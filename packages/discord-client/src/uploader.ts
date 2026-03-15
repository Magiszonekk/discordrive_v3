import { AttachmentBuilder } from "discord.js"
import type { UploadedChunk } from "@discordrive/types"
import { getNextWebhook } from "./webhooks"

/**
 * Wysyła batch zaszyfrowanych chunków jako załączniki do jednej wiadomości Discord.
 *
 * Jeden batch = jedna wiadomość = do 10 załączników (limit Discord).
 * Webhook wybierany jest round-robin między kolejnymi batchami,
 * co rozkłada rate limity.
 *
 * @param chunks - Tablica chunków do wysłania (max 10 elementów, max 10MB każdy)
 * @returns Metadane per chunk potrzebne do zapisu w DB
 */
export async function uploadBatch(
  chunks: { data: ArrayBuffer; index: number }[]
): Promise<UploadedChunk[]> {
  const webhook = getNextWebhook()

  const attachments = chunks.map(({ data, index }) =>
    new AttachmentBuilder(Buffer.from(data), { name: `chunk-${index}.bin` })
  )

  const message = await webhook.client.send({ files: attachments })

  return chunks.map(({ index }, attachmentIndex) => ({
    messageId: message.id,
    channelId: message.channel_id,
    webhookId: webhook.id,
    attachmentIndex,
    chunkIndex: index,
  }))
}
