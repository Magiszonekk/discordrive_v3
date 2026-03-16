import { describe, test, expect } from "bun:test"
import { toBase64Url, fromBase64Url } from "./encoding"

describe("toBase64Url / fromBase64Url", () => {
  test("roundtrip with random bytes", () => {
    const original = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer
    const encoded = toBase64Url(original)
    const decoded = fromBase64Url(encoded)
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(original))
  })

  test("output is URL-safe (no +, /, =)", () => {
    // Use bytes that would produce +, / in standard base64
    const buf = new Uint8Array([251, 239, 190, 63, 191, 239]).buffer as ArrayBuffer
    const encoded = toBase64Url(buf)
    expect(encoded).not.toContain("+")
    expect(encoded).not.toContain("/")
    expect(encoded).not.toContain("=")
  })

  test("empty buffer", () => {
    const empty = new ArrayBuffer(0)
    const encoded = toBase64Url(empty)
    expect(encoded).toBe("")
    const decoded = fromBase64Url(encoded)
    expect(decoded.byteLength).toBe(0)
  })

  test("single byte", () => {
    const buf = new Uint8Array([0xff]).buffer as ArrayBuffer
    const encoded = toBase64Url(buf)
    const decoded = fromBase64Url(encoded)
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array([0xff]))
  })

  test("large buffer (1KB)", () => {
    const original = crypto.getRandomValues(new Uint8Array(1024)).buffer as ArrayBuffer
    const decoded = fromBase64Url(toBase64Url(original))
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(original))
  })
})
