import { createYoga } from "graphql-yoga"
import { makeExecutableSchema } from "@graphql-tools/schema"
import { typeDefs } from "./schema"
import { resolvers } from "./resolvers"
import { buildContext } from "./context"

const schema = makeExecutableSchema({ typeDefs, resolvers })

const yoga = createYoga({
  schema,
  context: ({ request }) => buildContext(request),
})

const server = Bun.serve({
  port: 3000,
  fetch: yoga.fetch,
})

console.log(`GraphQL API running on http://localhost:${server.port}/graphql`)
