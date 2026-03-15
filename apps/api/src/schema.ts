export const typeDefs = /* GraphQL */ `
  type Query {
    downloadFile(fileId: ID!):                  DownloadFileResult!
    downloadSharedFile(shareToken: String!):     SharedFileResult!
    myFiles(folderId: ID):                       [FileInfo!]!
    myFolders(parentId: ID):                     [FolderInfo!]!
  }

  type Mutation {
    register(email: String!, password: String!): AuthResult!
    login(email: String!, password: String!):    AuthResult!
    uploadFile(input: UploadFileInput!):         UploadFileResult!
    deleteFile(fileId: ID!):                     Boolean!
    createFolder(name: String!, parentId: ID):   FolderInfo!
    deleteFolder(folderId: ID!):                 Boolean!
    renameFolder(folderId: ID!, name: String!):  FolderInfo!
    moveFile(fileId: ID!, folderId: ID):         Boolean!
    enableSharing(fileId: ID!):                  String!
    disableSharing(fileId: ID!):                 Boolean!
  }

  # ——— Upload ———

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

  # ——— Download ———

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

  # ——— File list ———

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

  # ——— Folders ———

  type FolderInfo {
    folderId:  ID!
    name:      String!
    createdAt: String!
    parentId:  ID
  }

  # ——— Auth ———

  type AuthResult {
    token: String!
  }
`
