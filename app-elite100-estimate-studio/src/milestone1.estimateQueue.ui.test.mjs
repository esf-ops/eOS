/**
 * Milestone 1 — Estimate Queue static wiring checks (Studio only).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertQuoteIntakePathAllowed
} from "./lib/quoteIntakeApi.mjs";
import {
  caseAttachmentStatusLabel,
  caseSupportedPdfLabel
} from "./lib/quoteIntakeFormat.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const app = readFileSync(join(root, "src/StudioApp.tsx"), "utf8");
const queue = readFileSync(join(root, "src/estimateQueue/EstimateQueuePage.tsx"), "utf8");
const detail = readFileSync(join(root, "src/estimateQueue/EstimateQueueCaseDetail.tsx"), "utf8");
const mailbox = readFileSync(join(root, "src/estimateQueue/MailboxSyncModal.tsx"), "utf8");
const api = readFileSync(join(root, "src/lib/quoteIntakeApi.mjs"), "utf8");

assert.ok(app.includes("EstimateQueuePage"));
assert.ok(app.includes("Open legacy queue") || app.includes("estimate-queue"));
assert.ok(app.includes("EstimateCommandCenterPage") || app.includes("command-center"));
assert.ok(app.includes("EstimateTakeoffWorkspace") || app.includes("estimate-workspace"));
assert.ok(queue.includes("Sync inbox"));
assert.ok(queue.includes("estimate-queue-dashboard"));
assert.ok(queue.includes("mailbox/preview") === false); // path lives in api client
assert.ok(api.includes("QUOTE_INTAKE_API_PREFIX"));
assert.ok(api.includes("/mailbox/preview"));
assert.ok(api.includes("/mailbox/import"));
assert.ok(api.includes("previewMailbox"));
assert.ok(api.includes("importMailboxMessages"));
assert.ok(mailbox.includes("previewMailbox"));
assert.ok(mailbox.includes("importMailboxMessages"));
assert.ok(mailbox.includes("confirm: true"));
assert.equal(mailbox.includes("mailboxAddress"), false);
assert.equal(mailbox.includes("tenantId"), false);
assert.equal(mailbox.includes("graphUrl"), false);
assert.ok(detail.includes("Open Estimate"));
assert.ok(detail.includes("onOpenEstimate"));
assert.ok(queue.includes("Open in Estimate Studio"));
assert.equal(queue.includes("calculateQuote"), false);
assert.equal(app.includes("service_role"), false);

assertQuoteIntakePathAllowed("/api/quote-intake/cases");
assert.throws(() => assertQuoteIntakePathAllowed("/api/other"), /refused/);

assert.equal(
  caseAttachmentStatusLabel({ attachments: [{ id: "a", sha256: "x" }] }),
  "1 file"
);
assert.equal(
  caseSupportedPdfLabel({
    attachments: [{ id: "a", sha256: "x", mimeType: "application/pdf", safeFilename: "plan.pdf" }]
  }),
  "Yes"
);
assert.equal(
  caseSupportedPdfLabel({
    attachments: [{ id: "a", sha256: "x", mimeType: "image/png" }],
    missingInformation: ["no_supported_pdf"]
  }),
  "No"
);

console.log("\nmilestone1.estimateQueue.ui.test.mjs\n");
console.log("ok: Estimate Queue wired to Quote Intake APIs; Open Estimate action present");
console.log("\nAll Milestone 1 Estimate Queue UI tests passed.\n");
