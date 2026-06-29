/**
 * Premium customer-safe quote delivery email bodies (summary cover message).
 * Outlook-safe: 600px card, table layout, inline styles.
 * The attached PDF remains the official detailed estimate.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CUSTOMER_ESTIMATE_BRANCH_LOCATIONS,
  CUSTOMER_ESTIMATE_PAYMENT_CARD_FEE_NOTE,
  CUSTOMER_ESTIMATE_WEBSITE,
  CUSTOMER_ESTIMATE_WEBSITE_URL
} from "./customerEstimateBrandingConstants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOGO_FALLBACK_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

function resolveLogoSrc() {
  try {
    const logoPath = join(
      __dirname,
      "../../../app-quote/src/lib/customerEstimate/assets/esf-horizontal-logo.png"
    );
    const bytes = readFileSync(logoPath);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return LOGO_FALLBACK_URL;
  }
}

const LOGO_SRC = resolveLogoSrc();

const BRAND_RED = "#b91c1c";
const BRAND_RED_SOFT = "#fef2f2";
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#475569";
const BORDER = "#e2e8f0";
const BG_PAGE = "#eef2f6";
const BG_LIGHT = "#f8fafc";
const BG_CARD = "#ffffff";

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isEmailLike(s) {
  const t = String(s ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function formatAddress(header) {
  const parts = [header.projectAddress, header.city, header.state].filter(Boolean);
  return parts.join(", ");
}

function formatQuoteRef(header) {
  const quoteNumber = String(header.quoteNumber ?? "").trim();
  const revisionLabel = String(header.revisionLabel ?? "").trim();
  if (!quoteNumber) return "—";
  if (!revisionLabel) return quoteNumber;
  if (quoteNumber.endsWith(`-${revisionLabel}`) || quoteNumber.endsWith(revisionLabel)) {
    return quoteNumber;
  }
  return `${quoteNumber} (${revisionLabel})`;
}

function projectOrAccountLabel(header) {
  return header.projectName || header.accountName || header.customerName || "your project";
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>["header"]} header
 */
