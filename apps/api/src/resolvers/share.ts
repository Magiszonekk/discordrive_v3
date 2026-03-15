import { GraphQLError } from "graphql"
import { downloadChunk } from "@discordrive/discord-client"
import type { Context } from "../context"

export const shareResolvers = {
  Query: {
    async downloadSharedFile(
      _: unknown,
      { shareToken }: { shareToken: string },
      { prisma }: Context
    ) {
      const file = await prisma.file.findUnique({
        where: { shareToken },
        include: { chunks: { orderBy: { index: "asc" } } },
      })

      if (!file) throw new GraphQLError("Plik nie istnieje lub nie jest udostępniony")

      if (file.expiresAt && file.expiresAt < new Date()) {
        throw new GraphQLError("Link wygasł")
      }

      const chunks = await Promise.all(
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
        fileId:   file.id,
        name:     file.name,
        mimeType: file.mimeType,
        hash:     file.hash,
        chunks,
      }
    },
  },

  Mutation: {
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
  },
}
