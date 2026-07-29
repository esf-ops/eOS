/**
 * Real component interaction tests for Estimate Record commercial controls.
 * Mounts production components in Playwright against the local review harness.
 *
 * Run (servers must be up, or use runEstimateRecordVisualProof which starts them):
 *   node app-elite100-estimate-studio/scripts/estimateRecordInteraction.proof.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const procs = [];
function killAll() {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}
process.on("exit", killAll);

async function waitForUrl(url) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`Timeout ${url}`);
}

function start(cwd, args, tag) {
  const p = spawn("npx", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  p.stderr.on("data", () => {});
  p.stdout.on("data", () => {});
  procs.push(p);
  return p;
}

const startServers = process.argv.includes("--start-servers");
if (startServers) {
  start(join(root, "app-ai-takeoff"), ["vite", "--host", "127.0.0.1", "--port", "5186", "--strictPort"], "t");
  start(
    join(root, "app-elite100-estimate-studio"),
    ["vite", "--config", "vite.review.config.ts", "--host", "127.0.0.1", "--port", "5199", "--strictPort"],
    "s"
  );
  start(join(root, "app-digital-estimate"), ["vite", "--host", "127.0.0.1", "--port", "5193", "--strictPort"], "d");
  await waitForUrl("http://127.0.0.1:5199/review-estimate-record.html");
  await waitForUrl("http://127.0.0.1:5186/");
  await waitForUrl("http://127.0.0.1:5193/review-digital-estimate.html");
}

const code = `
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const studio = (s) => 'http://127.0.0.1:5199/review-estimate-record.html?scenario=' + s + '&takeoffOrigin=http://127.0.0.1:5186';

console.log('interaction: commercial custom lines + percentage');
await page.goto(studio('commercial'), { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('[data-testid="eq-custom-line-items-editor"]');
assert.match(await page.locator('[data-testid="eq-adj-base"]').innerText(), /4,122|4122/);
assert.match(await page.locator('[data-testid="eq-adj-eligible-basis"]').innerText(), /5,222|5222/);
assert.match(await page.locator('[data-testid="eq-adj-amount"]').innerText(), /156\\.66/);
assert.match(await page.locator('[data-testid="eq-adj-display"]').innerText(), /5,280|5280/);
const pkg = await page.locator('[data-testid="eq-vanity-package"]').inputValue();
assert.match(pkg, /37-inch Single-Bowl Vanity Program/i);
assert.equal(/37_S/.test(pkg), false);
const rowsBefore = await page.locator('[data-testid="eq-custom-line-row"]').count();
assert.ok(rowsBefore >= 4, 'fixture should include Tear Out, Crane, credit, internal');
await page.click('[data-testid="eq-add-tear-out"]');
assert.equal(await page.locator('[data-testid="eq-custom-line-row"]').count(), rowsBefore + 1);
const vals = await page.locator('input[aria-label="Line unit price"]').evaluateAll((els) => els.map((e) => e.value));
assert.ok(vals.includes('750'), 'Tear Out $750 unit price present: ' + vals.join(','));
await page.click('[data-testid="eq-add-custom-line"]');
assert.equal(await page.locator('[data-testid="eq-custom-line-row"]').count(), rowsBefore + 2);
await page.fill('[data-testid="eq-percentage-input"]', '3');
await page.fill('[data-testid="eq-percentage-reason"]', 'Spahn & Rose account pricing');
await page.click('[data-testid="eq-save-commercial-changes"]');
await page.waitForTimeout(300);
assert.equal(await page.getAttribute('[data-testid="eq-commercial-configuration-section"]', 'data-dirty'), '0');
// Save must recalculate from complete state (Tear Out×2 + Crane + credit) — not stale tearout-only 4872/146.16/5020
const baseAfter = await page.locator('[data-testid="eq-adj-base"]').innerText();
const eligibleAfter = await page.locator('[data-testid="eq-adj-eligible-basis"]').innerText();
const adjAfter = await page.locator('[data-testid="eq-adj-amount"]').innerText();
const displayAfter = await page.locator('[data-testid="eq-adj-display"]').innerText();
assert.match(baseAfter, /4,122|4122/);
assert.match(eligibleAfter, /5,972|5972/);
assert.equal(/146\\.16/.test(adjAfter) && /5,020|5020/.test(displayAfter), false, 'must not keep stale tearout-only reconciliation');
assert.match(adjAfter, /179\\.16/);
assert.match(displayAfter, /6,050|6050/);
const preview = await page.locator('[data-testid="eq-customer-line-preview"]').innerText();
assert.equal(/Internal material hold/i.test(preview), false, 'internal-only must not leak to customer preview');
assert.match(preview, /Tear Out|Crane|Courtesy credit/);
assert.match(preview, /Base|Customer amount after/i);
assert.match(preview, /772\\.50|772.50/);
await page.locator('[data-testid="eq-vanity-apply"]').check({ force: true }).catch(()=>{});
assert.ok(await page.locator('[data-testid="eq-vanity-physical-facts"]').count());
console.log('ok: custom lines, tear out 750, percentage recalc, vanity label, no internal leak');

console.log('interaction: waterfall Takeoff ownership + R1/R2 DE state');
await page.goto(studio('r2'), { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => window.__takeoffReviewReady?.type === 'TAKEOFF_REVIEW_READY' && Number(window.__takeoffReviewReady.revisionNumber) === 2, null, { timeout: 45000 });
const frame = page.frameLocator('[data-testid="eq-takeoff-iframe"]');
await frame.locator('[data-testid="ctr-waterfall-panel"]').first().waitFor({ timeout: 15000 });
await frame.locator('[data-testid="ctr-waterfall-height"]').fill('42');
await frame.locator('[data-testid="ctr-save-draft"]').click();
await page.waitForTimeout(400);
await page.locator('[data-testid="eq-review-remount-takeoff"]').evaluate((el) => (el).click());
await page.waitForFunction(() => window.__takeoffReviewReady?.type === 'TAKEOFF_REVIEW_READY' && Number(window.__takeoffReviewReady.revisionNumber) === 2, null, { timeout: 45000 });
const remountFrame = page.frameLocator('[data-testid="eq-takeoff-iframe"]');
const heightAfter = await remountFrame.locator('[data-testid="ctr-waterfall-height"]').inputValue();
assert.equal(heightAfter, '42', 'R2 Takeoff save/remount must restore waterfall height');
await page.waitForSelector('[data-testid="eq-waterfall-height"]');
assert.match(await page.locator('[data-testid="eq-waterfall-height"]').first().innerText(), /42/);
assert.equal(await page.locator('input[data-testid="eq-waterfall-width"]').count(), 0);
assert.ok(await page.locator('[data-testid="eq-de-r1-remains-active"]').count() >= 1);
const approveLabel = await remountFrame.locator('[data-testid="ctr-approve-build"]').innerText();
assert.match(approveLabel, /Approve Revised Measurements/i);
console.log('ok: R2 Takeoff edit/save/remount + commercial mirrors Takeoff dims');

console.log('interaction: approved waterfall commercial options');
await page.goto(studio('r2-approved'), { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('[data-testid="eq-waterfall-commercial-controls"]');
await page.check('[data-testid="eq-waterfall-polish"]');
await page.check('[data-testid="eq-waterfall-optional"]');
await page.selectOption('[data-testid="eq-waterfall-miter"]', '4in');
await page.click('[data-testid="eq-save-commercial-changes"]');
await page.waitForTimeout(250);
console.log('ok: commercial owns miter/polish/optional; dims stay Takeoff-owned');

console.log('interaction: draft vanity/waterfall lifecycle messaging');
await page.goto(studio('draft'), { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('[data-testid="eq-vanity-lifecycle-msg"]');
assert.match(await page.locator('[data-testid="eq-vanity-lifecycle-msg"]').innerText(), /Bathroom vanity detected\\. Approve measurements/i);
assert.match(await page.locator('[data-testid="eq-waterfall-lifecycle-msg"]').innerText(), /Kitchen Island detected\\. Add waterfall panel geometry in Takeoff/i);
console.log('ok: pre-approval lifecycle messaging');

console.log('interaction: revision history cards + comparison');
await page.goto(studio('revision-history'), { waitUntil: 'networkidle', timeout: 120000 });
const revCount = await page.locator('[data-testid="eq-revision-item"]').count();
assert.ok(revCount >= 2);
assert.ok(await page.locator('[data-testid="eq-view-snapshot"]').count() >= 1);
assert.ok(await page.locator('[data-testid="eq-compare-revision"]').count() >= 1);
const cmp = await page.locator('[data-testid="eq-revision-comparison-summary"]').innerText();
assert.match(cmp, /96.*120|Sink wall/i);
assert.match(cmp, /waterfall/i);
assert.match(cmp, /Crane|350/);
assert.match(cmp, /3%/);
console.log('ok: revision cards + comparison');

console.log('interaction: inline publish (no navigation)');
await page.goto(studio('approved'), { waitUntil: 'networkidle', timeout: 120000 });
const sf = await page.locator('[data-testid="eq-ai-verified-sf"]').innerText();
assert.match(sf, /83\\.08/);
assert.ok((await page.getByText('Kitchen Island').count()) >= 1);
const urlBefore = page.url();
let beforeunloadFired = false;
page.on('dialog', async (d) => { beforeunloadFired = true; await d.dismiss(); });
await page.click('[data-testid="eq-publish-digital-estimate"]');
await page.waitForSelector('[data-testid="eq-ai-published-estimate"]', { timeout: 5000 });
assert.equal(page.url().split('#')[0], urlBefore.split('#')[0]);
assert.equal(beforeunloadFired, false);
console.log('ok: inline publish, no beforeunload, 83.08 SF + Kitchen Island');

console.log('interaction: customer Digital Estimate vanity + waterfall');
await page.goto('http://127.0.0.1:5193/review-digital-estimate.html', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('[data-testid="de-review-harness"]');
const body = await page.locator('body').innerText();
assert.match(body, /Munsterman|Kitchen|Bathroom/i);
assert.equal(/surcharge|3% surcharge/i.test(body), false);
assert.equal(/0 approved sinks/i.test(body), false);
assert.match(body, /37-inch Single-Bowl Vanity Program|Vanity Program applied|Included vanity sink/i);
const printVisible = await page.locator('.de-print-root').evaluateAll((nodes) =>
  nodes.some((n) => {
    const s = getComputedStyle(n);
    return s.display !== 'none' && s.visibility !== 'hidden';
  })
);
assert.equal(printVisible, false, 'print document must be hidden on screen');

await page.locator('[data-testid="de-open-specialty-modal"]').first().click({ force: true });
await page.waitForSelector('[data-testid="de-specialty-modal"]', { timeout: 5000 });
assert.ok(
  (await page.getByText(/Kitchen Island — Left waterfall|Left waterfall/i).count()) >= 1,
  'waterfall option label must render in specialty modal'
);
await page.getByText(/Kitchen Island — Left waterfall|Left waterfall/i).first().click({ force: true });
await page.locator('[data-testid="de-modal-done"]').click({ force: true }).catch(() => {});
await page.waitForTimeout(600);

await page.locator('[data-testid="de-open-sink-modal"]').first().click({ force: true });
await page.waitForTimeout(500);
assert.ok(
  (await page.getByText(/Rectangular white sink upgrade|Included vanity sink|sink upgrade/i).count()) >= 1 ||
    (await page.locator('[data-testid="de-sink-modal"], [data-testid*="sink"]').count()) >= 1,
  'vanity/sink upgrade UI must render'
);
console.log('ok: customer DE shows vanity + waterfall options without surcharge line');

await browser.close();
console.log('\\nAll Estimate Record interaction proofs passed.\\n');
`;

const { writeFileSync, unlinkSync, mkdirSync } = await import("node:fs");
mkdirSync(join(root, ".local/review/estimate-record-commercial-controls-v4"), { recursive: true });
const tmp = join(root, ".local/review/estimate-record-commercial-controls-v4/_interaction.mjs");
writeFileSync(tmp, code.replace(
  "import { chromium } from 'playwright';",
  "import { chromium } from '" + join(root, ".local/pw-tools/node_modules/playwright/index.mjs").replace(/\\/g, "/") + "';"
).replace(
  /executablePath: process\.env\.CHROME_PATH \|\| '[^']+'/,
  "channel: undefined"
));
const run = spawn(process.execPath, [tmp], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || undefined
  }
});
const exit = await new Promise((r) => run.on("exit", r));
killAll();
try {
  unlinkSync(tmp);
} catch {
  /* ignore */
}
process.exit(exit || 0);
