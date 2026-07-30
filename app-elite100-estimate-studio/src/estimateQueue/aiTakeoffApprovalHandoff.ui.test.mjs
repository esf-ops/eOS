/**
 * AiTakeoffFirstPanel — approval handoff UI contracts (no browser).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/aiTakeoffApprovalHandoff.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const panel = readFileSync(join(root, "src/estimateQueue/AiEstimatorWorkspace.tsx"), "utf8");

console.log("\naiTakeoffApprovalHandoff.ui.test.mjs\n");

{
  assert.ok(panel.includes('data-testid="eq-takeoff-iframe"'));
  // The handoff overlay obscured a populated Takeoff during ordinary calculation.
  // It is replaced by a small inline status above the frame.
  assert.equal(panel.includes("eq-takeoff-handoff-overlay"), false, "no obscuring overlay");
  assert.ok(panel.includes('data-testid="eq-takeoff-inline-status"'));
  assert.ok(panel.includes("Measurements approved. Building verified estimate"));
  assert.ok(panel.includes('data-testid="eq-ai-retry-handoff"'));
  assert.ok(
    panel.includes("VerifiedEstimateSection") || panel.includes('data-testid="eq-ai-approved-measurements"')
  );
  assert.ok(panel.includes("handoffSucceededRef"));
  assert.ok(panel.includes("handoffInFlightRef"));
  // Persistent Takeoff surface always mounts iframe; verified/digital sections are siblings.
  const surfaceStart = panel.indexOf('data-testid="eq-ai-takeoff-surface"');
  const surfaceEnd = panel.indexOf("<VerifiedEstimateSection", surfaceStart);
  const takeoffSurface = panel.slice(surfaceStart, surfaceEnd > 0 ? surfaceEnd : surfaceStart + 3500);
  assert.ok(takeoffSurface.includes('data-testid="eq-takeoff-iframe"'));
  assert.ok(takeoffSurface.includes("eq-ai-retry-handoff"));
  assert.ok(takeoffSurface.includes("eq-takeoff-inline-status"));
  assert.equal(
    takeoffSurface.includes("VerifiedEstimateSection"),
    false,
    "verified section is not rendered inside takeoff surface"
  );
  assert.ok(panel.includes('data-testid="eq-ai-takeoff-surface"'));
  assert.ok(panel.includes("takeoffMode"));
  console.log("ok: 1 iframe remains mounted during handoff; approved card gated");
}

{
  // Duplicate concurrent handoffs prevented.
  assert.ok(panel.includes("if (handoffInFlightRef.current) return"));
  assert.ok(panel.includes("if (handoffSucceededRef.current) return"));
  console.log("ok: 2 duplicate approval events do not re-enter handoff");
}

{
  // Missed postMessage recovered via bounded status poll.
  // Mode changes remount the iframe via key; draft polls must not rewrite src.
  assert.ok(panel.includes("APPROVAL_FALLBACK_POLL_MS"));
  assert.ok(panel.includes("APPROVAL_FALLBACK_MAX_MS"));
  assert.ok(panel.includes('/api/takeoff-jobs/'));
  assert.equal((panel.match(/setTakeoffSrc/g) || []).length, 0);
  assert.ok(panel.includes("aiTakeoffHeadUrl()"));
  assert.ok(panel.includes("const takeoffSrc = useMemo"));
  console.log("ok: 3 missed postMessage fallback; mode-aware takeoff src");
}

{
  // Never show zero placeholder as approved — require measured Scope.
  assert.ok(panel.includes("estimateHasMeasuredScope"));
  assert.ok(panel.includes("Verified estimate is missing measured Scope"));
  console.log("ok: 4 zero-summary prevention");
}

{
  // Dynamic import of retry helper (compiled away in TSX — re-check source export).
  assert.ok(panel.includes("export function isRetryableHandoffError"));
  assert.ok(panel.includes("takeoff_result_not_ready"));
  assert.ok(panel.includes("HANDOFF_RETRY_MAX_ATTEMPTS"));
  console.log("ok: 5 retryable handoff error contracts");
}

console.log("\naiTakeoffApprovalHandoff.ui.test.mjs — passed\n");
