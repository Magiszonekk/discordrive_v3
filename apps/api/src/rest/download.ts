import { buildContext, prisma } from "../context"
import { downloadChunk } from "@discordrive/discord-client"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * GET /api/download/:fileId/meta
 * Zwraca metadane pliku + listę chunków (index, iv) bez danych binarnych.
 */
export async function handleDownloadMeta(req: Request, fileId: string): Promise<Response> {
  const { userId } = buildContext(req)

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { chunks: { orderBy: { index: "asc" } } },
  })

  if (!file) return jsonResponse({ error: "Plik nie istnieje" }, 404)
  if (file.expiresAt && file.expiresAt < new Date()) return jsonResponse({ error: "Link wygasł" }, 410)

  // Auth check: non-anonymous files require owner
  if (!file.isAnonymous && file.userId !== userId) {
    return jsonResponse({ error: "Brak uprawnień" }, 403)
  }

  return jsonResponse({
    fileId: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    hash: file.hash,
    salt: file.salt,
    encryptedKey: file.encryptedKey ?? null,
    wrappingIv: file.wrappingIv ?? null,
    chunks: file.chunks.map((c) => ({ index: c.index, iv: c.iv })),
  })
}

/**
 * GET /api/download/:fileId/chunk/:index
 * Zwraca surowe dane binarne pojedynczego chunka (application/octet-stream).
 */
export async function handleDownloadChunk(req: Request, fileId: string, chunkIndex: number): Promise<Response> {
  const { userId } = buildContext(req)

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, isAnonymous: true, userId: true, expiresAt: true },
  })

  if (!file) return jsonResponse({ error: "Plik nie istnieje" }, 404)
  if (file.expiresAt && file.expiresAt < new Date()) return jsonResponse({ error: "Link wygasł" }, 410)
  if (!file.isAnonymous && file.userId !== userId) {
    return jsonResponse({ error: "Brak uprawnień" }, 403)
  }

  const chunk = await prisma.chunk.findFirst({
    where: { fileId, index: chunkIndex },
  })

  if (!chunk) return jsonResponse({ error: `Chunk ${chunkIndex} nie istnieje` }, 404)

  const data = await downloadChunk(chunk.messageId, chunk.webhookId, chunk.attachmentIndex)

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": data.byteLength.toString(),
    },
  })
}
