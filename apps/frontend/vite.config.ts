import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"
import { config } from "@discordrive/config"

const apiTarget = `http://localhost:${config.apiPort}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': '{}'
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: config.frontendPort,
    proxy: {
      "/graphql": apiTarget,
      "/api": apiTarget,
      "/s": apiTarget,
    },
  },
})
