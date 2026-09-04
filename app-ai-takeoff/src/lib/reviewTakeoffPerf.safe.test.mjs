/**
 * Safe Review Takeoff performance helpers.
 * Run: node app-ai-takeoff/src/lib/reviewTakeoffPerf.safe.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearPlanSignedUrlCache,
  getCachedPlanSignedUrl,
  planSignedUrlCacheSize,
  setCachedPlanSignedUrl
} from "./planSignedUrlCache.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

console.log("\nreviewTakeoffPerf.safe.test.mjs\n");

{
  clearPlanSignedUrlCache();
  assert.equal(getCachedPlanSignedUrl("f1"), null);
  setCachedPlanSignedUrl("f1", {
    signedUrl: "https://example.test/signed",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
  });
  assert.equal(getCachedPlanSignedUrl("f1"), "https://example.test/signed");
  assert.equal(planSignedUrlCacheSize(), 1);
  // Expired / about-to-expire rejected.
  setCachedPlanSignedUrl("f2", {
    signedUrl: "https://example.test/soon",
    expiresAt: new Date(Date.now() + 10_000).toISOString()
  });
  assert.equal(getCachedPlanSignedUrl("f2"), null);
  clearPlanSignedUrlCache();
  console.log("ok: plan signed URL session cache TTL");
}

{
  const ctr = readFileSync(
    join(here, "../components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.match(ctr, /Promise\.allSettled/);
  assert.match(ctr, /\/api\/takeoff-jobs\/\$\{encodeURIComponent\(jobId\)\}/);
  assert.match(ctr, /\/results\/latest/);
  assert.match(ctr, /coreHydrating/);
  assert.match(ctr, /Loading measurements…/);
  assert.match(ctr, /coreWorkspaceReady/);
  assert.match(ctr, /refresh_suggestions/);
  // AD must wait for core workspace — not fire on auth alone.
  assert.match(ctr, /if \(!coreWorkspaceReady\) return/);
  // Set Scope save-ack contract must remain.
  assert.match(ctr, /QUOTE_FLOW_REQUEST_SAVE_DRAFT/);
  assert.match(ctr, /TAKEOFF_REVIEW_DRAFT_SAVED/);
  assert.match(ctr, /TAKEOFF_REVIEW_DRAFT_SAVE_FAILED/);
  console.log("ok: parallel core hydrate + deferred AD + save-ack preserved");
}

{
  const panel = readFileSync(
    join(here, "../components/TakeoffPlanPreviewPanel.tsx"),
    "utf8"
  );
  assert.match(panel, /getCachedPlanSignedUrl/);
  assert.match(panel, /setCachedPlanSignedUrl/);
  assert.match(panel, /quote-files\/download-url/);
  console.log("ok: plan preview uses session signed-URL cache");
}

{
  const origins = readFileSync(
    join(root, "app-elite100-quote-flow/src/lib/takeoffPostMessageOrigins.mjs"),
    "utf8"
  );
  assert.match(origins, /import\.meta\.env\.VITE_HEAD_URL_AI_TAKEOFF/);
  assert.match(origins, /requestSaveDraftFromIframe/);
  assert.doesNotMatch(origins, /payload\?\.takeoffResult \|\| undefined/);
  console.log("ok: Set Scope production origin allowlist + save-ack untouched");
}

{
  const enrichment = readFileSync(
    join(here, "reviewTakeoffOptionalEnrichment.ui.test.mjs"),
    "utf8"
  );
  assert.match(enrichment, /optionalEnrichmentError|Account Directory|Starting Configuration/);
  console.log("ok: optional enrichment regression suite still present");
}

console.log("\nreviewTakeoffPerf.safe.test.mjs: ok\n");
