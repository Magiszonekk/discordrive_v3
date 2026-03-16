import {
  generateFileKey, exportKey, importKey,
  wrapFileKey, unwrapFileKey,
  encryptChunk, decryptChunk,
  toBase64Url, fromBase64Url,
} from "@discordrive/processing"
import { config } from "@discordrive/config"
import * as api from "@/api/queries"

const MASTER_KEY_STORAGE = "dd_master_key"

// ============= Master Key Management =============

let cachedMasterKey: CryptoKey | null = null

export async function getMasterKey(): Promise<CryptoKey> {
  if (cachedMasterKey) return cachedMasterKey

  // 1. Try localStorage
  const stored = localStorage.getItem(MASTER_KEY_STORAGE)
  if (stored) {
    cachedMasterKey = await importKey(fromBase64Url(stored))
    return cachedMasterKey
  }

  // 2. Try server
  const me = await api.getMe()
  if (me?.masterKey) {
    cachedMasterKey = await importKey(fromBase64Url(me.masterKey))
    localStorage.setItem(MASTER_KEY_STORAGE, me.masterKey)
    return cachedMasterKey
  }

  // 3. Generate new
  cachedMasterKey = await generateFileKey()
  const raw = await exportKey(cachedMasterKey)
  localStorage.setItem(MASTER_KEY_STORAGE, toBase64Url(raw))
  return cachedMasterKey
}

/** Called after login/register to ensure master key is available */
export async function initMasterKey() {
  await getMasterKey()
}

export async function saveMasterKeyToServer() {
  const key = await getMasterKey()
  const raw = await exportKey(key)
  await api.storeMasterKey(toBase64Url(raw))
}

export async function removeMasterKeyFromServer() {
  await api.deleteMasterKey()
}

// ============= File Encryption =============

export interface EncryptedChunkData {
  index: number
  data: ArrayBuffer
  iv: Uint8Array
}

export async function encryptFile(
  file: File,
  masterKey: CryptoKey
): Promise<{
  chunks: EncryptedChunkData[]
  encryptedKey: string
  wrappingIv: string
  hash: string
}> {
  const fileKey = await generateFileKey()

  // Wrap per-file key with master key
  const { wrapped, iv: wrapIv } = await wrapFileKey(fileKey, masterKey)
  const encryptedKey = btoa(String.fromCharCode(...new Uint8Array(wrapped)))
  const wrappingIv = btoa(String.fromCharCode(...new Uint8Array(wrapIv)))

  // Chunk and encrypt
  const chunks: EncryptedChunkData[] = []
  const hashParts: ArrayBuffer[] = []
  let offset = 0
  let index = 0

  while (offset < file.size) {
    const end = Math.min(offset + config.maxChunkSize, file.size)
    const raw = await file.slice(offset, end).arrayBuffer()
    hashParts.push(raw)

    const { data, iv } = await encryptChunk(raw, fileKey)
    chunks.push({ index, data, iv })

    offset = end
    index++
  }

  // Browser-compatible SHA-256 hash
  const hash = await hashFileChunks(hashParts)

  return { chunks, encryptedKey, wrappingIv, hash }
}

// ============= File Decryption =============

export async function decryptFileChunks(
  chunks: api.DownloadChunk[],
  fileKey: CryptoKey
): Promise<Blob> {
  const decrypted: ArrayBuffer[] = []

  for (const chunk of chunks.sort((a, b) => a.index - b.index)) {
    const iv = Uint8Array.from(atob(chunk.iv), (c) => c.charCodeAt(0))
    const plain = await decryptChunk(chunk.data, fileKey, iv)
    decrypted.push(plain)
  }

  return new Blob(decrypted)
}

/** Decrypt using master key (owner download) */
export async function decryptOwnFile(result: api.DownloadFileResult): Promise<Blob> {
  const masterKey = await getMasterKey()

  const wrapped = Uint8Array.from(atob(result.encryptedKey!), (c) => c.charCodeAt(0)).buffer as ArrayBuffer
  const wrapIv = Uint8Array.from(atob(result.wrappingIv!), (c) => c.charCodeAt(0))
  const fileKey = await unwrapFileKey(wrapped, masterKey, wrapIv)

  return decryptFileChunks(result.chunks, fileKey)
}

/** Decrypt using raw key from share URL */
export async function decryptSharedFile(
  chunks: api.DownloadChunk[],
  keyBase64Url: string
): Promise<Blob> {
  const fileKey = await importKey(fromBase64Url(keyBase64Url))
  return decryptFileChunks(chunks, fileKey)
}

// ============= Share URL =============

export async function buildShareUrl(shareToken: string, encryptedKey: string, wrappingIv: string): Promise<string> {
  const masterKey = await getMasterKey()

  // Unwrap per-file key
  const wrapped = Uint8Array.from(atob(encryptedKey), (c) => c.charCodeAt(0)).buffer as ArrayBuffer
  const wrapIv = Uint8Array.from(atob(wrappingIv), (c) => c.charCodeAt(0))
  const fileKey = await unwrapFileKey(wrapped, masterKey, wrapIv)

  // Export raw file key for URL
  const raw = await exportKey(fileKey)
  const keyParam = toBase64Url(raw)

  return `${window.location.origin}/s/${shareToken}#key=${keyParam}`
}

export function extractKeyFromHash(): string | null {
  const hash = window.location.hash
  const match = hash.match(/^#key=(.+)$/)
  return match ? match[1] : null
}

// ============= Browser-compatible hash =============

async function hashFileChunks(chunks: ArrayBuffer[]): Promise<string> {
  // Concatenate all chunks for hashing
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), offset)
    offset += chunk.byteLength
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", combined)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
