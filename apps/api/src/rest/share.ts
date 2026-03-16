import { prisma } from "../context"
import { config } from "@discordrive/config"

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function handleSharePage(shareToken: string): Promise<Response> {
  const file = await prisma.file.findUnique({
    where: { shareToken },
    select: { name: true, size: true, mimeType: true, expiresAt: true },
  })

  if (!file) {
    return new Response("Nie znaleziono pliku", { status: 404 })
  }

  if (file.expiresAt && file.expiresAt < new Date()) {
    return new Response("Link wygasł", { status: 410 })
  }

  const name = escapeHtml(file.name)
  const size = formatSize(file.size)
  const isImage = file.mimeType.startsWith("image/")
  const isVideo = file.mimeType.startsWith("video/")
  const frontendShareUrl = `${config.frontendUrl}/share/${shareToken}`

  // OG type zależny od mimeType
  let ogType = "website"
  let ogMediaTags = ""
  if (isImage) {
    ogType = "article"
    ogMediaTags = `<meta property="og:image" content="${config.apiUrl}/api/thumbnail/${shareToken}">`
  } else if (isVideo) {
    ogType = "video.other"
    ogMediaTags = `<meta property="og:video" content="${config.apiUrl}/api/thumbnail/${shareToken}">`
  }

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — DiscorDrive</title>

  <!-- OG Meta Tags -->
  <meta property="og:title" content="${name}">
  <meta property="og:description" content="${size} • ${escapeHtml(file.mimeType)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="DiscorDrive">
  ${ogMediaTags}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${isImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${name}">
  <meta name="twitter:description" content="${size} • ${escapeHtml(file.mimeType)}">

  <script>
    // JS redirect zachowuje fragment URL (#key=...)
    // HTTP redirect (302) by go zgubił
    window.location.href = "${frontendShareUrl}" + window.location.hash;
  </script>
</head>
<body>
  <noscript>
    <p>Przekierowanie do <a href="${frontendShareUrl}">strony pobierania</a>...</p>
  </noscript>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
