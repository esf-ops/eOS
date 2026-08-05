/**
 * Quote Flow Estimates Library + Modal Workspace UI contracts.
 * Run: node app-elite100-quote-flow/src/estimates/quoteFlowEstimates.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeEstimateStats,
  filterEstimateItems,
  resolveEstimateDisplayName,
  resolvePieceOpenEdgeLf,
  summarizeRoomsLocal
} from "../lib/estimateGrouping.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const repoRoot = join(appRoot, "..");

console.log("\nquoteFlowEstimates.ui.test.mjs\n");

const page = readFileSync(join(appRoot, "src/estimates/EstimatesListPage.tsx"), "utf8");
const editor = readFileSync(join(appRoot, "src/estimates/OfficialScopeEditor.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowEstimatesApi.ts"), "utf8");
const styles = readFileSync(join(appRoot, "src/styles.css"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");
const grouping = readFileSync(join(appRoot, "src/lib/estimateGrouping.mjs"), "utf8");

assert.match(page, /data-testid="qf-estimates-page"/);
assert.match(page, /qf-page--command|qf-estimates--command/);
assert.match(page, /qf-estimates--library/);
assert.match(page, /data-testid="qf-estimates-command-header"/);
assert.match(page, /data-testid="qf-estimates-stats"/);
assert.match(page, /data-testid="qf-estimates-list"/);
assert.match(page, /data-testid="qf-estimates-row"/);
assert.match(page, /Estimate library/);
assert.match(page, /qf-estimates__cards|qf-estimates__card/);
assert.match(page, /modalOpen/);
assert.match(page, /qf-estimates-modal-backdrop/);
assert.match(page, /qf-estimates-modal/);
assert.match(page, /data-testid="qf-estimates-detail"/);
assert.match(page, /data-testid="qf-estimates-modal-close"/);
assert.match(page, /Back to library/);
assert.match(page, /data-testid="qf-estimates-save-scope"/);
assert.match(page, /data-testid="qf-estimates-name-input"/);
assert.match(page, /data-testid="qf-estimates-sections"/);
assert.match(page, /data-testid="qf-estimates-summary-open-edge"/);
assert.match(page, /qf-estimates-tab-\$\{s\.key\}|qf-estimates-tab-scope/);
assert.match(page, /key:\s*"pricing"|Pricing/);
assert.match(page, /key:\s*"review"|Review/);
assert.match(page, /key:\s*"digital"|Digital Estimate/);
assert.match(page, /key:\s*"activity"|Activity/);
assert.match(page, /key:\s*"handoff"|Handoff/);
assert.match(page, /Save Scope/);
assert.match(page, /Coming later|placeholder/);
assert.match(page, /Manage official scoped estimates/);
assert.match(page, /initialEstimateId/);
assert.match(page, /openEstimate\(initialEstimateId\)/);
assert.match(page, /Scope saved/);
assert.doesNotMatch(page, /Select an estimate to review official scope/);
assert.doesNotMatch(page, /qf-estimates--command-layout/);
assert.doesNotMatch(page, /qf-estimates__detail--command/);
assert.match(styles, /qf-estimates-modal-backdrop/);
assert.match(styles, /qf-estimates-modal\b/);
assert.match(styles, /qf-estimates__cards/);
assert.match(editor, /data-testid="qf-official-scope-editor"/);
assert.match(editor, /Official scope/);
assert.match(editor, /Manual edits here do not rerun AI Takeoff/);
assert.match(editor, /Open edge LF/);
assert.match(editor, /data-testid="qf-scope-open-edge-lf"/);
assert.match(editor, /Add room/);
assert.match(editor, /Add piece/);
assert.match(editor, /Exclude piece/);
assert.match(editor, /Remove room|qf-scope-remove-room/);
assert.match(editor, /Remove piece|qf-scope-remove-piece/);
assert.match(editor, /qf-scope-sf-summary/);
assert.match(editor, /LF open edge/);
assert.match(api, /\/api\/elite100-quote-flow\/estimates/);
assert.match(api, /method:\s*["']PATCH["']/);
assert.match(api, /projectName|estimateName/);
assert.match(api, /openEdgeLf/);
assert.match(app, /EstimatesListPage/);
assert.match(app, /authToken=\{sessionToken\}/);
assert.match(app, /mainNav === "estimates"/);
assert.match(app, /initialEstimateId=\{openEstimateId\}/);
assert.match(app, /qf-shell--command/);
assert.match(grouping, /resolveEstimateDisplayName/);
assert.match(grouping, /resolvePieceOpenEdgeLf/);
assert.match(grouping, /Untitled estimate/);
assert.match(grouping, /openEdgeLf/);
assert.doesNotMatch(page, /qf-queue-takeoff-iframe|takeoff-iframe|ConsolidatedTakeoffReview/);
assert.doesNotMatch(editor, /iframe|quoteFlowSetScope|AI Takeoff review/);
assert.doesNotMatch(page + editor + api, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(page, /\bSet Scope\b/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish|calculate|approve/);
assert.doesNotMatch(page, /calculate\(|publishDigital|mark sold|Approve Estimate/i);
console.log("ok: Estimates library-first; modal workspace; Open edge LF; no Takeoff/V1/V2");

{
  const rows = [
    {
      estimateId: "a",
      estimateName: "Relihan VanderSchot Finals Plans",
      customerName: "Unknown contact",
      planFilename: "finals.pdf",
      scopeSource: { key: "ai_takeoff", label: "AI Takeoff" },
      updatedAt: new Date().toISOString(),
      scopeSummary: {
        roomCount: 1,
        pieceCount: 2,
        openEdgeLf: 12.5,
        label: "1 room · 2 pieces · 12.5 LF open edge"
      }
    },
    {
      estimateId: "b",
      projectName: "Manual Job",
      scopeSource: { key: "manual", label: "Manual scope" },
      updatedAt: "2020-01-01T00:00:00.000Z",
      scopeSummary: { roomCount: 1, pieceCount: 1, label: "1 room · 1 piece" }
    }
  ];
  const stats = computeEstimateStats(rows);
  assert.equal(stats.total, 2);
  assert.equal(stats.aiSourced, 1);
  assert.equal(stats.manual, 1);
  assert.equal(filterEstimateItems(rows, "manual").length, 1);
  assert.equal(resolveEstimateDisplayName(rows[0]), "Relihan VanderSchot Finals Plans");
  assert.equal(
    resolveEstimateDisplayName({
      customerName: "Unknown contact",
      planFilename: "NCH-McLain Top Drawing.pdf"
    }),
    "NCH-McLain Top Drawing"
  );
  console.log("ok: estimate labels/filters; no Unknown contact fallback when plan exists");
}

{
  assert.equal(resolvePieceOpenEdgeLf({ openEdgeLf: 8.25 }), 8.25);
  assert.equal(resolvePieceOpenEdgeLf({ exposedEdgeLf: 4 }), 4);
  assert.equal(resolvePieceOpenEdgeLf({ finishedEdgeLf: 3.5 }), 3.5);
  assert.equal(
    resolvePieceOpenEdgeLf({ finishedEdge: { totalFinishedEdgeLengthIn: 36 } }),
    3
  );
  assert.equal(resolvePieceOpenEdgeLf({}), 0);
  assert.equal(resolvePieceOpenEdgeLf({ openEdgeLf: "", exposedEdgeLf: null }), 0);
  const summary = summarizeRoomsLocal([
    {
      included: true,
      pieces: [
        {
          lengthIn: 96,
          depthIn: 25.5,
          quantity: 1,
          included: true,
          openEdgeLf: 8
        },
        {
          lengthIn: 48,
          depthIn: 25.5,
          quantity: 2,
          included: true,
          exposedEdgeLf: 4
        }
      ]
    }
  ]);
  // 8*1 + 4*2 = 16
  assert.equal(summary.openEdgeLf, 16);
  assert.ok(summary.countertopSf > 0);
  console.log("ok: open/exposed edge LF resolve + rollup");
}

{
  const presenter = await import(
    join(repoRoot, "backend-core/src/elite100QuoteFlow/quoteFlowEstimatesPresenter.mjs")
  );
  const item = presenter.presentQuoteFlowEstimateListItem({
    id: "e1",
    status: "ready_to_price",
    takeoffJobId: "job-1",
    scope: {
      rooms: [
        {
          id: "r1",
          included: true,
          pieces: [
            {
              id: "p1",
              lengthIn: 96,
              depthIn: 25.5,
              quantity: 1,
              included: true,
              finishedEdgeLf: 10
            }
          ]
        }
      ],
      projectName: "Amanda Rushton",
      source: "quote_flow_set_scope"
    },
    customerIdentitySnapshot: { displayName: "Unknown contact" }
  });
  assert.equal(item.estimateName, "Amanda Rushton");
  assert.doesNotMatch(item.estimateName, /Unknown contact|AAMk/);
  assert.equal(item.scopeSource.key, "ai_takeoff");
  assert.equal(item.scopeSummary.openEdgeLf, 10);
  assert.match(item.scopeSummary.label, /open edge/);
  console.log("ok: presenter estimate name + open edge LF summary");
}

console.log("\nquoteFlowEstimates.ui.test.mjs: ok\n");
