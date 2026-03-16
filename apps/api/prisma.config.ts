import path from "path"
import { readFileSync } from "fs"
import { defineConfig } from "prisma/config"

// Load infra/.env (single source of truth for DB credentials)
const envPath = path.join(import.meta.dirname, "../../infra/.env")
try {
  const content = readFileSync(envPath, "utf-8")
  for (const line of content.split(/\r?\n/)) {
    const eqIndex = line.indexOf("=")
    if (eqIndex === -1 || line.startsWith("#")) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    if (key && !process.env[key]) {
      process.env[key] = value
    }
  }
} catch {}

const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT = "5432" } = process.env
const url = POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB
  ? `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`
  : process.env.DATABASE_URL

export default defineConfig({
  schema: path.join(import.meta.dirname, "prisma/schema.prisma"),
  datasource: { url },
})
