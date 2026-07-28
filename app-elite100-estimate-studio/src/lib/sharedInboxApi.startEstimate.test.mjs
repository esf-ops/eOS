/**
 * Focused Start Estimate confirmation contract.
 * Proves startSharedInboxEstimate sends confirm:true (required by the
 * backend import_confirm_required guard) plus forceManual / idempotencyKey
 * body fields and the Idempotency-Key header — without weakening the
 * server-side guard.
 *
 * Run: node app-elite100-estimate-studio/src/lib/sharedInboxApi.startEstimate.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createStudioSimplifiedWorkflowService } from "../../../backend-core/src/elite100EstimateStudio/studioSimplifiedWorkflow.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const apiSrc = readFileSync(join(__dirname, "sharedInboxApi.mjs"), "utf8");
const pageSrc = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/SharedInboxPage.tsx"),
  "utf8"
);
const routesSrc = readFileSync(
  join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
  "utf8"
);

console.log("\nsharedInboxApi.startEstimate.test.mjs\n");

function sliceFn(src, startName, endName) {
  const start = src.indexOf(`export async function ${startName}`);
  const end = src.indexOf(`export async function ${endName}`);
  assert.ok(start >= 0, `${startName} found`);
  assert.ok(end > start, `${endName} follows ${startName}`);
  return src.slice(start, end);
}

// ── 1. Frontend request-shape contracts ───────────────────────────────
{
  const startFn = sliceFn(apiSrc, "startSharedInboxEstimate", "markSharedInboxViewed");
  assert.match(
    startFn,
    /\/api\/elite100-estimate-studio\/shared-inbox\/\$\{encodeURIComponent\(messageKey\)\}\/start-estimate/,
    "targets the correct start-estimate URL"
  );
  assert.match(startFn, /confirm:\s*true/, "body includes confirm: true");
  assert.match(startFn, /forceManual:\s*opts\.forceManual\s*===\s*true/, "body includes forceManual");
  assert.match(startFn, /idempotencyKey:\s*opts\.idempotencyKey/, "body includes idempotencyKey");
  assert.match(startFn, /["']Idempotency-Key["']/, "sets Idempotency-Key request header");
  assert.match(
    startFn,
    /\{\s*confirm:\s*true,\s*forceManual:\s*opts\.forceManual\s*===\s*true,\s*idempotencyKey:\s*opts\.idempotencyKey\s*\|\|\s*undefined\s*\}/,
    "request body is exactly { confirm:true, forceManual, idempotencyKey }"
  );

  const importFn = sliceFn(apiSrc, "importSharedInboxMessage", "startSharedInboxEstimate");
  assert.match(importFn, /confirm:\s*true/, "importSharedInboxMessage still sends confirm: true");
  assert.match(importFn, /\/import/, "importSharedInboxMessage still targets /import");
  assert.equal(importFn.includes("start-estimate"), false, "importSharedInboxMessage unchanged");

  const startRoute = routesSrc.slice(
    routesSrc.indexOf("shared-inbox/:messageKey/start-estimate"),
    routesSrc.indexOf("shared-inbox/:messageKey/mark-viewed")
  );
  assert.match(
    startRoute,
    /confirm:\s*body\.confirm\s*===\s*true/,
    "start-estimate route forwards body.confirm — never auto-confirms"
  );
  console.log("ok: 1 frontend+route contracts — URL, confirm:true, forceManual, idempotency, import unchanged");
}

// ── 2. Backend: confirm required; with confirm, intakeCaseId opens path ─
{
  let importArgs = [];
  let createCalls = 0;
  const svc = createStudioSimplifiedWorkflowService({
    sharedInboxService: {
      async importMessage(args) {
        importArgs.push(args);
        if (args.confirm !== true && args.confirm !== "true") {
          const err = new Error("Explicit import confirmation is required.");
          err.statusCode = 400;
          err.code = "import_confirm_required";
          throw err;
        }
        return {
          intakeCaseId: "case-start-1",
          estimateId: "est-start-1",
          alreadyImported: importArgs.length > 1,
          reused: importArgs.length > 1
        };
      }
    },
    studioEstimateService: {
      async getOrCreateForCase() {
        createCalls += 1;
        return { id: "est-start-1", intakeCaseId: "case-start-1" };
      }
    },
    digitalEstimateService: { async publish() { throw new Error("not used"); } }
  });

  await assert.rejects(
    () =>
      svc.startEstimate({
        organizationId: "org",
        actorUserId: "u1",
        messageKey: "msg-1",
        idempotencyKey: "idem-1"
        // confirm omitted — must fail
      }),
    (e) => e.code === "import_confirm_required",
    "without confirm, Start Estimate still hits import_confirm_required (guard intact)"
  );
  assert.equal(createCalls, 0, "estimate is not created when confirm is missing");

  const a = await svc.startEstimate({
    organizationId: "org",
    actorUserId: "u1",
    messageKey: "msg-1",
    idempotencyKey: "idem-1",
    forceManual: true,
    confirm: true
  });
  assert.equal(a.intakeCaseId, "case-start-1", "successful response contains intakeCaseId");
  assert.equal(a.estimateId, "est-start-1");
  assert.equal(a.openTarget, "scope");
  assert.equal(importArgs[importArgs.length - 1].confirm, true);
  assert.equal(importArgs[importArgs.length - 1].idempotencyKey, "idem-1");
  assert.equal(createCalls, 1);

  // Repeated request remains idempotent / may reuse.
  const b = await svc.startEstimate({
    organizationId: "org",
    actorUserId: "u1",
    messageKey: "msg-1",
    idempotencyKey: "idem-1",
    confirm: true
  });
  assert.equal(b.intakeCaseId, "case-start-1");
  assert.equal(b.estimateId, "est-start-1");
  assert.equal(b.reused, true, "already-created estimate may be reused");
  assert.equal(importArgs.length, 3, "importMessage invoked for rejected + two confirmed attempts");
  assert.equal(createCalls, 2);

  console.log(
    "ok: 2 backend — confirm required; with confirm returns intakeCaseId; repeated reuse; guard intact"
  );
}

// ── 3. SharedInboxPage opens estimate on intakeCaseId ─────────────────
{
  assert.match(
    pageSrc,
    /startSharedInboxEstimate\(authToken,\s*row\.messageKey/,
    "SharedInboxPage calls startSharedInboxEstimate on Start Estimate"
  );
  assert.match(
    pageSrc,
    /const caseId = result\.intakeCaseId \|\| result\.item\?\.intakeCaseId/,
    "successful Start Estimate response with intakeCaseId opens the estimate"
  );
  assert.match(pageSrc, /onOpenEstimate\(caseId/, "opens estimate workspace after success");
  console.log("ok: 3 SharedInboxPage opens estimate when intakeCaseId is returned");
}

console.log("\nsharedInboxApi.startEstimate.test.mjs: ok\n");
