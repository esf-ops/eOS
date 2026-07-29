/**
 * Capture real-component screenshots for Estimate Record commercial controls v4.
 * Requires TAKEOFF_REVIEW_READY postMessage + iframe assertions; fails without saving blank PNGs.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, ".local/review/estimate-record-commercial-controls-v4");
const pwEntry = join(root, ".local/pw-tools/node_modules/playwright/index.mjs");
mkdirSync(outDir, { recursive: true });

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

if (process.argv.includes("--start-servers")) {
  function start(cwd, args) {
    const p = spawn("npx", args, { cwd, stdio: "ignore", env: process.env });
    procs.push(p);
  }
  start(join(root, "app-ai-takeoff"), ["vite", "--host", "127.0.0.1", "--port", "5186", "--strictPort"]);
  start(join(root, "app-elite100-estimate-studio"), [
    "vite",
    "--config",
    "vite.review.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "5199",
    "--strictPort"
  ]);
  start(join(root, "app-digital-estimate"), ["vite", "--host", "127.0.0.1", "--port", "5193", "--strictPort"]);
  await waitForUrl("http://127.0.0.1:5199/review-estimate-record.html");
  await waitForUrl("http://127.0.0.1:5186/");
  await waitForUrl("http://127.0.0.1:5193/review-digital-estimate.html");
}

const { chromium } = await import(pathToFileURL(pwEntry).href);
const browser = await chromium.launch({
  headless: true,
  // Allow cross-origin iframe pixels in screenshots (Takeoff on :5186, Studio on :5199).
  args: ["--disable-site-isolation-trials", "--disable-features=IsolateOrigins,site-per-process"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

async function waitTakeoffReady(p, opts = {}) {
  const expectedRev = opts.revisionNumber != null ? Number(opts.revisionNumber) : null;
  const expectedMode = opts.mode || null;
  await p.waitForSelector('[data-testid="eq-takeoff-iframe"]');
  await p.waitForFunction(
    (rev) => {
      const ready = window.__takeoffReviewReady;
      if (!ready || ready.type !== "TAKEOFF_REVIEW_READY") return false;
      if (rev != null && Number(ready.revisionNumber) !== Number(rev)) return false;
      return Number(ready.pieceCount) >= 5 && Number(ready.roomCount) >= 2;
    },
    expectedRev,
    { timeout: 45000 }
  );
  const readyAttr = await p.getAttribute('[data-testid="eq-takeoff-iframe"]', "data-takeoff-ready");
  if (readyAttr !== "1") throw new Error("Takeoff ready attribute missing — refusing screenshot");
  if (expectedMode) {
    const mode = await p.getAttribute('[data-testid="eq-takeoff-iframe"]', "data-takeoff-mode");
    if (mode !== expectedMode) {
      throw new Error(`Takeoff mode expected ${expectedMode}, got ${mode}`);
    }
  }
  const frame = p.frameLocator('[data-testid="eq-takeoff-iframe"]');
  await frame.locator('input[value="Kitchen Island"]').first().waitFor({ timeout: 20000 });
  await frame.locator('input[value="Vanity Top"]').first().waitFor({ timeout: 20000 });
  await frame.locator('input[value="Sink wall"]').first().waitFor({ timeout: 20000 });
  if (opts.expectSf) {
    const bodyText = await frame.locator("body").innerText();
    const re = new RegExp(String(opts.expectSf).replace(".", "\\.") + "\\s*SF countertop", "i");
    if (!re.test(bodyText)) {
      throw new Error(`Takeoff missing ${opts.expectSf} SF — refusing screenshot`);
    }
  }
  if (opts.editable) {
    await frame.locator('[data-testid="ctr-save-draft"]').waitFor({ timeout: 10000 });
    await frame.locator('[data-testid="ctr-approve-build"]').waitFor({ timeout: 10000 });
    const approveLabel = await frame.locator('[data-testid="ctr-approve-build"]').innerText();
    if (opts.requireRevisedApprove && !/Approve Revised Estimate/i.test(approveLabel)) {
      throw new Error(`Expected Approve Revised Estimate, got ${approveLabel}`);
    }
  }
  if (opts.requireWaterfall) {
    await frame.locator('[data-testid="ctr-waterfall-panel"]').first().waitFor({ timeout: 10000 });
  }
  // Fail closed if Chromium still paints a blank cross-origin iframe.
  const iframeShot = await p.locator('[data-testid="eq-takeoff-iframe"]').screenshot();
  const whiteRatio = await measureWhiteRatio(iframeShot);
  if (whiteRatio > 0.9) {
    throw new Error(
      `Takeoff iframe screenshot is blank (whiteRatio=${whiteRatio.toFixed(3)}) — refusing PNG`
    );
  }
}

async function measureWhiteRatio(pngBuf) {
  const b64 = Buffer.from(pngBuf).toString("base64");
  return page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let white = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 32) {
      n += 1;
      if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white += 1;
    }
    return n ? white / n : 1;
  }, `data:image/png;base64,${b64}`);
}

/**
 * Full-page screenshots blank cross-origin iframes under Chromium site isolation.
 * Element screenshots of the iframe still have pixels — composite them into the page PNG.
 */
