/**
 * Takeoff postMessage origin lock (AUDIT-005).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/takeoffPostMessageOrigins.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAllowedTakeoffMessageOrigin,
  isValidTakeoffApprovedMessage,
  resolveStudioParentTargetOrigin,
  buildAllowedTakeoffMessageOrigins
} from "./takeoffPostMessageOrigins.mjs";
import { resolveStudioParentTargetOrigin as takeoffResolve } from "../../../app-ai-takeoff/src/lib/studioPostMessageTarget.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

console.log("\ntakeoffPostMessageOrigins.test.mjs\n");

const prodEnv = { VITE_HEAD_URL_AI_TAKEOFF: "https://takeoff.eliteosfab.com" };
assert.equal(isAllowedTakeoffMessageOrigin("https://takeoff.eliteosfab.com", prodEnv), true);
assert.equal(isAllowedTakeoffMessageOrigin("http://localhost:5186", prodEnv), true);
assert.equal(isAllowedTakeoffMessageOrigin("http://127.0.0.1:5186", prodEnv), true);

const previewEnv = {
  ...prodEnv,
  VITE_TAKEOFF_POSTMESSAGE_ALLOWED_ORIGINS: "https://app-ai-takeoff-abc123.vercel.app"
};
assert.equal(
  isAllowedTakeoffMessageOrigin("https://app-ai-takeoff-abc123.vercel.app", previewEnv),
  true
);
assert.equal(
  isAllowedTakeoffMessageOrigin("https://evil-app.vercel.app", previewEnv),
  false,
  "unrelated vercel.app rejected"
);
assert.equal(
  isAllowedTakeoffMessageOrigin("https://www.eliteosfab.com", prodEnv),
  false,
  "unrelated eliteosfab subdomain rejected"
);
assert.equal(isAllowedTakeoffMessageOrigin("null", prodEnv), false);
assert.equal(isAllowedTakeoffMessageOrigin("", prodEnv), false);
assert.equal(isAllowedTakeoffMessageOrigin("file://", prodEnv), false);

assert.ok(!buildAllowedTakeoffMessageOrigins(prodEnv).has("*"));

assert.equal(
  isValidTakeoffApprovedMessage(
    { type: "eliteos-takeoff-approved", takeoffJobId: "job-1", reviewStatus: "approved" },
    "job-1"
  ),
  true
);
assert.equal(
  isValidTakeoffApprovedMessage(
    { type: "eliteos-takeoff-approved", takeoffJobId: "job-other" },
    "job-1"
  ),
  false
);
assert.equal(isValidTakeoffApprovedMessage({ type: "other" }, "job-1"), false);
assert.equal(isValidTakeoffApprovedMessage(null, "job-1"), false);

assert.equal(
  resolveStudioParentTargetOrigin({
    env: { VITE_HEAD_URL_ELITE100_ESTIMATE_STUDIO: "https://studio.eliteosfab.com/app" }
  }),
  "https://studio.eliteosfab.com"
);
assert.equal(
  resolveStudioParentTargetOrigin({ referrer: "https://studio.eliteosfab.com/queue" }),
  "https://studio.eliteosfab.com"
);
assert.equal(resolveStudioParentTargetOrigin({}), null, "no wildcard fallback");
assert.equal(resolveStudioParentTargetOrigin({ isDev: true }), "http://localhost:5191");
assert.equal(
  takeoffResolve({
    env: { VITE_HEAD_URL_ESTIMATE_STUDIO: "https://studio.eliteosfab.com" }
  }),
  "https://studio.eliteosfab.com"
);

const takeoffSrc = readFileSync(
  join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);
assert.doesNotMatch(
  takeoffSrc.match(/postMessage\([\s\S]{0,400}/)?.[0] || "",
  /,\s*["']\*["']/
);
assert.match(takeoffSrc, /VITE_HEAD_URL_ELITE100_ESTIMATE_STUDIO|targetOrigin/);

const workspace = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
  "utf8"
);
assert.doesNotMatch(workspace, /endsWith\(["']\.vercel\.app["']\)/);
assert.doesNotMatch(workspace, /endsWith\(["']\.eliteosfab\.com["']\)/);
// Active simplified Scope no longer mounts the Takeoff iframe / postMessage bridge.
// Origin helpers remain available for the AI Takeoff head itself.
assert.equal(workspace.includes("isAllowedTakeoffMessageOrigin"), false);
assert.equal(workspace.includes("isValidTakeoffApprovedMessage"), false);
assert.equal(workspace.includes('data-testid="eq-takeoff-iframe"'), false);

console.log("\ntakeoffPostMessageOrigins.test.mjs — all passed\n");
