import { createYoga } from "graphql-yoga"
import { makeExecutableSchema } from "@graphql-tools/schema"
import { config } from "@discordrive/config"
import { typeDefs } from "./schema"
import { resolvers } from "./resolvers"
import { buildContext } from "./context"
import { handleRest } from "./rest"

const schema = makeExecutableSchema({ typeDefs, resolvers })

const yoga = createYoga({
  schema,
  context: ({ request }) => buildContext(request),
  graphqlEndpoint: "/graphql",
})

const server = Bun.serve({
  port: config.apiPort,
  maxRequestBodySize: 1024 * 1024 * 1024, // 1GB — pliki lecą jako base64 w JSON
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname.startsWith("/s/") || url.pathname.startsWith("/api/")) {
      return handleRest(req, url)
    }

    return yoga.fetch(req)
  },
})

console.log(`DiscorDrive API running on http://localhost:${server.port}`)
