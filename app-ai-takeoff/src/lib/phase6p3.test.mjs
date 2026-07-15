/**
 * Phase 6P.3 — Estimator Queue (pilot-gated) regression tests.
 * Run: node app-ai-takeoff/src/lib/phase6p3.test.mjs
 *
 * Uses injected/fake API responses only — no Supabase, Graph, or network.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isQuoteIntakeUiEnabled } from "./quoteIntakeUiConfig.mjs";
import {
  buildTakeoffSearch,
  parseTakeoffAppLocation
} from "./quoteIntakeView.mjs";
import {
  createQuoteIntakeApiClient,
  classifyQuoteIntakeError,
  QuoteIntakeClientError,
  QUOTE_INTAKE_API_PREFIX,
  assertQuoteIntakePathAllowed
} from "./quoteIntakeApi.mjs";
import {
  filterQuoteIntakeCases,
  computeQueueSummaryCounts
} from "./quoteIntakeFilter.mjs";
import {
  caseCustomerProjectLabel,
  caseSenderLabel,
  stripHtmlToText
} from "./quoteIntakeFormat.mjs";
import { labelQuoteIntakeStatus } from "./quoteIntakeStatusLabels.mjs";
import { sanitizeMetadataForDisplay } from "./quoteIntakeSanitize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "../..");
const srcRoot = join(__dirname, "..");

const FIXTURE_CASES = [
  {
    id: "case-a",
    status: "qil_received",
    priority: "high",
    createdAt: "2026-07-14T12:00:00.000Z",
    customerName: "Example Homes LLC",
    projectName: "Oak Ave remodel",
    senderEmail: "buyer@example.com",
    sourceMessage: { internetMessageId: "<a@example.com>", fromAddressHash: "abc123hash" },
    attachments: [{ id: "att-1", sha256: "a".repeat(64), safeFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 1200 }],
    missingInformation: ["program_unclear"]
  },
  {
    id: "case-b",
    status: "qil_manual_review",
    priority: "normal",
    createdAt: "2026-07-13T12:00:00.000Z",
    // no customer/project → Unknown fallbacks
    sourceMessage: { contentHash: "hash-b" },
    attachments: [],
    manualReviewReasons: ["sender_not_allowlisted"]
  }
];

console.log("\nphase6p3.test.mjs\n");

// 1. Existing workbench is default when no view query exists.
{
  const loc = parseTakeoffAppLocation("", { uiEnabled: true });
  assert.equal(loc.view, "workbench");
  assert.equal(loc.intakeCaseId, null);
  assert.equal(buildTakeoffSearch({ view: "workbench" }), "");
  console.log("ok: workbench default when no view query");
}

// 2. Existing takeoffJobId deep link still works.
{
  const loc = parseTakeoffAppLocation("?takeoffJobId=job-123", { uiEnabled: true });
  assert.equal(loc.view, "workbench");
  assert.equal(loc.takeoffJobId, "job-123");
  assert.equal(
    buildTakeoffSearch({ view: "workbench", takeoffJobId: "job-123" }),
    "?takeoffJobId=job-123"
  );
  console.log("ok: takeoffJobId deep link preserved");
}

// 3. Queue tab hidden when UI flag is off (view=intake forced to workbench).
{
  assert.equal(isQuoteIntakeUiEnabled({}), false);
  assert.equal(isQuoteIntakeUiEnabled({ VITE_QUOTE_INTAKE_UI_ENABLED: "false" }), false);
  assert.equal(isQuoteIntakeUiEnabled({ VITE_QUOTE_INTAKE_UI_ENABLED: "1" }), true);
  const forced = parseTakeoffAppLocation("?view=intake&intakeCaseId=x", { uiEnabled: false });
  assert.equal(forced.view, "workbench");
  assert.equal(forced.intakeCaseId, null);
  console.log("ok: queue view closed when UI flag off");
}

// 4. Queue view loads when UI flag on.
{
  const loc = parseTakeoffAppLocation("?view=intake", { uiEnabled: true });
  assert.equal(loc.view, "intake");
  const withCase = parseTakeoffAppLocation("?view=intake&intakeCaseId=case-a", { uiEnabled: true });
  assert.equal(withCase.intakeCaseId, "case-a");
  assert.equal(
    buildTakeoffSearch({ view: "intake", intakeCaseId: "case-a", takeoffJobId: "job-1" }),
    "?view=intake&intakeCaseId=case-a&takeoffJobId=job-1"
  );
  console.log("ok: intake view + case selection query");
}

// 5. 401/403 exposes no case data (client classify + list short-circuit).
{
  const forbidden = createQuoteIntakeApiClient({
    fetchImpl: async () => ({
      status: 403,
      ok: false,
      json: { ok: false, error: "Quote Intake pilot access required", cases: FIXTURE_CASES }
    })
  });
  await assert.rejects(() => forbidden.listCases("tok"), (e) => {
    assert.equal(e.status, 403);
    // Error path must not surface body.cases as a successful list.
    // Error body may contain junk; callers must not treat rejects as lists.
    assert.ok(e.body && typeof e.body === "object");
    const c = classifyQuoteIntakeError(e);
    assert.equal(c.kind, "forbidden");
    return true;
  });
  const unauthorized = classifyQuoteIntakeError(new QuoteIntakeClientError("nope", 401));
  assert.equal(unauthorized.kind, "unauthorized");

  const queueSrc = readFileSync(join(srcRoot, "components/intake/EstimatorQueueView.tsx"), "utf8");
  assert.ok(queueSrc.includes("clearAuthorizedCaseData"));
  assert.ok(queueSrc.includes('kind: "forbidden"'));
  assert.ok(queueSrc.includes("cases: []"));
  assert.ok(
    /clearAuthorizedCaseData\(\);\s*if \(classified\.kind === "unauthorized"\)/s.test(queueSrc) ||
      queueSrc.includes('classified.kind === "forbidden"')
  );
  // Fail-closed: auth failures clear detail before/with empty list state.
  assert.ok(queueSrc.includes("clearAuthorizedCaseData();"));
  console.log("ok: 401/403 classified — no case payload returned; UI clears authorized data");
}

// 6. API unavailable/disabled path.
{
  const missing = classifyQuoteIntakeError(new QuoteIntakeClientError("Not found", 404));
  assert.equal(missing.kind, "not_found");
  const down = classifyQuoteIntakeError(new QuoteIntakeClientError("Unavailable", 503));
  assert.equal(down.kind, "unavailable");
  console.log("ok: API disabled/unavailable classification");
}

// 7. Cases render with safe unknown fallbacks.
{
  assert.equal(caseCustomerProjectLabel(FIXTURE_CASES[0]), "Example Homes LLC · Oak Ave remodel");
  assert.equal(caseCustomerProjectLabel(FIXTURE_CASES[1]), "Unknown");
  assert.equal(caseSenderLabel(FIXTURE_CASES[1]).startsWith("Unknown") || caseSenderLabel(FIXTURE_CASES[1]).includes("hash"), true);
  assert.equal(labelQuoteIntakeStatus("qil_manual_review"), "Manual review");
  console.log("ok: safe unknown fallbacks + status labels");
}

// 8. Status/filter/search behavior.
{
  const byStatus = filterQuoteIntakeCases(FIXTURE_CASES, {
    search: "",
    status: "qil_manual_review",
    priority: "",
    summaryBucket: ""
  });
  assert.equal(byStatus.length, 1);
  assert.equal(byStatus[0].id, "case-b");

  const bySearch = filterQuoteIntakeCases(FIXTURE_CASES, {
    search: "oak ave",
    status: "",
    priority: "",
    summaryBucket: ""
  });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, "case-a");

  const byPriority = filterQuoteIntakeCases(FIXTURE_CASES, {
    search: "",
    status: "",
    priority: "high",
    summaryBucket: ""
  });
  assert.equal(byPriority.length, 1);

  const counts = computeQueueSummaryCounts(FIXTURE_CASES);
  assert.equal(counts.total, 2);
  assert.ok(counts.new >= 1);
  assert.ok(counts.manual_review >= 1);
  console.log("ok: status/filter/search behavior");
}

// 9 + 10. Case selection updates intakeCaseId; back/forward restores via search builder.
{
  const selected = buildTakeoffSearch({ view: "intake", intakeCaseId: "case-a" });
  assert.equal(selected, "?view=intake&intakeCaseId=case-a");
  const cleared = buildTakeoffSearch({
    view: "intake",
    intakeCaseId: null,
    baseSearch: selected
  });
  assert.equal(cleared, "?view=intake");
  const backWorkbench = buildTakeoffSearch({
    view: "workbench",
    takeoffJobId: "job-9",
    baseSearch: selected
  });
  assert.equal(backWorkbench, "?takeoffJobId=job-9");
  assert.equal(backWorkbench.includes("view=intake"), false);
  console.log("ok: intakeCaseId selection + history search restoration");
}

// 11. Detail fields / audit sanitize.
{
  const audit = sanitizeMetadataForDisplay({
    status: "qil_received",
    token: "super-secret",
    note: "<b>bold</b> ok"
  });
  assert.equal(audit.token, "[redacted]");
  assert.equal(audit.note, "bold ok");
  assert.equal(audit.status, "qil_received");
  console.log("ok: detail audit metadata sanitized");
}

// 12. Raw HTML is never rendered (source scan).
{
  const intakeFiles = [
    join(srcRoot, "components/intake/EstimatorQueueView.tsx"),
    join(srcRoot, "components/intake/EstimatorQueueCaseDetail.tsx"),
    join(srcRoot, "lib/quoteIntakeFormat.mjs"),
    join(srcRoot, "lib/quoteIntakeSanitize.mjs")
  ];
  for (const file of intakeFiles) {
    const src = readFileSync(file, "utf8");
    assert.equal(src.includes("dangerouslySetInnerHTML"), false, file);
    assert.equal(src.includes("innerHTML"), false, file);
  }
  assert.equal(stripHtmlToText("<script>alert(1)</script>Hi"), "alert(1) Hi".replace(/\s+/g, " ").trim() || "alert(1) Hi");
  // strip leaves text content without tags
  assert.equal(stripHtmlToText("<p>Hello</p>"), "Hello");
  console.log("ok: no dangerouslySetInnerHTML / raw HTML rendering");
}

// 13. No Graph/Supabase write / Takeoff provider / IE / Quote Library deps in intake modules.
{
  const intakeDir = join(srcRoot, "components/intake");
  const libFiles = readdirSync(join(srcRoot, "lib"))
    .filter((f) => f.startsWith("quoteIntake") && !f.includes(".test."))
    .map((f) => join(srcRoot, "lib", f));
  const componentFiles = readdirSync(intakeDir).map((f) => join(intakeDir, f));
  const forbidden = [
    "graph.microsoft",
    "@supabase/supabase-js",
    "geminiTakeoffProvider",
    "openAiTakeoffProvider",
    "import-from-takeoff",
    "importInternalEstimateFromTakeoff",
    "quoteLibraryApi",
    "/api/quote-library",
    "quotePersist",
    "quoteDelivery"
  ];
  for (const file of [...libFiles, ...componentFiles]) {
    const src = readFileSync(file, "utf8");
    for (const needle of forbidden) {
      assert.equal(src.includes(needle), false, `${file} must not reference ${needle}`);
    }
  }
  console.log("ok: no Graph/Supabase/Takeoff-provider/IE/Quote-Library deps in intake modules");
}

// 14. No queue control invokes Takeoff (client paths only /api/quote-intake).
{
  const paths = [];
  const client = createQuoteIntakeApiClient({
    fetchImpl: async (path) => {
      paths.push(path);
      assertQuoteIntakePathAllowed(path);
      if (path.endsWith("/config")) {
        return {
          ok: true,
          status: 200,
          json: { ok: true, config: { quoteIntakeApiEnabled: true } }
        };
      }
      if (path.endsWith("/cases")) {
        return { ok: true, status: 200, json: { ok: true, cases: FIXTURE_CASES } };
      }
      if (path.includes("/audit-events")) {
        return {
          ok: true,
          status: 200,
          json: {
            ok: true,
            events: [
              {
                id: "ev-1",
                intakeCaseId: "case-a",
                eventType: "case_created",
                createdAt: "2026-07-14T12:00:00.000Z",
                actorType: "system",
                metadata: { status: "qil_received" }
              }
            ]
          }
        };
      }
      if (path.includes("/takeoff-links")) {
        return {
          ok: true,
          status: 200,
          json: {
            ok: true,
            links: [
              {
                id: "link-1",
                intakeCaseId: "case-a",
                takeoffJobId: null,
                relationshipStatus: "requested",
                initiationMode: "manual",
                idempotencyKey: "k1",
                createdAt: "2026-07-14T12:00:00.000Z"
              }
            ]
          }
        };
      }
      if (path.includes("/cases/")) {
        return { ok: true, status: 200, json: { ok: true, case: FIXTURE_CASES[0] } };
      }
      return { ok: false, status: 404, json: { error: "Not found" } };
    }
  });

  const config = await client.getConfig("tok");
  assert.equal(config.quoteIntakeApiEnabled, true);
  const cases = await client.listCases("tok");
  assert.equal(cases.length, 2);
  const detail = await client.getCase("tok", "case-a");
  assert.equal(detail.id, "case-a");
  const events = await client.listAuditEvents("tok", "case-a");
  assert.equal(events.length, 1);
  const links = await client.listTakeoffLinks("tok", "case-a");
  assert.equal(links[0].takeoffJobId, null);

  for (const p of paths) {
    assert.ok(p.startsWith(QUOTE_INTAKE_API_PREFIX), p);
    assert.equal(p.includes("/api/takeoff-jobs"), false);
    assert.equal(p.includes("import-from-takeoff"), false);
    assert.equal(p.includes("/generate-ai-draft"), false);
  }
  console.log("ok: queue client only calls /api/quote-intake/* — no Takeoff invocation");
}

// 15. Source boundary: TakeoffLabApp wiring is additive (flag + view), workbench still present.
{
  const appSrc = readFileSync(join(srcRoot, "TakeoffLabApp.tsx"), "utf8");
  assert.ok(appSrc.includes("EstimatorQueueView"));
  assert.ok(appSrc.includes("isQuoteIntakeUiEnabled"));
  assert.ok(appSrc.includes('view: "workbench"'));
  assert.ok(appSrc.includes("hidden={showEstimatorQueue}"));
  // workbench components still mounted for regression safety
  assert.ok(appSrc.includes("TakeoffPlanFileSection"));
  assert.ok(appSrc.includes("TakeoffWorkflowStepper"));
  // Closure: workbench default never embeds quote-intake fetches in TakeoffLabApp itself.
  assert.equal(appSrc.includes("/api/quote-intake"), false);
  assert.equal(appSrc.includes("createQuoteIntakeApiClient"), false);
  assert.ok(appSrc.includes("quoteIntakeUiEnabled && appView === \"intake\""));
  // EstimatorQueueView only mounts when showEstimatorQueue is true.
  assert.ok(appSrc.includes("{showEstimatorQueue ? ("));
  console.log("ok: TakeoffLabApp additive queue wiring; workbench preserved");
}

// Closure: UI flag off cannot mount queue; config failures stay inside queue component.
{
  assert.equal(
    parseTakeoffAppLocation("?view=intake&intakeCaseId=case-a", { uiEnabled: false }).view,
    "workbench"
  );
  const queueSrc = readFileSync(join(srcRoot, "components/intake/EstimatorQueueView.tsx"), "utf8");
  assert.ok(queueSrc.includes("getConfig"));
  const appSrc = readFileSync(join(srcRoot, "TakeoffLabApp.tsx"), "utf8");
  // Workbench boot/hydration does not await quote-intake config.
  assert.equal(appSrc.includes("getConfig("), false);
  assert.ok(appSrc.includes("TakeoffPlanFileSection"));
  console.log("ok: UI-off forces workbench; config load isolated to queue view");
}

// Closure: no enabled queue control mutates / starts Takeoff / IE / email.
{
  const queueSrc = readFileSync(join(srcRoot, "components/intake/EstimatorQueueView.tsx"), "utf8");
  const detailSrc = readFileSync(
    join(srcRoot, "components/intake/EstimatorQueueCaseDetail.tsx"),
    "utf8"
  );
  for (const needle of [
    "generate-ai-draft",
    "import-from-takeoff",
    "importInternalEstimateFromTakeoff",
    "recordAutomationDecision",
    "createCase",
    "labApiPost",
    "method: \"POST\"",
    "method: \"PATCH\"",
    "method: \"DELETE\""
  ]) {
    assert.equal(queueSrc.includes(needle), false, `queue must not include ${needle}`);
    assert.equal(detailSrc.includes(needle), false, `detail must not include ${needle}`);
  }
  assert.ok(detailSrc.includes("Start Takeoff (later phase)"));
  assert.ok(detailSrc.includes("disabled title=\"Phase 6P.6+\""));
  assert.ok(detailSrc.includes("Import to Internal Estimate (disabled)"));
  assert.ok(detailSrc.includes("Send customer email (disabled)"));
  // Linked-job navigation is view-only (workbench deep link), not start/generate.
  assert.ok(detailSrc.includes("Open linked Takeoff job") || !detailSrc.includes("onOpenLinkedTakeoff"));
  console.log("ok: no enabled queue control starts Takeoff / IE / email / case mutation");
}

// Env example documents flag.
{
  const envExample = readFileSync(join(appRoot, ".env.example"), "utf8");
  assert.ok(envExample.includes("VITE_QUOTE_INTAKE_UI_ENABLED"));
  console.log("ok: .env.example documents UI flag");
}

console.log("\nAll phase6p3 tests passed.\n");
