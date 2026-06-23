/**
 * HTML → PDF for quote delivery attachments (Chromium via puppeteer-core).
 */

import { auditCustomerSafeText } from "./estimateContentSanitizer.js";
import { buildCustomerEstimatePrintHtml } from "./customerEstimatePrintHtml.js";
import {
  buildCustomerEstimatePdfFilename,
  loadPrintSnapshotFromQuoteRow
} from "./customerEstimatePrintSnapshot.js";

/**
 * @returns {Promise<string|null>}
 */
async function resolveChromiumExecutablePath() {
  const fromEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  if (fromEnv) return fromEnv;

  const fs = await import("node:fs");
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (process.platform === "darwin" && fs.existsSync(macChrome)) return macChrome;

  try {
    const chromium = await import("@sparticuz/chromium");
    const path = await chromium.default.executablePath();
    if (path && fs.existsSync(path)) return path;
  } catch {
    /* optional dependency or unsupported platform */
  }

  return null;
}

/**
 * @param {string} html
 * @returns {Promise<{ ok: true, buffer: Buffer } | { ok: false, error: string }>}
 */
export async function renderHtmlToPdfBytes(html) {
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = await resolveChromiumExecutablePath();
  if (!executablePath) {
    return {
      ok: false,
      error: "PDF renderer unavailable — set PUPPETEER_EXECUTABLE_PATH or install Chromium dependencies"
    };
  }

  let browser;
  try {
    const puppeteer = await import("puppeteer-core");
    let launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
    const useSparticuzArgs = executablePath !== macChrome;
    if (useSparticuzArgs) {
      try {
        const chromium = await import("@sparticuz/chromium");
        if (Array.isArray(chromium.default.args)) {
          launchArgs = chromium.default.args;
        }
      } catch {
        /* use default args */
      }
    }

    browser = await puppeteer.default.launch({
      executablePath,
      headless: true,
      args: launchArgs,
      timeout: 20000
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 20000 });
    const pdfUint8 = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.45in", right: "0.45in", bottom: "0.45in", left: "0.45in" }
    });
    return { ok: true, buffer: Buffer.from(pdfUint8) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {{
 *   row: Record<string, unknown>,
 *   pdfEnabled: boolean,
 *   revisionLabel?: string|null
 * }} params
 */
export async function buildCustomerEstimatePdfAttachment(params) {
  if (!params.pdfEnabled) {
    return {
      ok: false,
      skipped: true,
      reason: "pdf_disabled",
      filename: null,
      byteLength: 0
    };
  }

  const loaded = loadPrintSnapshotFromQuoteRow(params.row);
  if (!loaded?.snapshot) {
    return {
      ok: false,
      skipped: true,
      reason: "no_print_snapshot",
      filename: null,
      byteLength: 0
    };
  }

  if (!loaded.reconciled) {
    return {
      ok: false,
      skipped: true,
      reason: "print_snapshot_reconciliation_mismatch",
      filename: null,
      byteLength: 0
    };
  }

  const printSnapshot = loaded.snapshot;
  const quoteNumber = String(printSnapshot.header?.quoteNumber ?? params.row.quote_number ?? "").trim();
  const revisionLabel =
    params.revisionLabel != null
      ? String(params.revisionLabel).trim()
      : String(params.row.revision_label ?? "").trim();
  const filename = buildCustomerEstimatePdfFilename(quoteNumber, revisionLabel || null);

  const html = buildCustomerEstimatePrintHtml(printSnapshot);
  const htmlAudit = auditCustomerSafeText(html);
  if (!htmlAudit.ok) {
    return {
      ok: false,
      skipped: true,
      reason: "customer_safe_violation",
      filename,
      byteLength: 0
    };
  }

  const pdfResult = await renderHtmlToPdfBytes(html);
  if (!pdfResult.ok) {
    return {
      ok: false,
      skipped: true,
      reason: "pdf_render_failed",
      error: pdfResult.error,
      filename,
      byteLength: 0
    };
  }

  return {
    ok: true,
    skipped: false,
    reason: "generated",
    filename,
    byteLength: pdfResult.buffer.length,
    buffer: pdfResult.buffer,
    html
  };
}
