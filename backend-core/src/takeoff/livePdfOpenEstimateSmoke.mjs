/**
 * Live smoke: download a real mailbox PDF and open Takeoff with the corrected
 * QUOTE_INTAKE_MAX_PDF_BYTES limit (must be 50 MiB default, not 1024).
 *
 * Run:
 *   node --env-file=backend-core/.env backend-core/src/takeoff/livePdfOpenEstimateSmoke.mjs
 */
import { createClient } from "@supabase/supabase-js";
import {
  isQuoteIntakeGraphEnabled,
  isQuoteIntakeGraphManualSyncEnabled,
  readQuoteIntakeGraphCredentials,
  readQuoteIntakeGraphLimits,
  formatPdfSizeMb
} from "../quoteIntake/quoteIntakeGraphConfig.mjs";
import { createQuoteIntakeGraphClient } from "../quoteIntake/quoteIntakeGraphClient.mjs";
import {
  classifyAttachmentMeta,
  decodeAndValidatePdfBytes,
  normalizeGraphMessageCore
} from "../quoteIntake/quoteIntakeGraphNormalize.mjs";
import { createQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepositoryFactory.mjs";
import { openEstimateForIntakeCase } from "./intakeOpenEstimateService.mjs";

const env = process.env;

if (!isQuoteIntakeGraphEnabled(env) || !isQuoteIntakeGraphManualSyncEnabled(env)) {
  console.error("Graph flags not enabled");
  process.exit(2);
}

const limits = readQuoteIntakeGraphLimits(env);
console.log(
  JSON.stringify(
    {
      maxPdfBytes: limits.maxPdfBytes,
      maxPdfMb: formatPdfSizeMb(limits.maxPdfBytes),
      note: "Must be 52428800 (50 MiB) by default — was wrongly 1024 due to envInt bug"
    },
    null,
    2
  )
);

if (limits.maxPdfBytes < 1024 * 1024) {
  console.error("FAIL: limit still under 1 MiB — fix not loaded");
  process.exit(1);
}

const credentials = readQuoteIntakeGraphCredentials(env);
const client = createQuoteIntakeGraphClient({
  mailbox: credentials.mailbox,
  credentials,
  timeoutMs: limits.timeoutMs
});

const messages = await client.listInboxMessages({ top: 10 });
let chosen = null;
for (const raw of messages) {
  const core = normalizeGraphMessageCore(raw);
  if (!core.hasAttachments || !core.graphMessageId) continue;
  const atts = (await client.listAttachmentMetadata(core.graphMessageId)).map(classifyAttachmentMeta);
  const pdf = atts.find((a) => a.support === "direct_pdf");
  if (pdf) {
    chosen = { core, pdf };
    break;
  }
}

if (!chosen) {
  console.error("No direct PDF in bounded inbox preview");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      safeFilename: chosen.pdf.name,
      declaredSizeBytes: chosen.pdf.sizeBytes,
      declaredMb: formatPdfSizeMb(chosen.pdf.sizeBytes),
      limitMb: formatPdfSizeMb(limits.maxPdfBytes),
      metadataWouldReject: Number(chosen.pdf.sizeBytes) > limits.maxPdfBytes
    },
    null,
    2
  )
);

const att = await client.getAttachment(chosen.core.graphMessageId, chosen.pdf.sourceAttachmentId);
const validated = decodeAndValidatePdfBytes(att?.contentBytes, {
  maxBytes: limits.maxPdfBytes
});
console.log(
  JSON.stringify(
    {
      downloadedBytes: validated.sizeBytes,
      downloadedMb: formatPdfSizeMb(validated.sizeBytes),
      sha256Prefix: validated.sha256.slice(0, 12),
      magicOk: true
    },
    null,
    2
  )
);
validated.bytes.fill?.(0);

// Open Estimate end-to-end against Quote Intake repo + Takeoff when Supabase is configured.
const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.log("SKIP open-estimate: Supabase service role not in env (byte validation already passed)");
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { repository, mode } = createQuoteIntakeRepository({
  env: { ...env, QUOTE_INTAKE_REPOSITORY: env.QUOTE_INTAKE_REPOSITORY || "supabase" },
  getSupabase: () => supabase
});

const orgId = String(env.QUOTE_INTAKE_SMOKE_ORG_ID || env.ELITEOS_DEFAULT_ORGANIZATION_ID || "").trim();
if (!orgId) {
  console.log(
    "SKIP open-estimate: set QUOTE_INTAKE_SMOKE_ORG_ID to open Takeoff for this message (byte validation passed)"
  );
  process.exit(0);
}

const existing = await repository.findCaseBySourceKeys(orgId, {
  internetMessageId: chosen.core.internetMessageId,
  graphMessageId: chosen.core.graphMessageId
});

let caseRow = existing;
if (!caseRow) {
  caseRow = await repository.createCase({
    organizationId: orgId,
    createdByUserId: null,
    sourceType: "graph_mailbox",
    mailboxIdentity: credentials.mailbox,
    receivedAt: chosen.core.receivedDateTime,
    subjectHash: chosen.core.subjectHash,
    bodyCharCount: chosen.core.bodyCharCount,
    sourceMessage: {
      internetMessageId: chosen.core.internetMessageId || undefined,
      graphImmutableMessageId: chosen.core.graphMessageId,
      fromAddressHash: chosen.core.sender.fromAddressHash || undefined
    },
    attachments: [
      {
        sourceAttachmentId: chosen.pdf.sourceAttachmentId,
        safeFilename: chosen.pdf.name,
        mimeType: chosen.pdf.mimeType,
        sizeBytes: chosen.pdf.sizeBytes,
        isInline: false,
        kind: chosen.pdf.kind,
        support: "direct_pdf",
        providerMessageId: chosen.core.graphMessageId,
        retrievalState: "pending",
        sha256: null
      }
    ]
  });
  console.log("Created intake case for smoke:", caseRow.id);
} else {
  console.log("Reusing intake case:", caseRow.id);
}

const opened = await openEstimateForIntakeCase({
  repository,
  organizationId: orgId,
  intakeCaseId: caseRow.id,
  actorUserId: null,
  body: {},
  env,
  getSupabase: () => supabase,
  graphClient: client,
  repositoryMode: mode
});

console.log(
  JSON.stringify(
    {
      ok: true,
      takeoffJobId: opened.takeoffJobId,
      created: opened.created,
      reused: opened.reused,
      attachmentName: opened.attachmentName,
      repositoryMode: opened.repositoryMode
    },
    null,
    2
  )
);
console.log("SUCCESS: real PDF opened Takeoff workspace under corrected size limit.");
