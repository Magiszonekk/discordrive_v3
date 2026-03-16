export const typeDefs = `#graphql
  # ============= Query =============

  type Query {
    files:   FileQueries!
    folders: FolderQueries!
    me:      User
  }

  type FileQueries {
    list(folderId: ID):                  [FileInfo!]!
    download(fileId: ID!):               DownloadFileResult!
    downloadShared(shareToken: String!): SharedFileResult!
  }

  type FolderQueries {
    list(parentId: ID): [FolderInfo!]!
  }

  # ============= Mutation =============

  type Mutation {
    files:   FileMutations!
    folders: FolderMutations!
    auth:    AuthMutations!
  }

  type FileMutations {
    upload(input: UploadFileInput!): UploadFileResult!
    delete(fileId: ID!):             Boolean!
    move(fileId: ID!, folderId: ID): Boolean!
    enableSharing(fileId: ID!):      String!
    disableSharing(fileId: ID!):     Boolean!
  }

  type FolderMutations {
    create(name: String!, parentId: ID): FolderInfo!
    delete(folderId: ID!):               Boolean!
    rename(folderId: ID!, name: String!): FolderInfo!
  }

  type AuthMutations {
    register(email: String!, password: String!): AuthResult!
    login(email: String!, password: String!):    AuthResult!
  }

  # ============= Upload =============

  input UploadFileInput {
    name:         String!
    size:         Int!
    hash:         String!
    mimeType:     String!
    salt:         String!
    isAnonymous:  Boolean!
    encryptedKey: String
    folderId:     ID
    chunks:       [ChunkInput!]!
  }

  input ChunkInput {
    index: Int!
    data:  String!
    iv:    String!
  }

  type UploadFileResult {
    fileId: ID!
  }

  # ============= Download =============

  type DownloadFileResult {
    fileId:       ID!
    name:         String!
    mimeType:     String!
    hash:         String!
    salt:         String!
    encryptedKey: String
    chunks:       [DownloadChunk!]!
  }

  type SharedFileResult {
    fileId:   ID!
    name:     String!
    mimeType: String!
    hash:     String!
    chunks:   [DownloadChunk!]!
  }

  type DownloadChunk {
    index: Int!
    data:  String!
    iv:    String!
  }

  # ============= File & Folder =============

  type FileInfo {
    fileId:     ID!
    name:       String!
    size:       Int!
    mimeType:   String!
    createdAt:  String!
    expiresAt:  String
    folderId:   ID
    shareToken: String
  }

  type FolderInfo {
    folderId:  ID!
    name:      String!
    createdAt: String!
    parentId:  ID
  }

  # ============= Auth =============

  type User {
    id:        ID!
    email:     String!
    createdAt: String!
  }

  type AuthResult {
    token: String!
  }
`
