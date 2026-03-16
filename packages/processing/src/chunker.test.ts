import { describe, test, expect } from "bun:test"
import { chunkFileStream, assembleFileStream } from "./chunker"
import { config } from "@discordrive/config"

describe("chunkFileStream", () => {
  test("single chunk for small file", async () => {
    const content = new Uint8Array(100)
    const file = new File([content], "small.bin")

    const chunks: ArrayBuffer[] = []
    for await (const chunk of chunkFileStream(file)) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBe(1)
    expect(chunks[0].byteLength).toBe(100)
  })

  test("splits file into correct number of chunks", async () => {
    const size = config.maxChunkSize * 2.5
    const content = new Uint8Array(size)
    const file = new File([content], "large.bin")

    const chunks: ArrayBuffer[] = []
    for await (const chunk of chunkFileStream(file)) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBe(3)
    expect(chunks[0].byteLength).toBe(config.maxChunkSize)
    expect(chunks[1].byteLength).toBe(config.maxChunkSize)
    expect(chunks[2].byteLength).toBe(size - config.maxChunkSize * 2)
  })

  test("preserves file content", async () => {
    const original = crypto.getRandomValues(new Uint8Array(256))
    const file = new File([original], "data.bin")

    const parts: Uint8Array[] = []
    for await (const chunk of chunkFileStream(file)) {
      parts.push(new Uint8Array(chunk))
    }

    const reassembled = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
    let offset = 0
    for (const part of parts) {
      reassembled.set(part, offset)
      offset += part.length
    }

    expect(reassembled).toEqual(original)
  })

  test("empty file yields no chunks", async () => {
    const file = new File([], "empty.bin")

    const chunks: ArrayBuffer[] = []
    for await (const chunk of chunkFileStream(file)) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBe(0)
  })
})

describe("assembleFileStream", () => {
  test("converts async iterable to ReadableStream", async () => {
    const data1 = new Uint8Array([1, 2, 3]).buffer as ArrayBuffer
    const data2 = new Uint8Array([4, 5, 6]).buffer as ArrayBuffer

    async function* source() {
      yield data1
      yield data2
    }

    const stream = assembleFileStream(source())
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    expect(chunks.length).toBe(2)
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]))
    expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]))
  })
})
