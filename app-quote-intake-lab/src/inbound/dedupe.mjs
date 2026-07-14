import { normalizeMessageId, sha256Hex } from "./hash.mjs";
import { formatAddressList } from "./parseAddresses.mjs";

/**
 * Build deterministic dedupe key for an inbound message.
 * 1) messageId when present
 * 2) else content hash of normalized identity fields + attachment hashes
 *
 * @param {import("./inboundTypes.mjs").InboundMessage} message
 * @returns {Promise<{ dedupeKey: string, strategy: "message_id"|"content_hash" }>}
 */
export async function buildDedupeKey(message) {
  const mid = normalizeMessageId(message.messageId);
  if (mid) {
    return { dedupeKey: `mid:${mid}`, strategy: "message_id" };
  }

  const attHashes = (message.attachments ?? [])
    .map((a) => a.contentHash)
    .filter(Boolean)
    .sort()
    .join(",");

  const material = [
    message.from?.email ?? "",
    formatAddressList(message.to ?? []),
    formatAddressList(message.cc ?? []),
    String(message.subject ?? "").trim().toLowerCase(),
    String(message.sentOrReceivedAt ?? "").trim(),
    String(message.textBody ?? "").replace(/\r\n/g, "\n").trim(),
    attHashes
  ].join("\n|\n");

  const hash = await sha256Hex(material);
  return { dedupeKey: `hash:${hash}`, strategy: "content_hash" };
}
