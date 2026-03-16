import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import jwt from "jsonwebtoken"
import { getConnectionString } from "@discordrive/config"

const adapter = new PrismaPg({ connectionString: getConnectionString() })
export const prisma = new PrismaClient({ adapter })

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me"

export interface Context {
  prisma: PrismaClient
  userId: string | null
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" })
}

export function buildContext(request: Request): Context {
  const auth = request.headers.get("Authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null

  let userId: string | null = null
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string }
      userId = payload.userId
    } catch {
      // token wygasł lub nieprawidłowy — traktujemy jako anonimowy
    }
  }

  return { prisma, userId }
}
