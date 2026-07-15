#!/usr/bin/env node
/**
 * MANUAL smoke only — does NOT run in CI/tests.
 *
 * WARNING: This contacts the REAL Microsoft Graph tenant using server env
 * credentials and reads the configured shared mailbox (read-only preview).
 *
 * Usage (explicit):
 *   node backend-core/src/quoteIntake/scripts/quoteIntakeGraphPreviewSmoke.mjs --i-understand-real-mailbox
 *
 * Prints only safe counts/statuses. Never prints tokens, bodies, subjects,
 * addresses, or attachment bytes.
 */

import {
  isQuoteIntakeGraphEnabled,
  isQuoteIntakeGraphManualSyncEnabled,
  readQuoteIntakeGraphCredentials,
  readQuoteIntakeGraphLimits
} from "../quoteIntakeGraphConfig.mjs";
import { createQuoteIntakeGraphClient } from "../quoteIntakeGraphClient.mjs";

const understood = process.argv.includes("--i-understand-real-mailbox");
if (!understood) {
  console.error(
    "[quote-intake-graph-smoke] Refusing to run. Pass --i-understand-real-mailbox to acknowledge real mailbox access."
  );
  process.exit(2);
}

if (!isQuoteIntakeGraphEnabled() || !isQuoteIntakeGraphManualSyncEnabled()) {
  console.error("[quote-intake-graph-smoke] Graph/manual sync flags are off.");
  process.exit(1);
}

let credentials;
try {
  credentials = readQuoteIntakeGraphCredentials();
} catch {
  console.error("[quote-intake-graph-smoke] Graph is not configured.");
  process.exit(1);
}

const limits = readQuoteIntakeGraphLimits();
const client = createQuoteIntakeGraphClient({
  mailbox: credentials.mailbox,
  credentials,
  timeoutMs: limits.timeoutMs
});

const rows = await client.listInboxMessages({ top: Math.min(limits.previewLimit, 5) });
const withAtt = rows.filter((m) => m.hasAttachments).length;
console.log(
  JSON.stringify({
    ok: true,
    mode: "read_only_preview",
    mailboxConfigured: Boolean(credentials.mailbox),
    messageCount: rows.length,
    withAttachmentsCount: withAtt,
    note: "No subjects/bodies/addresses/tokens printed by design."
  })
);
