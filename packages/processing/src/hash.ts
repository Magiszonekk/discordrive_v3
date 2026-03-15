/**
 * Computes a SHA-256 hash of a file from its chunks sequentially.
 *
 * Processes chunks lazily without loading the entire file into memory,
 * making it suitable for large files. Uses Bun's built-in CryptoHasher. 
 * 
 * ⚠️ Bun runtime only — not compatible with Node.js or browser environments.
 *
 * @param chunks - An async iterable of ArrayBuffers representing the file's chunks,
 * e.g. from {@link chunkFileStream}.
 * @returns {Promise<string>} A hex-encoded SHA-256 hash string of the full file contents.
 *
 * @example
 * const file = new File([...], "video.mp4")
 * const chunks = chunkFileStream(file)
 *
 * const hash = await hashFile(chunks)
 * console.log(hash) // "a3f5c2d1e8b4..."
 */
export async function hashFile(
  chunks: AsyncIterable<ArrayBuffer>
): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256")
  for await (const chunk of chunks) {
    hasher.update(chunk)
  }
  return hasher.digest("hex")
}