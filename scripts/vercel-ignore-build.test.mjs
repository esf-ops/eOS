#!/usr/bin/env node
/**
 * Unit-style coverage for vercel-ignore-build decision rules.
 * Run: node scripts/vercel-ignore-build.test.mjs
 */
import assert from "node:assert/strict";
import {
  decideIgnoreBuild,
  ignoreCommandForProject,
  shouldBuildProject
} from "./vercel-ignore-build.mjs";

console.log("\nvercel-ignore-build.test.mjs\n");

{
  const d = shouldBuildProject("app-hr", ["app-hr/src/HrApp.tsx"]);
  assert.equal(d.build, true);
  assert.equal(d.reason, "own_project_root");
  console.log("ok: app-hr change builds app-hr");
}

{
  const d = shouldBuildProject("app-elite100-quote-flow", ["app-hr/src/HrApp.tsx"]);
  assert.equal(d.build, false);
  assert.equal(d.reason, "unaffected");
  console.log("ok: app-hr change skips quote-flow");
}

{
  const d = shouldBuildProject("app-elite100-quote-flow", [
    "app-elite100-quote-flow/src/estimates/OfficialScopeEditor.tsx"
  ]);
  assert.equal(d.build, true);
  assert.equal(d.reason, "own_project_root");
  console.log("ok: quote-flow app change builds quote-flow only (own root)");
}

{
  const qf = shouldBuildProject("app-elite100-quote-flow", [
    "backend-core/src/elite100QuoteFlow/quoteFlowCutouts.mjs"
  ]);
  assert.equal(qf.build, true);
  assert.match(qf.reason, /^dependency:/);
  const hr = shouldBuildProject("app-hr", [
    "backend-core/src/elite100QuoteFlow/quoteFlowCutouts.mjs"
  ]);
  assert.equal(hr.build, false);
  const brain = shouldBuildProject("backend-core", [
    "backend-core/src/elite100QuoteFlow/quoteFlowCutouts.mjs"
  ]);
  assert.equal(brain.build, true);
  console.log("ok: quote-flow backend path builds backend-core + quote-flow, skips app-hr");
}

{
  const apps = [
    "app-hr",
    "app-elite100-quote-flow",
    "app-home",
    "backend-core"
  ];
  for (const p of apps) {
    const d = shouldBuildProject(p, ["docs/eliteos/FEATURE_DECISIONS.md"]);
    assert.equal(d.build, false, `${p} should skip docs-only`);
  }
  console.log("ok: docs-only change skips app/backend builds");
}

{
  for (const p of ["app-hr", "app-elite100-quote-flow", "backend-core", "app-home"]) {
    const d = shouldBuildProject(p, ["package-lock.json"]);
    assert.equal(d.build, true, `${p} builds on lockfile`);
  }
  console.log("ok: package-lock change builds all");
}

{
  const d = shouldBuildProject("backend-core", ["app-hr/src/HrApp.tsx"]);
  assert.equal(d.build, false);
  console.log("ok: frontend-only change skips backend-core");
}

{
  const d = shouldBuildProject("app-hr", ["backend-core/src/hr/workforceRoster.mjs"]);
  assert.equal(d.build, true);
  console.log("ok: mapped hr backend path builds app-hr");
}

{
  const d = decideIgnoreBuild("app-home", { changedFiles: ["README.md"] });
  assert.equal(d.exitCode, 0);
  assert.equal(d.build, false);
  const force = decideIgnoreBuild("app-home", {
    changedFiles: [],
    gitRunner: () => ({ status: 1, stderr: "boom", stdout: "" })
  });
  // Empty injected list skips; detection failure path:
  const fail = decideIgnoreBuild("app-home", {
    gitRunner: () => ({ status: 128, stderr: "fatal", stdout: "" })
  });
  assert.equal(fail.exitCode, 1);
  assert.equal(fail.build, true);
  assert.match(fail.reason, /detection_failed/);
  console.log("ok: detection failure prefers build; docs/readme skip via inject");
}

{
  assert.equal(
    ignoreCommandForProject("app-elite100-quote-flow"),
    "node ../scripts/vercel-ignore-build.mjs app-elite100-quote-flow"
  );
  assert.equal(
    ignoreCommandForProject("backend-core"),
    "node ../scripts/vercel-ignore-build.mjs backend-core"
  );
  console.log("ok: ignoreCommand paths are relative to project Root Directory");
}

console.log("\nvercel-ignore-build.test.mjs: ok\n");
