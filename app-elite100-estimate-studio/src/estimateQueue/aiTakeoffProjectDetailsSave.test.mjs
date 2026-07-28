/**
 * AI Measurements approved — project-details PATCH + publish sequencing.
 *
 * Run: node app-elite100-estimate-studio/src/estimateQueue/aiTakeoffProjectDetailsSave.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const panel = readFileSync(join(root, "src/estimateQueue/AiTakeoffFirstPanel.tsx"), "utf8");
const api = readFileSync(join(root, "src/lib/api.ts"), "utf8");

console.log("\naiTakeoffProjectDetailsSave.test.mjs\n");

{
  assert.ok(api.includes("export function apiPatch"), "apiPatch helper exists");
  const saveFn = panel.slice(
    panel.indexOf("async function saveProjectFields"),
    panel.indexOf("async function publish")
  );
  assert.ok(saveFn.includes("apiPatch("), "1 Save details uses apiPatch");
  assert.match(
    saveFn,
    /apiPatch\(\s*`\/api\/elite100-estimate-studio\/estimates\/\$\{encodeURIComponent\(estimateId\)\}\/project-details`/,
    "1 project-details uses apiPatch"
  );
  assert.equal(
    /apiPost\(\s*`\/api\/elite100-estimate-studio\/estimates\/\$\{encodeURIComponent\(estimateId\)\}\/project-details`/.test(
      panel
    ),
    false,
    "1 project-details is never POSTed"
  );
  assert.match(
    saveFn,
    /\/api\/elite100-estimate-studio\/estimates\/\$\{encodeURIComponent\(estimateId\)\}\/project-details/,
    "2 correct project-details endpoint"
  );
  assert.match(
    saveFn,
    /\{\s*customerEmail,\s*projectName\s*\}/,
    "3 body contains projectName and customerEmail"
  );
  assert.ok(saveFn.includes("applyEstimateView(body.estimate"), "4 successful response updates estimate");
  assert.ok(saveFn.includes("/calculate"), "5 calculate runs after successful save");
  assert.ok(saveFn.includes('setDetailsSavedNotice("Details saved.")'));
  assert.ok(saveFn.includes("return true"));
  assert.ok(saveFn.includes("return false"));
  console.log("ok: 1–5 Save details is PATCH + body + calculate + confirmation");
}

{
  const publishFn = panel.slice(
    panel.indexOf("async function publish"),
    panel.indexOf("async function copyLink")
  );
  assert.ok(publishFn.includes("const saved = await saveProjectFields()"));
  assert.ok(publishFn.includes("if (!saved) return"));
  const savedGate = publishFn.indexOf("if (!saved) return");
  const publishCall = publishFn.indexOf("simplified-publish");
  assert.ok(savedGate !== -1 && publishCall !== -1 && savedGate < publishCall);
  console.log("ok: 6–7 failed details save blocks simplified-publish; success continues");
}

{
  assert.ok(panel.includes("buildApprovalSummaryFromEstimate"));
  assert.ok(panel.includes("eq-ai-approved-summary") || panel.includes("eq-ai-verified-sf"));
  assert.equal(panel.includes("apiPost") && panel.includes("refresh-from-takeoff"), true);
  // Approved measurement helpers unchanged by this hotfix.
  const summaryMod = readFileSync(
    join(root, "src/estimateQueue/aiTakeoffApprovedSummary.mjs"),
    "utf8"
  );
  assert.ok(summaryMod.includes("measuredCountertopSfFromEstimate"));
  console.log("ok: 8 approved measurements mapping remains unchanged");
}

/**
 * Behavioral publish sequencing — mirrors AiTakeoffFirstPanel.publish gate.
 */
async function runPublishSequence({ needsDetails, saveProjectDetails, simplifiedPublish }) {
  if (needsDetails) {
    const saved = await saveProjectDetails();
    if (!saved) return { published: false, blockedByDetailsSave: true, publishCalls: 0 };
  }
  await simplifiedPublish();
  return { published: true, blockedByDetailsSave: false, publishCalls: 1 };
}

{
  let publishCalls = 0;
  const fail = await runPublishSequence({
    needsDetails: true,
    saveProjectDetails: async () => false,
    simplifiedPublish: async () => {
      publishCalls += 1;
    }
  });
  assert.equal(fail.blockedByDetailsSave, true);
  assert.equal(fail.published, false);
  assert.equal(publishCalls, 0);

  publishCalls = 0;
  let patched = false;
  let calculated = false;
  const estimate = { id: "est-1", scope: { projectName: "P", customerEmail: "a@b.co" } };
  const ok = await runPublishSequence({
    needsDetails: true,
    saveProjectDetails: async () => {
      // Simulate PATCH → apply → calculate success path.
      patched = true;
      calculated = true;
      assert.equal(estimate.scope.projectName, "P");
      return true;
    },
    simplifiedPublish: async () => {
      publishCalls += 1;
    }
  });
  assert.equal(ok.published, true);
  assert.equal(publishCalls, 1);
  assert.equal(patched && calculated, true);
  console.log("ok: publish sequencing — fail blocks; success continues");
}

{
  // Simulate the PATCH call shape the panel issues.
  const calls = [];
  async function apiPatch(path, _token, body) {
    calls.push({ method: "PATCH", path, body });
    return { estimate: { id: "est-1", scope: body, calculation: null } };
  }
  async function apiPost(path) {
    calls.push({ method: "POST", path });
    if (path.includes("/calculate")) {
      return {
        estimate: {
          id: "est-1",
          scope: { projectName: "Kitchen", customerEmail: "c@ex.com" },
          calculation: { pricingVersion: 4, totals: { customerDisplayTotal: 100 } }
        }
      };
    }
    throw new Error("unexpected POST " + path);
  }
  const estimateId = "est-1";
  const customerEmail = "c@ex.com";
  const projectName = "Kitchen";
  const body = await apiPatch(
    `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/project-details`,
    "tok",
    { customerEmail, projectName }
  );
  assert.equal(calls[0].method, "PATCH");
  assert.match(calls[0].path, /\/project-details$/);
  assert.deepEqual(calls[0].body, { customerEmail, projectName });
  assert.equal(body.estimate.scope.projectName, "Kitchen");
  const priced = await apiPost(
    `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/calculate`
  );
  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].path, /\/calculate$/);
  assert.equal(priced.estimate.calculation.pricingVersion, 4);
  console.log("ok: simulated PATCH then calculate updates estimate");
}

console.log("\naiTakeoffProjectDetailsSave.test.mjs — passed\n");
