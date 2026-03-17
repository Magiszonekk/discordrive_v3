import { buildContext, prisma } from "../context"
import { uploadChunksParallel, uploadSingleChunk } from "@discordrive/discord-client"
import { config } from "@discordrive/config"
import { z } from "zod"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// ============= Legacy single-request multipart upload (small files) =============

const MetaSchema = z.object({
  name:         z.string().min(1).max(255),
  size:         z.number().int().min(1).max(config.maxUploadSize),
  hash:         z.string().regex(/^[a-f0-9]{64}$/),
  mimeType:     z.string().min(1),
  isAnonymous:  z.boolean(),
  encryptedKey: z.string().optional(),
  wrappingIv:   z.string().optional(),
  salt:         z.string().optional(),
  folderId:     z.string().optional(),
  chunks:       z.array(z.object({ index: z.number().int().min(0), iv: z.string().min(1) })).min(1),
})

export async function handleUpload(req: Request): Promise<Response> {
  const { userId } = buildContext(req)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonResponse({ error: "Nieprawidłowe dane formularza" }, 400)
  }

  const metaRaw = formData.get("meta")
  if (typeof metaRaw !== "string") return jsonResponse({ error: "Brak pola meta" }, 400)

  let meta: z.infer<typeof MetaSchema>
  try {
    const parsed = MetaSchema.safeParse(JSON.parse(metaRaw))
    if (!parsed.success) return jsonResponse({ error: `Nieprawidłowe meta: ${parsed.error.message}` }, 400)
    meta = parsed.data
  } catch {
    return jsonResponse({ error: "Nieprawidłowy JSON w meta" }, 400)
  }

  const { name, size, hash, mimeType, isAnonymous, encryptedKey, wrappingIv, salt, folderId, chunks: chunkMeta } = meta

  if (!isAnonymous && !userId) {
    return jsonResponse({ error: "Musisz być zalogowany aby przesłać plik jako authenticated" }, 401)
  }

  // Collect binary chunks from FormData
  const chunkInputs: { data: ArrayBuffer; index: number }[] = []
  for (const { index } of chunkMeta) {
    const blob = formData.get(`chunk_${index}`)
    if (!(blob instanceof Blob)) return jsonResponse({ error: `Brak chunka chunk_${index}` }, 400)
    chunkInputs.push({ data: await blob.arrayBuffer(), index })
  }

  const expiresAt = isAnonymous && config.anonymousTTLDays !== null
    ? new Date(Date.now() + config.anonymousTTLDays * 24 * 60 * 60 * 1000)
    : null

  const file = await prisma.file.create({
    data: { name, size, hash, mimeType, salt, isAnonymous, encryptedKey, wrappingIv, folderId: folderId ?? null, expiresAt, userId: userId ?? null },
  })

  try {
    const uploaded = await uploadChunksParallel(chunkInputs)

    await prisma.chunk.createMany({
      data: uploaded.map((uc) => {
        const orig = chunkMeta.find((c) => c.index === uc.chunkIndex)!
        return {
          index: uc.chunkIndex, messageId: uc.messageId, channelId: uc.channelId,
          webhookId: uc.webhookId, attachmentIndex: uc.attachmentIndex, iv: orig.iv, fileId: file.id,
        }
      }),
    })
  } catch (err) {
    await prisma.file.delete({ where: { id: file.id } })
    return jsonResponse({ error: `Błąd uploadu: ${(err as Error).message}` }, 500)
  }

  return jsonResponse({ fileId: file.id }, 201)
}

// ============= Per-chunk upload (large files) =============

const InitSchema = z.object({
  name:         z.string().min(1).max(255),
  size:         z.number().int().min(1).max(config.maxUploadSize),
  hash:         z.string().regex(/^[a-f0-9]{64}$/).optional(), // may be deferred to /complete
  mimeType:     z.string().min(1),
  isAnonymous:  z.boolean(),
  encryptedKey: z.string().optional(),
  wrappingIv:   z.string().optional(),
  salt:         z.string().optional(),
  folderId:     z.string().optional(),
  chunkCount:   z.number().int().min(1), // replaces chunks array — IVs come per-chunk via ?iv=
})

const CompleteBodySchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).optional()

/**
 * POST /api/upload/init
 * Body: JSON with file metadata + chunkCount. No binary data, no IVs.
 * Returns: { fileId, chunkCount }
 */
export async function handleUploadInit(req: Request): Promise<Response> {
  const { userId } = buildContext(req)

  let body: z.infer<typeof InitSchema>
  try {
    const parsed = InitSchema.safeParse(await req.json())
    if (!parsed.success) return jsonResponse({ error: `Nieprawidłowe dane: ${parsed.error.message}` }, 400)
    body = parsed.data
  } catch {
    return jsonResponse({ error: "Nieprawidłowy JSON" }, 400)
  }

  const { name, size, hash, mimeType, isAnonymous, encryptedKey, wrappingIv, salt, folderId, chunkCount } = body

  if (!isAnonymous && !userId) {
    return jsonResponse({ error: "Musisz być zalogowany aby przesłać plik jako authenticated" }, 401)
  }

  const expiresAt = isAnonymous && config.anonymousTTLDays !== null
    ? new Date(Date.now() + config.anonymousTTLDays * 24 * 60 * 60 * 1000)
    : null

  const file = await prisma.file.create({
    data: { name, size, hash: hash ?? "", mimeType, salt, isAnonymous, encryptedKey, wrappingIv, folderId: folderId ?? null, expiresAt, userId: userId ?? null },
  })

  return jsonResponse({ fileId: file.id, chunkCount }, 201)
}

/**
 * POST /api/upload/:fileId/chunk/:index
 * Body: raw binary (application/octet-stream)
 * Query: ?iv=base64encodedIV
 * Uploads single chunk to Discord and saves to DB.
 */
export async function handleUploadChunk(req: Request, fileId: string, chunkIndex: number, url: URL): Promise<Response> {
  const { userId } = buildContext(req)

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, isAnonymous: true, userId: true },
  })

  if (!file) return jsonResponse({ error: "Plik nie istnieje" }, 404)
  if (!file.isAnonymous && file.userId !== userId) {
    return jsonResponse({ error: "Brak uprawnień" }, 403)
  }

  const iv = url.searchParams.get("iv")
  if (!iv) return jsonResponse({ error: "Brak parametru iv" }, 400)

  const data = await req.arrayBuffer()
  if (data.byteLength === 0) return jsonResponse({ error: "Pusty chunk" }, 400)

  try {
    const uc = await uploadSingleChunk(data, chunkIndex)

    await prisma.chunk.create({
      data: {
        index: uc.chunkIndex, messageId: uc.messageId, channelId: uc.channelId,
        webhookId: uc.webhookId, attachmentIndex: uc.attachmentIndex, iv, fileId,
      },
    })
  } catch (err) {
    return jsonResponse({ error: `Błąd uploadu chunka: ${(err as Error).message}` }, 500)
  }

  return jsonResponse({ ok: true })
}

/**
 * POST /api/upload/:fileId/complete
 * Validates all chunks are present. Optionally finalizes the file hash (for streaming uploads
 * where hash couldn't be known at init time). Returns final confirmation.
 */
export async function handleUploadComplete(req: Request, fileId: string): Promise<Response> {
  const { userId } = buildContext(req)

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { _count: { select: { chunks: true } } },
  })

  if (!file) return jsonResponse({ error: "Plik nie istnieje" }, 404)
  if (!file.isAnonymous && file.userId !== userId) {
    return jsonResponse({ error: "Brak uprawnień" }, 403)
  }

  let body: z.infer<typeof CompleteBodySchema>
  try {
    body = CompleteBodySchema.parse(await req.json().catch(() => undefined))
  } catch {
    body = undefined
  }

  if (body?.hash) {
    await prisma.file.update({ where: { id: fileId }, data: { hash: body.hash } })
  }

  return jsonResponse({ fileId: file.id, chunksUploaded: file._count.chunks })
}
