/**
 * Guardrail: Vercel git.deploymentEnabled must keep main on and suppress other auto-deploys.
 * Run: node scripts/verify-vercel-git-deployment-policy.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("\nverify-vercel-git-deployment-policy.mjs\n");

/** Apps we intentionally manage in-repo (Digital Estimate is dashboard-only for this policy). */
const EXPECTED_WITH_POLICY = [
  "backend-core/vercel.json",
  "app-home/vercel.json",
  "app-elite100-estimate-studio/vercel.json",
  "app-elite100-quote-flow/vercel.json",
  "app-ai-takeoff/vercel.json",
  "app-quote/vercel.json",
  "app-quote-library/vercel.json",
  "app-kiosk/vercel.json",
  "app-sales/vercel.json",
  "app-slab-inventory/vercel.json",
  "app-visualizer/vercel.json"
];

assert.equal(existsSync(join(root, "vercel.json")), false, "no repo-root vercel.json (unsafe for monorepo)");

for (const rel of EXPECTED_WITH_POLICY) {
  const raw = readFileSync(join(root, rel), "utf8");
  const cfg = JSON.parse(raw);
  const enabled = cfg?.git?.deploymentEnabled;
  assert.ok(enabled && typeof enabled === "object", `${rel}: git.deploymentEnabled object required`);
  assert.equal(enabled.main, true, `${rel}: main must remain enabled`);
  assert.equal(enabled["*"], false, `${rel}: wildcard * must be false (unspecified branches default true)`);
  // Avoid accidental "any true wins" traps that re-enable previews.
  assert.equal(enabled["feature/*"], undefined, `${rel}: do not set feature/* true alongside *`);
  assert.equal(enabled["hotfix/*"], undefined, `${rel}: do not set hotfix/* true alongside *`);
  console.log(`ok: ${rel}`);
}

// Digital Estimate must not be changed by this policy branch (dashboard manual).
const de = join(root, "app-digital-estimate/vercel.json");
if (existsSync(de)) {
  const cfg = JSON.parse(readFileSync(de, "utf8"));
  assert.equal(cfg?.git?.deploymentEnabled, undefined, "app-digital-estimate left without in-repo git policy");
  console.log("ok: app-digital-estimate untouched (dashboard-only)");
}

// backend-core production surface preserved
const brain = JSON.parse(readFileSync(join(root, "backend-core/vercel.json"), "utf8"));
assert.ok(Array.isArray(brain.crons) && brain.crons.length >= 1, "backend-core crons preserved");
assert.ok(brain.functions?.["api/index.js"], "backend-core functions preserved");
console.log("ok: backend-core production vercel surface preserved");

console.log("\nverify-vercel-git-deployment-policy.mjs: ok\n");
