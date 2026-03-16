import { describe, test, expect, mock, beforeEach } from "bun:test"
import { FileQueries, FileMutations } from "./files"

// Mock discord-client
mock.module("@discordrive/discord-client", () => ({
  uploadChunksParallel: mock(() => []),
  downloadChunk: mock(() => new Uint8Array([1, 2, 3]).buffer),
  deleteChunks: mock(() => Promise.resolve()),
}))

const now = new Date("2025-01-01T00:00:00Z")

function makePrisma(): any {
  return {
    file: {
      findMany: mock(() => []),
      findUnique: mock(() => null),
      create: mock(() => ({ id: "file-1" })),
      update: mock(() => ({})),
      delete: mock(() => ({})),
    },
    chunk: {
      createMany: mock(() => ({})),
      findMany: mock(() => []),
      deleteMany: mock(() => ({})),
    },
    folder: {
      findUnique: mock(() => null),
    },
  }
}

// ============= FileQueries =============

describe("FileQueries.list", () => {
  test("returns mapped files for logged-in user", async () => {
    const prisma = makePrisma()
    prisma.file.findMany = mock(() => [
      {
        id: "f1", name: "doc.pdf", size: 1024, mimeType: "application/pdf",
        createdAt: now, expiresAt: null, folderId: null, shareToken: null,
      },
    ])

    const result = await FileQueries.list(null, { folderId: null }, { prisma, userId: "user-1" } as any)

    expect(result).toEqual([{
      fileId: "f1", name: "doc.pdf", size: 1024, mimeType: "application/pdf",
      createdAt: now.toISOString(), expiresAt: null, folderId: null, shareToken: null,
    }])
  })

  test("throws when not logged in", () => {
    const prisma = makePrisma()
    expect(
      FileQueries.list(null, {}, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})

describe("FileQueries.download", () => {
  test("throws when file not found", () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => null)

    expect(
      FileQueries.download(null, { fileId: "nope" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Plik nie istnieje")
  })

  test("throws when file expired", () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({
      id: "f1", expiresAt: new Date("2020-01-01"), chunks: [],
    }))

    expect(
      FileQueries.download(null, { fileId: "f1" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Link wygasł")
  })
})

describe("FileQueries.downloadShared", () => {
  test("throws when share token not found", () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => null)

    expect(
      FileQueries.downloadShared(null, { shareToken: "invalid" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Plik nie istnieje lub nie jest udostępniony")
  })
})

// ============= FileMutations =============

describe("FileMutations.delete", () => {
  test("deletes owned file", async () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({
      id: "f1", userId: "user-1", isAnonymous: false, chunks: [],
    }))

    const result = await FileMutations.delete(
      null, { fileId: "f1" }, { prisma, userId: "user-1" } as any
    )

    expect(result).toBe(true)
    expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: "f1" } })
  })

  test("throws when not owner", () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({
      id: "f1", userId: "other", isAnonymous: false, chunks: [],
    }))

    expect(
      FileMutations.delete(null, { fileId: "f1" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Brak uprawnień")
  })

  test("throws when file not found", () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => null)

    expect(
      FileMutations.delete(null, { fileId: "nope" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Plik nie istnieje")
  })
})

describe("FileMutations.move", () => {
  test("moves file to folder", async () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({ id: "f1", userId: "user-1" }))
    prisma.folder.findUnique = mock(() => ({ id: "folder-1", userId: "user-1" }))

    const result = await FileMutations.move(
      null, { fileId: "f1", folderId: "folder-1" }, { prisma, userId: "user-1" } as any
    )

    expect(result).toBe(true)
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: "f1" }, data: { folderId: "folder-1" },
    })
  })

  test("moves file to root (null folderId)", async () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({ id: "f1", userId: "user-1" }))

    const result = await FileMutations.move(
      null, { fileId: "f1", folderId: null }, { prisma, userId: "user-1" } as any
    )

    expect(result).toBe(true)
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: "f1" }, data: { folderId: null },
    })
  })

  test("throws when target folder belongs to another user", () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({ id: "f1", userId: "user-1" }))
    prisma.folder.findUnique = mock(() => ({ id: "folder-1", userId: "other" }))

    expect(
      FileMutations.move(null, { fileId: "f1", folderId: "folder-1" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Folder docelowy nie istnieje")
  })

  test("throws when not logged in", () => {
    const prisma = makePrisma()
    expect(
      FileMutations.move(null, { fileId: "f1" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})

describe("FileMutations.enableSharing", () => {
  test("generates share token for owned file", async () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({ id: "f1", userId: "user-1" }))

    const token = await FileMutations.enableSharing(
      null, { fileId: "f1" }, { prisma, userId: "user-1" } as any
    )

    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(0)
    expect(prisma.file.update).toHaveBeenCalledTimes(1)
  })

  test("throws when not owner", () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({ id: "f1", userId: "other" }))

    expect(
      FileMutations.enableSharing(null, { fileId: "f1" }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Plik nie istnieje")
  })

  test("throws when not logged in", () => {
    const prisma = makePrisma()
    expect(
      FileMutations.enableSharing(null, { fileId: "f1" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})

describe("FileMutations.disableSharing", () => {
  test("clears share token", async () => {
    const prisma = makePrisma()
    prisma.file.findUnique = mock(() => ({ id: "f1", userId: "user-1" }))

    const result = await FileMutations.disableSharing(
      null, { fileId: "f1" }, { prisma, userId: "user-1" } as any
    )

    expect(result).toBe(true)
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: "f1" }, data: { shareToken: null },
    })
  })
})

describe("FileMutations.upload", () => {
  test("rejects invalid input", () => {
    const prisma = makePrisma()
    const badInput = { name: "", size: -1, hash: "bad", mimeType: "", isAnonymous: false, chunks: [] }

    expect(
      FileMutations.upload(null, { input: badInput as any }, { prisma, userId: "user-1" } as any)
    ).rejects.toThrow("Nieprawidłowe dane")
  })

  test("requires login for non-anonymous upload", () => {
    const prisma = makePrisma()
    const input = {
      name: "test.txt", size: 100, hash: "a".repeat(64), mimeType: "text/plain",
      isAnonymous: false, chunks: [{ index: 0, data: "AQID", iv: "AQID" }],
    }

    expect(
      FileMutations.upload(null, { input }, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})
