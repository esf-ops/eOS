/**
 * Optional synthetic live smoke test — NEVER part of npm test.
 *
 * Requires:
 *   QIL_LIVE_AI_ENABLED=true
 *   QIL_AI_MODEL set
 *   QIL_GEMINI_API_KEY (or shared opt-in)
 *   Lab server running OR this script can call pipeline directly
 *
 * WARNING: May incur Gemini provider cost.
 * Uses only committed synthetic example.com data. No attachment bytes.
 * Does not print email body, full provider response, or credentials.
 *
 * Usage (from app-quote-intake-lab):
 *   npm run live-smoke
 */

import "./loadEnv.mjs";
import { readLabServerConfig } from "./config.mjs";
import { runLiveClassificationPipeline } from "./classifyPipeline.mjs";
import { sanitizeLiveClassificationRequest } from "./sanitizeLiveRequest.mjs";

console.log("[qil-smoke] Synthetic live smoke — may incur provider cost.");
console.log("[qil-smoke] Uses example.com fixture content only. No attachment bytes.");

const config = readLabServerConfig();
if (!config.liveAiEnabled) {
  console.error("[qil-smoke] Aborted: QIL_LIVE_AI_ENABLED is not true.");
  process.exit(2);
}
if (!config.model) {
  console.error("[qil-smoke] Aborted: QIL_AI_MODEL is not configured.");
  process.exit(2);
}
if (!config.hasApiKey) {
  console.error("[qil-smoke] Aborted: no lab Gemini API key configured.");
  process.exit(2);
}

const request = sanitizeLiveClassificationRequest({
  caseId: "qil-smoke-synthetic",
  subject: "Need an Elite 100 estimate for Maple Court",
  textBody:
    "Customer: Northbridge Homes\nProject: Maple Court Kitchen\nColor: Calacatta Mira\nEdge: eased edge\nSinks: 2 sink cutouts\nTotal SF: 48.5\nSynthetic lab smoke only.",
  from: { name: "Avery Nguyen", email: "avery.nguyen@example.com" },
  to: [{ name: null, email: "sales@example.com" }],
  cc: [],
  mailbox: "sales@example.com",
  messageId: "<qil-smoke-001@example.com>",
  attachments: [{ id: "a1", filename: "kitchen-plan.pdf", contentType: "application/pdf", sizeBytes: 1200 }]
});

const started = Date.now();
try {
  const out = await runLiveClassificationPipeline({ request, config });
  console.log("[qil-smoke] ok=true");
  console.log(`[qil-smoke] intent=${out.result.intent}`);
  console.log(`[qil-smoke] status=${out.result.suggestedStatus}`);
  console.log(`[qil-smoke] eligibility=${out.result.workflowEligibility}`);
  console.log(`[qil-smoke] verificationRan=${out.result.verification?.ran}`);
  console.log(`[qil-smoke] latencyMs=${Date.now() - started}`);
  const warns = out.validationWarnings ?? [];
  console.log(`[qil-smoke] validationWarnings=${warns.length}`);
  // Codes/messages only — never request body, prompts, or provider payload
  for (const w of warns) {
    const text = String(w ?? "").slice(0, 160);
    console.log(`[qil-smoke] warning: ${text}`);
  }
  process.exit(0);
} catch (e) {
  console.error(`[qil-smoke] failed code=${e?.code ?? "ERROR"} message=${e?.message ?? e}`);
  process.exit(1);
}
