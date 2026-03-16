import { describe, test, expect, mock } from "bun:test"
import { FolderQueries, FolderMutations } from "./folders"

const now = new Date("2025-01-01T00:00:00Z")

function makePrisma(): any {
  return {
    folder: {
      findMany: mock(() => []),
      findUnique: mock(() => null),
      create: mock(() => ({ id: "folder-1", name: "Test", createdAt: now, parentId: null, userId: "user-1" })),
      update: mock(() => ({ id: "folder-1", name: "Renamed", createdAt: now, parentId: null })),
      delete: mock(() => ({})),
    },
    file: {
      updateMany: mock(() => ({})),
    },
  }
}

describe("FolderQueries.list", () => {
  test("returns mapped folders", async () => {
    const prisma = makePrisma()
    prisma.folder.findMany = mock(() => [
      { id: "f1", name: "Docs", createdAt: now, parentId: null },
      { id: "f2", name: "Photos", createdAt: now, parentId: "f1" },
    ])

    const result = await FolderQueries.list(null, { parentId: null }, { prisma, userId: "user-1" } as any)

    expect(result).toEqual([
      { folderId: "f1", name: "Docs", createdAt: now.toISOString(), parentId: null },
      { folderId: "f2", name: "Photos", createdAt: now.toISOString(), parentId: "f1" },
    ])
  })

  test("throws when not logged in", () => {
    const prisma = makePrisma()
    expect(
      FolderQueries.list(null, {}, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})

describe("FolderMutations.create", () => {
  test("creates root folder", async () => {
    const prisma = makePrisma()
    const result = await FolderMutations.create(
      null, { name: "Test" }, { prisma, userId: "user-1" } as any
    )

    expect(result.folderId).toBe("folder-1")
    expect(result.name).toBe("Test")
    expect(prisma.folder.create).toHaveBeenCalledTimes(1)
  })

  test("creates nested folder with valid parent", async () => {
    const prisma = makePrisma()
    prisma.folder.findUnique = mock(() => ({ id: "parent-1", userId: "user-1" }))

    await FolderMutations.create(
      null, { name: "Sub", parentId: "parent-1" }, { prisma, userId: "user-1" } as any
    )

    expect(prisma.folder.findUnique).toHaveBeenCalledWith({ where: { id: "parent-1" } })
    expect(prisma.folder.create).toHaveBeenCalledTimes(1)
  })

  test("throws when parent belongs to another user", () => {
    const prisma = makePrisma()
    prisma.folder.findUnique = mock(() => ({ id: "parent-1", userId: "other-user" }))

    expect(
      FolderMutations.create(null, { name: "Sub", parentId: "parent-1" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Folder nadrzędny nie istnieje")
  })

  test("throws when not logged in", () => {
    const prisma = makePrisma()
    expect(
      FolderMutations.create(null, { name: "X" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})

describe("FolderMutations.delete", () => {
  test("deletes folder and orphans files", async () => {
    const prisma = makePrisma()
    prisma.folder.findUnique = mock(() => ({ id: "f1", userId: "user-1" }))

    const result = await FolderMutations.delete(
      null, { folderId: "f1" }, { prisma, userId: "user-1" } as any
    )

    expect(result).toBe(true)
    expect(prisma.file.updateMany).toHaveBeenCalledWith({ where: { folderId: "f1" }, data: { folderId: null } })
    expect(prisma.folder.delete).toHaveBeenCalledWith({ where: { id: "f1" } })
  })

  test("throws when folder not found", () => {
    const prisma = makePrisma()
    prisma.folder.findUnique = mock(() => null)

    expect(
      FolderMutations.delete(null, { folderId: "nope" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Folder nie istnieje")
  })

  test("throws when folder belongs to another user", () => {
    const prisma = makePrisma()
    prisma.folder.findUnique = mock(() => ({ id: "f1", userId: "other" }))

    expect(
      FolderMutations.delete(null, { folderId: "f1" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Folder nie istnieje")
  })
})

describe("FolderMutations.rename", () => {
  test("renames folder", async () => {
    const prisma = makePrisma()
    prisma.folder.findUnique = mock(() => ({ id: "f1", userId: "user-1" }))

    const result = await FolderMutations.rename(
      null, { folderId: "f1", name: "Renamed" }, { prisma, userId: "user-1" } as any
    )

    expect(result.name).toBe("Renamed")
    expect(prisma.folder.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { name: "Renamed" } })
  })

  test("throws when not owner", () => {
    const prisma = makePrisma()
    prisma.folder.findUnique = mock(() => ({ id: "f1", userId: "other" }))

    expect(
      FolderMutations.rename(null, { folderId: "f1", name: "X" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Folder nie istnieje")
  })
})
