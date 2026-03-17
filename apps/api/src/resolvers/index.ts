import { GraphQLScalarType } from "graphql"
import { AuthMutations } from "./auth"
import { FileQueries, FileMutations } from "./files"
import { FolderQueries, FolderMutations } from "./folders"
import type { Context } from "../context"

const BigIntScalar = new GraphQLScalarType({
  name: "BigInt",
  serialize:    (value) => Number(value),
  parseValue:   (value) => BigInt(value as number),
  parseLiteral: (ast)   => "value" in ast ? BigInt(ast.value as string) : null,
})

export const resolvers = {
  BigInt: BigIntScalar,
  Query: {
    files:   () => ({}),
    folders: () => ({}),
    me: (_: unknown, __: unknown, { prisma, userId }: Context) => {
      if (!userId) return null
      return prisma.user.findUnique({ where: { id: userId } }).then((u) =>
        u ? { id: u.id, email: u.email, createdAt: u.createdAt.toISOString(), masterKey: u.masterKey ?? null } : null
      )
    },
  },
  Mutation: {
    files:   () => ({}),
    folders: () => ({}),
    auth:    () => ({}),
  },
  FileQueries,
  FolderQueries,
  FileMutations,
  FolderMutations,
  AuthMutations,
}
