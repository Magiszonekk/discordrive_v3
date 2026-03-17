import { config } from "@discordrive/config"
import {
  generateFileKey,
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
  const authHeaders: Record<string, string> = { Authorization: `Bearer ${token}` }

  // 2. Keys
  const masterKey = await generateFileKey()
  const fileKey = await generateFileKey()
  const { wrapped, iv: wrapIv } = await wrapFileKey(fileKey, masterKey)
  const encryptedKeyB64 = toBase64(wrapped)
  const wrappingIvB64 = toBase64(wrapIv.buffer as ArrayBuffer)

  // 3. Init — create file record without hash (will be sent in /complete after streaming upload)
  const initRes = await fetch(`${BASE}/api/upload/init`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `bench-${SIZE_MB}mb.bin`,
      size: SIZE_BYTES,
      mimeType: "application/octet-stream",
      isAnonymous: false,
      encryptedKey: encryptedKeyB64,
      wrappingIv: wrappingIvB64,
      chunkCount: numChunks,
    }),
  })
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ error: "Init failed" }))
    throw new Error((err as { error: string }).error)
  }
  const { fileId } = await initRes.json() as { fileId: string }

  // 4. Encrypt + Upload streaming — generate → hash → encrypt → upload per chunk
  //    Peak memory: ~2 × maxChunkSize × CONCURRENCY ≈ 76 MB regardless of file size
  console.log("Encrypting + Uploading...")
  const CONCURRENCY = 4
  const uploadHasher = new Bun.CryptoHasher("sha256")
  let tEncryptMs = 0
  const t1 = performance.now()

  for (let i = 0; i < numChunks; i += CONCURRENCY) {
    // Encrypt window of chunks sequentially (hash must be in order)
    const window: { index: number; data: ArrayBuffer; iv: Uint8Array }[] = []
    for (let j = i; j < Math.min(i + CONCURRENCY, numChunks); j++) {
      const chunkStart = j * config.maxChunkSize
      const chunkEnd = Math.min(chunkStart + config.maxChunkSize, SIZE_BYTES)
      const plaintext = crypto.getRandomValues(new Uint8Array(chunkEnd - chunkStart))

      const te = performance.now()
      uploadHasher.update(plaintext)
      const { data, iv } = await encryptChunk(plaintext.buffer as ArrayBuffer, fileKey)
      tEncryptMs += performance.now() - te

      window.push({ index: j, data, iv })
      // plaintext goes out of scope — GC eligible
    }

    // Upload window in parallel
    await Promise.all(
      window.map(async ({ index, data, iv }) => {
        const ivB64 = toBase64(iv.buffer as ArrayBuffer)
        const res = await fetch(
          `${BASE}/api/upload/${fileId}/chunk/${index}?iv=${encodeURIComponent(ivB64)}`,
          { method: "POST", headers: { ...authHeaders, "Content-Type": "application/octet-stream" }, body: data }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Chunk upload failed" }))
          throw new Error((err as { error: string }).error)
        }
      })
    )
    // window buffers go out of scope — GC eligible
  }

  const originalHash = uploadHasher.digest("hex")
  const tEncrypt = tEncryptMs / 1000
  const tUpload = (performance.now() - t1) / 1000 - tEncrypt
  console.log(`Encrypt:  ${fmt(tEncrypt)}  (${mbps(SIZE_BYTES, tEncrypt)})`)
  console.log(`Upload:   ${fmt(tUpload)}  (${mbps(SIZE_BYTES, tUpload)})`)

  // 5. Finalize — send hash now that we know it
  const completeRes = await fetch(`${BASE}/api/upload/${fileId}/complete`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ hash: originalHash }),
  })
  if (!completeRes.ok) {
    const err = await completeRes.json().catch(() => ({ error: "Complete failed" }))
    throw new Error((err as { error: string }).error)
  }

  // 6. Download + Decrypt streaming — download → decrypt → hash per chunk, no output buffer
  //    Peak memory: ~2 × maxChunkSize × DL_CONCURRENCY ≈ 114 MB regardless of file size
  console.log("Downloading + Decrypting...")
  const DL_CONCURRENCY = 6
  const t2 = performance.now()
  let tDecryptMs = 0

  const metaRes = await fetch(`${BASE}/api/download/${fileId}/meta`, { headers: authHeaders })
  if (!metaRes.ok) {
    const text = await metaRes.text()
    throw new Error(`Download meta failed (${metaRes.status}): ${text}`)
  }
  const meta = await metaRes.json() as {
    hash: string; encryptedKey: string; wrappingIv: string;
    chunks: { index: number; iv: string }[]
  }

  const wrappedBuf = fromBase64(meta.encryptedKey)
  const wrapIvArr = new Uint8Array(fromBase64(meta.wrappingIv)) as Uint8Array<ArrayBuffer>
  const recoveredFileKey = await unwrapFileKey(wrappedBuf, masterKey, wrapIvArr)

  const sortedMeta = meta.chunks.sort((a, b) => a.index - b.index)
  const downloadHasher = new Bun.CryptoHasher("sha256")

  for (let i = 0; i < sortedMeta.length; i += DL_CONCURRENCY) {
    // Download window in parallel
    const results = await Promise.all(
      sortedMeta.slice(i, i + DL_CONCURRENCY).map(async (c) => {
        const res = await fetch(`${BASE}/api/download/${fileId}/chunk/${c.index}`, { headers: authHeaders })
        if (!res.ok) throw new Error(`Download chunk ${c.index} failed: ${res.status}`)
        return { index: c.index, data: await res.arrayBuffer(), iv: c.iv }
      })
    )

    // Decrypt in order and hash (order must match upload)
    results.sort((a, b) => a.index - b.index)
    for (const r of results) {
      const encIv = new Uint8Array(fromBase64(r.iv)) as Uint8Array<ArrayBuffer>
      const td = performance.now()
      const plain = await decryptChunk(r.data, recoveredFileKey, encIv)
      tDecryptMs += performance.now() - td
      downloadHasher.update(plain)
      // r.data and plain go out of scope — GC eligible
    }
  }

  const downloadedHash = downloadHasher.digest("hex")
  const tDecrypt = tDecryptMs / 1000
  const tDownload = (performance.now() - t2) / 1000 - tDecrypt
  console.log(`Download: ${fmt(tDownload)}  (${mbps(SIZE_BYTES, tDownload)})`)
  console.log(`Decrypt:  ${fmt(tDecrypt)}  (${mbps(SIZE_BYTES, tDecrypt)})`)

  // 7. Verify
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
