/**
 * Quote Flow Estimates Official Workspace UI contracts.
 * Run: node app-elite100-quote-flow/src/estimates/quoteFlowEstimates.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeEstimateStats,
  filterEstimateItems,
  resolveEstimateDisplayName
} from "../lib/estimateGrouping.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const repoRoot = join(appRoot, "..");

console.log("\nquoteFlowEstimates.ui.test.mjs\n");

const page = readFileSync(join(appRoot, "src/estimates/EstimatesListPage.tsx"), "utf8");
const editor = readFileSync(join(appRoot, "src/estimates/OfficialScopeEditor.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowEstimatesApi.ts"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");
const grouping = readFileSync(join(appRoot, "src/lib/estimateGrouping.mjs"), "utf8");

assert.match(page, /data-testid="qf-estimates-page"/);
assert.match(page, /qf-page--command|qf-estimates--command/);
assert.match(page, /data-testid="qf-estimates-command-header"/);
assert.match(page, /data-testid="qf-estimates-stats"/);
assert.match(page, /data-testid="qf-estimates-list"/);
assert.match(page, /data-testid="qf-estimates-row"/);
assert.match(page, /data-testid="qf-estimates-detail"/);
assert.match(page, /data-testid="qf-estimates-save-scope"/);
assert.match(page, /data-testid="qf-estimates-name-input"/);
assert.match(page, /data-testid="qf-estimates-sections"/);
assert.match(page, /qf-estimates-tab-\$\{s\.key\}|qf-estimates-tab-scope/);
assert.match(page, /key:\s*"pricing"|Pricing/);
assert.match(page, /key:\s*"review"|Review/);
assert.match(page, /key:\s*"digital"|Digital Estimate/);
assert.match(page, /key:\s*"activity"|Activity/);
assert.match(page, /key:\s*"handoff"|Handoff/);
assert.match(page, /Save Scope/);
assert.match(page, /Coming later/);
assert.match(page, /Select an estimate to review official scope/);
assert.match(page, /Manage official scoped estimates/);
assert.match(editor, /data-testid="qf-official-scope-editor"/);
assert.match(editor, /Official scope/);
assert.match(editor, /Manual edits here do not rerun AI Takeoff/);
assert.match(editor, /Add room/);
assert.match(editor, /Add piece/);
assert.match(editor, /Exclude piece/);
assert.match(editor, /Remove room|qf-scope-remove-room/);
assert.match(editor, /Remove piece|qf-scope-remove-piece/);
assert.match(editor, /qf-scope-sf-summary/);
assert.match(api, /\/api\/elite100-quote-flow\/estimates/);
assert.match(api, /method:\s*["']PATCH["']/);
assert.match(api, /projectName|estimateName/);
assert.match(app, /EstimatesListPage/);
assert.match(app, /authToken=\{sessionToken\}/);
assert.match(app, /mainNav === "estimates"/);
assert.match(app, /qf-shell--command/);
assert.match(grouping, /resolveEstimateDisplayName/);
assert.match(grouping, /Untitled estimate/);
assert.doesNotMatch(page, /qf-queue-takeoff-iframe|takeoff-iframe|ConsolidatedTakeoffReview/);
assert.doesNotMatch(editor, /iframe|quoteFlowSetScope|AI Takeoff review/);
assert.doesNotMatch(page + editor + api, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(page, /\bSet Scope\b/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish|calculate|approve/);
assert.doesNotMatch(page, /calculate\(|publishDigital|mark sold|Approve Estimate/i);
console.log("ok: Estimates command center; official scope; section tabs; no Takeoff/V1/V2");

{
  const rows = [
    {
      estimateId: "a",
      estimateName: "Relihan VanderSchot Finals Plans",
      customerName: "Unknown contact",
      planFilename: "finals.pdf",
      scopeSource: { key: "ai_takeoff", label: "AI Takeoff" },
      updatedAt: new Date().toISOString(),
      scopeSummary: { roomCount: 1, pieceCount: 2, label: "1 room · 2 pieces" }
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
          pieces: [{ id: "p1", lengthIn: 96, depthIn: 25.5, quantity: 1, included: true }]
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
  console.log("ok: presenter estimate name before Unknown contact");
}

console.log("\nquoteFlowEstimates.ui.test.mjs: ok\n");
