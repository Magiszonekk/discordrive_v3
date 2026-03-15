import { GraphQLError } from "graphql"
import { downloadChunk } from "@discordrive/discord-client"
import type { Context } from "../context"

export const downloadResolvers = {
  Query: {
    async downloadFile(
      _: unknown,
      { fileId }: { fileId: string },
      { prisma }: Context
    ) {
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        include: { chunks: { orderBy: { index: "asc" } } },
      })

      if (!file) throw new GraphQLError("Plik nie istnieje")

      if (file.expiresAt && file.expiresAt < new Date()) {
        throw new GraphQLError("Link wygasł")
      }

      // Pobierz wszystkie chunki równolegle
      const downloadedChunks = await Promise.all(
        file.chunks.map(async (chunk) => {
          const data = await downloadChunk(chunk.messageId, chunk.webhookId, chunk.attachmentIndex)
          return {
            index: chunk.index,
            data:  Buffer.from(data).toString("base64"),
            iv:    chunk.iv,
          }
        })
      )

      return {
        fileId:       file.id,
        name:         file.name,
        mimeType:     file.mimeType,
        hash:         file.hash,
        salt:         file.salt,
        encryptedKey: file.encryptedKey ?? null,
        chunks:       downloadedChunks,
      }
    },
  },
}
