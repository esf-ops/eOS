/**
 * HTML → PDF for quote delivery attachments (Chromium via puppeteer-core).
 */

import { auditCustomerSafeText } from "./estimateContentSanitizer.js";
import { buildCustomerEstimatePrintHtml } from "./customerEstimatePrintHtml.js";
import {
  buildCustomerEstimatePdfFilename,
  loadPrintSnapshotFromQuoteRow
} from "./customerEstimatePrintSnapshot.js";
import { resolveChromiumLaunchConfig } from "./chromiumLaunchConfig.js";

/**
 * @param {string} html
 * @returns {Promise<{ ok: true, buffer: Buffer } | { ok: false, reason: string, error: string }>}
 */
export async function renderHtmlToPdfBytes(html) {
  const launchConfig = await resolveChromiumLaunchConfig();
  if (!launchConfig.ok) {
    return {
      ok: false,
      reason: launchConfig.reason,
      error: launchConfig.error
    };
  }

  let browser;
  try {
    const puppeteerMod = await import("puppeteer-core");
    const puppeteer = puppeteerMod.default ?? puppeteerMod;
    browser = await puppeteer.launch({
      executablePath: launchConfig.executablePath,
      headless: launchConfig.headless,
      args: launchConfig.args,
      defaultViewport: launchConfig.defaultViewport,
      timeout: 30000
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    const pdfUint8 = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    return { ok: true, buffer: Buffer.from(pdfUint8) };
  } catch (e) {
    const error = String(e?.message || e);
    console.warn("[quote-delivery-pdf] chromium launch or render failed", {
      reason: "launch_failed",
      mode: launchConfig.mode,
      error
    });
    return { ok: false, reason: "launch_failed", error };
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
    const reason =
      pdfResult.reason === "chromium_executable_unavailable" || pdfResult.reason === "launch_failed"
        ? pdfResult.reason
        : "pdf_render_failed";
    console.warn("[quote-delivery-pdf] attachment skipped", {
      reason,
      error: pdfResult.error
    });
    return {
      ok: false,
      skipped: true,
      reason,
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
