import { getWebhookById } from "./webhooks"

/**
 * Pobiera zaszyfrowany chunk pliku z kanału Discord.
 *
 * Używa `webhook.fetchMessage()` zamiast bezpośredniego URL — Discord
 * zwraca świeże signed URL przy każdym fetchu, co zapobiega wygaśnięciu
 * linków po ~24h.
 *
 * @param messageId - ID wiadomości Discord zawierającej chunk
 * @param webhookId - ID webhooka który wysłał wiadomość (zapisany w DB)
 * @param attachmentIndex - Pozycja załącznika w wiadomości (0-based)
 * @returns Zaszyfrowane dane chunka gotowe do odszyfrowania przez `decryptChunk`
 * @throws Jeśli wiadomość nie zawiera załącznika na danej pozycji lub pobieranie się nie powiedzie
 */
export async function downloadChunk(
  messageId: string,
  webhookId: string,
  attachmentIndex: number
): Promise<ArrayBuffer> {
  const webhook = getWebhookById(webhookId)
  const message = await webhook.client.fetchMessage(messageId)

  const attachments = [...message.attachments.values()]
  const attachment = attachments[attachmentIndex]
  if (!attachment) {
    throw new Error(`Brak załącznika [${attachmentIndex}] w wiadomości ${messageId}`)
  }

  const response = await fetch(attachment.url)
  if (!response.ok) throw new Error(`Błąd pobierania chunka: ${response.status}`)

  return response.arrayBuffer()
}
