// src/index.ts
var config = {
  maxChunkSize: 9.5 * 1024 * 1024,
  maxUploadSize: 1024 * 1024 * 1024 * 1024,
  anonymousTTLDays: 30,
  pbkdf2Iterations: 1e5,
  saltLength: 16,
  ivLength: 12,
  apiPort: 3000,
  frontendPort: 5173,
  nodeEnv: "development",
  apiUrl: process.env.API_URL ?? "http://localhost:3000",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173"
};
function getConnectionString() {
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT = "5432" } = process.env;
  if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB) {
    return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`;
  }
  return process.env.DATABASE_URL;
}
export {
  getConnectionString,
  config
};
