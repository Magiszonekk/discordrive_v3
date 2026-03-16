import { AttachmentBuilder } from "discord.js"
import type { UploadedChunk } from "@discordrive/types"
import { getNextWebhook, getWebhooks } from "./webhooks"

type ChunkInput = { data: ArrayBuffer; index: number }

function batchify<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < arr.length; i += size) batches.push(arr.slice(i, i + size))
  return batches
}

async function sendBatch(
  chunks: ChunkInput[],
  webhook: { id: string; client: { send: (opts: any) => Promise<any> } }
): Promise<UploadedChunk[]> {
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

/**
 * Wysyła batch chunków na jednym webhooku (round-robin).
 * Zachowane dla kompatybilności wstecznej.
 */
export async function uploadBatch(chunks: ChunkInput[]): Promise<UploadedChunk[]> {
  return sendBatch(chunks, getNextWebhook())
}

/**
 * Wysyła chunki równolegle na wszystkich dostępnych webhookach.
 *
 * Chunki są rozdzielane round-robin między webhooki.
 * Każdy webhook wysyła sekwencyjnie (rate limit),
 * ale wszystkie webhooki działają równolegle.
 */
/**
 * Wysyła pojedynczy chunk na webhook wybrany na podstawie chunkIndex % webhooks.length.
 * Używane przez per-chunk upload API.
 */
export async function uploadSingleChunk(data: ArrayBuffer, chunkIndex: number): Promise<UploadedChunk> {
  const webhooks = getWebhooks()
  const webhook = webhooks[chunkIndex % webhooks.length]
  const results = await sendBatch([{ data, index: chunkIndex }], webhook)
  return results[0]
}

export async function uploadChunksParallel(chunks: ChunkInput[]): Promise<UploadedChunk[]> {
  const webhooks = getWebhooks()

  // Rozdziel chunki między webhooki (round-robin)
  const perWebhook: ChunkInput[][] = Array.from({ length: webhooks.length }, () => [])
  for (let i = 0; i < chunks.length; i++) {
    perWebhook[i % webhooks.length].push(chunks[i])
  }

  // Każdy webhook wysyła swoje chunki równolegle z innymi
  const results = await Promise.all(
    perWebhook.map(async (whChunks, whIdx) => {
      if (whChunks.length === 0) return []
      const webhook = webhooks[whIdx]
      const batches = batchify(whChunks, 10)
      const batchResults: UploadedChunk[] = []
      for (const batch of batches) {
        batchResults.push(...await sendBatch(batch, webhook))
      }
      return batchResults
    })
  )

  return results.flat()
}
