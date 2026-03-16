import { GraphQLError } from "graphql"
import type { Context } from "../context"

// ============= FolderQueries =============

export const FolderQueries = {
  async list(
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
}

// ============= FolderMutations =============

export const FolderMutations = {
  async create(
    _: unknown,
    { name, parentId }: { name: string; parentId?: string | null },
    { prisma, userId }: Context
  ) {
    if (!userId) throw new GraphQLError("Musisz być zalogowany")

    if (parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: parentId } })
      if (!parent || parent.userId !== userId) throw new GraphQLError("Folder nadrzędny nie istnieje")
    }

    const folder = await prisma.folder.create({ data: { name, userId, parentId: parentId ?? null } })

    return { folderId: folder.id, name: folder.name, createdAt: folder.createdAt.toISOString(), parentId: folder.parentId ?? null }
  },

  async delete(
    _: unknown,
    { folderId }: { folderId: string },
    { prisma, userId }: Context
  ) {
    if (!userId) throw new GraphQLError("Musisz być zalogowany")

    const folder = await prisma.folder.findUnique({ where: { id: folderId } })
    if (!folder || folder.userId !== userId) throw new GraphQLError("Folder nie istnieje")

    // Pliki w folderze trafiają do roota — nie są kasowane
    await prisma.file.updateMany({ where: { folderId }, data: { folderId: null } })
    await prisma.folder.delete({ where: { id: folderId } })
    return true
  },

  async rename(
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
}
