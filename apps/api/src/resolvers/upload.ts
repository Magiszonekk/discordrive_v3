import { GraphQLError } from "graphql"
import { z } from "zod"
import { uploadBatch } from "@discordrive/discord-client"
import { config } from "@discordrive/config"
import type { Context } from "../context"

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
  salt:         z.string().min(1),
  isAnonymous:  z.boolean(),
  encryptedKey: z.string().optional(),
  folderId:     z.string().optional(),
  chunks:       z.array(ChunkSchema).min(1),
})

/** Dzieli tablicę na batche po `size` elementów */
function batchify<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size))
  }
  return batches
}

export const uploadResolvers = {
  Mutation: {
    async uploadFile(
      _: unknown,
      { input }: { input: z.infer<typeof UploadInputSchema> },
      { prisma, userId }: Context
    ) {
      const parsed = UploadInputSchema.safeParse(input)
      if (!parsed.success) {
        throw new GraphQLError(`Nieprawidłowe dane: ${parsed.error.message}`)
      }

      const { name, size, hash, mimeType, salt, isAnonymous, encryptedKey, folderId, chunks } = parsed.data

      if (!isAnonymous && !userId) {
        throw new GraphQLError("Musisz być zalogowany aby przesłać plik jako authenticated")
      }

      const expiresAt = isAnonymous
        ? new Date(Date.now() + config.anonymousTTLDays * 24 * 60 * 60 * 1000)
        : null

      // Stwórz rekord File przed uploadem — chunk records linkują się do niego
      const file = await prisma.file.create({
        data: { name, size, hash, mimeType, salt, isAnonymous, encryptedKey, folderId: folderId ?? null, expiresAt, userId: userId ?? null },
      })

      try {
        // Podziel chunki na batche po 10 (max Discord per message)
        const batches = batchify(chunks, 10)

        for (const batch of batches) {
          const uploadedChunks = await uploadBatch(
            batch.map((c) => ({
              data: Buffer.from(c.data, "base64").buffer as ArrayBuffer,
              index: c.index,
            }))
          )

          await prisma.chunk.createMany({
            data: uploadedChunks.map((uc) => {
              const original = batch.find((c) => c.index === uc.chunkIndex)!
              return {
                index:           uc.chunkIndex,
                messageId:       uc.messageId,
                channelId:       uc.channelId,
                webhookId:       uc.webhookId,
                attachmentIndex: uc.attachmentIndex,
                iv:              original.iv,
                fileId:          file.id,
              }
            }),
          })
        }
      } catch (err) {
        // Sprzątamy po sobie jeśli coś poszło nie tak
        await prisma.file.delete({ where: { id: file.id } })
        throw new GraphQLError(`Błąd uploadu: ${(err as Error).message}`)
      }

      return { fileId: file.id }
    },
  },
}
