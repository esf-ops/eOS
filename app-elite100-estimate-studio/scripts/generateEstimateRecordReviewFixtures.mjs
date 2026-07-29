/**
 * Write fixture Estimate Record HTML screenshots (labeled fixture, not live Takeoff).
 * Run: node app-elite100-estimate-studio/scripts/generateEstimateRecordReviewFixtures.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.local/review/estimate-record-commercial-controls"
);
mkdirSync(outDir, { recursive: true });

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title} — fixture</title>
<style>
  body{font-family:Georgia,serif;margin:24px;background:#f4f7f5;color:#1c2b24}
  .banner{background:#fff3cd;border:1px solid #e6d28a;padding:8px 12px;margin-bottom:16px;font-size:14px}
  .record{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
  .section{background:#fff;border:1px solid #d7e2dc;border-radius:10px;padding:14px}
  .head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  h1{font-size:22px;margin:0} h2{font-size:17px;margin:0}
  .badge{background:#eef5f1;padding:2px 8px;border-radius:999px;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{border-bottom:1px solid #e8eee9;padding:6px;text-align:left}
  .muted{color:#5a6f64;font-size:13px}
  .actions button{margin-right:8px;margin-top:8px;padding:8px 12px}
</style>
</head>
<body>
<div class="banner"><strong>FIXTURE SCREENSHOT</strong> — production-shaped Estimate Record chrome. Not a live authenticated Takeoff capture.</div>
<div class="record">${body}</div>
</body></html>`;
}

const fixtures = {
  "01-draft-estimate-record.html": page(
    "Draft R1",
    `
    <div class="section"><div class="head"><h1>Munsterman Plan</h1><span class="badge">Revision R1</span><span class="badge">Measurements draft</span><span class="badge">Not published</span></div></div>
    <div class="section"><div class="head"><h2>AI Takeoff Review</h2><span class="badge">Editable</span></div><p class="muted">Save Draft · Approve Measurements</p><div style="height:120px;background:#eef2f0;display:flex;align-items:center;justify-content:center" class="muted">[Takeoff iframe — live capture N/A]</div></div>
    <div class="section"><div class="head"><h2>Verified Estimate</h2><span class="badge">Waiting for approved measurements</span></div></div>
    <div class="section"><div class="head"><h2>Commercial Configuration</h2><span class="badge">Editable</span></div><p class="muted">Custom lines · Percentage · Vanity · Waterfalls</p></div>
    <div class="section"><div class="head"><h2>Digital Estimate</h2><span class="badge">Waiting for approved measurements</span></div></div>
    <div class="section"><div class="head"><h2>Revision History</h2></div><p class="muted">R1 — draft</p></div>`
  ),
  "02-approved-estimate-record.html": page(
    "Approved R1",
    `
    <div class="section"><div class="head"><h1>Munsterman Plan</h1><span class="badge">Revision R1</span><span class="badge">Measurements approved</span><span class="badge">Ready to publish</span></div></div>
    <div class="section"><div class="head"><h2>Approved Takeoff — Revision R1</h2><span class="badge">Read-only</span></div><button>Create Measurement Revision</button></div>
    <div class="section"><div class="head"><h2>Verified Estimate</h2></div>
      <p>Countertop 59.08 SF · Backsplash 8.75 SF · Edge 26.25 LF</p>
      <p>Kitchen sink 1 · Vanity/bar 1 · Cooktop 1 · Outlet 0</p>
      <p>Starting display total $4,130</p>
    </div>
    <div class="section"><div class="head"><h2>Commercial Configuration</h2><span class="badge">Editable</span></div></div>
    <div class="section"><div class="head"><h2>Digital Estimate</h2><span class="badge">Ready to publish</span></div><div class="actions"><button>Publish Digital Estimate</button></div></div>
    <div class="section"><div class="head"><h2>Revision History</h2></div><p>R1 — approved</p></div>`
  ),
  "03-commercial-configuration.html": page(
    "Commercial",
    `
    <div class="section"><div class="head"><h2>Commercial Configuration</h2></div>
      <h3>Custom line items</h3>
      <table><tr><th>Description</th><th>Category</th><th>Qty</th><th>Unit</th><th>% eligible</th></tr>
      <tr><td>Tear Out</td><td>Tear-out</td><td>1</td><td>$750.00</td><td>Yes</td></tr></table>
      <h3>Estimate-wide percentage</h3>
      <p>Active 3.00% · Spahn &amp; Rose account pricing · Distributed</p>
      <p class="muted">Base $4,872.00 · Adjustment $146.16 · Adjusted $5,018.16 · Display $5,020</p>
      <h3>Vanity Program</h3><p>Bathroom · Apply program · Additional trips 0</p>
      <h3>Waterfalls</h3><p class="muted">No approved waterfall geometry yet</p>
      <button>Save commercial changes</button>
    </div>`
  ),
  "04-published-estimate-record.html": page(
    "Published R1",
    `
    <div class="section"><div class="head"><h1>Munsterman Plan</h1><span class="badge">Revision R1</span><span class="badge">Measurements approved</span><span class="badge">Digital Estimate published</span><span class="badge">Customer status: Not viewed</span></div></div>
    <div class="section"><div class="head"><h2>Published measurements — Revision R1</h2><span class="badge">Read-only</span></div></div>
    <div class="section"><div class="head"><h2>Verified Estimate</h2></div><p>59.08 SF · 8.75 SF · $5,020</p></div>
    <div class="section"><div class="head"><h2>Commercial Configuration</h2><span class="badge">Read-only for this revision</span></div></div>
    <div class="section"><div class="head"><h2>Digital Estimate</h2><span class="badge">Published</span></div>
      <p>Customer URL: https://example.test/e/munsterman</p>
      <div class="actions"><button>Open Customer Estimate</button><button>Copy Customer Link</button><button>Create Measurement Revision</button></div>
    </div>
    <div class="section"><div class="head"><h2>Revision History</h2></div><p>R1 — Published and active</p></div>`
  ),
  "05-revision-history-r1-r2.html": page(
    "History R1/R2",
    `
    <div class="section"><div class="head"><h2>Revision History</h2></div>
      <ul>
        <li><strong>R1 — Published and active</strong><div class="muted">59.08 SF countertop · 8.75 SF backsplash · 3% account adjustment · $5,020</div></li>
        <li><strong>R2 — draft</strong> Based on R1<div class="muted">Sink wall 96 → 120 · Added left waterfall · Added crane custom line</div></li>
      </ul>
    </div>`
  ),
  "06-r2-waterfall-and-custom-line.html": page(
    "R2 waterfall",
    `
    <div class="section"><div class="head"><h2>AI Takeoff Review — editing revision R2</h2><span class="badge">Editable</span></div>
      <p class="muted">Based on approved revision R1. R1 remains published until R2 is successfully published.</p>
    </div>
    <div class="section"><div class="head"><h2>Commercial Configuration</h2></div>
      <p>Custom: Crane — $350</p>
      <p>Waterfall: Kitchen Island — Left · 36″ · Miter 2-3in · Customer optional · Backside polish</p>
      <p>Percentage remains 3%</p>
    </div>`
  ),
  "07-digital-estimate-vanity-waterfall.html": page(
    "Customer DE",
    `
    <div class="section"><div class="head"><h2>Digital Estimate (customer-facing fixture)</h2></div>
      <h3>Bathroom Vanity Program</h3>
      <p>Package with permitted upgrades only — width/depth/bowl locked</p>
      <h3>Kitchen Island — Left waterfall</h3>
      <p>Optional include/exclude · geometry locked · 3% policy applies to eligible lines</p>
      <p class="muted">No vague global Waterfall checkbox. No separate percentage surcharge line.</p>
    </div>`
  )
};

for (const [name, html] of Object.entries(fixtures)) {
  writeFileSync(join(outDir, name), html);
}

// Also write README noting fixture vs live
writeFileSync(
  join(outDir, "README.md"),
  `# Estimate Record review fixtures

All HTML files in this folder are **FIXTURE** screenshots of Estimate Record chrome
using production-shaped totals (59.08 / 8.75 / $4,130–$5,020).

They are **not** live authenticated Takeoff worksheet captures.

PNG conversion (optional, local only):

\`\`\`bash
# If playwright/chromium available:
npx --yes playwright screenshot .local/review/estimate-record-commercial-controls/01-draft-estimate-record.html .local/review/estimate-record-commercial-controls/01-draft-estimate-record.png
\`\`\`

Do not commit this directory (.local/review is gitignored).
`
);

console.log(`Wrote fixtures to ${outDir}`);
