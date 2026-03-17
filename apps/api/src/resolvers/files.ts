import { GraphQLError } from "graphql"
import { z } from "zod"
import { uploadChunksParallel, downloadChunk, deleteChunks } from "@discordrive/discord-client"
import { config } from "@discordrive/config"
import type { Context } from "../context"

// ============= Zod schemas =============

const ChunkSchema = z.object({
  index: z.number().int().min(0),
  data:  z.string().min(1),
  iv:    z.string().min(1),
})

const UploadInputSchema = z.object({
  name:         z.string().min(1).max(255),
  size:         z.number().int().min(1).max(config.maxUploadSize),
  hash:         z.string().regex(/^[a-f0-9]{64}$/),
  mimeType:     z.string().min(1),
  salt:         z.string().optional(),
  isAnonymous:  z.boolean(),
  encryptedKey: z.string().optional(),
  wrappingIv:   z.string().optional(),
  folderId:     z.string().optional(),
  chunks:       z.array(ChunkSchema).min(1),
})

// ============= FileQueries =============

export const FileQueries = {
  async list(
    _: unknown,
    { folderId }: { folderId?: string | null },
    { prisma, userId }: Context
  ) {
    if (!userId) throw new GraphQLError("Musisz być zalogowany")

    const files = await prisma.file.findMany({
      where: { userId, folderId: folderId !== undefined ? (folderId ?? null) : undefined },
      orderBy: { createdAt: "desc" },
    })

    return files.map((f) => ({
      fileId:     f.id,
      name:       f.name,
      size:       Number(f.size),
      mimeType:   f.mimeType,
      createdAt:  f.createdAt.toISOString(),
      expiresAt:  f.expiresAt?.toISOString() ?? null,
      folderId:   f.folderId ?? null,
      shareToken: f.shareToken ?? null,
    }))
  },

  async download(
    _: unknown,
    { fileId }: { fileId: string },
    { prisma }: Context
  ) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { chunks: { orderBy: { index: "asc" } } },
    })

    if (!file) throw new GraphQLError("Plik nie istnieje")
    if (file.expiresAt && file.expiresAt < new Date()) throw new GraphQLError("Link wygasł")

    const chunks = await Promise.all(
      file.chunks.map(async (chunk) => {
        const data = await downloadChunk(chunk.messageId, chunk.webhookId, chunk.attachmentIndex)
        return { index: chunk.index, data: Buffer.from(data).toString("base64"), iv: chunk.iv }
      })
    )

    return {
      fileId:       file.id,
      name:         file.name,
      mimeType:     file.mimeType,
      hash:         file.hash,
      salt:         file.salt,
      encryptedKey: file.encryptedKey ?? null,
      wrappingIv:   file.wrappingIv ?? null,
      chunks,
    }
  },

  async downloadShared(
    _: unknown,
    { shareToken }: { shareToken: string },
    { prisma }: Context
  ) {
    const file = await prisma.file.findUnique({
      where: { shareToken },
      include: { chunks: { orderBy: { index: "asc" } } },
    })

    if (!file) throw new GraphQLError("Plik nie istnieje lub nie jest udostępniony")
    if (file.expiresAt && file.expiresAt < new Date()) throw new GraphQLError("Link wygasł")

    const chunks = await Promise.all(
      file.chunks.map(async (chunk) => {
        const data = await downloadChunk(chunk.messageId, chunk.webhookId, chunk.attachmentIndex)
        return { index: chunk.index, data: Buffer.from(data).toString("base64"), iv: chunk.iv }
      })
    )

    return { fileId: file.id, name: file.name, mimeType: file.mimeType, hash: file.hash, chunks }
  },
}

// ============= FileMutations =============

export const FileMutations = {
  async upload(
    _: unknown,
    { input }: { input: z.infer<typeof UploadInputSchema> },
    { prisma, userId }: Context
  ) {
    const parsed = UploadInputSchema.safeParse(input)
    if (!parsed.success) throw new GraphQLError(`Nieprawidłowe dane: ${parsed.error.message}`)

    const { name, size, hash, mimeType, salt, isAnonymous, encryptedKey, wrappingIv, folderId, chunks } = parsed.data

    if (!isAnonymous && !userId) {
      throw new GraphQLError("Musisz być zalogowany aby przesłać plik jako authenticated")
    }

    const expiresAt = isAnonymous && config.anonymousTTLDays !== null
      ? new Date(Date.now() + config.anonymousTTLDays * 24 * 60 * 60 * 1000)
      : null

    const file = await prisma.file.create({
      data: { name, size, hash, mimeType, salt, isAnonymous, encryptedKey, wrappingIv, folderId: folderId ?? null, expiresAt, userId: userId ?? null },
    })

    try {
      const uploaded = await uploadChunksParallel(
        chunks.map((c) => ({ data: Buffer.from(c.data, "base64").buffer as ArrayBuffer, index: c.index }))
      )

      await prisma.chunk.createMany({
        data: uploaded.map((uc) => {
          const orig = chunks.find((c) => c.index === uc.chunkIndex)!
          return {
            index: uc.chunkIndex, messageId: uc.messageId, channelId: uc.channelId,
            webhookId: uc.webhookId, attachmentIndex: uc.attachmentIndex, iv: orig.iv, fileId: file.id,
          }
        }),
      })
    } catch (err) {
      await prisma.file.delete({ where: { id: file.id } })
      throw new GraphQLError(`Błąd uploadu: ${(err as Error).message}`)
    }

    return { fileId: file.id }
  },

  async delete(
    _: unknown,
    { fileId }: { fileId: string },
    { prisma, userId }: Context
  ) {
    const file = await prisma.file.findUnique({ where: { id: fileId }, include: { chunks: true } })
    if (!file) throw new GraphQLError("Plik nie istnieje")

    if (!file.isAnonymous && file.userId !== userId) throw new GraphQLError("Brak uprawnień")

    await deleteChunks(file.chunks)
    await prisma.file.delete({ where: { id: fileId } })
    return true
  },

  async move(
    _: unknown,
    { fileId, folderId }: { fileId: string; folderId?: string | null },
    { prisma, userId }: Context
  ) {
    if (!userId) throw new GraphQLError("Musisz być zalogowany")

    const file = await prisma.file.findUnique({ where: { id: fileId } })
    if (!file || file.userId !== userId) throw new GraphQLError("Plik nie istnieje")

    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } })
      if (!folder || folder.userId !== userId) throw new GraphQLError("Folder docelowy nie istnieje")
    }

    await prisma.file.update({ where: { id: fileId }, data: { folderId: folderId ?? null } })
    return true
  },

  async enableSharing(
    _: unknown,
    { fileId }: { fileId: string },
    { prisma, userId }: Context
  ) {
    if (!userId) throw new GraphQLError("Musisz być zalogowany")

    const file = await prisma.file.findUnique({ where: { id: fileId } })
    if (!file || file.userId !== userId) throw new GraphQLError("Plik nie istnieje")

    const shareToken = crypto.randomUUID()
    await prisma.file.update({ where: { id: fileId }, data: { shareToken } })
    return shareToken
  },

  async disableSharing(
    _: unknown,
    { fileId }: { fileId: string },
    { prisma, userId }: Context
  ) {
    if (!userId) throw new GraphQLError("Musisz być zalogowany")

    const file = await prisma.file.findUnique({ where: { id: fileId } })
    if (!file || file.userId !== userId) throw new GraphQLError("Plik nie istnieje")

    await prisma.file.update({ where: { id: fileId }, data: { shareToken: null } })
    return true
  },
}
