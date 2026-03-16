import { WebhookClient } from "discord.js"

interface WebhookEntry {
  id: string
  client: WebhookClient
}

let webhooks: WebhookEntry[] | null = null
let batchCounter = 0

/**
 * Parsuje webhookId z pełnego URL webhooka Discord.
 * Format: https://discord.com/api/webhooks/{id}/{token}
 *
 * @param url - Pełny URL webhooka
 * @returns ID webhooka
 */
function parseWebhookId(url: string): string {
  const match = url.match(/webhooks\/(\d+)\//)
  if (!match) throw new Error(`Nieprawidłowy URL webhooka: ${url}`)
  return match[1]
}

/**
 * Inicjalizuje i zwraca pulę webhooków.
 *
 * Webhooks wczytywane są z env: `DISCORD_WEBHOOK_1`, `DISCORD_WEBHOOK_2`, ...
 * Pula jest inicjalizowana leniwie przy pierwszym wywołaniu i cachowana.
 *
 * @returns Tablica wpisów { id, client }
 * @throws Jeśli żaden webhook nie jest zdefiniowany w środowisku
 */
export function getWebhooks(): WebhookEntry[] {
  if (webhooks) return webhooks

  const entries: WebhookEntry[] = []
  let i = 1
  while (true) {
    const url = process.env[`DISCORD_WEBHOOK_${i}`]
    if (!url) break
    entries.push({ id: parseWebhookId(url), client: new WebhookClient({ url }) })
    i++
  }

  if (entries.length === 0) {
    throw new Error("No Discord webhooks found in environment (DISCORD_WEBHOOK_1, DISCORD_WEBHOOK_2, ...)")
  }

  webhooks = entries
  return webhooks
}

/**
 * Zwraca webhook wybrany metodą round-robin dla kolejnego batcha.
 * Każde wywołanie przesuwa licznik o 1.
 *
 * @returns Wpis webhooka { id, client }
 */
export function getNextWebhook(): WebhookEntry {
  const list = getWebhooks()
  return list[batchCounter++ % list.length]
}

/**
 * Zwraca webhooka po jego ID (do operacji crud na wiadomościach).
 *
 * @param webhookId - ID webhooka zapisane w rekordzie Chunk w DB
 * @returns Wpis webhooka { id, client }
 * @throws Jeśli webhook o danym ID nie istnieje w puli
 */
export function getWebhookById(webhookId: string): WebhookEntry {
  const list = getWebhooks()
  const entry = list.find((w) => w.id === webhookId)
  if (!entry) throw new Error(`Webhook ${webhookId} nie istnieje w puli`)
  return entry
}
