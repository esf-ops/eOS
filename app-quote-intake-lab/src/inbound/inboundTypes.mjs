/**
 * @typedef {"manual_eml"|"manual_paste"} InboundSourceType
 *
 * @typedef {{ name: string|null, email: string }} InboundAddress
 *
 * @typedef {{
 *   id: string,
 *   filename: string,
 *   contentType: string,
 *   sizeBytes: number,
 *   contentHash: string,
 *   bytes?: Uint8Array,
 *   localOnly: true
 * }} InboundAttachment
 *
 * @typedef {{
 *   conversationId: string|null,
 *   inReplyTo: string|null,
 *   references: string[],
 *   threadKey: string
 * }} InboundThreadMetadata
 *
 * @typedef {{
 *   sourceType: InboundSourceType,
 *   providerPlaceholder: "none",
 *   messageId: string|null,
 *   thread: InboundThreadMetadata,
 *   from: InboundAddress,
 *   to: InboundAddress[],
 *   cc: InboundAddress[],
 *   replyTo: InboundAddress|null,
 *   subject: string,
 *   sentOrReceivedAt: string|null,
 *   textBody: string,
 *   htmlPresent: boolean,
 *   originalFilename: string|null,
 *   attachments: InboundAttachment[],
 *   messageContentHash: string,
 *   importTimestamp: string,
 *   importActor: string,
 *   parserWarnings: string[],
 *   rawSourcePreserved: boolean,
 *   dedupeKey: string,
 *   dedupeStrategy: "message_id"|"content_hash",
 *   mailbox: string|null,
 *   headers: Record<string, string>
 * }} InboundMessage
 *
 * @typedef {{
 *   senderName: string,
 *   senderEmail: string,
 *   to: string,
 *   cc: string,
 *   subject: string,
 *   dateReceived: string,
 *   bodyText: string,
 *   mailbox: string,
 *   attachments: Array<{ filename: string, contentType: string, bytes: Uint8Array }>
 * }} ManualEmailInput
 *
 * @typedef {{
 *   message: InboundMessage,
 *   duplicateOfCaseId: string|null,
 *   duplicateReason: string|null,
 *   canConfirm: boolean
 * }} EmailImportPreview
 *
 * @typedef {{
 *   ok: true,
 *   caseId: string,
 *   dedupeKey: string,
 *   duplicate: false
 * } | {
 *   ok: false,
 *   duplicate: true,
 *   caseId: string,
 *   dedupeKey: string,
 *   reason: string
 * }} EmailImportResult
 */

export {};
