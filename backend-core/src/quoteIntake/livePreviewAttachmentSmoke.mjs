/**
 * Live Graph smoke for mailbox preview attachment discovery.
 * Uses Brain .env Graph credentials. Does NOT log tokens, provider IDs,
 * raw bodies, or attachment bytes.
 *
 * Run (from repo root, with Graph env loaded):
 *   node --env-file=backend-core/.env backend-core/src/quoteIntake/livePreviewAttachmentSmoke.mjs
 */
import {
  isQuoteIntakeGraphEnabled,
  isQuoteIntakeGraphManualSyncEnabled,
  readQuoteIntakeGraphCredentials,
  readQuoteIntakeGraphLimits
} from "./quoteIntakeGraphConfig.mjs";
import { createQuoteIntakeGraphClient } from "./quoteIntakeGraphClient.mjs";
import { classifyAttachmentMeta, normalizeGraphMessageCore } from "./quoteIntakeGraphNormalize.mjs";

const env = process.env;

if (!isQuoteIntakeGraphEnabled(env) || !isQuoteIntakeGraphManualSyncEnabled(env)) {
  console.error("Graph preview not enabled in env (QUOTE_INTAKE_GRAPH_* flags).");
  process.exit(2);
}

let credentials;
try {
  credentials = readQuoteIntakeGraphCredentials(env);
} catch (e) {
  console.error("Graph credentials unavailable:", e?.code || e?.message);
  process.exit(2);
}

const limits = readQuoteIntakeGraphLimits(env);
const client = createQuoteIntakeGraphClient({
  mailbox: credentials.mailbox,
  credentials,
  timeoutMs: limits.timeoutMs
});

console.log("Live preview attachment smoke");
console.log(
  JSON.stringify(
    {
      mailboxDisplay: credentials.mailbox.replace(/^[^@]+/, "***"),
      previewLimit: limits.previewLimit,
      requestShape: {
        listMessages:
          "GET /users/{mailbox}/mailFolders/Inbox/messages?$top&$orderby&$select=id,internetMessageId,...,hasAttachments",
        listAttachments:
          "GET /users/{mailbox}/messages/{immutableId}/attachments?$select=id,name,contentType,size,isInline",
        prefer: 'outlook.body-content-type="text", IdType="ImmutableId"'
      }
    },
    null,
    2
  )
);

const messages = await client.listInboxMessages({ top: Math.min(limits.previewLimit, 10) });
console.log(`Listed ${messages.length} inbox message(s)`);

let foundPdf = false;
for (const raw of messages) {
  const core = normalizeGraphMessageCore(raw);
  if (!core.graphMessageId) continue;

  const safe = {
    hasAttachments: core.hasAttachments,
    subjectPresent: Boolean(core.subject),
    receivedDateTime: core.receivedDateTime,
    attachments: [],
    discovery: null
  };

  if (!core.hasAttachments) {
    console.log(JSON.stringify({ ...safe, discovery: { status: "skipped_no_flag" } }));
    continue;
  }

  try {
    const atts = await client.listAttachmentMetadata(core.graphMessageId);
    const classified = atts.map(classifyAttachmentMeta);
    safe.attachments = classified.map((a) => ({
      name: a.name,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      isInline: a.isInline,
      kind: a.kind,
      support: a.support
      // intentionally omit sourceAttachmentId / provider ids
    }));
    safe.discovery = {
      status: classified.length === 0 ? "empty_mismatch" : "ok",
      graphAttachmentCount: classified.length,
      kinds: classified.map((a) => a.kind)
    };
    if (classified.some((a) => a.support === "direct_pdf")) foundPdf = true;
  } catch (e) {
    safe.discovery = {
      status: "failed",
      code: e?.code || "graph_unavailable",
      graphAttachmentCount: null
    };
  }

  console.log(JSON.stringify(safe));
}

if (!foundPdf) {
  console.error(
    "No direct_pdf found in bounded preview page. Check mailbox contents or discovery status above."
  );
  process.exit(1);
}

console.log("SUCCESS: at least one direct PDF appeared in live preview attachment discovery.");
