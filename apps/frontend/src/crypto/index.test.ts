import { describe, test, expect, mock, beforeEach } from "bun:test"
import {
  generateFileKey, exportKey, importKey,
  wrapFileKey, unwrapFileKey,
  encryptChunk, decryptChunk,
  toBase64Url, fromBase64Url,
} from "@discordrive/processing"

// We test the pure crypto functions used by the frontend crypto module
// without importing the module directly (which has localStorage/DOM deps).
// Instead we test the core logic: encrypt → decrypt roundtrip, share URL key roundtrip.

describe("frontend crypto: encrypt → decrypt roundtrip", () => {
  test("encrypt file chunks and decrypt with master key (owner flow)", async () => {
    const masterKey = await generateFileKey()
    const fileKey = await generateFileKey()

    // Wrap file key with master key
    const { wrapped, iv: wrapIv } = await wrapFileKey(fileKey, masterKey)

    // Encrypt a chunk with file key
    const original = new TextEncoder().encode("Hello from DiscorDrive!")
    const { data: encrypted, iv: chunkIv } = await encryptChunk(original.buffer as ArrayBuffer, fileKey)

    // Simulate base64 encoding (as frontend does)
    const encryptedKeyB64 = btoa(String.fromCharCode(...new Uint8Array(wrapped)))
    const wrappingIvB64 = btoa(String.fromCharCode(...new Uint8Array(wrapIv)))
    const chunkDataB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    const chunkIvB64 = btoa(String.fromCharCode(...new Uint8Array(chunkIv)))

    // === Owner decryption ===
    // Unwrap file key from master key
    const wrappedBuf = Uint8Array.from(atob(encryptedKeyB64), c => c.charCodeAt(0)).buffer as ArrayBuffer
    const wrapIvArr = Uint8Array.from(atob(wrappingIvB64), c => c.charCodeAt(0))
    const recoveredFileKey = await unwrapFileKey(wrappedBuf, masterKey, wrapIvArr)

    // Decrypt chunk
    const encData = Uint8Array.from(atob(chunkDataB64), c => c.charCodeAt(0)).buffer as ArrayBuffer
    const encIv = Uint8Array.from(atob(chunkIvB64), c => c.charCodeAt(0))
    const decrypted = await decryptChunk(encData, recoveredFileKey, encIv)

    expect(new Uint8Array(decrypted)).toEqual(original)
  })

  test("encrypt and decrypt with shared key (share flow)", async () => {
    const fileKey = await generateFileKey()

    // Encrypt
    const original = new TextEncoder().encode("Shared file content")
    const { data: encrypted, iv } = await encryptChunk(original.buffer as ArrayBuffer, fileKey)

    // Export key for URL fragment
    const rawKey = await exportKey(fileKey)
    const keyBase64Url = toBase64Url(rawKey)

    // === Share decryption ===
    const importedKey = await importKey(fromBase64Url(keyBase64Url))
    const decrypted = await decryptChunk(encrypted, importedKey, iv)

    expect(new Uint8Array(decrypted)).toEqual(original)
  })
})

describe("frontend crypto: share URL key roundtrip", () => {
  test("export → toBase64Url → fromBase64Url → import preserves key", async () => {
    const original = await generateFileKey()
    const raw = await exportKey(original)
    const encoded = toBase64Url(raw)

    // Verify URL-safe
    expect(encoded).not.toContain("+")
    expect(encoded).not.toContain("/")
    expect(encoded).not.toContain("=")

    const decoded = fromBase64Url(encoded)
    const imported = await importKey(decoded)
    const reExported = await exportKey(imported)

    expect(new Uint8Array(reExported)).toEqual(new Uint8Array(raw))
  })
})

describe("frontend crypto: extractKeyFromHash logic", () => {
  test("parses #key=... pattern", () => {
    const hash = "#key=abc123DEF_-"
    const match = hash.match(/^#key=(.+)$/)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("abc123DEF_-")
  })

  test("returns null for empty hash", () => {
    const hash = ""
    const match = hash.match(/^#key=(.+)$/)
    expect(match).toBeNull()
  })

  test("returns null for wrong format", () => {
    const hash = "#notkey=value"
    const match = hash.match(/^#key=(.+)$/)
    expect(match).toBeNull()
  })
})

describe("frontend crypto: buildShareUrl format", () => {
  test("produces correct URL format", async () => {
    const masterKey = await generateFileKey()
    const fileKey = await generateFileKey()

    const { wrapped, iv: wrapIv } = await wrapFileKey(fileKey, masterKey)
    const encryptedKey = btoa(String.fromCharCode(...new Uint8Array(wrapped)))
    const wrappingIv = btoa(String.fromCharCode(...new Uint8Array(wrapIv)))

    // Simulate buildShareUrl logic (without window.location)
    const wrappedBuf = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0)).buffer as ArrayBuffer
    const wrapIvArr = Uint8Array.from(atob(wrappingIv), c => c.charCodeAt(0))
    const unwrapped = await unwrapFileKey(wrappedBuf, masterKey, wrapIvArr)
    const raw = await exportKey(unwrapped)
    const keyParam = toBase64Url(raw)

    const shareToken = "test-share-token"
    const url = `http://localhost:5173/s/${shareToken}#key=${keyParam}`

    expect(url).toContain("/s/test-share-token#key=")
    // Key part (after #key=) should be URL-safe base64
    const keyPart = url.split("#key=")[1]
    expect(keyPart).not.toContain("+")
    expect(keyPart).not.toContain("/")
    expect(keyPart).not.toContain("=")

    // Verify the key in URL can decrypt
    const extractedKey = url.split("#key=")[1]
    const importedKey = await importKey(fromBase64Url(extractedKey))
    const originalRaw = await exportKey(fileKey)
    const importedRaw = await exportKey(importedKey)
    expect(new Uint8Array(importedRaw)).toEqual(new Uint8Array(originalRaw))
  })
})
