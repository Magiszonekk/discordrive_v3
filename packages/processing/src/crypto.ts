import { config } from "@discordrive/config"

/**
 * Derives an AES-256-GCM CryptoKey from a password and salt using PBKDF2.
 *
 * The resulting key is non-extractable and can only be used for
 * encryption and decryption. Number of iterations is controlled by
 * `config.pbkdf2Iterations`.
 *
 * @param password - The user-provided password to derive the key from.
 * @param salt - A random salt, e.g. from {@link generateSalt}. Must be stored
 * alongside encrypted data to allow key re-derivation during decryption.
 * @returns {Promise<CryptoKey>} A non-extractable AES-256-GCM key usable for encrypt/decrypt.
 *
 * @example
 * const salt = generateSalt()
 * const key = await deriveKey("myPassword123", salt)
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: config.pbkdf2Iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

/**
 * Encrypts a single chunk of data using AES-256-GCM.
 *
 * Generates a unique random IV for each chunk to ensure
 * ciphertext uniqueness even when the same key is reused.
 * IV length is controlled by `config.ivLength`.
 *
 * @param chunk - Raw data to encrypt as an ArrayBuffer, e.g. from {@link chunkFileStream}.
 * @param key - A CryptoKey derived via {@link deriveKey}.
 * @returns {Promise<{ data: ArrayBuffer; iv: Uint8Array }>} Encrypted data and the IV
 * used — both must be stored to allow decryption via {@link decryptChunk}.
 *
 * @example
 * const { data, iv } = await encryptChunk(chunk, key)
 * // store both data and iv
 */
export async function encryptChunk(
  chunk: ArrayBuffer,
  key: CryptoKey
): Promise<{ data: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(config.ivLength))
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, chunk)
  return { data, iv }
}

/**
 * Decrypts a single AES-256-GCM encrypted chunk.
 *
 * Must use the same key and IV that were used during encryption,
 * otherwise decryption will fail with an error.
 *
 * @param encryptedData - The encrypted chunk as an ArrayBuffer, from {@link encryptChunk}.
 * @param key - A CryptoKey derived via {@link deriveKey}.
 * @param iv - The IV that was used during encryption, from {@link encryptChunk}.
 * @returns {Promise<ArrayBuffer>} Decrypted raw data.
 * @throws {DOMException} If the key or IV is incorrect, or data is corrupted.
 *
 * @example
 * const decrypted = await decryptChunk(encryptedData, key, iv)
 */
export async function decryptChunk(
  encryptedData: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedData)
}

/**
 * Generates a cryptographically secure random salt.
 *
 * Salt length is controlled by `config.saltLength`.
 * Should be generated once per file and stored alongside
 * the encrypted data to allow key re-derivation via {@link deriveKey}.
 *
 * @returns {Uint8Array<ArrayBuffer>} A random salt as Uint8Array.
 *
 * @example
 * const salt = generateSalt()
 * const key = await deriveKey("myPassword123", salt)
 * // store salt with encrypted file
 */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(config.saltLength))
}