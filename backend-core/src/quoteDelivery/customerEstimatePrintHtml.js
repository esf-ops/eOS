/**
 * Customer-safe print HTML for email PDF attachment (mirrors CustomerEstimatePrint sections).
 */

const LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const BRAND_RED = "#b91c1c";
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#475569";
const BORDER = "#cbd5e1";

const BRANCH_LOCATIONS = [
  { city: "Lisbon, IA", lines: ["200 Kraiburg Blvd", "Lisbon, IA 52253", "319-455-4200"] },
  { city: "Iowa City, IA", lines: ["3 Escort Lane, Suite B", "Iowa City, IA 52240", "319-455-4200"] },
  { city: "Dyersville, IA", lines: ["819 9th Street SE, Suite A", "Dyersville, IA 52040", "319-640-3710"] }
];

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDisplayDollars(n) {
  const v = Math.round(Number(n) || 0);
  return `$${Math.max(0, v).toLocaleString("en-US")}`;
}

function formatDisplayAmount(n) {
  const v = Math.round(Number(n) || 0);
  if (v < 0) return `-$${Math.abs(v).toLocaleString("en-US")}`;
  return `$${Math.max(0, v).toLocaleString("en-US")}`;
}

function roundCustomerDisplay(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (n < 0) return n;
  return Math.ceil(n / 5) * 5;
}

function formatVanitySubline(materialGroup, colorLabel, colorTbd) {
  const parts = ["Vanity program"];
  const color = String(colorLabel ?? "").trim();
  if (color) parts.push(`Color: ${color}`);
  else if (colorTbd) parts.push("Color TBD");
  const group = String(materialGroup ?? "").trim();
  if (group) parts.push(group);
  return parts.join(" · ");
}

function formatAddress(header) {
  return [header.projectAddress, header.city, header.state].filter(Boolean).join(", ");
}

/**
 * @param {Record<string, unknown>} printSnapshot
 */
