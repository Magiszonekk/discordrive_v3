import { GraphQLError } from "graphql"
import { deleteChunks } from "@discordrive/discord-client"
import type { Context } from "../context"

export const fileResolvers = {
  Query: {
    async myFiles(
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
        size:       f.size,
        mimeType:   f.mimeType,
        createdAt:  f.createdAt.toISOString(),
        expiresAt:  f.expiresAt?.toISOString() ?? null,
        folderId:   f.folderId ?? null,
        shareToken: f.shareToken ?? null,
      }))
    },
  },

  Mutation: {
    async deleteFile(
      _: unknown,
      { fileId }: { fileId: string },
      { prisma, userId }: Context
    ) {
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        include: { chunks: true },
      })

      if (!file) throw new GraphQLError("Plik nie istnieje")

      // Anonimowe pliki może usunąć każdy (brak właściciela),
      // authenticated pliki tylko właściciel
      if (!file.isAnonymous && file.userId !== userId) {
        throw new GraphQLError("Brak uprawnień")
      }

      await deleteChunks(file.chunks)
      await prisma.file.delete({ where: { id: fileId } })

      return true
    },
  },
}