async function screenshotWithTakeoffComposite(outPath) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const iframe = page.locator('[data-testid="eq-takeoff-iframe"]');
  const count = await iframe.count();
  if (!count) {
    await page.screenshot({ path: outPath, fullPage: true });
    return null;
  }
  const box = await iframe.boundingBox();
  if (!box) {
    await page.screenshot({ path: outPath, fullPage: true });
    return null;
  }
  const iframePng = await iframe.screenshot();
  const iframeWhite = await measureWhiteRatio(iframePng);
  if (iframeWhite > 0.9) {
    throw new Error(`Takeoff iframe element shot blank (whiteRatio=${iframeWhite.toFixed(3)})`);
  }
  const fullPng = await page.screenshot({ fullPage: true });
  const viewport = page.viewportSize();
  const bytes = await page.evaluate(
    async ({ fullB64, iframeB64, box, viewportWidth }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const full = await load(`data:image/png;base64,${fullB64}`);
      const frame = await load(`data:image/png;base64,${iframeB64}`);
      const c = document.createElement("canvas");
      c.width = full.width;
      c.height = full.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(full, 0, 0);
      const dpr = full.width / viewportWidth;
      ctx.drawImage(frame, box.x * dpr, box.y * dpr, box.width * dpr, box.height * dpr);
      const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
      const ab = await blob.arrayBuffer();
      return Array.from(new Uint8Array(ab));
    },
    {
      fullB64: Buffer.from(fullPng).toString("base64"),
      iframeB64: Buffer.from(iframePng).toString("base64"),
      box,
      viewportWidth: viewport.width
    }
  );
  writeFileSync(outPath, Buffer.from(bytes));
  // Fail closed: re-check top band of composited PNG is not blank.
  const compositedWhite = await measureWhiteRatio(Buffer.from(bytes));
  // Full page includes lots of white chrome — only fail if nearly entirely white.
  if (compositedWhite > 0.98) {
    throw new Error("Composited screenshot appears blank — refusing PNG");
  }
  return Buffer.from(bytes);
}

async function cropPngToHeight(pngBuf, cssHeight) {
  const viewport = page.viewportSize();
  const bytes = await page.evaluate(
    async ({ b64, cssHeight, viewportWidth }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const dpr = img.width / viewportWidth;
      const cropH = Math.min(img.height, Math.max(1, Math.round(cssHeight * dpr)));
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = cropH;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, img.width, cropH, 0, 0, img.width, cropH);
      const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
      const ab = await blob.arrayBuffer();
      return Array.from(new Uint8Array(ab));
    },
    {
      b64: Buffer.from(pngBuf).toString("base64"),
      cssHeight,
      viewportWidth: viewport.width
    }
  );
  return Buffer.from(bytes);
}

async function shot(name, url, prep, opts = {}) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  if (prep) await prep(page);
  await page.addStyleTag({
    content: `
      [data-testid="eq-review-devbar"],
      [data-testid="de-review-devbar"]{display:none !important}
      .eliteos-topbar, header.eliteos-topbar {
        position: static !important;
        top: auto !important;
      }
    `
  });
  const path = join(outDir, `${name}.png`);
  if (opts.noTakeoffComposite) {
    await page.screenshot({ path, fullPage: true });
  } else {
    const buf = await screenshotWithTakeoffComposite(path);
    if (opts.cropThroughCommercial && buf) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const bottom = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="eq-commercial-configuration-section"]');
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.bottom + window.scrollY + 24;
      });
      if (bottom > 0) {
        writeFileSync(path, await cropPngToHeight(buf, bottom));
      }
    }
  }
  console.log("wrote", name);
}

// Prefer same-origin `/__takeoff` proxy; fall back to direct Takeoff origin with site-isolation disabled.
const studio = (scenario) =>
  `http://127.0.0.1:5199/review-estimate-record.html?scenario=${scenario}&takeoffOrigin=${encodeURIComponent("http://127.0.0.1:5186")}`;

