#!/usr/bin/env node
/**
 * Guardrail: Vercel projects that auto-deploy from main must declare ignoreCommand
 * (or an explicit documented exception) so unaffected heads skip builds.
 *
 * Run: node scripts/verify-vercel-ignore-build-policy.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ignoreCommandForProject } from "./vercel-ignore-build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("\nverify-vercel-ignore-build-policy.mjs\n");

assert.equal(existsSync(join(root, "vercel.json")), false, "no repo-root vercel.json");
assert.ok(
  existsSync(join(root, "scripts/vercel-ignore-build.mjs")),
  "ignore script must exist"
);

/** Projects with in-repo vercel.json that must declare ignoreCommand. */
const REQUIRED_IGNORE_COMMAND = [
  "backend-core",
  "app-home",
  "app-elite100-estimate-studio",
  "app-elite100-quote-flow",
  "app-ai-takeoff",
  "app-digital-estimate",
  "app-quote-library",
  "app-quote",
  "app-kiosk",
  "app-sales",
  "app-slab-inventory",
  "app-visualizer"
];

/**
 * Known Vercel (or candidate) heads without in-repo vercel.json — operators must
 * set Dashboard → Git → Ignored Build Step to the same command until a vercel.json
 * is added. Listed so the verifier does not silently forget them.
 */
const DASHBOARD_IGNORE_EXCEPTIONS = Object.freeze({
  "app-hr": {
    reason: "no in-repo vercel.json yet; use Dashboard Ignored Build Step",
    command: ignoreCommandForProject("app-hr")
  },
  "app-pricing-admin": {
    reason: "no in-repo vercel.json yet; use Dashboard Ignored Build Step",
    command: ignoreCommandForProject("app-pricing-admin")
  },
  "app-internal-estimate": {
    reason: "no in-repo vercel.json yet; use Dashboard Ignored Build Step",
    command: ignoreCommandForProject("app-internal-estimate")
  }
});

for (const project of REQUIRED_IGNORE_COMMAND) {
  const rel = `${project}/vercel.json`;
  const path = join(root, rel);
  assert.ok(existsSync(path), `${rel} missing`);
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  const expected = ignoreCommandForProject(project);
  assert.equal(
    cfg.ignoreCommand,
    expected,
    `${rel}: ignoreCommand must be exactly "${expected}"`
  );

  // Preserve existing non-main suppression for projects that already had it.
  // Digital Estimate remains dashboard-only for deploymentEnabled (§290).
  if (project === "app-digital-estimate") {
    assert.equal(
      cfg?.git?.deploymentEnabled,
      undefined,
      "app-digital-estimate keeps deploymentEnabled out of vercel.json (dashboard)"
    );
  } else {
    assert.equal(cfg?.git?.deploymentEnabled?.main, true, `${rel}: main deploy remains enabled`);
    assert.equal(cfg?.git?.deploymentEnabled?.["*"], false, `${rel}: non-main auto-deploy stays off`);
  }
  console.log(`ok: ${rel} ignoreCommand`);
}

for (const [project, meta] of Object.entries(DASHBOARD_IGNORE_EXCEPTIONS)) {
  assert.equal(
    existsSync(join(root, project, "vercel.json")),
    false,
    `${project}: still a dashboard exception (no vercel.json)`
  );
  assert.equal(meta.command, ignoreCommandForProject(project));
  console.log(`ok: exception ${project} → Dashboard: ${meta.command}`);
}

// Spot-check: every app-* / backend-core vercel.json under REQUIRED is covered;
// stray vercel.json with git policy should not silently omit ignoreCommand.
const managedDirs = new Set(["backend-core", ...REQUIRED_IGNORE_COMMAND]);
for (const name of readdirSync(root, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  if (name.name !== "backend-core" && !name.name.startsWith("app-")) continue;
  const vf = join(root, name.name, "vercel.json");
  if (!existsSync(vf)) continue;
  if (!managedDirs.has(name.name) && !REQUIRED_IGNORE_COMMAND.includes(name.name)) {
    // Any unexpected vercel.json with ignoreCommand is fine; without it, fail if
    // it has deploymentEnabled (would auto-deploy without skip guard).
    const cfg = JSON.parse(readFileSync(vf, "utf8"));
    if (cfg?.git?.deploymentEnabled && !cfg.ignoreCommand) {
      assert.fail(
        `${name.name}/vercel.json has deploymentEnabled but no ignoreCommand — add ignoreCommand or document an exception`
      );
    }
  }
}

console.log("\nverify-vercel-ignore-build-policy.mjs: ok\n");
