import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { extractKeyFromHash, decryptSharedFile, triggerDownload } from "@/crypto"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Download, Lock, FileIcon } from "lucide-react"

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

interface FileMeta {
  fileId: string
  name: string
  size: number
  mimeType: string
  hash: string
  chunkCount: number
  chunks: { index: number; iv: string }[]
}

export function Share() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const [keyParam, setKeyParam] = useState<string | null>(null)
  const [meta, setMeta] = useState<FileMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const key = extractKeyFromHash()
    setKeyParam(key)

    if (!key) {
      setError("Brak klucza deszyfrowania w URL")
      setLoading(false)
      return
    }

    fetch(`/api/share/${shareToken}/meta`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Plik nie istnieje" : "Błąd pobierania")
        return res.json()
      })
      .then(setMeta)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [shareToken])

  async function handleDownload() {
    if (!keyParam || !shareToken) return
    setDownloading(true)
    setProgress(10)

    try {
      // Download chunks as binary (per-chunk, batched concurrency)
      const DL_CONCURRENCY = 6
      const chunks: { index: number; data: ArrayBuffer; iv: string }[] = []
      for (let i = 0; i < meta!.chunks.length; i += DL_CONCURRENCY) {
        const batch = meta!.chunks.slice(i, i + DL_CONCURRENCY)
        const results = await Promise.all(
          batch.map(async (c) => {
            const res = await fetch(`/api/share/${shareToken}/chunk/${c.index}`)
            if (!res.ok) throw new Error(`Błąd pobierania chunka ${c.index}`)
            return { index: c.index, data: await res.arrayBuffer(), iv: c.iv }
          })
        )
        chunks.push(...results)
      }
      setProgress(50)

      const blob = await decryptSharedFile(chunks, keyParam)
      setProgress(90)

      triggerDownload(blob, meta?.name ?? "download")
      setProgress(100)
      toast.success("Pobrano i odszyfrowano")
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDownloading(false)
      setProgress(0)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" /> DiscorDrive
          </CardTitle>
          <CardDescription>Udostępniony plik (szyfrowany end-to-end)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-muted-foreground">Ładowanie...</p>}

          {error && (
            <div className="text-center py-6">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-destructive">{error}</p>
            </div>
          )}

          {meta && !error && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileIcon className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{meta.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSize(meta.size)} &middot; {meta.mimeType}
                  </p>
                </div>
              </div>

              {downloading && <Progress value={progress} />}

              <Button className="w-full" onClick={handleDownload} disabled={downloading}>
                <Download className="h-4 w-4 mr-2" />
                {downloading ? "Deszyfrowanie..." : "Pobierz i odszyfruj"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Klucz deszyfrowania nigdy nie opuszcza Twojej przeglądarki
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
