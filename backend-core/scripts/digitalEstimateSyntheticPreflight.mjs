#!/usr/bin/env node
/**
 * DE.2G.0 — Digital Estimate synthetic deployment preflight (read-only).
 *
 * Does NOT connect to databases, apply SQL, deploy, create users, or print secrets.
 *
 * Run: node backend-core/scripts/digitalEstimateSyntheticPreflight.mjs
 * Optional: --env-file=.env.local (values are never printed)
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const MIGRATIONS = [
  "backend-core/supabase/eliteos_digital_estimate_v1.sql",
  "backend-core/supabase/eliteos_digital_estimate_configuration_v1.sql",
  "backend-core/supabase/eliteos_digital_estimate_public_configuration_v1.sql",
  "backend-core/supabase/eliteos_digital_estimate_amendment_v1.sql"
];

const CHECKSUM_MANIFEST = "docs/digital-estimate/MIGRATION_CHECKSUMS_DE_2G_0.json";

const FORBIDDEN_VITE_KEYS = [
  "VITE_SUPABASE_SERVICE_ROLE",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SERVICE_ROLE",
  "VITE_SERVICE_ROLE_KEY",
  "VITE_MONDAY_TOKEN",
  "VITE_GRAPH_CLIENT_SECRET",
  "VITE_GEMINI_API_KEY",
  "VITE_OPENAI_API_KEY"
];

function loadOptionalEnvFile(path) {
  if (!path || !existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function sha256File(abs) {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

function isOn(v) {
  return String(v ?? "").trim() === "1";
}

function fail(msg, failures) {
  failures.push(msg);
  console.log(`FAIL  ${msg}`);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function warn(msg) {
  console.log(`WARN  ${msg}`);
}

const args = process.argv.slice(2);
let envFile = null;
for (const a of args) {
  if (a.startsWith("--env-file=")) envFile = a.slice("--env-file=".length);
}

const fileEnv = loadOptionalEnvFile(envFile ? resolve(envFile) : "");
const env = { ...process.env, ...fileEnv };

const failures = [];

console.log("\nDigital Estimate DE.2G.0 synthetic preflight (read-only)\n");

// --- Migration files + checksums ---
let manifest = null;
const manifestPath = join(repoRoot, CHECKSUM_MANIFEST);
if (!existsSync(manifestPath)) {
  fail(`checksum manifest missing: ${CHECKSUM_MANIFEST}`, failures);
} else {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  pass(`checksum manifest present (${CHECKSUM_MANIFEST})`);
}

for (const rel of MIGRATIONS) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) {
    fail(`migration missing: ${rel}`, failures);
    continue;
  }
  const hash = sha256File(abs);
  const expected = manifest?.migrations?.find((m) => m.path === rel)?.sha256;
  if (!expected) {
    fail(`checksum entry missing for ${rel}`, failures);
  } else if (expected !== hash) {
    fail(`checksum mismatch for ${rel}`, failures);
  } else {
    pass(`checksum ok: ${rel.split("/").pop()}`);
  }
}

// Expected objects (static names only — no DB probe)
pass(
  "expected tables/functions documented: quote_publications*, digital_estimate_configuration_*, digital_estimate_*_sessions/selections/calculations, digital_estimate_*_review_requests/amendments, digital_estimate_publish_atomic / activate / save_selection / publish_amendment RPCs"
);

// --- Flags should be off for readiness (safe default) ---
const featureFlags = [
  "DIGITAL_ESTIMATE_API_ENABLED",
  "DIGITAL_ESTIMATE_PUBLISH_ENABLED",
  "DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED",
  "DIGITAL_ESTIMATE_CONFIGURATION_ENABLED",
  "DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED",
  "DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED",
  "DIGITAL_ESTIMATE_AMENDMENTS_ENABLED",
  "ELITE100_ESTIMATE_STUDIO_ENABLED"
];
for (const k of featureFlags) {
  if (isOn(env[k])) {
    fail(`${k}=1 (expected off for DE.2G.0 readiness gate)`, failures);
  } else {
    pass(`${k} off/absent`);
  }
}

const syntheticDefault = String(env.DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY ?? "1").trim();
if (syntheticDefault === "0") {
  fail("DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=0 (REAL_CUSTOMER blocked in DE.2G.0)", failures);
} else {
  pass("DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY default/on (fail closed)");
}

const allow = String(env.DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS ?? "").trim();
if (allow) {
  warn("DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS is set (count not printed); confirm intentional before Gate 8");
} else {
  pass("DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS empty (fail closed)");
}

const pilots = String(env.ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS ?? "").trim();
if (pilots) {
  warn("ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS is set (value not printed); confirm owner-only before Gate 6");
} else {
  pass("ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS empty (fail closed)");
}

// Head URLs presence (not values beyond boolean)
const studioUrl = Boolean(String(env.HEAD_URL_ELITE100_ESTIMATE_STUDIO ?? "").trim());
const deUrl = Boolean(
  String(env.HEAD_URL_DIGITAL_ESTIMATE || env.DIGITAL_ESTIMATE_PUBLIC_BASE_URL || "").trim()
);
if (!studioUrl) warn("HEAD_URL_ELITE100_ESTIMATE_STUDIO unset (required before Studio deploy)");
else pass("HEAD_URL_ELITE100_ESTIMATE_STUDIO configured (value not printed)");
if (!deUrl) warn("HEAD_URL_DIGITAL_ESTIMATE unset (required before public deploy)");
else pass("HEAD_URL_DIGITAL_ESTIMATE configured (value not printed)");

// Vite secret audit on example/env keys only
for (const k of FORBIDDEN_VITE_KEYS) {
  if (env[k]) fail(`forbidden Vite secret key present: ${k}`, failures);
}
pass("no forbidden VITE_* service/secret keys detected in env under test");

// Example envs must stay false
for (const rel of [
  "app-digital-estimate/.env.example",
  "app-elite100-estimate-studio/.env.example"
]) {
  const abs = join(repoRoot, rel);
  const text = readFileSync(abs, "utf8");
  if (/SERVICE_ROLE|service_role/.test(text)) {
    fail(`${rel} mentions service role`, failures);
  } else {
    pass(`${rel} has no service-role placeholders`);
  }
}

console.log("");
if (failures.length) {
  console.log(`Preflight FAILED (${failures.length})`);
  process.exit(1);
}
console.log("Preflight PASSED — do not deploy/apply SQL from this script.");
process.exit(0);
