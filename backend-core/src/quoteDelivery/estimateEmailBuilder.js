/**
 * Customer-safe HTML/text email bodies from snapshot-derived display model.
 * Outlook-safe: table layout, inline styles, no external fonts or complex CSS.
 */

const LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const BRAND_RED = "#b91c1c";
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#475569";
const BORDER = "#e2e8f0";
const BG_LIGHT = "#f8fafc";

const BRANCH_LOCATIONS = [
  {
    city: "Lisbon, IA",
    lines: ["200 Kraiburg Blvd", "Lisbon, IA 52253", "319-455-4200"]
  },
  {
    city: "Iowa City, IA",
    lines: ["3 Escort Lane, Suite B", "Iowa City, IA 52240", "319-455-4200"]
  },
  {
    city: "Dyersville, IA",
    lines: ["819 9th Street SE, Suite A", "Dyersville, IA 52040", "319-640-3710"]
  }
];

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

/**
 * Customer-facing label when prepared_by stores an internal email address.
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>["header"]} header
 */
function formatPreparedByLabel(header) {
  const prepared = String(header.preparedBy ?? "").trim();
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
 * @param {{ subject?: string }} [opts]
 */
export function buildEstimateEmailContent(display, opts = {}) {
  const h = display.header;
  const quoteNumber = String(h.quoteNumber ?? "").trim();
  if (!quoteNumber) {
    throw new Error("Customer estimate email requires a saved quote number");
  }

  const subject =
    opts.subject?.trim() ||
    defaultSubject(quoteNumber, h.projectName, h.customerName);

  const htmlPreview = buildHtmlEmail(display);
  const textPreview = buildTextEmail(display);
  const replyTo = pickReplyToEmail(display);

  return { subject, htmlPreview, textPreview, replyTo };
}

function defaultSubject(quoteNumber, projectName, customerName) {
  const parts = ["Elite Stone Fabrication Estimate", quoteNumber];
  if (projectName) parts.push(projectName);
  else if (customerName) parts.push(customerName);
  return parts.join(" — ");
}

function buildDetailRow(label, value) {
  if (!value) return "";
  return `<tr>
    <td style="padding:8px 12px;font-size:13px;line-height:1.4;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};width:132px;vertical-align:top;">${escHtml(label)}</td>
    <td style="padding:8px 12px;font-size:14px;line-height:1.4;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};vertical-align:top;">${escHtml(value)}</td>
  </tr>`;
}

function buildBranchFooterHtml() {
  const cells = BRANCH_LOCATIONS.map((branch) => {
    const lineHtml = branch.lines
      .map(
        (line) =>
          `<span style="display:block;font-size:12px;line-height:1.5;color:${TEXT_MUTED};">${escHtml(line)}</span>`
      )
      .join("");
    return `<td style="padding:12px 8px;vertical-align:top;width:33%;">
      <strong style="display:block;font-size:12px;line-height:1.4;color:${TEXT_DARK};margin-bottom:4px;">${escHtml(branch.city)}</strong>
      ${lineHtml}
    </td>`;
  }).join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
    <tr>${cells}</tr>
  </table>`;
}

function buildBranchFooterText() {
  return BRANCH_LOCATIONS.map((branch) =>
    [branch.city, ...branch.lines].join("\n  ")
  ).join("\n\n");
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 */
function buildHtmlEmail(display) {
  const h = display.header;
  const quoteNumber = String(h.quoteNumber ?? "").trim();
  if (!quoteNumber) {
    throw new Error("Customer estimate email requires a saved quote number");
  }
  const addr = formatAddress(h);
  const preparedByLabel = formatPreparedByLabel(h);
  const quoteLabel = h.revisionLabel ? `${quoteNumber} (${h.revisionLabel})` : quoteNumber;
  const totalFormatted = display.estimateTotalFormatted || "—";

  const summaryRows = display.summaryRows
    .map(
      (row) =>
        `<tr>
          <td style="padding:10px 14px;font-size:14px;line-height:1.4;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};">${escHtml(row.label)}</td>
          <td style="padding:10px 14px;font-size:14px;line-height:1.4;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};text-align:right;font-weight:600;">${escHtml(row.displayFormatted)}</td>
        </tr>`
    )
    .join("");

  const roomBlock = display.showRoomBreakdown
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:24px;">
        <tr>
          <td style="padding:0 0 8px 0;">
            <span style="font-size:15px;font-weight:700;color:${TEXT_DARK};">Areas &amp; rooms</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid ${BORDER};">
              ${display.roomSummaries
                .map((room, idx) => {
                  const sfParts = [];
                  if (room.countertopSqft != null) sfParts.push(`${room.countertopSqft} sf counter`);
                  if (room.backsplashSqft != null) sfParts.push(`${room.backsplashSqft} sf backsplash`);
                  const border = idx < display.roomSummaries.length - 1 ? `border-bottom:1px solid ${BORDER};` : "";
                  return `<tr>
                    <td style="padding:10px 14px;font-size:14px;line-height:1.4;color:${TEXT_DARK};${border}width:40%;vertical-align:top;"><strong>${escHtml(room.name)}</strong></td>
                    <td style="padding:10px 14px;font-size:13px;line-height:1.4;color:${TEXT_MUTED};${border}vertical-align:top;">${sfParts.length ? escHtml(sfParts.join(", ")) : "—"}</td>
                  </tr>`;
                })
                .join("")}
            </table>
          </td>
        </tr>
      </table>`
    : "";

  const notesBlock =
    display.customerFacingNotes.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:24px;">
          <tr>
            <td style="padding:0 0 8px 0;">
              <span style="font-size:15px;font-weight:700;color:${TEXT_DARK};">Project notes</span>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 14px;background-color:${BG_LIGHT};border:1px solid ${BORDER};font-size:14px;line-height:1.5;color:${TEXT_DARK};">
              <ul style="margin:0;padding-left:18px;">
                ${display.customerFacingNotes.map((n) => `<li style="margin-bottom:4px;">${escHtml(n)}</li>`).join("")}
              </ul>
            </td>
          </tr>
        </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Elite Stone Fabrication Estimate</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:${TEXT_DARK};line-height:1.5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#eef2f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${BORDER};">
          <tr>
            <td style="padding:24px 28px 16px 28px;border-bottom:3px solid ${BRAND_RED};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;padding-right:16px;width:140px;">
                    <img src="${LOGO_URL}" alt="Elite Stone Fabrication" width="140" style="display:block;border:0;outline:none;text-decoration:none;width:140px;height:auto;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="display:block;font-size:22px;font-weight:700;line-height:1.25;color:${TEXT_DARK};">Elite Stone Fabrication Estimate</span>
                    <span style="display:block;margin-top:6px;font-size:13px;line-height:1.4;color:${TEXT_MUTED};">Your planning estimate from Elite Stone Fabrication</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${BG_LIGHT};border:1px solid ${BORDER};">
                <tr>
                  <td style="padding:18px 20px;text-align:center;">
                    <span style="display:block;font-size:12px;font-weight:600;line-height:1.4;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Estimated project total</span>
                    <span style="display:block;margin-top:6px;font-size:32px;font-weight:700;line-height:1.2;color:${TEXT_DARK};">${escHtml(totalFormatted)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0 28px;">
              <span style="font-size:15px;font-weight:700;color:${TEXT_DARK};">Project details</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid ${BORDER};">
                ${buildDetailRow("Quote #", quoteLabel)}
                ${buildDetailRow("Customer", h.customerName)}
                ${buildDetailRow("Project", h.projectName)}
                ${buildDetailRow("Account", h.accountName)}
                ${buildDetailRow("Location", addr)}
                ${buildDetailRow("Branch", h.branch)}
                ${buildDetailRow("Sales rep", h.salesRep)}
                ${buildDetailRow("Prepared by", preparedByLabel)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 0 28px;">
              <span style="font-size:15px;font-weight:700;color:${TEXT_DARK};">Estimate summary</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid ${BORDER};">
                ${summaryRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px;">
              ${roomBlock}
              ${notesBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${BG_LIGHT};border:1px solid ${BORDER};">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;line-height:1.55;color:${TEXT_MUTED};">
                    This estimate is provided for <strong style="color:${TEXT_DARK};">planning purposes</strong>. Final pricing may vary after field verification, material selection, and project scope confirmation.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px 28px;border-top:1px solid ${BORDER};">
              <span style="display:block;font-size:14px;font-weight:700;color:${TEXT_DARK};">Elite Stone Fabrication</span>
              <span style="display:block;margin-top:4px;font-size:13px;line-height:1.5;color:${TEXT_MUTED};">
                Questions about this estimate? Reply to this email or contact your Elite Stone representative.
              </span>
              ${buildBranchFooterHtml()}
              <span style="display:block;margin-top:16px;font-size:13px;font-weight:600;color:${BRAND_RED};">
                <a href="https://www.elitestonefabrication.com" style="color:${BRAND_RED};text-decoration:none;">www.elitestonefabrication.com</a>
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
 */
function buildTextEmail(display) {
  const h = display.header;
  const quoteNumber = String(h.quoteNumber ?? "").trim();
  if (!quoteNumber) {
    throw new Error("Customer estimate email requires a saved quote number");
  }
  const preparedByLabel = formatPreparedByLabel(h);
  const quoteLabel = `${quoteNumber}${h.revisionLabel ? ` (${h.revisionLabel})` : ""}`;

  const lines = [
    "ELITE STONE FABRICATION",
    "Estimate",
    "=======================",
    "",
    `Estimated project total: ${display.estimateTotalFormatted || "—"}`,
    "",
    "Project details",
    "---------------",
    `Quote #: ${quoteLabel}`,
    h.customerName ? `Customer: ${h.customerName}` : null,
    h.projectName ? `Project: ${h.projectName}` : null,
    h.accountName ? `Account: ${h.accountName}` : null,
    formatAddress(h) ? `Location: ${formatAddress(h)}` : null,
    h.branch ? `Branch: ${h.branch}` : null,
    h.salesRep ? `Sales rep: ${h.salesRep}` : null,
    preparedByLabel ? `Prepared by: ${preparedByLabel}` : null,
    "",
    "Estimate summary",
    "----------------"
  ].filter((line) => line != null);

  for (const row of display.summaryRows) {
    lines.push(`${row.label}: ${row.displayFormatted}`);
  }

  if (display.showRoomBreakdown) {
    lines.push("", "Areas & rooms", "-------------");
    for (const room of display.roomSummaries) {
      const sfParts = [];
      if (room.countertopSqft != null) sfParts.push(`${room.countertopSqft} sf counter`);
      if (room.backsplashSqft != null) sfParts.push(`${room.backsplashSqft} sf backsplash`);
      lines.push(`- ${room.name}${sfParts.length ? ` (${sfParts.join(", ")})` : ""}`);
    }
  }

  if (display.customerFacingNotes.length) {
    lines.push("", "Project notes", "-------------");
    for (const note of display.customerFacingNotes) lines.push(`- ${note}`);
  }

  lines.push(
    "",
    "PLANNING ESTIMATE",
    "This estimate is provided for planning purposes. Final pricing may vary after field verification, material selection, and project scope confirmation.",
    "",
    "ELITE STONE FABRICATION",
    "Questions? Reply to this email or contact your Elite Stone representative.",
    "",
    buildBranchFooterText(),
    "",
    "www.elitestonefabrication.com"
  );

  return lines.join("\n");
}

export { defaultSubject };
