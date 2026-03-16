import { describe, test, expect } from "bun:test"
import { hashFile } from "./hash"

describe("hashFile", () => {
  test("produces hex SHA-256 hash", async () => {
    const data = new TextEncoder().encode("hello world")
    async function* gen() { yield data.buffer as ArrayBuffer }

    const hash = await hashFile(gen())
    // Known SHA-256 of "hello world"
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
  })

  test("multiple chunks produce same hash as single chunk", async () => {
    const full = new TextEncoder().encode("abcdef")
    const part1 = new TextEncoder().encode("abc")
    const part2 = new TextEncoder().encode("def")

    async function* single() { yield full.buffer as ArrayBuffer }
    async function* multi() {
      yield part1.buffer as ArrayBuffer
      yield part2.buffer as ArrayBuffer
    }

    const hashSingle = await hashFile(single())
    const hashMulti = await hashFile(multi())
    expect(hashMulti).toBe(hashSingle)
  })

  test("empty input produces SHA-256 of empty string", async () => {
    async function* empty() {}
    const hash = await hashFile(empty())
    // SHA-256 of empty input
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })
})
