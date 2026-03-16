import { describe, test, expect } from "bun:test"
import {
  deriveKey, generateSalt, generateFileKey,
  encryptChunk, decryptChunk,
  exportKey, importKey,
  wrapFileKey, unwrapFileKey,
} from "./crypto"

describe("generateSalt", () => {
  test("returns 16 bytes", () => {
    const salt = generateSalt()
    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt.length).toBe(16)
  })

  test("generates unique salts", () => {
    const a = generateSalt()
    const b = generateSalt()
    expect(a).not.toEqual(b)
  })
})

describe("generateFileKey", () => {
  test("returns extractable AES-GCM key", async () => {
    const key = await generateFileKey()
    expect(key.type).toBe("secret")
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 })
    expect(key.extractable).toBe(true)
    expect(key.usages).toContain("encrypt")
    expect(key.usages).toContain("decrypt")
  })
})

describe("exportKey / importKey", () => {
  test("roundtrip preserves key material", async () => {
    const original = await generateFileKey()
    const raw = await exportKey(original)
    expect(raw.byteLength).toBe(32) // 256-bit

    const imported = await importKey(raw)
    const reExported = await exportKey(imported)
    expect(new Uint8Array(reExported)).toEqual(new Uint8Array(raw))
  })
})

describe("encryptChunk / decryptChunk", () => {
  test("encrypt then decrypt returns original data", async () => {
    const key = await generateFileKey()
    const original = new TextEncoder().encode("Hello, DiscorDrive!").buffer as ArrayBuffer

    const { data, iv } = await encryptChunk(original, key)
    expect(data.byteLength).toBeGreaterThan(0)
    expect(iv.length).toBe(12)

    const decrypted = await decryptChunk(data, key, iv)
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(original))
  })

  test("different IVs for same data", async () => {
    const key = await generateFileKey()
    const data = new Uint8Array(64).buffer as ArrayBuffer

    const a = await encryptChunk(data, key)
    const b = await encryptChunk(data, key)
    expect(a.iv).not.toEqual(b.iv)
  })

  test("wrong key fails decryption", async () => {
    const key1 = await generateFileKey()
    const key2 = await generateFileKey()
    const original = new TextEncoder().encode("secret").buffer as ArrayBuffer

    const { data, iv } = await encryptChunk(original, key1)
    expect(decryptChunk(data, key2, iv)).rejects.toThrow()
  })

  test("empty chunk", async () => {
    const key = await generateFileKey()
    const empty = new ArrayBuffer(0)
    const { data, iv } = await encryptChunk(empty, key)
    const decrypted = await decryptChunk(data, key, iv)
    expect(decrypted.byteLength).toBe(0)
  })
})

describe("wrapFileKey / unwrapFileKey", () => {
  test("wrap then unwrap returns equivalent key", async () => {
    const masterKey = await generateFileKey()
    const fileKey = await generateFileKey()

    const { wrapped, iv } = await wrapFileKey(fileKey, masterKey)
    expect(wrapped.byteLength).toBeGreaterThan(0)
    expect(iv.length).toBe(12)

    const unwrapped = await unwrapFileKey(wrapped, masterKey, iv)
    const originalRaw = await exportKey(fileKey)
    const unwrappedRaw = await exportKey(unwrapped)
    expect(new Uint8Array(unwrappedRaw)).toEqual(new Uint8Array(originalRaw))
  })

  test("wrong master key fails unwrap", async () => {
    const masterKey1 = await generateFileKey()
    const masterKey2 = await generateFileKey()
    const fileKey = await generateFileKey()

    const { wrapped, iv } = await wrapFileKey(fileKey, masterKey1)
    expect(unwrapFileKey(wrapped, masterKey2, iv)).rejects.toThrow()
  })
})

describe("deriveKey", () => {
  test("same password + salt = same derived key", async () => {
    const salt = generateSalt()
    const key1 = await deriveKey("password123", salt)
    const key2 = await deriveKey("password123", salt)

    // Non-extractable, so test by encrypting/decrypting
    const data = new TextEncoder().encode("test").buffer as ArrayBuffer
    const { data: encrypted, iv } = await encryptChunk(data, key1)
    const decrypted = await decryptChunk(encrypted, key2, iv)
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(data))
  })

  test("different password = different key", async () => {
    const salt = generateSalt()
    const key1 = await deriveKey("password1", salt)
    const key2 = await deriveKey("password2", salt)

    const data = new TextEncoder().encode("test").buffer as ArrayBuffer
    const { data: encrypted, iv } = await encryptChunk(data, key1)
    expect(decryptChunk(encrypted, key2, iv)).rejects.toThrow()
  })

  test("different salt = different key", async () => {
    const key1 = await deriveKey("password", generateSalt())
    const key2 = await deriveKey("password", generateSalt())

    const data = new TextEncoder().encode("test").buffer as ArrayBuffer
    const { data: encrypted, iv } = await encryptChunk(data, key1)
    expect(decryptChunk(encrypted, key2, iv)).rejects.toThrow()
  })
})
