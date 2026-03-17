import { prisma } from "../context"
import { downloadChunk } from "@discordrive/discord-client"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status)
}

export async function handleShareMeta(shareToken: string): Promise<Response> {
  const file = await prisma.file.findUnique({
    where: { shareToken },
    include: { chunks: { orderBy: { index: "asc" } } },
  })

  if (!file) return errorResponse("Plik nie istnieje lub nie jest udostępniony", 404)
  if (file.expiresAt && file.expiresAt < new Date()) return errorResponse("Link wygasł", 410)

  return jsonResponse({
    fileId: file.id,
    name: file.name,
    size: Number(file.size),
    mimeType: file.mimeType,
    hash: file.hash,
    chunkCount: file.chunks.length,
    chunks: file.chunks.map((c) => ({ index: c.index, iv: c.iv })),
  })
}

/**
 * GET /api/share/:shareToken/chunk/:index
 * Zwraca surowe dane binarne pojedynczego chunka (application/octet-stream).
 */
export async function handleShareChunk(shareToken: string, chunkIndex: number): Promise<Response> {
  const file = await prisma.file.findUnique({
    where: { shareToken },
    select: { id: true, expiresAt: true },
  })

  if (!file) return errorResponse("Plik nie istnieje lub nie jest udostępniony", 404)
  if (file.expiresAt && file.expiresAt < new Date()) return errorResponse("Link wygasł", 410)

  const chunk = await prisma.chunk.findFirst({
    where: { fileId: file.id, index: chunkIndex },
  })

  if (!chunk) return errorResponse(`Chunk ${chunkIndex} nie istnieje`, 404)

  const data = await downloadChunk(chunk.messageId, chunk.webhookId, chunk.attachmentIndex)

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": data.byteLength.toString(),
      "Access-Control-Allow-Origin": "*",
    },
  })
}
