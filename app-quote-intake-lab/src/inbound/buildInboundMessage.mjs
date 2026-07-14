import { buildDedupeKey } from "./dedupe.mjs";
import { sha256Hex } from "./hash.mjs";
import { formatAddressList } from "./parseAddresses.mjs";

/**
 * Finalize an inbound message with content hash + dedupe key.
 * @param {Omit<import("./inboundTypes.mjs").InboundMessage, "messageContentHash"|"dedupeKey"|"dedupeStrategy">} partial
 */
export async function finalizeInboundMessage(partial) {
  const attPart = (partial.attachments ?? [])
    .map((a) => `${a.filename}:${a.contentHash}:${a.sizeBytes}`)
    .join(";");
  const material = [
    partial.sourceType,
    partial.messageId ?? "",
    partial.from?.email ?? "",
    formatAddressList(partial.to ?? []),
    formatAddressList(partial.cc ?? []),
    partial.subject ?? "",
    partial.sentOrReceivedAt ?? "",
    partial.textBody ?? "",
    attPart
  ].join("\n");

  const messageContentHash = await sha256Hex(material);
  const withHash = { ...partial, messageContentHash };
  const { dedupeKey, strategy } = await buildDedupeKey(withHash);
  return {
    ...withHash,
    dedupeKey,
    dedupeStrategy: strategy,
    providerPlaceholder: "none"
  };
}

/**
 * Build a short excerpt for queue display.
 * @param {string} body
 * @param {number} [max]
 */
export function bodyExcerpt(body, max = 180) {
  const t = String(body ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Derive a thread key for local correlation (placeholder for Graph later).
 */
export function deriveThreadKey({ conversationId, inReplyTo, references, subject, fromEmail }) {
  if (conversationId) return `conv:${conversationId}`;
  if (inReplyTo) return `reply:${inReplyTo}`;
  if (references?.length) return `ref:${references[0]}`;
  const subj = String(subject ?? "")
    .replace(/^\s*(re|fw|fwd)\s*:\s*/i, "")
    .trim()
    .toLowerCase();
  return `subj:${fromEmail ?? ""}:${subj}`;
}
