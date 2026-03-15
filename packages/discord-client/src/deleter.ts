import type { Chunk } from "@discordrive/types"
import { getWebhookById } from "./webhooks"

/**
 * Usuwa wszystkie chunki pliku z kanałów Discord.
 *
 * Chunki grupowane są po `messageId` — jedna wiadomość może zawierać do 10
 * chunków, więc usuwamy wiadomości (nie chunki), co zmniejsza liczbę
 * wywołań API nawet 10-krotnie. Operacje wykonywane są równolegle.
 *
 * @param chunks - Lista chunków do usunięcia (z pola `chunks` rekordu `File` w DB)
 * @throws Jeśli webhook nie ma uprawnień do usunięcia wiadomości
 */
export async function deleteChunks(chunks: Chunk[]): Promise<void> {
  // Grupuj po messageId — wiele chunków = jedna wiadomość
  const byMessage = new Map<string, Chunk>()
  for (const chunk of chunks) {
    byMessage.set(chunk.messageId, chunk)
  }

  await Promise.all(
    [...byMessage.values()].map(({ messageId, webhookId }) =>
      getWebhookById(webhookId).client.deleteMessage(messageId)
    )
  )
}
