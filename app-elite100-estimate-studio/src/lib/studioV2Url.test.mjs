/**
 * Studio V2 workspace deep-link URL helpers + StudioApp wiring contracts.
 * Run: node app-elite100-estimate-studio/src/lib/studioV2Url.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyStudioV2WorkspaceUrl,
  buildStudioV2WorkspaceSearch,
  isValidStudioV2CaseId,
  parseStudioV2WorkspaceDeepLink
} from "./studioV2Url.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const app = readFileSync(join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
const shell = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
  "utf8"
);

console.log("\nstudioV2Url.test.mjs\n");

{
  assert.equal(isValidStudioV2CaseId("case-abc-12345678"), true);
  assert.equal(isValidStudioV2CaseId("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isValidStudioV2CaseId("short"), false);
  assert.equal(isValidStudioV2CaseId("bad id with spaces"), false);
  assert.equal(isValidStudioV2CaseId("x".repeat(200)), false);
  console.log("ok: 1 caseId validation");
}

{
  const inboxOnly = parseStudioV2WorkspaceDeepLink("?studioV2=1");
  assert.deepEqual(inboxOnly, { studioV2: true, caseId: null, caseIdInvalid: false });

  const deep = parseStudioV2WorkspaceDeepLink("?studioV2=1&caseId=case-abc-12345678");
  assert.equal(deep.studioV2, true);
  assert.equal(deep.caseId, "case-abc-12345678");
  assert.equal(deep.caseIdInvalid, false);

  const alias = parseStudioV2WorkspaceDeepLink("?studioV2=1&estimateId=case-alias-999999");
  assert.equal(alias.caseId, "case-alias-999999");

  const invalid = parseStudioV2WorkspaceDeepLink("?studioV2=1&caseId=nope");
  assert.equal(invalid.caseId, null);
  assert.equal(invalid.caseIdInvalid, true);

  const v1 = parseStudioV2WorkspaceDeepLink("?caseId=case-abc-12345678");
  assert.deepEqual(v1, { studioV2: false, caseId: null, caseIdInvalid: false });
  console.log("ok: 2 parseStudioV2WorkspaceDeepLink");
}

{
  const withCase = buildStudioV2WorkspaceSearch("?studioV2=1&foo=bar", "case-abc-12345678");
  assert.match(withCase, /studioV2=1/);
  assert.match(withCase, /caseId=case-abc-12345678/);
  assert.match(withCase, /foo=bar/);

  const cleared = buildStudioV2WorkspaceSearch(withCase, null);
  assert.match(cleared, /studioV2=1/);
  assert.equal(cleared.includes("caseId="), false);
  assert.match(cleared, /foo=bar/);
  console.log("ok: 3 buildStudioV2WorkspaceSearch open + back");
}

{
  const history = [];
  const loc = {
    pathname: "/",
    search: "?studioV2=1",
    hash: ""
  };
  globalThis.window = {
    location: loc,
    history: {
      state: null,
      pushState(_s, _t, url) {
        history.push(["push", url]);
        const u = new URL(url, "https://elite100.eliteosfab.com");
        loc.pathname = u.pathname;
        loc.search = u.search;
        loc.hash = u.hash;
      },
      replaceState(_s, _t, url) {
        history.push(["replace", url]);
        const u = new URL(url, "https://elite100.eliteosfab.com");
        loc.pathname = u.pathname;
        loc.search = u.search;
        loc.hash = u.hash;
      }
    }
  };

  const applied = applyStudioV2WorkspaceUrl({ caseId: "case-abc-12345678", mode: "push" });
  assert.equal(applied.applied, true);
  assert.match(loc.search, /caseId=case-abc-12345678/);
  assert.equal(history.at(-1)[0], "push");

  const cleared = applyStudioV2WorkspaceUrl({ caseId: null, mode: "push" });
  assert.equal(cleared.applied, true);
  assert.equal(loc.search.includes("caseId="), false);
  assert.match(loc.search, /studioV2=1/);

  delete globalThis.window;
  console.log("ok: 4 applyStudioV2WorkspaceUrl push/clear");
}

{
  // StudioApp: deep-link init + open + back wiring
  assert.ok(app.includes("parseStudioV2WorkspaceDeepLink"));
  assert.ok(app.includes("applyStudioV2WorkspaceUrl"));
  assert.ok(app.includes("initialStudioV2DeepLink"));
  assert.ok(app.includes('openWorkspace ? "estimate-workspace"'));
  assert.ok(app.includes("openEstimateWorkspace"));
  assert.ok(app.includes("leaveEstimateWorkspace"));
  assert.ok(app.includes('addEventListener("popstate"'));
  assert.ok(app.includes("studio-v2-deeplink-error"));
  assert.ok(app.includes("studio-v2-deeplink-error-back"));
  assert.ok(app.includes('data-testid="studio-nav-studio-v2"'));
  assert.ok(app.includes('data-testid="studio-v2-landing"'));
  // Opening a case from Inbox uses the shared open helper (URL sync).
  assert.match(
    app,
    /SharedInboxPage[\s\S]*openEstimateWorkspace\(\{[\s\S]*returnNav:\s*"shared-inbox"/
  );
  // Back clears case via leaveEstimateWorkspace (keeps studioV2=1).
  assert.match(app, /StudioV2EstimatorShell[\s\S]*onBack=\{\(\) => leaveEstimateWorkspace\(\)\}/);
  assert.ok(app.includes('applyStudioV2WorkspaceUrl({ caseId: null, mode: "push" })'));
  assert.match(
    app,
    /<DigitalEstimatesPage[\s\S]{0,900}returnNav:\s*"digital-estimates"[\s\S]{0,300}applyStudioV2WorkspaceUrl\(\{ caseId, mode: "push" \}\)/
  );
  console.log("ok: 5 StudioApp deep-link init / open / back wiring");
}

{
  // V1 default unchanged when no caseId: default nav remains shared-inbox without deep link.
  assert.match(
    app,
    /initialStudioV2DeepLink\(\)\.openWorkspace\s*\?\s*"estimate-workspace"\s*:\s*"shared-inbox"/
  );
  assert.ok(app.includes("EstimateTakeoffWorkspace"));
  // V1 back must not call applyStudioV2WorkspaceUrl.
  const v1BackChunk = app.slice(
    app.indexOf("<EstimateTakeoffWorkspace"),
    app.indexOf("</EstimateTakeoffWorkspace>")
  );
  assert.ok(v1BackChunk.includes("onBackToQueue"));
  assert.equal(v1BackChunk.includes("applyStudioV2WorkspaceUrl"), false);
  console.log("ok: 6 V1/default Inbox behavior unchanged without caseId URL sync");
}

{
  // URL restoration must not auto approve / calculate / publish.
  const helper = readFileSync(join(__dirname, "studioV2Url.mjs"), "utf8");
  for (const forbidden of [
    "autoApprove",
    "autoCalculate",
    "simplified-publish",
    "refresh-from-takeoff",
    "ensure-editable-draft",
    "/working-draft/calculate",
    "/working-draft/approve",
    "/publish"
  ]) {
    assert.equal(helper.includes(forbidden), false, `helper must not mention ${forbidden}`);
  }
  // StudioApp restore path only parses URL + sets nav state; no mutation endpoints.
  const restoreRegion = app.slice(
    app.indexOf("initialStudioV2DeepLink"),
    app.indexOf("normalizeWorkspaceFocus")
  );
  assert.equal(restoreRegion.includes("apiPost"), false);
  assert.equal(restoreRegion.includes("approve"), false);
  assert.equal(restoreRegion.includes("calculate"), false);
  assert.equal(restoreRegion.includes("publish"), false);
  console.log("ok: 7 no pricing/approval/publish side effects on URL restoration");
}

{
  assert.ok(shell.includes("studio-v2-load-error-back"));
  assert.ok(shell.includes("Back to Inbox"));
  // Shell still loads working-draft + customer-activity only on mount (read path).
  assert.ok(shell.includes("/working-draft"));
  assert.ok(shell.includes("/customer-activity"));
  console.log("ok: 8 invalid/failed deep-link recoverable Back to Inbox");
}

console.log("\nAll Studio V2 URL deep-link tests passed.\n");
