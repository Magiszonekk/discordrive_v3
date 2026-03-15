import { config } from "@discordrive/config"

/**
 * Splits a File into fixed-size chunks and yields them sequentially as ArrayBuffers.
 *
 * Uses a generator to ensure only one chunk is held in memory at a time,
 * making it safe for large files.
 *
 * @param file - The File object to be chunked.
 * @yields {ArrayBuffer} Sequential chunks of the file, each of size `config.maxChunkSize`,
 * except for the last chunk which may be smaller.
 *
 * @example
 * const file = new File([...], "video.mp4")
 *
 * for await (const chunk of chunkFileStream(file)) {
 *   const encrypted = await encryptChunk(chunk, key)
 *   // upload chunk...
 * }
 */
export async function* chunkFileStream(file: File): AsyncGenerator<ArrayBuffer> {
  let offset = 0
  while (offset < file.size) {
    const end = Math.min(offset + config.maxChunkSize, file.size)
    yield await file.slice(offset, end).arrayBuffer()
    offset = end
  }
}

/**
 * Converts an AsyncIterable of ArrayBuffers into a Web API ReadableStream of Uint8Arrays.
 *
 * Acts as a bridge between async generator output and Web API consumers
 * such as `Response`, `fetch`, or `Bun.write`.
 *
 * @param source - An async iterable of ArrayBuffers to stream, e.g. from {@link chunkFileStream}.
 * @returns {ReadableStream<Uint8Array>} A ReadableStream that emits each chunk as Uint8Array.
 *
 * @example
 * const decryptedChunks = decryptAllChunks(encryptedData)
 * const stream = assembleFileStream(decryptedChunks)
 *
 * // Stream as file download:
 * return new Response(stream, {
 *   headers: { "Content-Disposition": "attachment; filename=file.zip" }
 * })
 *
 * // Or write to disk with Bun:
 * await Bun.write("output.bin", stream)
 */
export function assembleFileStream(
  source: AsyncIterable<ArrayBuffer>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of source) {
        controller.enqueue(new Uint8Array(chunk))
      }
      controller.close()
    },
  })
}