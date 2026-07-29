/**
 * Generate AI estimator operational-depth review HTML + PNGs.
 * Uses real React display components (Approved / Published / Revision compare).
 * Takeoff Review requires authenticated app-ai-takeoff — see LIMITATION.md.
 *
 * Run: node --import tsx app-elite100-estimate-studio/scripts/generateAiEstimatorReviewV2.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ApprovedMeasurementsCard,
  CompactEstimateHeader,
  PublishedEstimateCard
} from "../src/estimateQueue/AiEstimatorWorkspace.tsx";
import { MeasurementRevisionComparison } from "../src/estimateQueue/AiEstimatorReadViews.tsx";
import { buildAiEstimatorSummary } from "../../backend-core/src/elite100EstimateStudio/studioAiEstimatorSummary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, ".local/review/ai-estimator-consolidation-v2");
mkdirSync(outDir, { recursive: true });

const kitchenR1 = {
  revision: 1,
  scope: {
    addOns: { "qty-sink": 1, "qty-cook": 1, "qty-outlet": 1, "qty-bar": 0 },
    edgeEligibleLinearFeet: 26.25,
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        included: true,
        countertopSqft: 46.25,
        backsplashSqft: 5.79,
        edgeEligibleLinearFeet: 26.25,
        pieces: [
          { id: "p1", name: "Cooktop wall", pieceType: "counter", lengthIn: 112.5, depthIn: 25.5, quantity: 1, sqft: 19.92, included: true },
          { id: "p2", name: "Sink wall", pieceType: "counter", lengthIn: 96, depthIn: 25.5, quantity: 1, sqft: 17, included: true },
          { id: "p3", name: "Cooktop wall FHB", pieceType: "counter", lengthIn: 112.5, depthIn: 18, quantity: 1, sqft: 14.06, included: true },
          { id: "p4", name: "Sink wall FHB", pieceType: "counter", lengthIn: 96, depthIn: 18, quantity: 1, sqft: 12, included: true }
        ]
      }
    ]
  },
  calculation: {
    totals: { customerDisplayTotal: 5120 },
    reviewSummary: {
      countertopMaterialTotal: 3800,
      backsplashTotal: 420,
      materialTaxTotal: 80,
      fabricationTotal: 820
    },
    warnings: [],
    unresolvedItems: []
  },
  activeReview: { eligible: true, blockers: [] }
};

const kitchenR2 = structuredClone(kitchenR1);
kitchenR2.revision = 2;
kitchenR2.scope.rooms[0].pieces[1].lengthIn = 120;
kitchenR2.scope.rooms[0].pieces[1].sqft = 21.25;
kitchenR2.scope.rooms[0].pieces[3].lengthIn = 120;
kitchenR2.scope.rooms[0].pieces[3].sqft = 15;
kitchenR2.scope.rooms[0].countertopSf = 50;
kitchenR2.scope.rooms[0].countertopSqft = 50;
kitchenR2.calculation.totals.customerDisplayTotal = 5480;

const summaryR1 = buildAiEstimatorSummary({
  estimate: kitchenR1,
  publicationSummary: {
    active: true,
    revision: 1,
    publishedAt: "2026-07-28T15:00:00.000Z",
    customerUrl: "https://digital.example/e/demo-token",
    customerUrlAvailable: true,
    customerActivityState: "waiting",
    customerActivityLabel: "Not viewed",
    reviewRequestOpen: false
  }
});

const summaryR2 = buildAiEstimatorSummary({
  estimate: kitchenR2,
  priorEstimate: kitchenR1
});

const css = `
  :root { --eos-border: #d5ddd8; --eos-ink: #14241c; --eos-muted: #5a6b63; }
  body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; background: #eef2f0; color: var(--eos-ink); }
  .page { max-width: 72rem; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
  .eq-ai-compact-header, .eq-ai-approved-card, .eq-ai-revision-compare, .eq-takeoff-frame-wrap {
    background: #fff; border: 1px solid var(--eos-border); border-radius: 10px;
  }
  .eq-ai-compact-header { display:flex; justify-content:space-between; gap:12px; padding:14px 16px; flex-wrap:wrap; }
  .eq-ai-approved-card { padding:16px 18px; display:flex; flex-direction:column; gap:14px; }
  .eq-ai-approved-card--deep { max-width: 100%; }
  .eq-summary-dl--grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr)); gap:10px 14px; }
  .eq-summary-dl--grid div { margin:0; padding:10px 12px; background:#f7f9f8; border:1px solid var(--eos-border); border-radius:8px; }
  .eq-summary-dl dt { font-size:0.78rem; color:var(--eos-muted); }
  .eq-summary-dl dd { margin:4px 0 0; font-weight:650; }
  .eq-ai-section-title { margin:0 0 8px; font-size:0.95rem; font-weight:650; }
  .eq-ai-room-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
  .eq-ai-room-card { border:1px solid var(--eos-border); border-radius:8px; overflow:hidden; }
  .eq-ai-room-card__header { width:100%; display:flex; justify-content:space-between; gap:8px; padding:10px 12px; background:#f7f9f8; border:0; font:inherit; }
  .eq-ai-room-card__body { padding:10px 12px; }
  .eq-ai-piece-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
  .eq-ai-piece-table th, .eq-ai-piece-table td { padding:6px 8px; border-bottom:1px solid var(--eos-border); text-align:left; }
  .eq-ai-price-groups, .eq-ai-change-list, .eq-ai-room-openings { list-style:none; margin:0; padding:0; }
  .eq-ai-price-groups li, .eq-ai-change-list li, .eq-ai-room-openings li { display:flex; justify-content:space-between; gap:12px; padding:4px 0; border-bottom:1px solid #eef2f0; }
  .eq-ai-price-total { display:flex; justify-content:space-between; margin-top:10px; padding-top:10px; border-top:1px solid var(--eos-border); }
  .eq-action-row { display:flex; flex-wrap:wrap; gap:8px; }
  .eq-btn-primary, .eq-btn-secondary, .eq-btn-ghost { padding:8px 12px; border-radius:6px; border:1px solid var(--eos-border); background:#fff; font:inherit; text-decoration:none; color:inherit; }
  .eq-btn-primary { background:#1a4d38; color:#fff; border-color:#1a4d38; }
  .eq-muted { color:var(--eos-muted); font-size:0.9rem; }
  .eq-ai-revision-compare { padding:12px 14px; }
  .eq-takeoff-frame-wrap { min-height: 320px; padding: 16px; }
  .limitation { padding:12px 14px; background:#fff8ef; border:1px solid #e8c9a0; border-radius:8px; }
`;

function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>${css}</style></head><body><div class="page">${bodyHtml}</div></body></html>`;
}

const header = renderToStaticMarkup(
  React.createElement(CompactEstimateHeader, {
    title: "Nietert Kitchen",
    planFilename: "kitchen-plan.pdf",
    onViewPlan: () => {},
    onBackToQueue: () => {},
    draftSaveStatus: null
  })
);

const approvedHtml = page(
  "Measurements approved R1",
  header +
    renderToStaticMarkup(
      React.createElement(ApprovedMeasurementsCard, {
        aiSummary: summaryR1,
        estimateRevision: 1,
        publishedRevision: null,
        activeReview: { eligible: true, blockers: [] },
        publishBusy: false,
        publishError: null,
        publishLabel: "Publish Digital Estimate",
        eligible: true,
        estimateId: "est-r1",
        onEdit: () => {},
        onPublish: () => {}
      })
    )
);

const publishedHtml = page(
  "Digital Estimate published R1",
  header +
    renderToStaticMarkup(
      React.createElement(PublishedEstimateCard, {
        aiSummary: summaryR1,
        estimateRevision: 1,
        publishedRevision: 1,
        customerUrl: "https://digital.example/e/demo-token",
        onEdit: () => {},
        onCopy: () => {}
      })
    )
);

const revisedApprovedHtml = page(
  "Measurements approved R2",
  header +
    renderToStaticMarkup(
      React.createElement(ApprovedMeasurementsCard, {
        aiSummary: summaryR2,
        estimateRevision: 2,
        publishedRevision: 1,
        activeReview: { eligible: true, blockers: [] },
        publishBusy: false,
        publishError: null,
        publishLabel: "Publish Revised Estimate",
        eligible: true,
        estimateId: "est-r2",
        onEdit: () => {},
        onPublish: () => {}
      })
    )
);

const revisionDraftShell = page(
  "Editing measurement revision R2 (Takeoff limitation)",
  header.replace(
    "eq-ai-compact-header",
    "eq-ai-compact-header"
  ) +
    `<div class="eq-ai-revision-banner" style="font-weight:650">Editing measurement revision R2 · Based on published revision R1</div>` +
    renderToStaticMarkup(
      React.createElement(MeasurementRevisionComparison, {
        comparison: summaryR2.comparison
      })
    ) +
    `<div class="limitation" data-testid="eq-takeoff-limitation">
      <strong>Takeoff Review mount:</strong> Production mounts
      <code>eq-takeoff-iframe</code> → <code>app-ai-takeoff/?takeoffJobId=…&amp;consolidated=1</code>
      (real ConsolidatedTakeoffReview). Automated review cannot authenticate a live Takeoff job here,
      so this package does <em>not</em> fabricate a fake worksheet. See LIMITATION.md.
      Comparison panel above is the real <code>MeasurementRevisionComparison</code> component.
    </div>
    <div class="eq-takeoff-frame-wrap" data-testid="eq-takeoff-frame-wrap">
      <iframe class="eq-takeoff-frame" data-testid="eq-takeoff-iframe" title="AI Takeoff review"
        src="about:blank" style="width:100%;min-height:240px;border:0;background:#f8faf9"></iframe>
    </div>`
);

const draftShell = page(
  "AI Takeoff draft (Takeoff limitation)",
  header +
    `<h2 class="eq-ai-section-title">AI Takeoff Review</h2>
    <div class="limitation">
      Production draft stage mounts the real Consolidated Takeoff Review via iframe
      (<code>consolidated=1</code>) with plan preview, rooms/pieces, Save Draft, and Approve Measurements.
      This automated package cannot load that authenticated tool — see LIMITATION.md.
      No placeholder worksheet was fabricated.
    </div>
    <div class="eq-takeoff-frame-wrap" data-testid="eq-takeoff-frame-wrap">
      <iframe class="eq-takeoff-frame" data-testid="eq-takeoff-iframe" title="AI Takeoff review"
        src="about:blank" style="width:100%;min-height:240px;border:0;background:#f8faf9"></iframe>
    </div>`
);

const files = {
  "01-draft-takeoff.html": draftShell,
  "02-approved-r1.html": approvedHtml,
  "03-published-r1.html": publishedHtml,
  "04-revision-draft-r2.html": revisionDraftShell,
  "05-revised-approved-r2.html": revisedApprovedHtml
};

for (const [name, html] of Object.entries(files)) {
  writeFileSync(join(outDir, name), html, "utf8");
}

writeFileSync(
  join(outDir, "LIMITATION.md"),
  `# Screenshot limitation — real Takeoff Review

The production draft / revision_draft stages mount:

\`\`\`
<iframe data-testid="eq-takeoff-iframe"
  src="{VITE_HEAD_URL_AI_TAKEOFF}/?takeoffJobId=…&consolidated=1" />
\`\`\`

That loads \`ConsolidatedTakeoffReview\` (plan preview, editable rooms/pieces, openings,
Save Draft, Approve Measurements). It requires a running Takeoff head plus an authenticated
session and a real takeoff job.

This review package therefore:

- **Does** screenshot real \`ApprovedMeasurementsCard\` / \`PublishedEstimateCard\` /
  \`MeasurementRevisionComparison\` output from production-shaped fixtures.
- **Does not** fabricate a fake Takeoff worksheet to stand in for ConsolidatedTakeoffReview.
- **Does** leave the real iframe mount point in the draft/revision HTML shells.

To capture live Takeoff screenshots: run Studio + Takeoff heads, open an AI estimate on
\`fix/consolidate-ai-estimator-workflow\`, and capture the draft / revision_draft stages manually.
`,
  "utf8"
);

const chrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (existsSync(chrome)) {
  for (const [htmlName, pngName] of [
    ["02-approved-r1.html", "02-approved-r1.png"],
    ["03-published-r1.html", "03-published-r1.png"],
    ["05-revised-approved-r2.html", "05-revised-approved-r2.png"],
    ["04-revision-draft-r2.html", "04-revision-draft-r2.png"],
    ["01-draft-takeoff.html", "01-draft-takeoff.png"]
  ]) {
    const htmlPath = join(outDir, htmlName);
    const pngPath = join(outDir, pngName);
    spawnSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--screenshot=${pngPath}`,
        "--window-size=1400,1800",
        `file://${htmlPath}`
      ],
      { stdio: "ignore" }
    );
  }
}

console.log(`Wrote review package to ${outDir}`);