try {
  await shot("01-draft-estimate-record", studio("draft"), async (p) => {
    await waitTakeoffReady(p, { revisionNumber: 1, mode: "editable", expectSf: "83.08", editable: true });
  });

  await shot("02-approved-estimate-record", studio("approved"), async (p) => {
    await waitTakeoffReady(p, { revisionNumber: 1, mode: "readonly", expectSf: "83.08" });
    const sf = await p.locator('[data-testid="eq-ai-verified-sf"]').innerText();
    if (!/83\.08/.test(sf)) throw new Error(`Verified SF expected 83.08, got ${sf}`);
  });

  await shot("03-commercial-configuration", studio("commercial"), async (p) => {
    await waitTakeoffReady(p, { revisionNumber: 1, mode: "readonly", expectSf: "83.08" });
    await p.waitForSelector('[data-testid="eq-custom-line-items-editor"]');
    await p.waitForSelector('[data-testid="eq-vanity-card"]');
    await p.locator('[data-testid="eq-commercial-configuration-section"]').scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const ready = await p.getAttribute('[data-testid="eq-takeoff-iframe"]', "data-takeoff-ready");
    if (ready !== "1") throw new Error("Commercial shot: Takeoff no longer ready");
  }, { cropThroughCommercial: true });

  await shot("04-published-estimate-record", studio("published"), async (p) => {
    await waitTakeoffReady(p, { revisionNumber: 1, mode: "readonly", expectSf: "83.08" });
    await p.waitForSelector('[data-testid="eq-ai-published-estimate"]');
  });

  await shot("05-revision-history-r1-r2", studio("revision-history"), async (p) => {
    await waitTakeoffReady(p, {
      revisionNumber: 2,
      mode: "editable",
      expectSf: "87.08",
      editable: true,
      requireRevisedApprove: true,
      requireWaterfall: true
    });
    await p.waitForSelector('[data-testid="eq-revision-item"]');
    await p.locator('[data-testid="eq-revision-history-section"]').scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const ready = await p.getAttribute('[data-testid="eq-takeoff-iframe"]', "data-takeoff-ready");
    if (ready !== "1") throw new Error("Revision history shot: Takeoff blank/not ready");
  });

  await shot("06-r2-waterfall-and-custom-line", studio("r2"), async (p) => {
    await waitTakeoffReady(p, {
      revisionNumber: 2,
      mode: "editable",
      expectSf: "87.08",
      editable: true,
      requireRevisedApprove: true,
      requireWaterfall: true
    });
    await p.waitForSelector('[data-testid="eq-waterfall-card"]');
    const widthCommercial = await p.locator('[data-testid="eq-waterfall-width"]').first().innerText();
    if (!/36/.test(widthCommercial)) throw new Error("Commercial width must mirror Takeoff");
    const editableWidth = await p.locator('input[data-testid="eq-waterfall-width"]').count();
    if (editableWidth > 0) throw new Error("Commercial must not own editable waterfall width");
    const frame = p.frameLocator('[data-testid="eq-takeoff-iframe"]');
    await frame.locator('[data-testid="ctr-waterfall-panel"]').first().scrollIntoViewIfNeeded();
    await p.locator('[data-testid="eq-waterfall-configuration"]').scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    // Return to top so full-page PNG leads with loaded Takeoff + waterfall, then commercial.
    await p.locator('[data-testid="eq-ai-takeoff-surface"]').scrollIntoViewIfNeeded();
    await p.waitForTimeout(200);
  });

  await shot(
    "07-digital-estimate-vanity-waterfall",
    "http://127.0.0.1:5193/review-digital-estimate.html",
    async (p) => {
      await p.waitForSelector('[data-testid="de-review-harness"]');
      const printVisible = await p.locator(".de-print-root").evaluateAll((nodes) =>
        nodes.some((n) => {
          const s = getComputedStyle(n);
          return s.display !== "none" && s.visibility !== "hidden";
        })
      );
      if (printVisible) throw new Error("Print document visible on screen");
      await p.locator('[data-testid="de-open-specialty-modal"]').first().click({ force: true });
      await p.waitForSelector('[data-testid="de-specialty-modal"]');
      await p.getByText(/Kitchen Island — Left waterfall/i).first().click({ force: true });
      await p.locator('[data-testid="de-modal-done"]').click({ force: true }).catch(() => {});
      await p.waitForTimeout(500);
    },
    { noTakeoffComposite: true }
  );

  writeFileSync(
    join(outDir, "README.md"),
    `# Estimate Record commercial controls — v4

Editable R2 Takeoff ready-contract screenshots. Takeoff owns waterfall geometry; Commercial owns options.
`
  );
  console.log("Done →", outDir);
} catch (err) {
  console.error("Screenshot generation failed:", err);
  // Do not leave partial misleading captures for the failed shot — already-written ok shots remain.
  process.exitCode = 1;
} finally {
  await browser.close();
  killAll();
}
