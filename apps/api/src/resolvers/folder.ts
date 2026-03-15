import { GraphQLError } from "graphql"
import type { Context } from "../context"

export const folderResolvers = {
  Query: {
    async myFolders(
      _: unknown,
      { parentId }: { parentId?: string | null },
      { prisma, userId }: Context
    ) {
      if (!userId) throw new GraphQLError("Musisz być zalogowany")

      const folders = await prisma.folder.findMany({
        where: { userId, parentId: parentId ?? null },
        orderBy: { name: "asc" },
      })

      return folders.map((f) => ({
        folderId:  f.id,
        name:      f.name,
        createdAt: f.createdAt.toISOString(),
        parentId:  f.parentId ?? null,
      }))
    },
  },

  Mutation: {
    async createFolder(
      _: unknown,
      { name, parentId }: { name: string; parentId?: string | null },
      { prisma, userId }: Context
    ) {
      if (!userId) throw new GraphQLError("Musisz być zalogowany")

      if (parentId) {
        const parent = await prisma.folder.findUnique({ where: { id: parentId } })
        if (!parent || parent.userId !== userId) throw new GraphQLError("Folder nadrzędny nie istnieje")
      }

      const folder = await prisma.folder.create({
        data: { name, userId, parentId: parentId ?? null },
      })

      return { folderId: folder.id, name: folder.name, createdAt: folder.createdAt.toISOString(), parentId: folder.parentId ?? null }
    },

    async deleteFolder(
      _: unknown,
      { folderId }: { folderId: string },
      { prisma, userId }: Context
    ) {
      if (!userId) throw new GraphQLError("Musisz być zalogowany")

      const folder = await prisma.folder.findUnique({ where: { id: folderId } })
      if (!folder || folder.userId !== userId) throw new GraphQLError("Folder nie istnieje")

      // Pliki w folderze trafiają do roota (nie są kasowane)
      await prisma.file.updateMany({ where: { folderId }, data: { folderId: null } })
      await prisma.folder.delete({ where: { id: folderId } })

      return true
    },

    async renameFolder(
      _: unknown,
      { folderId, name }: { folderId: string; name: string },
      { prisma, userId }: Context
    ) {
      if (!userId) throw new GraphQLError("Musisz być zalogowany")

      const folder = await prisma.folder.findUnique({ where: { id: folderId } })
      if (!folder || folder.userId !== userId) throw new GraphQLError("Folder nie istnieje")

      const updated = await prisma.folder.update({ where: { id: folderId }, data: { name } })

      return { folderId: updated.id, name: updated.name, createdAt: updated.createdAt.toISOString(), parentId: updated.parentId ?? null }
    },

    async moveFile(
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
  },
}
