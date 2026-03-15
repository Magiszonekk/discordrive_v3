import path from "path"
import { defineConfig } from "prisma/config"
import { PrismaPg } from "@prisma/adapter-pg"

export default defineConfig({
  schema: path.join(import.meta.dirname, "prisma/schema.prisma"),
  migrate: {
    async adapter() {
      return new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    },
  },
})
