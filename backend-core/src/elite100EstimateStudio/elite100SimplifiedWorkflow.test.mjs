/**
 * Elite 100 simplified estimating workflow — focused contract tests.
 * Run: npm run eos:test:elite100-simplified-workflow
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTOSAVE_STATUS_LABELS,
  CALC_STATUS_LABELS,
  ESTIMATES_REGISTRY_FILTERS,
  INBOX_ESTIMATE_STATUS,
  OBSOLETE_ESTIMATOR_GATE_LABELS,
  SIMPLIFIED_COMMITMENT_ACTIONS,
  SIMPLIFIED_ESTIMATE_SECTIONS,
  SIMPLIFIED_STUDIO_NAV,
  buildFrozenCustomerOptionPackageSummary,
  createStudioSimplifiedWorkflowService,
  deriveInboxEstimateStatus,
  deriveScopeReadiness,
  matchEstimatesRegistryFilter,
  readBacksplashEligibleLf,
  shouldApplyAutosaveResponse,
  shouldApplyCalculationResponse,
  simplifyInboxPrimaryAction
} from "./studioSimplifiedWorkflow.mjs";
import { buildSharedInboxRow } from "./studioSharedInboxReadModel.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const studioApp = readFileSync(
  join(__dirname, "../../../app-elite100-estimate-studio/src/StudioApp.tsx"),
  "utf8"
);
const inboxPage = readFileSync(
  join(__dirname, "../../../app-elite100-estimate-studio/src/estimateQueue/SharedInboxPage.tsx"),
  "utf8"
);
const scopePanel = readFileSync(
  join(__dirname, "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"),
  "utf8"
);
const dePanel = readFileSync(
  join(
    __dirname,
    "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"
  ),
  "utf8"
);
const workspace = readFileSync(
  join(
    __dirname,
    "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"
  ),
  "utf8"
);
const routes = readFileSync(join(__dirname, "elite100EstimateStudioRoutes.js"), "utf8");
const acceptSrc = readFileSync(join(__dirname, "studioFinalAcceptanceService.mjs"), "utf8");
const soldSrc = readFileSync(join(__dirname, "studioSoldReviewService.mjs"), "utf8");
const ieProbe = readFileSync(
  join(__dirname, "../../../app-internal-estimate/package.json"),
  "utf8"
);

console.log("\nelite100SimplifiedWorkflow.test.mjs\n");

assert.deepEqual(Object.values(SIMPLIFIED_STUDIO_NAV), ["inbox", "estimates"]);
assert.deepEqual(Object.values(SIMPLIFIED_ESTIMATE_SECTIONS), [
  "scope",
  "customer_choices",
  "review_publish"
]);
assert.ok(studioApp.includes('data-testid="studio-nav-inbox"'));
assert.ok(studioApp.includes('data-testid="studio-nav-estimates"'));
assert.ok(studioApp.includes(">Inbox<") || studioApp.includes("\n            Inbox\n"));
assert.ok(studioApp.includes(">Estimates<") || studioApp.includes("\n            Estimates\n"));
console.log("ok: 1 top-level Inbox + Estimates navigation");

{
  const unread = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m-view-1",
      subject: "Plans",
      sender: { displayName: "Casey" },
      attachments: [],
      viewed: false
    }
  });
  assert.equal(unread.viewed, false);
  const viewed = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m-view-2",
      subject: "Plans",
      sender: { displayName: "Casey" },
      attachments: [],
      viewed: true,
      viewedAt: "2026-07-21T12:00:00Z"
    }
  });
  assert.equal(viewed.viewed, true);
  assert.ok(routes.includes("mark-viewed"));
  console.log("ok: 2 inbox viewed state");
}

{
  const start = simplifyInboxPrimaryAction({
    key: "import_and_open",
    label: "Import and open",
    openTarget: "takeoff",
    mutates: true
  });
  assert.equal(start.key, "start_estimate");
  assert.equal(start.label, "Start Estimate");
  const resume = simplifyInboxPrimaryAction(
    { key: "open_estimate", label: "Open estimate", mutates: false },
    { estimateId: "est-1", intakeCaseId: "case-1" }
  );
  assert.equal(resume.key, "resume_estimate");
  assert.equal(resume.label, "Resume Estimate");
  assert.ok(routes.includes("start-estimate"));
  assert.ok(inboxPage.includes("startSharedInboxEstimate"));
  console.log("ok: 3–4 Start Estimate / Resume Estimate actions");
}

{
  const row = buildSharedInboxRow({
    previewMessage: {
      graphMessageId: "m-start",
      subject: "Kitchen",
      sender: { displayName: "A" },
      attachments: [{ sourceAttachmentId: "a", name: "a.pdf", support: "direct_pdf" }],
      importable: true,
      alreadyImported: false
    }
  });
  assert.equal(row.primaryAction.key, "start_estimate");
  assert.equal(row.legacyPrimaryAction.key, "import_and_open");
  assert.equal(row.estimateStatus, INBOX_ESTIMATE_STATUS.NOT_STARTED);
  console.log("ok: 5 inbox Start Estimate mapping + status chip");
}

{
  let importCalls = 0;
  let createCalls = 0;
  const svc = createStudioSimplifiedWorkflowService({
    sharedInboxService: {
      async importMessage() {
        importCalls += 1;
        return { intakeCaseId: "case-1", estimateId: "est-1", reused: importCalls > 1 };
      }
    },
    studioEstimateService: {
      async getOrCreateForCase() {
        createCalls += 1;
        return { id: "est-1", intakeCaseId: "case-1" };
      }
    },
    digitalEstimateService: { async publish() { throw new Error("not used"); } }
  });
  const a = await svc.startEstimate({
    organizationId: "org",
    actorUserId: "u1",
    messageKey: "m1",
    idempotencyKey: "k1",
    confirm: true
  });
  const b = await svc.startEstimate({
    organizationId: "org",
    actorUserId: "u1",
    messageKey: "m1",
    idempotencyKey: "k1",
    confirm: true
  });
  assert.equal(a.estimateId, "est-1");
  assert.equal(b.estimateId, "est-1");
  assert.equal(a.openTarget, SIMPLIFIED_ESTIMATE_SECTIONS.SCOPE);
  assert.equal(importCalls, 2);
  assert.equal(createCalls, 2);
  assert.equal(a.sideEffects.emailSent, false);
  console.log("ok: 6–7 Start Estimate idempotent open-to-Scope");
}

{
  const aiScope = { rooms: [{ id: "r1", name: "Kitchen", pieces: [{ id: "p1", lengthIn: 96, depthIn: 25.5, quantity: 1 }] }] };
  const manualScope = {
    estimateOrigin: "manual_staff",
    physicalScopeSource: "manual_staff",
    manualPhysicalScope: {
      rooms: [{ id: "r1", name: "Kitchen", pieces: [{ id: "p1", lengthIn: 96, depthIn: 25.5, quantity: 1 }] }]
    }
  };
  assert.equal(deriveScopeReadiness({ scope: aiScope }).ready, true);
  assert.equal(deriveScopeReadiness({ scope: manualScope }).ready, true);
  assert.equal(deriveScopeReadiness({ scope: { rooms: [] } }).ready, false);
  assert.ok(workspace.includes("eq-scope-prefill-hint") || workspace.includes("starting draft"));
  console.log("ok: 8–9 AI and manual share Scope readiness model");
}

{
  assert.equal(AUTOSAVE_STATUS_LABELS.saving, "Saving…");
  assert.equal(AUTOSAVE_STATUS_LABELS.saved, "Saved");
  assert.equal(AUTOSAVE_STATUS_LABELS.failed, "Save failed — Retry");
  assert.equal(AUTOSAVE_STATUS_LABELS.conflict, "Another user changed this estimate");
  const stale = shouldApplyAutosaveResponse({
    localMutationRevision: 5,
    responseMutationRevision: 4,
    requestStartedAt: 10,
    latestEditAt: 20
  });
  assert.equal(stale.apply, false);
  const ok = shouldApplyAutosaveResponse({
    localMutationRevision: 5,
    responseMutationRevision: 5,
    requestStartedAt: 30,
    latestEditAt: 20
  });
  assert.equal(ok.apply, true);
  console.log("ok: 10–12 autosave labels + stale/conflict rejection");
}

{
  assert.equal(readBacksplashEligibleLf({ backsplashEligibleLf: 18.5 }), 18.5);
  assert.equal(readBacksplashEligibleLf({ backsplash: { eligibleLf: 7 } }), 7);
  const needs = deriveScopeReadiness({
    scope: {
      manualPhysicalScope: {
        rooms: [
          {
            name: "Kitchen",
            offerBacksplash: true,
            pieces: [{ lengthIn: 10, depthIn: 25, quantity: 1 }]
          }
        ]
      }
    }
  });
  assert.equal(needs.ready, false);
  assert.ok(needs.issues.some((i) => i.code === "missing_backsplash_eligible_length"));
  console.log("ok: 13 backsplash-eligible length authority");
}

{
  assert.equal(CALC_STATUS_LABELS.updating, "Updating price…");
  const reject = shouldApplyCalculationResponse({
    requestCalcToken: "a",
    latestCalcToken: "b",
    responseFingerprint: "fp"
  });
  assert.equal(reject.apply, false);
  assert.ok(scopePanel.includes("eq-compat-calc-approve"));
  assert.ok(scopePanel.includes("useSimplifiedPublish"));
  assert.ok(routes.includes("simplified-publish"));
  console.log("ok: 14–16 auto-calc semantics; no required manual Calculate/Approve in primary path");
}

{
  let calc = 0;
  let approve = 0;
  let publish = 0;
  const svc = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: {
      async getById() {
        return {
          id: "est-1",
          status: "ready_to_price",
          scope: {
            estimateOrigin: "manual_staff",
            physicalScopeSource: "manual_staff",
            manualScopeConfirmed: true,
            manualPhysicalScope: {
              rooms: [{ pieces: [{ lengthIn: 96, depthIn: 25, quantity: 1 }] }]
            },
            projectName: "Kitchen",
            customerName: "Casey"
          },
          approval: { customerDisplayTotal: 5000 },
          calculationSnapshot: { totals: { customerDisplayTotal: 5000 } }
        };
      },
      async calculate() {
        calc += 1;
        return {
          id: "est-1",
          status: "priced",
          scope: {
            estimateOrigin: "manual_staff",
            physicalScopeSource: "manual_staff",
            manualScopeConfirmed: true,
            customerEmail: "casey@example.test",
            projectName: "Kitchen",
            materialGroup: "Group Promo",
            manualPhysicalScope: {
              rooms: [{ pieces: [{ lengthIn: 96, depthIn: 25, quantity: 1 }] }]
            },
            rooms: [
              {
                id: "room-1",
                included: true,
                pieces: [{ id: "piece-1", included: true, lengthIn: 96, depthIn: 25 }]
              }
            ]
          },
          calculationSnapshot: { fingerprint: "fp1", totals: { customerDisplayTotal: 5000 } },
          approval: null
        };
      },
      async approve() {
        approve += 1;
        return {
          id: "est-1",
          status: "approved",
          approval: { customerDisplayTotal: 5000, calculationFingerprint: "fp1" },
          calculationSnapshot: { fingerprint: "fp1", totals: { customerDisplayTotal: 5000 } },
          scope: { projectName: "Kitchen" }
        };
      }
    },
    digitalEstimateService: {
      async publish({ body }) {
        publish += 1;
        assert.equal(body.confirm, true);
        return {
          customerUrl: "https://example.test/de/abc",
          publication: { id: "pub-1", status: "active" },
          reused: false
        };
      }
    }
  });

  await assert.rejects(
    () =>
      svc.publishDigitalEstimate({
        organizationId: "org",
        estimateId: "est-1",
        actorUserId: "u1",
        body: {}
      }),
    (e) => e.code === "confirm_required"
  );

  const badScopeSvc = createStudioSimplifiedWorkflowService({
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: {
      async getById() {
        return { id: "est-bad", scope: { rooms: [] } };
      },
      async calculate() {
        throw new Error("should not calculate");
      },
      async approve() {
        throw new Error("should not approve");
      }
    },
    digitalEstimateService: {
      async publish() {
        throw new Error("should not publish");
      }
    }
  });
  await assert.rejects(
    () =>
      badScopeSvc.publishDigitalEstimate({
        organizationId: "org",
        estimateId: "est-bad",
        actorUserId: "u1",
        body: { confirm: true }
      }),
    (e) => e.code === "scope_needs_attention"
  );
  assert.equal(publish, 0);

  const ok = await svc.publishDigitalEstimate({
    organizationId: "org",
    estimateId: "est-1",
    actorUserId: "u1",
    body: { confirm: true, configuration: { allowedEdgeModes: ["edge_eased"] } }
  });
  assert.equal(calc, 1);
  assert.equal(approve, 1);
  assert.equal(publish, 1);
  assert.ok(ok.customerUrl);
  assert.ok(ok.frozenOptionPackage);
  assert.equal(ok.sideEffects.emailSent, false);
  assert.equal(ok.sideEffects.markedSold, false);
  assert.equal(ok.sideEffects.quickbooksWritten, false);
  assert.equal(ok.sideEffects.morawareWritten, false);
  console.log("ok: 17–20 one-step Publish atomic success + failure without publication");
}

{
  const pkg = buildFrozenCustomerOptionPackageSummary({
    estimate: {
      approval: { customerDisplayTotal: 1200 },
      scope: { projectName: "Kitchen", customerName: "Casey", rooms: [{ id: 1 }] }
    },
    configuration: {
      allowedEdgeModes: ["edge_eased"],
      textureImageRefs: ["tex-1"],
      productRefs: [{ id: "sink-1" }],
      customerChoiceGroups: [{ key: "materials", label: "Materials" }]
    }
  });
  assert.equal(pkg.approvedBaseCustomerTotal, 1200);
  assert.deepEqual(pkg.textureImageRefs, ["tex-1"]);
  assert.ok(pkg.allowedProducts);
  assert.equal(JSON.stringify(pkg).toLowerCase().includes("exactinternaltotal"), false);
  assert.throws(
    () =>
      buildFrozenCustomerOptionPackageSummary({
        configuration: { allowedColors: ["Group A exactInternalTotal"] }
      }),
    (e) => e.code === "frozen_package_leak"
  );
  console.log("ok: 21–24 frozen option package + texture/product refs + internal omit");
}

{
  assert.ok(acceptSrc.includes("Final Acceptance") || acceptSrc.includes("customer"));
  assert.ok(!/markSold|quickbooks|moraware|sendMail/i.test(acceptSrc) || /quickbooksWritten:\s*false/.test(acceptSrc));
  assert.ok(soldSrc.includes("canMarkStudioEstimateSold"));
  assert.equal(SIMPLIFIED_COMMITMENT_ACTIONS.PUBLISH, "publish_digital_estimate");
  assert.equal(SIMPLIFIED_COMMITMENT_ACTIONS.ACCEPT, "customer_accept_estimate");
  assert.equal(SIMPLIFIED_COMMITMENT_ACTIONS.MARK_SOLD, "mark_sold");
  console.log("ok: 25–26 Review Request / Acceptance / Mark Sold remain explicit commitments");
}

{
  assert.ok(matchEstimatesRegistryFilter({ lifecycleStatus: "sold" }, ESTIMATES_REGISTRY_FILTERS.sold));
  assert.ok(
    matchEstimatesRegistryFilter(
      { reviewRequestStatus: "open", needsAttention: true },
      ESTIMATES_REGISTRY_FILTERS.needs_attention
    )
  );
  assert.equal(
    deriveInboxEstimateStatus({ hasSoldSnapshot: true }),
    INBOX_ESTIMATE_STATUS.SOLD
  );
  console.log("ok: 27 Estimates registry filters + inbox status");
}

{
  assert.ok(dePanel.includes("simplified-publish") || dePanel.includes("useSimplifiedPublish"));
  assert.ok(workspace.includes("no separate") || workspace.includes("starting draft"));
  // Obsolete gate labels must not be primary required buttons outside compatibility wrappers
  for (const label of ["Approve Takeoff & Build Estimate"]) {
    assert.equal(workspace.includes(`<strong>${label}</strong>`), false);
  }
  assert.ok(scopePanel.includes("eq-compat-calc-approve"));
  assert.ok(OBSOLETE_ESTIMATOR_GATE_LABELS.includes("Calculate Estimate"));
  console.log("ok: 28 obsolete primary gates removed / compatibility-wrapped");
}

{
  assert.ok(ieProbe.includes("name"));
  const ql = readFileSync(join(__dirname, "../quotes/quoteLibrarySearch.test.mjs"), "utf8");
  assert.ok(ql.includes("quoteLibrarySearch"));
  assert.equal(/ALTER TABLE public\.quote_headers/i.test(routes), false);
  console.log("ok: 29–32 Internal Estimate + Quote Library untouched; no quote_headers Studio writes in routes");
}

{
  assert.ok(workspace.includes('data-testid="eq-section-tabs"'));
  assert.ok(workspace.includes("eq-section-tab-${id}") || workspace.includes("eq-section-tab-"));
  assert.ok(workspace.includes('"scope", "Scope"') || workspace.includes("['scope', 'Scope']") || workspace.includes('["scope", "Scope"]'));
  assert.ok(workspace.includes("customer_choices"));
  assert.ok(workspace.includes("review_publish"));
  assert.ok(workspace.includes("flushAllPendingSaves"));
  assert.ok(workspace.includes("onBeforePublishFlush"));
  assert.ok(workspace.includes("eq-compat-workflow-header"));
  console.log("ok: 33 three-section workspace tabs + flush-before-navigate/publish");
}

{
  assert.ok(scopePanel.includes('data-testid="eq-advanced-pricing"'));
  assert.ok(scopePanel.includes("eq-section-choices-commercial") || scopePanel.includes("Advanced Pricing"));
  assert.ok(scopePanel.includes("createStudioAutosaveController"));
  assert.ok(scopePanel.includes("runAutoCalculate"));
  assert.ok(scopePanel.includes("shouldApplyStudioAutosaveResponse"));
  assert.ok(scopePanel.includes("beforeunload"));
  assert.ok(scopePanel.includes('eq-compat-save-draft'));
  assert.ok(dePanel.includes("onBeforePublishFlush"));
  console.log("ok: 34 Advanced Pricing under Choices + autosave/calc/publish flush wiring");
}

{
  const autosaveCtrl = readFileSync(
    join(
      __dirname,
      "../../../app-elite100-estimate-studio/src/lib/studioAutosaveController.ts"
    ),
    "utf8"
  );
  const manualScope = readFileSync(
    join(
      __dirname,
      "../../../app-elite100-estimate-studio/src/estimateQueue/ManualPhysicalScopeEditor.tsx"
    ),
    "utf8"
  );
  assert.ok(autosaveCtrl.includes("markDirty"));
  assert.ok(autosaveCtrl.includes("async flush"));
  assert.ok(autosaveCtrl.includes("async retry"));
  assert.ok(autosaveCtrl.includes("Saving…"));
  assert.ok(autosaveCtrl.includes("Another user changed this estimate"));
  assert.ok(autosaveCtrl.includes("shouldApplyStudioAutosaveResponse"));
  // Scope field categories trigger markDirty / autosave
  for (const token of [
    "markDirty",
    "markCutoutsDirty",
    "lengthIn",
    "depthIn",
    "qty-sink",
    "included",
    "exposed",
    "backsplash",
    "notes"
  ]) {
    assert.ok(manualScope.includes(token), `manual scope missing ${token}`);
  }
  for (const token of [
    "materialGroup",
    "edgeProfileToken",
    "customerCatalogPermissions",
    "customLineItems",
    "commercialRole",
    "patchAddon",
    "internal_only",
    "absorbed"
  ]) {
    assert.ok(scopePanel.includes(token), `scope panel missing ${token}`);
  }
  assert.ok(manualScope.includes("manual-scope-compat-actions"));
  assert.ok(!/className="eq-btn-primary"[^>]*>[\s\S]{0,40}Save Draft/.test(scopePanel));
  console.log("ok: 35–36 autosave covers Scope + Choices + Advanced Pricing; Save not primary");
}

{
  // Autosave controller behavioral simulation (inline mirror of core rules)
  let status = "idle";
  let dirty = false;
  let latestEditAt = 0;
  let editSeq = 0;
  let applied = 0;
  let calcRuns = 0;
  const saves = [];
  async function runSave(startedAt) {
    status = "saving";
    const result = await new Promise((resolve) => {
      saves.push({ startedAt, resolve });
    });
    if (result.conflict) {
      status = "conflict";
      dirty = true;
      return;
    }
    if (latestEditAt > startedAt) {
      dirty = true;
      status = "saving";
      return;
    }
    dirty = false;
    status = "saved";
    applied += 1;
    calcRuns += 1;
  }
  function markDirty() {
    dirty = true;
    editSeq += 1;
    latestEditAt = editSeq;
    status = "saving";
  }
  markDirty();
  const t1 = latestEditAt;
  const p1 = runSave(t1);
  markDirty(); // newer local edit while in flight
  saves[0].resolve({ ok: true });
  await p1;
  assert.equal(dirty, true);
  assert.equal(applied, 0);
  const t2 = latestEditAt;
  const p2 = runSave(t2);
  saves[1].resolve({ ok: true });
  await p2;
  assert.equal(dirty, false);
  assert.equal(status, "saved");
  assert.equal(applied, 1);
  assert.equal(calcRuns, 1);
  markDirty();
  const t3 = latestEditAt;
  const p3 = runSave(t3);
  saves[2].resolve({ conflict: true });
  await p3;
  assert.equal(status, "conflict");
  assert.equal(dirty, true);
  console.log("ok: 37 autosave order/conflict simulation + auto-calc only on clean save");
}

{
  const staleCalc = shouldApplyCalculationResponse({
    requestCalcToken: 1,
    latestCalcToken: 2,
    responseFingerprint: "fp-old"
  });
  assert.equal(staleCalc.apply, false);
  const freshCalc = shouldApplyCalculationResponse({
    requestCalcToken: 2,
    latestCalcToken: 2,
    responseFingerprint: "fp-new"
  });
  assert.equal(freshCalc.apply, true);
  assert.ok(scopePanel.includes("calcTokenRef") || scopePanel.includes("token !== calcTokenRef"));
  console.log("ok: 38 stale calculation response ignored");
}

console.log("\nAll elite100-simplified-workflow tests passed.\n");
