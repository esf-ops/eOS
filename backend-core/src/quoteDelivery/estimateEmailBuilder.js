/**
 * Customer-safe HTML/text email bodies from snapshot-derived display model.
 */

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAddress(header) {
  const parts = [header.projectAddress, header.city, header.state].filter(Boolean);
  return parts.join(", ");
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 * @param {{ subject?: string }} [opts]
 */
export function buildEstimateEmailContent(display, opts = {}) {
  const h = display.header;
  const subject =
    opts.subject?.trim() ||
    defaultSubject(h.quoteNumber, h.projectName, h.customerName);

  const htmlPreview = buildHtmlEmail(display);
  const textPreview = buildTextEmail(display);

  return { subject, htmlPreview, textPreview };
}

function defaultSubject(quoteNumber, projectName, customerName) {
  const qn = quoteNumber ? ` ${quoteNumber}` : "";
  const proj = projectName ? ` — ${projectName}` : "";
  const cust = customerName ? ` for ${customerName}` : "";
  return `Elite Stone Fabrication Estimate${qn}${cust}${proj}`.trim();
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 */
function buildHtmlEmail(display) {
  const h = display.header;
  const addr = formatAddress(h);

  const summaryRows = display.summaryRows
    .map(
      (row) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${escHtml(row.label)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${escHtml(row.displayFormatted)}</td></tr>`
    )
    .join("");

  const roomRows = display.showRoomBreakdown
    ? display.roomSummaries
        .map((room) => {
          const sfParts = [];
          if (room.countertopSqft != null) sfParts.push(`${room.countertopSqft} sf counter`);
          if (room.backsplashSqft != null) sfParts.push(`${room.backsplashSqft} sf backsplash`);
          return `<li><strong>${escHtml(room.name)}</strong>${sfParts.length ? ` — ${escHtml(sfParts.join(", "))}` : ""}</li>`;
        })
        .join("")
    : "";

  const notesBlock =
    display.customerFacingNotes.length > 0
      ? `<h3 style="margin:24px 0 8px;font-size:14px;">Project notes</h3><ul style="margin:0;padding-left:20px;">${display.customerFacingNotes.map((n) => `<li>${escHtml(n)}</li>`).join("")}</ul>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Elite Stone Fabrication Estimate</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 8px;">Elite Stone Fabrication Estimate</h1>
  <p style="margin:0 0 16px;color:#555;">Customer-facing estimate summary</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:4px 0;color:#666;">Quote #</td><td style="padding:4px 0;">${escHtml(h.quoteNumber || "—")}${h.revisionLabel ? ` (${escHtml(h.revisionLabel)})` : ""}</td></tr>
    ${h.customerName ? `<tr><td style="padding:4px 0;color:#666;">Customer</td><td style="padding:4px 0;">${escHtml(h.customerName)}</td></tr>` : ""}
    ${h.projectName ? `<tr><td style="padding:4px 0;color:#666;">Project</td><td style="padding:4px 0;">${escHtml(h.projectName)}</td></tr>` : ""}
    ${addr ? `<tr><td style="padding:4px 0;color:#666;">Location</td><td style="padding:4px 0;">${escHtml(addr)}</td></tr>` : ""}
    ${h.branch ? `<tr><td style="padding:4px 0;color:#666;">Branch</td><td style="padding:4px 0;">${escHtml(h.branch)}</td></tr>` : ""}
    ${h.salesRep ? `<tr><td style="padding:4px 0;color:#666;">Sales rep</td><td style="padding:4px 0;">${escHtml(h.salesRep)}</td></tr>` : ""}
    ${h.preparedBy ? `<tr><td style="padding:4px 0;color:#666;">Prepared by</td><td style="padding:4px 0;">${escHtml(h.preparedBy)}</td></tr>` : ""}
  </table>
  <h2 style="font-size:16px;margin:24px 0 8px;border-bottom:2px solid #333;padding-bottom:4px;">Estimate summary</h2>
  <table style="width:100%;border-collapse:collapse;">${summaryRows}</table>
  ${display.showRoomBreakdown ? `<h3 style="margin:24px 0 8px;font-size:14px;">Areas</h3><ul style="margin:0;padding-left:20px;">${roomRows}</ul>` : ""}
  ${notesBlock}
  <p style="margin-top:32px;font-size:12px;color:#888;">This estimate is provided for planning purposes. Final pricing may vary based on field verification.</p>
</body>
</html>`;
}

/**
 * @param {ReturnType<import("./estimateDisplayFromSnapshot.js").buildCustomerEstimateDisplayFromSnapshot>} display
 */
function buildTextEmail(display) {
  const h = display.header;
  const lines = [
    "Elite Stone Fabrication Estimate",
    "================================",
    h.quoteNumber ? `Quote #: ${h.quoteNumber}${h.revisionLabel ? ` (${h.revisionLabel})` : ""}` : null,
    h.customerName ? `Customer: ${h.customerName}` : null,
    h.projectName ? `Project: ${h.projectName}` : null,
    formatAddress(h) ? `Location: ${formatAddress(h)}` : null,
    h.branch ? `Branch: ${h.branch}` : null,
    h.salesRep ? `Sales rep: ${h.salesRep}` : null,
    "",
    "Estimate summary",
    "----------------"
  ].filter((line) => line != null);

  for (const row of display.summaryRows) {
    lines.push(`${row.label}: ${row.displayFormatted}`);
  }

  if (display.showRoomBreakdown) {
    lines.push("", "Areas", "-----");
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

  lines.push("", "This estimate is provided for planning purposes.");
  return lines.join("\n");
}

export { defaultSubject };