function formatPreparedByLabel(header) {
  const prepared = String(header.preparedByDisplayName ?? header.preparedBy ?? "").trim();
  if (!prepared) return null;
  if (isEmailLike(prepared) && header.salesRep) return header.salesRep;
  return prepared;
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 */
export function pickReplyToEmail(display) {
  const prepared = String(display.header.preparedBy ?? "").trim();
  if (isEmailLike(prepared)) return prepared;
  return null;
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 * @param {{ subject?: string, pdfAttached?: boolean, pdfFilename?: string|null }} [opts]
 */
export function buildEstimateEmailContent(display, opts = {}) {
  const h = display.header;
  const quoteNumber = String(h.quoteNumber ?? "").trim();
  if (!quoteNumber) {
    throw new Error("Customer estimate email requires a saved quote number");
  }

  const subject =
    opts.subject?.trim() ||
    defaultSubject(quoteNumber, h.projectName, h.customerName, h.accountName);

  const pdfAttached = Boolean(opts.pdfAttached);
  const htmlPreview = buildHtmlEmail(display, { pdfAttached, pdfFilename: opts.pdfFilename });
  const textPreview = buildTextEmail(display, { pdfAttached, pdfFilename: opts.pdfFilename });
  const replyTo = pickReplyToEmail(display);

  return { subject, htmlPreview, textPreview, replyTo };
}

function defaultSubject(quoteNumber, projectName, customerName, accountName) {
  const label = projectName || accountName || customerName;
  if (label) return `Elite Stone Fabrication Estimate — ${label} — ${quoteNumber}`;
  return `Elite Stone Fabrication Estimate — ${quoteNumber}`;
}

function buildDetailRow(label, value) {
  if (!value) return "";
  return `<tr>
    <td style="padding:10px 14px;font-size:13px;line-height:1.45;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};width:38%;vertical-align:top;">${escHtml(label)}</td>
    <td style="padding:10px 14px;font-size:14px;line-height:1.45;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};vertical-align:top;font-weight:600;">${escHtml(value)}</td>
  </tr>`;
}

function buildBranchFooterHtml() {
  const cells = CUSTOMER_ESTIMATE_BRANCH_LOCATIONS.map((branch) => {
    const lineHtml = branch.lines
      .map(
        (line) =>
          `<span style="display:block;font-size:12px;line-height:1.5;color:${TEXT_MUTED};">${escHtml(line)}</span>`
      )
      .join("");
    return `<td style="padding:10px 8px;vertical-align:top;width:33%;">
      <strong style="display:block;font-size:12px;line-height:1.4;color:${TEXT_DARK};margin-bottom:4px;">${escHtml(branch.city)}</strong>
      ${lineHtml}
    </td>`;
  }).join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
    <tr>${cells}</tr>
  </table>`;
}

function buildBranchFooterText() {
  return CUSTOMER_ESTIMATE_BRANCH_LOCATIONS.map((branch) =>
    [branch.city, ...branch.lines].join("\n  ")
  ).join("\n\n");
}

function attachmentCalloutHtml(pdfAttached) {
  const text = pdfAttached
    ? "See attached PDF for the detailed estimate, room/area breakdown, terms, and signature lines."
    : "A detailed estimate is available from Elite Stone Fabrication.";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:20px;">
    <tr>
      <td style="padding:14px 16px;background-color:${BRAND_RED_SOFT};border:1px solid #fecaca;border-left:4px solid ${BRAND_RED};font-size:13px;line-height:1.55;color:${TEXT_DARK};">
        <strong style="color:${BRAND_RED};">Detailed estimate</strong><br />
        ${escHtml(text)}
      </td>
    </tr>
  </table>`;
}

function attachmentCalloutText(pdfAttached) {
  return pdfAttached
    ? "See attached PDF for the detailed estimate, room/area breakdown, terms, and signature lines."
    : "A detailed estimate is available from Elite Stone Fabrication.";
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 * @param {{ pdfAttached?: boolean, pdfFilename?: string|null }} opts
 */
function buildHtmlEmail(display, opts = {}) {
  const h = display.header;
  const quoteNumber = String(h.quoteNumber ?? "").trim();
  if (!quoteNumber) {
    throw new Error("Customer estimate email requires a saved quote number");
  }

  const quoteRef = formatQuoteRef(h);
  const preparedByLabel = formatPreparedByLabel(h);
  const totalFormatted = display.estimateTotalFormatted || "—";
  const projectLabel = projectOrAccountLabel(h);
  const pdfAttached = Boolean(opts.pdfAttached);

  const heroContext = [
    h.projectName ? { label: "Project", value: h.projectName } : null,
    h.accountName ? { label: "Account", value: h.accountName } : null,
    h.customerName ? { label: "Customer", value: h.customerName } : null,
    { label: "Quote / estimate ref.", value: quoteRef },
    h.estimateDate ? { label: "Estimate date", value: h.estimateDate } : null
  ].filter(Boolean);

  const heroContextHtml = heroContext
    .map(
      (item) =>
        `<tr>
          <td style="padding:3px 0;font-size:12px;line-height:1.4;color:${TEXT_MUTED};width:42%;">${escHtml(item.label)}</td>
          <td style="padding:3px 0;font-size:12px;line-height:1.4;color:${TEXT_DARK};font-weight:600;">${escHtml(item.value)}</td>
        </tr>`
    )
    .join("");

  const breakdownRows = display.emailBreakdownRows || [];
  const breakdownHtml =
    breakdownRows.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:20px;">
          <tr>
            <td style="padding:0 0 8px 0;">
              <span style="font-size:14px;font-weight:700;color:${TEXT_DARK};">Estimate breakdown</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid ${BORDER};">
                ${breakdownRows
                  .map(
                    (row) =>
                      `<tr>
                        <td style="padding:10px 14px;font-size:14px;line-height:1.4;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};">${escHtml(row.label)}</td>
                        <td style="padding:10px 14px;font-size:14px;line-height:1.4;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};text-align:right;font-weight:600;">${escHtml(row.displayFormatted)}</td>
                      </tr>`
                  )
                  .join("")}
              </table>
            </td>
          </tr>
        </table>`
      : "";

  const comparisonBlock = display.comparisonNote
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${TEXT_MUTED};">${escHtml(display.comparisonNote)}</p>`
    : "";

  const notesBlock =
    display.customerFacingNotes.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:20px;">
          <tr>
            <td style="padding:0 0 8px 0;">
              <span style="font-size:14px;font-weight:700;color:${TEXT_DARK};">Project notes</span>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 14px;background-color:${BG_LIGHT};border:1px solid ${BORDER};font-size:13px;line-height:1.5;color:${TEXT_DARK};">
              <ul style="margin:0;padding-left:18px;">
                ${display.customerFacingNotes.map((n) => `<li style="margin-bottom:4px;">${escHtml(n)}</li>`).join("")}
              </ul>
            </td>
          </tr>
        </table>`
      : "";

  const introMessage = pdfAttached
    ? `Attached is the detailed estimate for ${escHtml(projectLabel)}. Please review the attached PDF for the full room/area breakdown, included scope, terms, and signature lines.`
    : `Here is a summary of the estimate for ${escHtml(projectLabel)}. A detailed estimate with the full room/area breakdown, included scope, terms, and signature lines is available from Elite Stone Fabrication.`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Elite Stone Fabrication Estimate</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};font-family:Arial,Helvetica,sans-serif;color:${TEXT_DARK};line-height:1.5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${BG_PAGE};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background-color:${BG_CARD};border:1px solid ${BORDER};">
          <tr>
            <td style="padding:0;border-bottom:3px solid ${BRAND_RED};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:24px 28px 20px 28px;">
                    <img src="${LOGO_SRC}" alt="Elite Stone Fabrication" width="132" style="display:block;border:0;outline:none;text-decoration:none;width:132px;height:auto;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${BG_LIGHT};border:1px solid ${BORDER};margin-top:24px;">
                <tr>
                  <td style="padding:22px 22px 18px 22px;text-align:center;">
                    <span style="display:block;font-size:11px;font-weight:700;line-height:1.4;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.08em;">Estimated project total</span>
                    <span style="display:block;margin-top:8px;font-size:40px;font-weight:700;line-height:1.15;color:${BRAND_RED};">${escHtml(totalFormatted)}</span>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
                      ${heroContextHtml}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 0 28px;font-size:14px;line-height:1.6;color:${TEXT_DARK};">
              ${introMessage}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 0 28px;">
              <span style="font-size:14px;font-weight:700;color:${TEXT_DARK};">Quote summary</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid ${BORDER};">
                ${buildDetailRow("Quote / estimate ref.", quoteRef)}
                ${buildDetailRow("Project name", h.projectName)}
                ${buildDetailRow("Account", h.accountName)}
                ${buildDetailRow("Customer", h.customerName)}
                ${buildDetailRow("Branch", h.branch)}
                ${buildDetailRow("Prepared by", preparedByLabel)}
                ${buildDetailRow("Estimate date", h.estimateDate)}
                ${buildDetailRow("Salesperson", h.salesRep)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px;">
              ${breakdownHtml}
              ${comparisonBlock}
              ${notesBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px;">
              ${attachmentCalloutHtml(pdfAttached)}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${BG_LIGHT};border:1px solid ${BORDER};">
                <tr>
                  <td style="padding:14px 16px;font-size:12px;line-height:1.55;color:${TEXT_MUTED};">
                    <strong style="display:block;margin-bottom:4px;font-size:12px;color:${TEXT_DARK};">Payment note</strong>
                    ${escHtml(CUSTOMER_ESTIMATE_PAYMENT_CARD_FEE_NOTE)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px 28px;border-top:1px solid ${BORDER};">
              <span style="display:block;font-size:14px;font-weight:700;color:${TEXT_DARK};">Elite Stone Fabrication</span>
              <span style="display:block;margin-top:6px;font-size:13px;line-height:1.5;color:${TEXT_MUTED};">
                Questions about this estimate? Reply to this email or contact your Elite Stone representative.
              </span>
              ${buildBranchFooterHtml()}
              <span style="display:block;margin-top:16px;font-size:13px;font-weight:600;color:${BRAND_RED};">
                <a href="${CUSTOMER_ESTIMATE_WEBSITE_URL}" style="color:${BRAND_RED};text-decoration:none;">${escHtml(CUSTOMER_ESTIMATE_WEBSITE)}</a>
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 * @param {{ pdfAttached?: boolean, pdfFilename?: string|null }} opts
 */
function buildTextEmail(display, opts = {}) {
  const h = display.header;
  const quoteNumber = String(h.quoteNumber ?? "").trim();
  if (!quoteNumber) {
    throw new Error("Customer estimate email requires a saved quote number");
  }

  const preparedByLabel = formatPreparedByLabel(h);
  const quoteRef = formatQuoteRef(h);
  const projectLabel = projectOrAccountLabel(h);
  const pdfAttached = Boolean(opts.pdfAttached);

  const lines = [
    "ELITE STONE FABRICATION",
    "Estimate summary",
    "=======================",
    "",
    `Estimated project total: ${display.estimateTotalFormatted || "—"}`,
    "",
    h.projectName ? `Project: ${h.projectName}` : null,
    h.accountName ? `Account: ${h.accountName}` : null,
    h.customerName ? `Customer: ${h.customerName}` : null,
    `Quote / estimate ref.: ${quoteRef}`,
    h.estimateDate ? `Estimate date: ${h.estimateDate}` : null,
    "",
    pdfAttached
      ? `Attached is the detailed estimate for ${projectLabel}. Please review the attached PDF for the full room/area breakdown, included scope, terms, and signature lines.`
      : `Here is a summary of the estimate for ${projectLabel}. A detailed estimate with the full room/area breakdown, included scope, terms, and signature lines is available from Elite Stone Fabrication.`,
    "",
    "Quote summary",
    "-------------",
    `Quote / estimate ref.: ${quoteRef}`,
    h.projectName ? `Project name: ${h.projectName}` : null,
    h.accountName ? `Account: ${h.accountName}` : null,
    h.customerName ? `Customer: ${h.customerName}` : null,
    h.branch ? `Branch: ${h.branch}` : null,
    preparedByLabel ? `Prepared by: ${preparedByLabel}` : null,
    h.estimateDate ? `Estimate date: ${h.estimateDate}` : null,
    h.salesRep ? `Salesperson: ${h.salesRep}` : null,
    "",
    "Estimate breakdown",
    "------------------"
  ].filter((line) => line != null);

  const breakdownRows = display.emailBreakdownRows || [];
  if (breakdownRows.length) {
    for (const row of breakdownRows) {
      lines.push(`${row.label}: ${row.displayFormatted}`);
    }
  } else {
    lines.push("(See attached detailed estimate for line items.)");
  }

  if (display.comparisonNote) {
    lines.push("", display.comparisonNote);
  }

  if (display.customerFacingNotes.length) {
    lines.push("", "Project notes", "-------------");
    for (const note of display.customerFacingNotes) lines.push(`- ${note}`);
  }

  lines.push(
    "",
    "Detailed estimate",
    "-----------------",
    attachmentCalloutText(pdfAttached),
    "",
    "Payment note",
    "------------",
    CUSTOMER_ESTIMATE_PAYMENT_CARD_FEE_NOTE,
    "",
    "ELITE STONE FABRICATION",
    "Questions? Reply to this email or contact your Elite Stone representative.",
    "",
    buildBranchFooterText(),
    "",
    CUSTOMER_ESTIMATE_WEBSITE
  );

  return lines.join("\n");
}

export { defaultSubject };