export function buildCustomerEstimatePrintHtml(printSnapshot) {
  const header = printSnapshot.header || {};
  const display = printSnapshot.display || {};
  const quoteNumber = String(header.quoteNumber ?? "").trim();
  const preparedBy = String(display.preparedByDisplayName ?? "").trim() || "—";
  const addr = formatAddress(header);

  const summaryRows = Array.isArray(display.estimateSummaryRows)
    ? display.estimateSummaryRows
    : [];
  const summaryHtml = summaryRows
    .map(
      (row) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid ${BORDER};font-size:12px;color:${TEXT_DARK};">${escHtml(row.label)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid ${BORDER};font-size:12px;text-align:right;color:${TEXT_DARK};">${formatDisplayAmount(row.displayAmount)}</td>
        </tr>`
    )
    .join("");

  const roomRows = Array.isArray(display.roomAreaPrintRows) ? display.roomAreaPrintRows : [];
  const roomHtml = display.showRoomBreakdown && roomRows.length
    ? `<section style="margin-top:18px;">
        <h2 style="font-size:14px;font-weight:700;color:${TEXT_DARK};margin:0 0 6px 0;">Room / area cost breakdown</h2>
        <p style="font-size:11px;color:${TEXT_MUTED};margin:0 0 8px 0;line-height:1.45;">
          Estimated cost by room or area. Area totals reconcile with <strong>Estimated project total</strong> above.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};font-size:12px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:6px 8px;text-align:left;border-bottom:1px solid ${BORDER};">Room / area</th>
              <th style="padding:6px 8px;text-align:right;border-bottom:1px solid ${BORDER};">Material</th>
              <th style="padding:6px 8px;text-align:right;border-bottom:1px solid ${BORDER};">Add-ons</th>
              <th style="padding:6px 8px;text-align:right;border-bottom:1px solid ${BORDER};">Area total</th>
            </tr>
          </thead>
          <tbody>
            ${roomRows
              .map((row) => {
                const vanityLine = row.isVanity
                  ? formatVanitySubline(row.materialGroup, row.colorLabel, header.colorTbd)
                  : `${escHtml(row.materialGroup || "")}${row.colorLabel ? ` · ${escHtml(row.colorLabel)}` : header.colorTbd ? " · Color TBD" : ""}`;
                const sub = row.isVanity
                  ? `${row.vanityProgramLabel ? `${escHtml(row.vanityProgramLabel)} · ` : ""}${escHtml(vanityLine)}`
                  : escHtml(vanityLine);
                const addonLines = Array.isArray(row.addonLines) ? row.addonLines : [];
                const customLines = Array.isArray(row.customerCustomLines) ? row.customerCustomLines : [];
                const noteLines = Array.isArray(row.customerNoteLines) ? row.customerNoteLines : [];
                return `
                  <tr>
                    <td style="padding:6px 8px;border-bottom:1px solid ${BORDER};vertical-align:top;">
                      <strong>${escHtml(row.displayName)}</strong>
                      <span style="color:${TEXT_MUTED};font-size:11px;"> · ${sub}</span>
                    </td>
                    <td style="padding:6px 8px;border-bottom:1px solid ${BORDER};text-align:right;vertical-align:top;">${formatDisplayDollars(row.displayedMaterial)}</td>
                    <td style="padding:6px 8px;border-bottom:1px solid ${BORDER};text-align:right;vertical-align:top;">${row.displayedAddOns > 0 ? formatDisplayDollars(row.displayedAddOns) : "—"}</td>
                    <td style="padding:6px 8px;border-bottom:1px solid ${BORDER};text-align:right;vertical-align:top;"><strong>${formatDisplayDollars(row.displayedAreaTotal)}</strong></td>
                  </tr>
                  ${addonLines.length
                    ? `<tr><td colspan="4" style="padding:4px 8px 6px 8px;font-size:11px;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};">Includes: ${addonLines.map((a) => escHtml(a.label)).join(", ")}</td></tr>`
                    : ""}
                  ${customLines
                    .map(
                      (c) =>
                        `<tr>
                          <td colspan="3" style="padding:4px 8px;font-size:11px;color:${TEXT_DARK};border-bottom:1px solid ${BORDER};">${escHtml(c.name)}</td>
                          <td style="padding:4px 8px;font-size:11px;text-align:right;border-bottom:1px solid ${BORDER};">${formatDisplayAmount(roundCustomerDisplay(c.amountExact))}</td>
                        </tr>`
                    )
                    .join("")}
                  ${noteLines.length
                    ? `<tr><td colspan="4" style="padding:4px 8px 6px 8px;font-size:11px;color:${TEXT_MUTED};border-bottom:1px solid ${BORDER};">${escHtml(noteLines.join(" "))}</td></tr>`
                    : ""}`;
              })
              .join("")}
          </tbody>
          ${Number(display.unassignedExact) !== 0
            ? `<tfoot>
                <tr>
                  <td colspan="3" style="padding:6px 8px;font-size:12px;border-top:1px solid ${BORDER};">
                    ${Number(display.unassignedExact) < 0 ? "Project discount / credit" : "Other project items (see Estimate summary)"}
                  </td>
                  <td style="padding:6px 8px;font-size:12px;text-align:right;border-top:1px solid ${BORDER};">${formatDisplayAmount(display.unassignedDisplayTotal)}</td>
                </tr>
              </tfoot>`
            : ""}
        </table>
      </section>`
    : "";

  const comparison = display.roomComparisonTable;
  let comparisonHtml = "";
  if (comparison && Array.isArray(comparison.roomBlocks) && comparison.roomBlocks.length) {
    const blocks = comparison.roomBlocks
      .map((roomBlock) => {
        const groups = Array.isArray(roomBlock.groupBlocks) ? roomBlock.groupBlocks : [];
        return `
          <div style="margin-bottom:12px;">
            <h3 style="font-size:13px;margin:0 0 6px 0;color:${TEXT_DARK};">${escHtml(roomBlock.roomDisplayName)}</h3>
            ${groups
              .map((gb) => {
                const rows = [];
                if (gb.countertopDisplay > 0) {
                  rows.push(`<tr><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};">Countertop material</td><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};text-align:right;">${formatDisplayDollars(gb.countertopDisplay)}</td></tr>`);
                }
                if (gb.backsplashDisplay > 0) {
                  rows.push(`<tr><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};">4-inch backsplash material</td><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};text-align:right;">${formatDisplayDollars(gb.backsplashDisplay)}</td></tr>`);
                }
                if (gb.fhbDisplay > 0) {
                  rows.push(`<tr><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};">Full-height backsplash material</td><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};text-align:right;">${formatDisplayDollars(gb.fhbDisplay)}</td></tr>`);
                }
                if (gb.addonsDisplay > 0) {
                  rows.push(`<tr><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};">Add-ons / fixtures</td><td style="padding:4px 6px;border-bottom:1px solid ${BORDER};text-align:right;">${formatDisplayDollars(gb.addonsDisplay)}</td></tr>`);
                }
                rows.push(
                  `<tr><td style="padding:4px 6px;"><strong>Room total</strong></td><td style="padding:4px 6px;text-align:right;"><strong>${formatDisplayDollars(gb.roomTotalDisplay)}</strong></td></tr>`
                );
                return `
                  <div style="margin-bottom:8px;">
                    <p style="margin:0 0 4px 0;font-size:12px;"><strong>${escHtml(gb.group)}</strong>${gb.colorLabel ? `<span style="color:${TEXT_MUTED};"> · ${escHtml(gb.colorLabel)}</span>` : ""}</p>
                    <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};font-size:11px;">${rows.join("")}</table>
                  </div>`;
              })
              .join("")}`;
      })
      .join("");
    const projectLines = Array.isArray(comparison.selectedGroups)
      ? comparison.selectedGroups
          .map(
            (g) =>
              `<p style="margin:2px 0;font-size:11px;">${escHtml(g.group)}${g.colorLabel ? ` · ${escHtml(g.colorLabel)}` : ""}: <strong>${formatDisplayDollars(comparison.projectDisplayTotals?.[g.group] ?? 0)}</strong></p>`
          )
          .join("")
      : "";
    comparisonHtml = `
      <section style="margin-top:18px;">
        <h2 style="font-size:14px;font-weight:700;color:${TEXT_MUTED};margin:0 0 6px 0;">
          ${comparison.isPerRoomMode ? "Optional material comparison by room" : "Optional material group comparison"}
        </h2>
        <p style="font-size:11px;color:${TEXT_MUTED};margin:0 0 8px 0;">Illustrative only — alternate material tier pricing for the scope shown.</p>
        ${blocks}
        <div style="margin-top:8px;">
          <p style="margin:0 0 4px 0;font-size:11px;"><strong>${comparison.isPerRoomMode ? "Subtotal (shown rooms)" : "Estimated project total"}</strong></p>
          ${projectLines}
        </div>
      </section>`;
  }

  const notes = Array.isArray(display.customerFacingNoteLines) ? display.customerFacingNoteLines : [];
  const notesHtml =
    notes.length > 0
      ? `<section style="margin-top:18px;">
          <h2 style="font-size:14px;font-weight:700;color:${TEXT_DARK};margin:0 0 6px 0;">Project Notes</h2>
          <ul style="margin:0;padding-left:18px;font-size:12px;color:${TEXT_DARK};line-height:1.45;">
            ${notes.map((n) => `<li style="margin-bottom:4px;">${escHtml(n)}</li>`).join("")}
          </ul>
        </section>`
      : "";

  const branchHtml = BRANCH_LOCATIONS.map((b) => {
    const lines = b.lines.map((l) => `<span style="display:block;font-size:10px;color:${TEXT_MUTED};">${escHtml(l)}</span>`).join("");
    return `<td style="padding:8px 6px;vertical-align:top;width:33%;"><strong style="display:block;font-size:10px;color:${TEXT_DARK};margin-bottom:2px;">${escHtml(b.city)}</strong>${lines}</td>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Elite Stone Fabrication Estimate</title>
  <style>
    @page { margin: 0.45in; size: letter; }
    body { font-family: Arial, Helvetica, sans-serif; color: ${TEXT_DARK}; font-size: 12px; line-height: 1.4; margin: 0; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <header style="display:flex;align-items:center;gap:14px;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid ${BRAND_RED};">
    <img src="${LOGO_URL}" alt="Elite Stone Fabrication" width="108" style="display:block;width:108px;height:auto;" />
    <div>
      <h1 style="margin:0;font-size:18px;font-weight:700;color:${TEXT_DARK};">Elite Stone Fabrication Estimate</h1>
      <p style="margin:4px 0 0 0;font-size:11px;color:${TEXT_MUTED};">${escHtml(header.estimateDate || "")}</p>
    </div>
  </header>

  <section style="margin-bottom:16px;">
    <h2 style="font-size:14px;font-weight:700;margin:0 0 8px 0;">Project overview</h2>
    <table style="width:100%;font-size:12px;">
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};width:140px;">Estimate date</td><td style="padding:3px 0;">${escHtml(header.estimateDate || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Quote / estimate ref.</td><td style="padding:3px 0;">${escHtml(quoteNumber)}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Customer</td><td style="padding:3px 0;">${escHtml(header.customerName || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Account</td><td style="padding:3px 0;">${escHtml(header.accountName || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Project / Elite job name</td><td style="padding:3px 0;">${escHtml(header.projectName || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Project address</td><td style="padding:3px 0;">${escHtml(addr || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Branch</td><td style="padding:3px 0;">${escHtml(header.branch || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Salesperson</td><td style="padding:3px 0;">${escHtml(header.salesRep || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:${TEXT_MUTED};">Prepared by</td><td style="padding:3px 0;">${escHtml(preparedBy)}</td></tr>
    </table>
  </section>

  <section style="margin-bottom:16px;">
    <h2 style="font-size:14px;font-weight:700;margin:0 0 8px 0;">Estimate summary</h2>
    <table style="width:100%;border:1px solid ${BORDER};">
      <tbody>${summaryHtml}
        <tr>
          <td style="padding:8px;font-size:12px;"><strong>Estimated project total</strong></td>
          <td style="padding:8px;font-size:12px;text-align:right;"><strong>${formatDisplayAmount(display.finalRounded)}</strong></td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:10px;color:${TEXT_MUTED};margin:6px 0 0 0;">Estimate only — not a contract.</p>
  </section>

  ${roomHtml}
  ${comparisonHtml}
  ${notesHtml}

  <footer style="margin-top:22px;padding-top:14px;border-top:1px solid ${BORDER};">
    <div style="display:flex;gap:16px;">
      <div style="flex:1;">
        <h2 style="font-size:13px;margin:0 0 6px 0;">Terms &amp; conditions</h2>
        <ul style="margin:0;padding-left:16px;font-size:10px;color:${TEXT_MUTED};line-height:1.45;">
          <li>This estimate is valid for 30 days from the date shown unless otherwise noted in writing.</li>
          <li>Final pricing may change after field measure, material selection, template, and plan review.</li>
          <li>Payment terms, deposits, and schedule are confirmed in the signed customer agreement.</li>
          <li>Natural stone and quartz may vary in color, veining, and pattern; samples are representative only.</li>
        </ul>
      </div>
      <div style="flex:1;font-size:10px;color:${TEXT_MUTED};">
        <p style="margin:0 0 8px 0;"><span style="display:inline-block;width:120px;">Customer signature</span> ________________________ Date ________</p>
        <p style="margin:0;"><span style="display:inline-block;width:120px;">Elite Stone representative</span> ________________________ Date ________</p>
      </div>
    </div>
    <table style="width:100%;margin-top:14px;border-collapse:collapse;">${branchHtml}</table>
    <p style="margin:12px 0 0 0;font-size:11px;font-weight:600;color:${BRAND_RED};">www.elitestonefabrication.com</p>
  </footer>
</body>
</html>`;
}
