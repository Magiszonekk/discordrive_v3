import { config } from "@discordrive/config"
import {
  generateFileKey, exportKey,
  wrapFileKey, unwrapFileKey,
  encryptChunk, decryptChunk,
} from "@discordrive/processing"

// ─── Config ───

const SIZE_MB = parseInt(process.argv[2] ?? process.env.BENCH_SIZE_MB ?? "50", 10)
const SIZE_BYTES = SIZE_MB * 1024 * 1024
const BASE = `http://localhost:${config.apiPort}`
const EMAIL = `bench-${Date.now()}@test.local`
const PASSWORD = "benchpass123"

// ─── Helpers ───

let token: string | null = null

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${BASE}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json() as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data!
}

function fmt(seconds: number): string {
  return seconds.toFixed(2).padStart(7) + "s"
}

function mbps(bytes: number, seconds: number): string {
  return (bytes / 1024 / 1024 / seconds).toFixed(2).padStart(7) + " MB/s"
}

async function sha256hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const CHUNK = 8192
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromBase64(str: string): ArrayBuffer {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

// ─── Main ───

async function main() {
  const numChunks = Math.ceil(SIZE_BYTES / config.maxChunkSize)

  console.log()
  console.log("DiscorDrive E2E Benchmark")
  console.log("─────────────────────────")
  console.log(`File size:  ${SIZE_MB.toString().padStart(7)} MB (${numChunks} chunks)`)
  console.log()

  // 1. Register
  const regData = await gql<{ auth: { register: { token: string } } }>(
    `mutation($email: String!, $password: String!) { auth { register(email: $email, password: $password) { token } } }`,
    { email: EMAIL, password: PASSWORD }
  )
  token = regData.auth.register.token

  // 2. Generate random file
  console.log("Generating random data...")
  const rawData = crypto.getRandomValues(new Uint8Array(SIZE_BYTES))
  const originalHash = await sha256hex(rawData)

  // 3. Encrypt
  console.log("Encrypting...")
  const t0 = performance.now()

  const masterKey = await generateFileKey()
  const fileKey = await generateFileKey()
  const { wrapped, iv: wrapIv } = await wrapFileKey(fileKey, masterKey)
  const encryptedKeyB64 = toBase64(wrapped)
  const wrappingIvB64 = toBase64(wrapIv.buffer as ArrayBuffer)

  const chunks: { index: number; data: ArrayBuffer; iv: Uint8Array }[] = []
  let offset = 0
  let index = 0
  while (offset < SIZE_BYTES) {
    const end = Math.min(offset + config.maxChunkSize, SIZE_BYTES)
    const slice = rawData.slice(offset, end).buffer as ArrayBuffer
    const { data, iv } = await encryptChunk(slice, fileKey)
    chunks.push({ index, data, iv })
    offset = end
    index++
  }

  const tEncrypt = (performance.now() - t0) / 1000
  console.log(`Encrypt:  ${fmt(tEncrypt)}  (${mbps(SIZE_BYTES, tEncrypt)})`)

  // 4. Upload (per-chunk binary — no size limit)
  console.log("Uploading to Discord...")
  const t1 = performance.now()

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  // 4a. Init — create file record
  const initRes = await fetch(`${BASE}/api/upload/init`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `bench-${SIZE_MB}mb.bin`,
      size: SIZE_BYTES,
      hash: originalHash,
      mimeType: "application/octet-stream",
      isAnonymous: false,
      encryptedKey: encryptedKeyB64,
      wrappingIv: wrappingIvB64,
      chunks: chunks.map(c => ({ index: c.index, iv: toBase64(c.iv.buffer as ArrayBuffer) })),
    }),
  })
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ error: "Init failed" }))
    throw new Error((err as { error: string }).error)
  }
  const { fileId } = await initRes.json() as { fileId: string }

  // 4b. Upload chunks in parallel (each chunk is a separate request)
  const CONCURRENCY = 4
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (chunk) => {
        const iv = toBase64(chunk.iv.buffer as ArrayBuffer)
        const res = await fetch(`${BASE}/api/upload/${fileId}/chunk/${chunk.index}?iv=${encodeURIComponent(iv)}`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/octet-stream" },
          body: chunk.data,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Chunk upload failed" }))
          throw new Error((err as { error: string }).error)
        }
      })
    )
  }

  const tUpload = (performance.now() - t1) / 1000
  console.log(`Upload:   ${fmt(tUpload)}  (${mbps(SIZE_BYTES, tUpload)})`)

  // 5. Download (REST binary — per-chunk, no base64 overhead)
  console.log("Downloading from Discord...")
  const t2 = performance.now()

  const metaRes = await fetch(`${BASE}/api/download/${fileId}/meta`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) {
    const text = await metaRes.text()
    throw new Error(`Download meta failed (${metaRes.status}): ${text}`)
  }
  const meta = await metaRes.json() as {
    hash: string; encryptedKey: string; wrappingIv: string;
    chunks: { index: number; iv: string }[]
  }

  // Download chunks with concurrency limit
  const DL_CONCURRENCY = 6
  const dlChunks: { index: number; data: ArrayBuffer; iv: string }[] = []
  for (let i = 0; i < meta.chunks.length; i += DL_CONCURRENCY) {
    const batch = meta.chunks.slice(i, i + DL_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (c) => {
        const res = await fetch(`${BASE}/api/download/${fileId}/chunk/${c.index}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`Download chunk ${c.index} failed: ${res.status}`)
        return { index: c.index, data: await res.arrayBuffer(), iv: c.iv }
      })
    )
    dlChunks.push(...results)
  }

  const tDownload = (performance.now() - t2) / 1000
  console.log(`Download: ${fmt(tDownload)}  (${mbps(SIZE_BYTES, tDownload)})`)

  // 6. Decrypt
  console.log("Decrypting...")
  const t3 = performance.now()

  const wrappedBuf = fromBase64(meta.encryptedKey)
  const wrapIvArr = new Uint8Array(fromBase64(meta.wrappingIv)) as Uint8Array<ArrayBuffer>
  const recoveredFileKey = await unwrapFileKey(wrappedBuf, masterKey, wrapIvArr)

  const sortedChunks = dlChunks.sort((a, b) => a.index - b.index)
  const decryptedParts: ArrayBuffer[] = []
  for (const chunk of sortedChunks) {
    const encIv = new Uint8Array(fromBase64(chunk.iv)) as Uint8Array<ArrayBuffer>
    const plain = await decryptChunk(chunk.data, recoveredFileKey, encIv)
    decryptedParts.push(plain)
  }

  // Reassemble
  const totalSize = decryptedParts.reduce((s, p) => s + p.byteLength, 0)
  const reassembled = new Uint8Array(totalSize)
  let off = 0
  for (const part of decryptedParts) {
    reassembled.set(new Uint8Array(part), off)
    off += part.byteLength
  }

  const tDecrypt = (performance.now() - t3) / 1000
  console.log(`Decrypt:  ${fmt(tDecrypt)}  (${mbps(SIZE_BYTES, tDecrypt)})`)

  // 7. Verify
  const downloadedHash = await sha256hex(reassembled)
  const hashOk = downloadedHash === originalHash

  // 8. Cleanup
  await gql(`mutation($fileId: ID!) { files { delete(fileId: $fileId) } }`, { fileId })

  // 9. Report
  const tTotal = tEncrypt + tUpload + tDownload + tDecrypt
  console.log()
  console.log("─────────────────────────")
  console.log(`Total:    ${fmt(tTotal)}  (${mbps(SIZE_BYTES, tTotal)})`)
  console.log(`Hash:     ${hashOk ? "OK" : "MISMATCH!"}`)
  console.log()

  if (!hashOk) {
    console.error("BENCHMARK FAILED: hash mismatch!")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Benchmark error:", err.message)
  process.exit(1)
})
