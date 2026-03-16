import { GraphQLError } from "graphql"
import type { Context } from "../context"
import { signToken } from "../context"

export const AuthMutations = {
  async register(
      _: unknown,
      { email, password }: { email: string; password: string },
      { prisma }: Context
    ) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) throw new GraphQLError("Email już zajęty")

      const passwordHash = await Bun.password.hash(password)
      const user = await prisma.user.create({ data: { email, passwordHash } })

      return { token: signToken(user.id) }
    },

    async login(
      _: unknown,
      { email, password }: { email: string; password: string },
      { prisma }: Context
    ) {
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) throw new GraphQLError("Nieprawidłowy email lub hasło")

      const valid = await Bun.password.verify(password, user.passwordHash)
      if (!valid) throw new GraphQLError("Nieprawidłowy email lub hasło")

      return { token: signToken(user.id) }
    },

    async storeMasterKey(
      _: unknown,
      { key }: { key: string },
      { prisma, userId }: Context
    ) {
      if (!userId) throw new GraphQLError("Musisz być zalogowany")
      await prisma.user.update({ where: { id: userId }, data: { masterKey: key } })
      return true
    },

    async deleteMasterKey(
      _: unknown,
      __: unknown,
      { prisma, userId }: Context
    ) {
      if (!userId) throw new GraphQLError("Musisz być zalogowany")
      await prisma.user.update({ where: { id: userId }, data: { masterKey: null } })
      return true
    },
}
