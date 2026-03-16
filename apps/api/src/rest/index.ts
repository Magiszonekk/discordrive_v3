import { handleSharePage } from "./share"
import { handleShareMeta, handleShareChunk } from "./share-api"
import { handleUpload, handleUploadInit, handleUploadChunk, handleUploadComplete } from "./upload"
import { handleDownloadMeta, handleDownloadChunk } from "./download"

export async function handleRest(req: Request, url: URL): Promise<Response> {
  const { pathname } = url
  const method = req.method

  // POST /api/upload — legacy single-request multipart upload (small files)
  if (pathname === "/api/upload" && method === "POST") {
    return handleUpload(req)
  }

  // POST /api/upload/init — per-chunk upload: create file record
  if (pathname === "/api/upload/init" && method === "POST") {
    return handleUploadInit(req)
  }

  // POST /api/upload/{fileId}/chunk/{index}?iv=... — per-chunk upload: single binary chunk
  const ulChunkMatch = pathname.match(/^\/api\/upload\/([a-zA-Z0-9_-]+)\/chunk\/(\d+)$/)
  if (ulChunkMatch && method === "POST") {
    return handleUploadChunk(req, ulChunkMatch[1], parseInt(ulChunkMatch[2], 10), url)
  }

  // POST /api/upload/{fileId}/complete — per-chunk upload: finalize
  const ulCompleteMatch = pathname.match(/^\/api\/upload\/([a-zA-Z0-9_-]+)\/complete$/)
  if (ulCompleteMatch && method === "POST") {
    return handleUploadComplete(req, ulCompleteMatch[1])
  }

  // GET /api/download/{fileId}/meta — file metadata + chunk list (no binary data)
  const dlMetaMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)\/meta$/)
  if (dlMetaMatch && method === "GET") {
    return handleDownloadMeta(req, dlMetaMatch[1])
  }

  // GET /api/download/{fileId}/chunk/{index} — raw binary chunk
  const dlChunkMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)\/chunk\/(\d+)$/)
  if (dlChunkMatch && method === "GET") {
    return handleDownloadChunk(req, dlChunkMatch[1], parseInt(dlChunkMatch[2], 10))
  }

  // GET /s/{shareToken} — share page z OG meta tagami
  const sharePageMatch = pathname.match(/^\/s\/([a-f0-9-]+)$/)
  if (sharePageMatch && method === "GET") {
    return handleSharePage(sharePageMatch[1])
  }

  // GET /api/share/{shareToken}/meta — shared file metadata + chunk IVs
  const shareMetaMatch = pathname.match(/^\/api\/share\/([a-f0-9-]+)\/meta$/)
  if (shareMetaMatch && method === "GET") {
    return handleShareMeta(shareMetaMatch[1])
  }

  // GET /api/share/{shareToken}/chunk/{index} — raw binary shared chunk
  const shareChunkMatch = pathname.match(/^\/api\/share\/([a-f0-9-]+)\/chunk\/(\d+)$/)
  if (shareChunkMatch && method === "GET") {
    return handleShareChunk(shareChunkMatch[1], parseInt(shareChunkMatch[2], 10))
  }

  return new Response("Not Found", { status: 404 })
}
