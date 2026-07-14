/**
 * Optional synthetic live takeoff smoke — NEVER part of npm test.
 * Phase 4B.4A must not run this.
 *
 * Requires:
 *   QIL_LIVE_TAKEOFF_ENABLED=true
 *   QIL_TAKEOFF_MODEL set
 *   QIL_GEMINI_API_KEY (or shared opt-in)
 *
 * WARNING: Transmits the committed synthetic plan PDF to Gemini and may incur cost.
 * Never prints attachment content, API key, full provider response, or URL-with-key.
 *
 * Usage (from app-quote-intake-lab):
 *   npm run live-takeoff-smoke
 */

import "./loadEnv.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readLabServerConfig } from "./config.mjs";
import { sanitizeLiveTakeoffRequest } from "./takeoff/sanitizeTakeoffRequest.mjs";
import { runLiveTakeoffPipeline } from "./takeoff/takeoffPipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, "../fixtures/takeoff/qil-synth-kitchen-island-plan.pdf");
const GT_PATH = join(__dirname, "../fixtures/takeoff/qil-synth-kitchen-island-plan.ground-truth.json");

console.log("[qil-takeoff-smoke] WARNING: Transmits synthetic plan to Gemini — may incur cost.");
console.log("[qil-takeoff-smoke] Uses only the committed lab synthetic PDF. No real customer plans.");

const config = readLabServerConfig();
if (!config.takeoff.liveEnabled) {
  console.error("[qil-takeoff-smoke] Aborted: QIL_LIVE_TAKEOFF_ENABLED is not true.");
  process.exit(2);
}
if (!config.takeoff.model) {
  console.error("[qil-takeoff-smoke] Aborted: QIL_TAKEOFF_MODEL is not configured.");
  process.exit(2);
}
if (!config.hasApiKey) {
  console.error("[qil-takeoff-smoke] Aborted: no lab Gemini API key configured.");
  process.exit(2);
}

const bytes = readFileSync(PDF_PATH);
const gt = JSON.parse(readFileSync(GT_PATH, "utf8"));
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== gt.contentHash) {
  console.error("[qil-takeoff-smoke] Aborted: fixture hash mismatch.");
  process.exit(2);
}

const request = sanitizeLiveTakeoffRequest(
  {
    caseId: "qil-smoke-takeoff-synthetic",
    acceptedIntakeSnapshotId: "qil-snap-smoke-takeoff",
    attachmentId: "qil-att-synth-plan-1",
    filename: "qil-synth-kitchen-island-plan.pdf",
    mimeType: "application/pdf",
    sizeBytes: bytes.length,
    contentHash: hash,
    contentBase64: bytes.toString("base64"),
    liveTransmissionAcknowledged: true,
    actorLabel: "Lab Smoke",
    requestedAt: new Date().toISOString(),
    elite100Decision: "elite_100_candidate",
    syntheticPlanAcknowledged: true
  },
  { maxAttachmentBytes: config.takeoff.maxAttachmentBytes }
);

const started = Date.now();
try {
  const out = await runLiveTakeoffPipeline({ request, config });
  const calc = out.run.calculation;
  console.log("[qil-takeoff-smoke] ok=true");
  console.log(`[qil-takeoff-smoke] runId=${out.run.id}`);
  console.log(`[qil-takeoff-smoke] status=${out.run.labTakeoffStatus}`);
  console.log(`[qil-takeoff-smoke] countertopSf=${calc.measuredCountertopSf}`);
  console.log(`[qil-takeoff-smoke] backsplashSf=${calc.measuredBacksplashSf}`);
  console.log(`[qil-takeoff-smoke] combinedSf=${calc.measuredCombinedSf}`);
  console.log(`[qil-takeoff-smoke] sinkCount=${calc.sinkCutoutCount}`);
  console.log(`[qil-takeoff-smoke] contentHash=${hash.slice(0, 12)}…`);
  console.log(`[qil-takeoff-smoke] latencyMs=${Date.now() - started}`);
  console.log(`[qil-takeoff-smoke] prompts=${JSON.stringify(out.promptVersions)}`);
  process.exit(0);
} catch (e) {
  console.error(`[qil-takeoff-smoke] failed code=${e?.code ?? "ERROR"} message=${e?.message ?? e}`);
  process.exit(1);
}
