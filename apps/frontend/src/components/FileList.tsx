import type { FileInfo, FolderInfo } from "@/api/queries"
import { Button } from "@/components/ui/button"
import { Folder, FileIcon, Download, Trash2, Share2, Link2Off } from "lucide-react"

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

interface Props {
  files: FileInfo[]
  folders: FolderInfo[]
  onDownload: (fileId: string) => void
  onDelete: (fileId: string) => void
  onShare: (file: FileInfo) => void
  onDisableSharing: (fileId: string) => void
  onOpenFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
}

export function FileList({ files, folders, onDownload, onDelete, onShare, onDisableSharing, onOpenFolder, onDeleteFolder }: Props) {
  if (folders.length === 0 && files.length === 0) {
    return <p className="text-center text-muted-foreground py-12">Brak plików. Prześlij coś!</p>
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Nazwa</th>
            <th className="text-left px-4 py-3 font-medium w-24">Rozmiar</th>
            <th className="text-left px-4 py-3 font-medium w-40">Data</th>
            <th className="text-right px-4 py-3 font-medium w-36">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr key={folder.folderId} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onOpenFolder(folder.folderId, folder.name)}>
              <td className="px-4 py-3 flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" />
                {folder.name}
              </td>
              <td className="px-4 py-3 text-muted-foreground">—</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(folder.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.folderId) }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
          {files.map((file) => (
            <tr key={file.fileId} className="border-b hover:bg-muted/30">
              <td className="px-4 py-3 flex items-center gap-2">
                <FileIcon className="h-4 w-4 text-muted-foreground" />
                {file.name}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatSize(file.size)}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(file.createdAt)}</td>
              <td className="px-4 py-3 text-right space-x-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDownload(file.fileId)} title="Pobierz">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {file.shareToken ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => onDisableSharing(file.fileId)} title="Wyłącz udostępnianie">
                    <Link2Off className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onShare(file)} title="Udostępnij">
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(file.fileId)} title="Usuń">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
