import { gql, getToken } from "./graphql"

// ============= Auth =============

export async function login(email: string, password: string) {
  const data = await gql<{ auth: { login: { token: string } } }>(
    `mutation($email: String!, $password: String!) { auth { login(email: $email, password: $password) { token } } }`,
    { email, password }
  )
  return data.auth.login.token
}

export async function register(email: string, password: string) {
  const data = await gql<{ auth: { register: { token: string } } }>(
    `mutation($email: String!, $password: String!) { auth { register(email: $email, password: $password) { token } } }`,
    { email, password }
  )
  return data.auth.register.token
}

export async function storeMasterKey(key: string) {
  await gql(`mutation($key: String!) { auth { storeMasterKey(key: $key) } }`, { key })
}

export async function deleteMasterKey() {
  await gql(`mutation { auth { deleteMasterKey } }`)
}

// ============= User =============

export interface MeResult {
  id: string
  email: string
  createdAt: string
  masterKey: string | null
}

export async function getMe() {
  const data = await gql<{ me: MeResult | null }>(`query { me { id email createdAt masterKey } }`)
  return data.me
}

// ============= Files =============

export interface FileInfo {
  fileId: string
  name: string
  size: number
  mimeType: string
  createdAt: string
  expiresAt: string | null
  folderId: string | null
  shareToken: string | null
}

export interface DownloadChunk {
  index: number
  data: ArrayBuffer
  iv: string   // base64
}

export interface DownloadFileMeta {
  fileId: string
  name: string
  mimeType: string
  hash: string
  salt: string | null
  encryptedKey: string | null
  wrappingIv: string | null
  chunks: { index: number; iv: string }[]
}

export interface DownloadFileResult {
  fileId: string
  name: string
  mimeType: string
  hash: string
  salt: string | null
  encryptedKey: string | null
  wrappingIv: string | null
  chunks: DownloadChunk[]
}

export async function listFiles(folderId?: string | null) {
  const data = await gql<{ files: { list: FileInfo[] } }>(
    `query($folderId: ID) { files { list(folderId: $folderId) { fileId name size mimeType createdAt expiresAt folderId shareToken } } }`,
    { folderId: folderId ?? null }
  )
  return data.files.list
}

export interface UploadChunkInput {
  index: number
  data: ArrayBuffer
  iv: Uint8Array
}

export interface UploadFileInput {
  name: string
  size: number
  hash: string
  mimeType: string
  isAnonymous: boolean
  encryptedKey?: string
  wrappingIv?: string
  salt?: string
  folderId?: string
  chunks: UploadChunkInput[]
}

export async function uploadFile(input: UploadFileInput): Promise<string> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers["Authorization"] = `Bearer ${token}`

  const chunkMeta = input.chunks.map(({ index, iv }) => ({
    index,
    iv: btoa(String.fromCharCode(...iv)),
  }))

  // 1. Init — create file record
  const initRes = await fetch("/api/upload/init", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      size: input.size,
      hash: input.hash,
      mimeType: input.mimeType,
      isAnonymous: input.isAnonymous,
      encryptedKey: input.encryptedKey,
      wrappingIv: input.wrappingIv,
      salt: input.salt,
      folderId: input.folderId,
      chunks: chunkMeta,
    }),
  })
  const initJson = await initRes.json()
  if (!initRes.ok) throw new Error(initJson.error ?? "Błąd inicjalizacji uploadu")
  const fileId = initJson.fileId as string

  // 2. Upload chunks in parallel (4 concurrent)
  const CONCURRENCY = 4
  for (let i = 0; i < input.chunks.length; i += CONCURRENCY) {
    const batch = input.chunks.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (chunk) => {
        const iv = chunkMeta.find(c => c.index === chunk.index)!.iv
        const res = await fetch(`/api/upload/${fileId}/chunk/${chunk.index}?iv=${encodeURIComponent(iv)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: chunk.data,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Błąd uploadu chunka" }))
          throw new Error(err.error)
        }
      })
    )
  }

  return fileId
}

export async function downloadFile(fileId: string): Promise<DownloadFileResult> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers["Authorization"] = `Bearer ${token}`

  // 1. Fetch metadata (no binary data)
  const metaRes = await fetch(`/api/download/${fileId}/meta`, { headers })
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({ error: "Błąd pobierania" }))
    throw new Error(err.error ?? "Błąd pobierania metadanych")
  }
  const meta: DownloadFileMeta = await metaRes.json()

  // 2. Download chunks with concurrency limit
  const DL_CONCURRENCY = 6
  const chunks: DownloadChunk[] = []
  for (let i = 0; i < meta.chunks.length; i += DL_CONCURRENCY) {
    const batch = meta.chunks.slice(i, i + DL_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (c) => {
        const res = await fetch(`/api/download/${fileId}/chunk/${c.index}`, { headers })
        if (!res.ok) throw new Error(`Błąd pobierania chunka ${c.index}`)
        return { index: c.index, data: await res.arrayBuffer(), iv: c.iv }
      })
    )
    chunks.push(...results)
  }

  return {
    fileId: meta.fileId,
    name: meta.name,
    mimeType: meta.mimeType,
    hash: meta.hash,
    salt: meta.salt,
    encryptedKey: meta.encryptedKey,
    wrappingIv: meta.wrappingIv,
    chunks,
  }
}

export async function deleteFile(fileId: string) {
  await gql(`mutation($fileId: ID!) { files { delete(fileId: $fileId) } }`, { fileId })
}

export async function moveFile(fileId: string, folderId?: string | null) {
  await gql(`mutation($fileId: ID!, $folderId: ID) { files { move(fileId: $fileId, folderId: $folderId) } }`, { fileId, folderId })
}

export async function enableSharing(fileId: string) {
  const data = await gql<{ files: { enableSharing: string } }>(
    `mutation($fileId: ID!) { files { enableSharing(fileId: $fileId) } }`,
    { fileId }
  )
  return data.files.enableSharing
}

export async function disableSharing(fileId: string) {
  await gql(`mutation($fileId: ID!) { files { disableSharing(fileId: $fileId) } }`, { fileId })
}

// ============= Folders =============

export interface FolderInfo {
  folderId: string
  name: string
  createdAt: string
  parentId: string | null
}

export async function listFolders(parentId?: string | null) {
  const data = await gql<{ folders: { list: FolderInfo[] } }>(
    `query($parentId: ID) { folders { list(parentId: $parentId) { folderId name createdAt parentId } } }`,
    { parentId: parentId ?? null }
  )
  return data.folders.list
}

export async function createFolder(name: string, parentId?: string | null) {
  const data = await gql<{ folders: { create: FolderInfo } }>(
    `mutation($name: String!, $parentId: ID) { folders { create(name: $name, parentId: $parentId) { folderId name createdAt parentId } } }`,
    { name, parentId }
  )
  return data.folders.create
}

export async function deleteFolder(folderId: string) {
  await gql(`mutation($folderId: ID!) { folders { delete(folderId: $folderId) } }`, { folderId })
}

export async function renameFolder(folderId: string, name: string) {
  await gql(`mutation($folderId: ID!, $name: String!) { folders { rename(folderId: $folderId, name: $name) { folderId } } }`, { folderId, name })
}
