// ===== USER =====
export interface User {
  id: string
  email: string
  createdAt: Date
  passwordHash: string
}

// ===== FILE =====
export interface File {
  id: string
  name: string
  size: number
  hash: string
  mimeType: string
  createdAt: Date
  expiresAt: Date | null  // null = authenticated (bez TTL)
  isAnonymous: boolean

  // authenticated only
  userId: string | null
  encryptedKey: string | null  // klucz pliku zaszyfrowany masterKey

  salt: string  // do derive klucza
  chunks: Chunk[]
}

// ===== CHUNK =====
export interface Chunk {
  id: string
  index: number           // kolejność chunku w pliku
  messageId: string       // ID wiadomości na Discordzie
  channelId: string       // ID kanału na Discordzie
  webhookId: string       // ID webhooka który wysłał wiadomość (do fetch/delete)
  attachmentIndex: number // który załącznik w wiadomości (0–9)
  fileId: string
}

// ===== UPLOAD =====
export interface UploadedChunk {
  messageId: string
  channelId: string
  webhookId: string
  attachmentIndex: number
  chunkIndex: number
}

export interface UploadProgress {
  fileId: string
  totalChunks: number
  uploadedChunks: number
  status: UploadStatus
}

export type UploadStatus = 
  | "pending"
  | "encrypting"
  | "uploading"
  | "done"
  | "error"