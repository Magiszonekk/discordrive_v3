import { describe, test, expect, mock, beforeEach } from "bun:test"
import { AuthMutations } from "./auth"

// Mock signToken
const signTokenMock = mock(() => "mock-jwt-token")
mock.module("../context", () => ({
  signToken: signTokenMock,
}))

function makePrisma(): any {
  return {
    user: {
      findUnique: mock(() => null),
      create: mock(() => ({ id: "user-1", email: "test@test.com", passwordHash: "hashed" })),
      update: mock(() => ({})),
    },
  }
}

describe("AuthMutations.register", () => {
  test("creates user and returns token", async () => {
    const prisma = makePrisma()
    prisma.user.findUnique = mock(() => null)
    prisma.user.create = mock(() => ({ id: "user-1" }))

    const result = await AuthMutations.register(
      null, { email: "new@test.com", password: "pass123" }, { prisma, userId: null } as any
    )

    expect(result.token).toBe("mock-jwt-token")
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "new@test.com" } })
    expect(prisma.user.create).toHaveBeenCalledTimes(1)
  })

  test("throws on duplicate email", async () => {
    const prisma = makePrisma()
    prisma.user.findUnique = mock(() => ({ id: "existing" }))

    expect(
      AuthMutations.register(null, { email: "taken@test.com", password: "pass" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Email już zajęty")
  })
})

describe("AuthMutations.login", () => {
  test("returns token for valid credentials", async () => {
    const password = "correctpassword"
    const hash = await Bun.password.hash(password)

    const prisma = makePrisma()
    prisma.user.findUnique = mock(() => ({ id: "user-1", email: "test@test.com", passwordHash: hash }))

    const result = await AuthMutations.login(
      null, { email: "test@test.com", password }, { prisma, userId: null } as any
    )

    expect(result.token).toBe("mock-jwt-token")
  })

  test("throws on wrong email", async () => {
    const prisma = makePrisma()
    prisma.user.findUnique = mock(() => null)

    expect(
      AuthMutations.login(null, { email: "nobody@test.com", password: "pass" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Nieprawidłowy email lub hasło")
  })

  test("throws on wrong password", async () => {
    const hash = await Bun.password.hash("correct")
    const prisma = makePrisma()
    prisma.user.findUnique = mock(() => ({ id: "user-1", passwordHash: hash }))

    expect(
      AuthMutations.login(null, { email: "test@test.com", password: "wrong" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Nieprawidłowy email lub hasło")
  })
})

describe("AuthMutations.storeMasterKey", () => {
  test("stores key for logged in user", async () => {
    const prisma = makePrisma()
    const result = await AuthMutations.storeMasterKey(
      null, { key: "base64key" }, { prisma, userId: "user-1" } as any
    )

    expect(result).toBe(true)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" }, data: { masterKey: "base64key" },
    })
  })

  test("throws when not logged in", () => {
    const prisma = makePrisma()
    expect(
      AuthMutations.storeMasterKey(null, { key: "key" }, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})

describe("AuthMutations.deleteMasterKey", () => {
  test("deletes key for logged in user", async () => {
    const prisma = makePrisma()
    const result = await AuthMutations.deleteMasterKey(
      null, null, { prisma, userId: "user-1" } as any
    )

    expect(result).toBe(true)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" }, data: { masterKey: null },
    })
  })

  test("throws when not logged in", () => {
    const prisma = makePrisma()
    expect(
      AuthMutations.deleteMasterKey(null, null, { prisma, userId: null } as any)
    ).rejects.toThrow("Musisz być zalogowany")
  })
})
