import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { getConnectionString } from "./index"

describe("getConnectionString", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv }
  })

  test("builds URL from individual POSTGRES_* vars", () => {
    process.env.POSTGRES_USER = "admin"
    process.env.POSTGRES_PASSWORD = "secret"
    process.env.POSTGRES_DB = "mydb"
    process.env.POSTGRES_PORT = "5433"

    expect(getConnectionString()).toBe("postgresql://admin:secret@localhost:5433/mydb")
  })

  test("defaults port to 5432", () => {
    process.env.POSTGRES_USER = "admin"
    process.env.POSTGRES_PASSWORD = "secret"
    process.env.POSTGRES_DB = "mydb"
    delete process.env.POSTGRES_PORT

    expect(getConnectionString()).toBe("postgresql://admin:secret@localhost:5432/mydb")
  })

  test("falls back to DATABASE_URL", () => {
    delete process.env.POSTGRES_USER
    delete process.env.POSTGRES_PASSWORD
    delete process.env.POSTGRES_DB
    process.env.DATABASE_URL = "postgresql://fallback:pass@remote:5432/db"

    expect(getConnectionString()).toBe("postgresql://fallback:pass@remote:5432/db")
  })
})
