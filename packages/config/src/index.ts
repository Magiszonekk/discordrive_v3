export const config = {
  // Limity plików
  maxChunkSize:  9.5 * 1024 * 1024,    // 9.5MB — margin for AES-GCM overhead (Discord limit: 10MB per attachment)
  maxUploadSize: 1024 * 1024 * 1024 * 1024,  // 1TB

  // TTL dla anonymous uploads (null = no expiry)
  anonymousTTLDays: 30 as number | null,

  // Crypto
  pbkdf2Iterations: 100_000,
  saltLength: 16,
  ivLength: 12,

  // Porty
  apiPort:      3000,
  frontendPort: 5173,

  // Środowisko
  nodeEnv:      process.env.NODE_ENV      ?? "development",
  apiUrl:       process.env.API_URL       ?? "http://localhost:3000",
  frontendUrl:  process.env.FRONTEND_URL  ?? "http://localhost:5173",
} as const

export type Config = typeof config

export function getConnectionString(): string {
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT = "5432" } = process.env
  if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB) {
    return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`
  }
  return process.env.DATABASE_URL!
}