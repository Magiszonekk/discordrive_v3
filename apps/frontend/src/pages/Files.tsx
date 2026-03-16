import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/useAuth"
import * as api from "@/api/queries"
import { encryptFile, decryptOwnFile, getMasterKey, buildShareUrl, saveMasterKeyToServer, triggerDownload } from "@/crypto"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { FileList } from "@/components/FileList"
import { FolderBreadcrumb } from "@/components/FolderBreadcrumb"
import { Upload, FolderPlus, LogOut, KeyRound } from "lucide-react"

export function Files() {
  const { logout } = useAuth()
  const [files, setFiles] = useState<api.FileInfo[]>([])
  const [folders, setFolders] = useState<api.FolderInfo[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Root" }])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([api.listFiles(currentFolder), api.listFolders(currentFolder)])
      setFiles(f)
      setFolders(d)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }, [currentFolder])

  useEffect(() => { refresh() }, [refresh])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    setUploading(true)
    setUploadProgress(10)

    try {
      const masterKey = await getMasterKey()
      setUploadProgress(20)

      const { chunks, encryptedKey, wrappingIv, hash } = await encryptFile(file, masterKey)
      setUploadProgress(70)

      await api.uploadFile({
        name: file.name,
        size: file.size,
        hash,
        mimeType: file.type || "application/octet-stream",
        isAnonymous: false,
        encryptedKey,
        wrappingIv,
        folderId: currentFolder ?? undefined,
        chunks,
      })
      setUploadProgress(100)
      toast.success(`Przesłano: ${file.name}`)
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleDownload(fileId: string) {
    try {
      toast.info("Pobieranie...")
      const result = await api.downloadFile(fileId)
      const blob = await decryptOwnFile(result)
      triggerDownload(blob, result.name)
      toast.success("Pobrano")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleDelete(fileId: string) {
    try {
      await api.deleteFile(fileId)
      toast.success("Usunięto")
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleShare(file: api.FileInfo) {
    try {
      let shareToken = file.shareToken
      if (!shareToken) {
        shareToken = await api.enableSharing(file.fileId)
      }

      // Need encryptedKey and wrappingIv to build share URL
      const fileData = await api.downloadFile(file.fileId)
      if (!fileData.encryptedKey || !fileData.wrappingIv) {
        toast.error("Plik nie ma zaszyfrowanego klucza")
        return
      }

      const url = await buildShareUrl(shareToken, fileData.encryptedKey, fileData.wrappingIv)
      await navigator.clipboard.writeText(url)
      toast.success("Link skopiowany do schowka")
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleDisableSharing(fileId: string) {
    try {
      await api.disableSharing(fileId)
      toast.success("Udostępnianie wyłączone")
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleCreateFolder() {
    const name = prompt("Nazwa folderu:")
    if (!name) return
    try {
      await api.createFolder(name, currentFolder)
      toast.success(`Folder "${name}" utworzony`)
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleDeleteFolder(folderId: string) {
    try {
      await api.deleteFolder(folderId)
      toast.success("Folder usunięty")
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function navigateToFolder(folderId: string | null, folderName?: string) {
    setCurrentFolder(folderId)
    if (folderId === null) {
      setFolderPath([{ id: null, name: "Root" }])
    } else {
      const existingIndex = folderPath.findIndex((f) => f.id === folderId)
      if (existingIndex >= 0) {
        setFolderPath(folderPath.slice(0, existingIndex + 1))
      } else {
        setFolderPath([...folderPath, { id: folderId, name: folderName ?? "Folder" }])
      }
    }
  }

  async function handleStoreMasterKey() {
    try {
      await saveMasterKeyToServer()
      toast.success("Klucz zapisany na serwerze")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">DiscorDrive</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleStoreMasterKey} title="Zapisz klucz na serwerze">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Actions bar */}
        <div className="flex items-center gap-3">
          <FolderBreadcrumb path={folderPath} onNavigate={navigateToFolder} />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCreateFolder}>
              <FolderPlus className="h-4 w-4 mr-1" /> Nowy folder
            </Button>
            <label className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-3 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              <Upload className="h-4 w-4" /> Prześlij
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Upload progress */}
        {uploading && <Progress value={uploadProgress} />}

        {/* File list */}
        <FileList
          files={files}
          folders={folders}
          onDownload={handleDownload}
          onDelete={handleDelete}
          onShare={handleShare}
          onDisableSharing={handleDisableSharing}
          onOpenFolder={navigateToFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      </main>
    </div>
  )
}
