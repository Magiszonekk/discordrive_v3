import { authResolvers } from "./auth"
import { uploadResolvers } from "./upload"
import { downloadResolvers } from "./download"
import { fileResolvers } from "./file"
import { folderResolvers } from "./folder"
import { shareResolvers } from "./share"

export const resolvers = {
  Query: {
    ...downloadResolvers.Query,
    ...fileResolvers.Query,
    ...folderResolvers.Query,
    ...shareResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...uploadResolvers.Mutation,
    ...fileResolvers.Mutation,
    ...folderResolvers.Mutation,
    ...shareResolvers.Mutation,
  },
}
