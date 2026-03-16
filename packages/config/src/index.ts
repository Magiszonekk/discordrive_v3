export const config = {
  // Limity plików
  maxChunkSize:  10 * 1024 * 1024,   // 10MB — limit Discorda (od Sep 2024)
  maxUploadSize: 1024 * 1024 * 1024 * 1024,  // 1TB

  // TTL dla anonymous uploads
  anonymousTTLDays: 30,

  // Crypto
  pbkdf2Iterations: 100_000,
  saltLength: 16,
  ivLength: 12,

  // Środowisko
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiUrl:  process.env.API_URL  ?? "http://localhost:3000",
} as const

export type Config = typeof config

export function getConnectionString(): string {
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT = "5432" } = process.env
  if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB) {
    return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`
  }
  return process.env.DATABASE_URL!
}