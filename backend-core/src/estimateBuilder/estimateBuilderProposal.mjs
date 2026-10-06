/**
 * Estimate Builder customer proposal (QuickBooks "Proposal" layout, eliteOS styling).
 *
 * `buildEstimateProposalSnapshot` is server-authored from the normalized document + server pricing and is
 * stored on save (`internal_ui.estimate_builder_proposal`). `renderEstimateProposalHtml` renders only from
 * that snapshot, so a saved quote's PDF always matches what was saved. Line amounts are the final $5
 * line amounts from `priceEstimateDocument`; item lines always sum to `total`.
 */

import {
  CUSTOMER_ESTIMATE_WEBSITE,
  CUSTOMER_PROPOSAL_COMPANY,
  CUSTOMER_PROPOSAL_FOOTER_LINES
} from "../quoteDelivery/customerEstimateBrandingConstants.js";
import { PRODUCT_ITEM_NAMES } from "./estimateBuilderProducts.mjs";

export const ESTIMATE_PROPOSAL_VERSION = 1;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function shortItemName(r) {
  if (r.itemType === "countertop") {
    const group = r.details?.find((d) => d.label === "Price group")?.value ?? "";
    return group ? group.replace(/^Group\s+/i, "") : "Countertop";
  }
  switch (r.itemType) {
    case "backsplash":
      return "Backsplash";
    case "vanity":
      return "Vanity";
    case "cutout":
      return "Cutout";
    case "outlet":
      return "Outlet";
    case "edge":
      return "Edge";
    case "service":
      return r.pricingSource?.reference?.includes("tearout") ? "Tear-out" : "Trip";
    case "product":
      return PRODUCT_ITEM_NAMES[r.productTab] ?? "Sink";
    case "custom":
      return r.amount < 0 ? "Credit" : "Other";
    default:
      return "";
  }
}

function itemDescription(docItem, r) {
  const override = String(docItem?.label ?? "").trim();
  if (override) return override;
  if (r.quantity > 1 && r.unit === "ea") return `${r.description} (×${r.quantity})`;
  return r.description;
}

function textLines(s) {
  return String(s ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * @param {ReturnType<import("./estimateBuilderContracts.mjs").normalizeEstimateDocument>} doc
 * @param {Awaited<ReturnType<import("./estimateBuilderPricing.mjs").priceEstimateDocument>>} pricing
 * @param {{ quoteNumber?: string, estimateDate?: string }} [opts]
 */
export function buildEstimateProposalSnapshot(doc, pricing, opts = {}) {
  const h = doc.header;
  const pricedById = new Map(pricing.items.map((r) => [r.itemId, r]));
  const docItems = doc.items;
  const isInternalOnly = (it) => it.itemType === "custom" && it.inputs?.customerFacing === false;

  const sections = [];
  const showRoomHeadings = doc.rooms.filter((room) => docItems.some((it) => it.roomId === room.id)).length > 1;
  for (const room of doc.rooms) sections.push({ room, items: docItems.filter((it) => it.roomId === room.id) });
  const unassigned = docItems.filter((it) => !it.roomId);
  if (unassigned.length) sections.push({ room: null, items: unassigned });

  /** @type {Array<{ kind: "room"|"item"|"note", item?: string, description: string, amount?: number, itemId?: string, roomId?: string|null }>} */
  const lines = [];
  /** @type {Array<{ item: string, description: string, amount: number, itemId: string, room: string }>} */
  const options = [];
  let folded = 0;
  let skippedIncomplete = 0;
  for (const { room, items } of sections) {
    if (!items.length) continue;
    if (showRoomHeadings) lines.push({ kind: "room", description: room ? room.name : "Additional items" });
    let firstItemLine = null;
    let sectionFold = 0;
    for (const it of items) {
      const r = pricedById.get(it.id);
      if (!r) continue;
      if (it.itemType === "note") {
        const text = String(it.inputs?.text ?? "").trim();
        if (text) for (const ln of textLines(text)) lines.push({ kind: "note", description: ln, itemId: it.id });
        continue;
      }
      if (r.status !== "priced") {
        skippedIncomplete += 1;
        continue;
      }
      if (r.optional) {
        options.push({ item: shortItemName(r), description: itemDescription(it, r), amount: round2(r.amount), itemId: it.id, room: room?.name ?? "" });
        continue;
      }
      if (isInternalOnly(it)) {
        sectionFold = round2(sectionFold + r.amount);
        continue;
      }
      const line = {
        kind: "item",
        item: shortItemName(r),
        description: itemDescription(it, r),
        amount: round2(r.amount),
        itemId: it.id,
        roomId: room?.id ?? null
      };
      lines.push(line);
      if (!firstItemLine && r.amount > 0) firstItemLine = line;
    }
    if (sectionFold !== 0) {
      if (firstItemLine) firstItemLine.amount = round2(firstItemLine.amount + sectionFold);
      else folded = round2(folded + sectionFold);
    }
  }
  if (folded !== 0) {
    const first = lines.find((l) => l.kind === "item" && l.amount > 0);
    if (first) first.amount = round2(first.amount + folded);
    else lines.push({ kind: "item", item: "Other", description: "Additional work", amount: folded });
  }

  const total = round2(lines.reduce((s, l) => s + (l.kind === "item" ? l.amount : 0), 0));
  const billToLines = [];
  const who = h.customerName || h.accountName;
  if (who) billToLines.push(who);
  if (h.accountName && h.customerName && h.accountName !== h.customerName) billToLines.push(h.accountName);
  const addr = textLines(h.billToAddress);
  if (addr.length) billToLines.push(...addr);
  else {
    if (h.projectAddress) billToLines.push(h.projectAddress);
    const cityLine = [h.city, [h.state, h.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (cityLine) billToLines.push(cityLine);
  }

  return {
    version: ESTIMATE_PROPOSAL_VERSION,
    header: {
      date: opts.estimateDate ?? new Date().toISOString().slice(0, 10),
      quoteNumber: opts.quoteNumber ?? "",
      billToLines,
      county: h.county || "",
      rep: h.salesRep || "",
      poNumber: h.poNumber || "",
      project: h.projectName || ""
    },
    lines,
    total,
    options,
    pricingTotal: round2(pricing.totals.total),
    skippedIncomplete,
    customerMessage: h.customerMessage || "",
    customerNoteLines: textLines(h.customerNotes)
  };
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function num(n) {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : esc(iso);
}

/** ESF revision quote numbers already carry their `-R{n}` suffix. */
export function proposalNumberLabel(header) {
  return String(header?.quoteNumber ?? "").trim() || "DRAFT";
}

const STYLES = `
@page { size: Letter; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #0b1a33; font-size: 11px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 8.5in; padding: 0.5in 0.55in 0.45in; }
.accent { height: 5px; background: #a3132f; margin: -0.5in -0.55in 0.35in; }
.top { display: flex; justify-content: space-between; align-items: flex-start; }
.co-name { font-size: 20px; font-weight: 700; color: #a3132f; letter-spacing: 0.01em; }
.co-lines { margin-top: 3px; color: #1e2b48; }
.title { text-align: right; }
.title h1 { margin: 0 0 8px; font-size: 26px; font-weight: 700; letter-spacing: 0.02em; color: #0b1a33; }
table.boxes { border-collapse: collapse; }
table.boxes th, table.boxes td { border: 1px solid #94a0b8; padding: 4px 10px; text-align: center; min-width: 1.1in; }
table.boxes th { background: #eef2f8; font-weight: 600; font-size: 10px; color: #1e2b48; }
.mid { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 22px; gap: 24px; }
.billto { border: 1px solid #94a0b8; width: 3.6in; min-height: 1.05in; }
.billto .hd { background: #eef2f8; border-bottom: 1px solid #94a0b8; padding: 4px 10px; font-weight: 600; font-size: 10px; color: #1e2b48; }
.billto .bd { padding: 6px 10px; white-space: pre-line; }
.row-boxes { display: flex; justify-content: flex-end; margin-top: 14px; }
table.boxes.wide td { min-width: 1.45in; height: 22px; }
table.items { width: 100%; border-collapse: collapse; margin-top: 14px; border: 1px solid #94a0b8; }
table.items th { background: #eef2f8; border: 1px solid #94a0b8; padding: 5px 8px; font-size: 10px; font-weight: 600; color: #1e2b48; }
table.items td { border-left: 1px solid #94a0b8; border-right: 1px solid #94a0b8; padding: 5px 8px; vertical-align: top; }
table.items td.item { width: 1.35in; font-weight: 600; }
table.items td.amt { width: 1.15in; text-align: right; white-space: nowrap; }
table.items tr.room td.desc { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; color: #a3132f; padding-top: 10px; }
table.items tr.note td.desc { color: #1e2b48; }
table.items tr { page-break-inside: avoid; }
.options-hd { margin-top: 16px; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #a3132f; }
table.items.options { margin-top: 6px; }
table.items.options tbody tr:last-child td { border-bottom: 1px solid #94a0b8; }
.notes { margin-top: 10px; color: #1e2b48; }
.notes div { margin-top: 2px; }
.bottom { display: flex; justify-content: space-between; align-items: stretch; border: 1px solid #94a0b8; border-top: none; }
.bottom .msg { padding: 8px 10px; flex: 1; white-space: pre-line; }
.bottom .tot { width: 2.5in; border-left: 1px solid #94a0b8; display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; font-size: 14px; font-weight: 700; }
.legal { margin-top: 12px; font-weight: 700; font-size: 10px; text-align: center; letter-spacing: 0.02em; }
.legal div { margin-top: 2px; }
.sign { display: flex; gap: 0.4in; margin-top: 26px; }
.sign .ln { flex: 1; border-top: 1px solid #0b1a33; padding-top: 3px; font-size: 10px; color: #475067; }
.sign .ln.date { flex: 0 0 2in; }
.contact { margin-top: 16px; display: flex; justify-content: space-between; border-top: 1px solid rgba(11,26,51,0.14); padding-top: 6px; font-size: 10px; color: #475067; }
.eos { margin-top: 6px; text-align: right; font-size: 9px; color: #94a0b8; letter-spacing: 0.02em; }
.eos b { color: #a3132f; font-weight: 700; }
`;

/**
 * @param {ReturnType<typeof buildEstimateProposalSnapshot>} p
 */
export function renderEstimateProposalHtml(p) {
  const h = p.header ?? {};
  const co = CUSTOMER_PROPOSAL_COMPANY;
  const rows = (p.lines ?? [])
    .map((l) => {
      if (l.kind === "room") return `<tr class="room"><td class="item"></td><td class="desc">${esc(l.description)}</td><td class="amt"></td></tr>`;
      if (l.kind === "note") return `<tr class="note"><td class="item"></td><td class="desc">${esc(l.description)}</td><td class="amt"></td></tr>`;
      return `<tr class="line"><td class="item">${esc(l.item)}</td><td class="desc">${esc(l.description)}</td><td class="amt">${num(l.amount)}</td></tr>`;
    })
    .join("");
  const optionRows = (p.options ?? [])
    .map(
      (o) =>
        `<tr class="line"><td class="item">${esc(o.item)}</td><td class="desc">${esc(o.room ? `${o.room}: ${o.description}` : o.description)}</td><td class="amt">${num(o.amount)}</td></tr>`
    )
    .join("");
  const optionsBlock = optionRows
    ? `<div class="options-hd">Options — not included in the total above</div><table class="items options"><thead><tr><th>Item</th><th>Description</th><th>Price</th></tr></thead><tbody>${optionRows}</tbody></table>`
    : "";
  const notes = (p.customerNoteLines ?? []).length
    ? `<div class="notes">${p.customerNoteLines.map((n) => `<div>${esc(n)}</div>`).join("")}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Proposal ${esc(proposalNumberLabel(h))}</title><style>${STYLES}</style></head><body><div class="page">
<div class="accent"></div>
<div class="top">
  <div><div class="co-name">${esc(co.name)}</div><div class="co-lines">${co.addressLines.map(esc).join("<br>")}</div></div>
  <div class="title"><h1>Proposal</h1>
    <table class="boxes"><tr><th>Date</th><th>Proposal #</th></tr><tr><td>${formatDate(h.date)}</td><td>${esc(proposalNumberLabel(h))}</td></tr></table>
  </div>
</div>
<div class="mid">
  <div class="billto"><div class="hd">We Are Pleased To Provide This Quote For:</div><div class="bd">${(h.billToLines ?? []).map(esc).join("\n")}</div></div>
  <table class="boxes"><tr><th>County</th></tr><tr><td>${esc(h.county)}</td></tr></table>
</div>
<div class="row-boxes"><table class="boxes wide"><tr><th>Rep</th><th>P.O. No.</th><th>Project</th></tr><tr><td>${esc(h.rep)}</td><td>${esc(h.poNumber)}</td><td>${esc(h.project)}</td></tr></table></div>
<div>
<table class="items"><thead><tr><th>Item</th><th>Description</th><th>Total</th></tr></thead><tbody>${rows}<tr class="filler"><td class="item" style="height:${Math.max(20, 340 - (p.lines ?? []).length * 23)}px"></td><td></td><td class="amt"></td></tr></tbody></table>
<div class="bottom"><div class="msg">${esc(p.customerMessage)}</div><div class="tot"><span>Total</span><span>$${num(p.total)}</span></div></div>
${optionsBlock}
${notes}
</div>
<div class="legal">${CUSTOMER_PROPOSAL_FOOTER_LINES.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
<div class="sign"><div class="ln">Signature</div><div class="ln date">Date Accepted</div></div>
<div class="contact"><span>Phone ${esc(co.phone)}</span><span>Fax ${esc(co.fax)}</span><span>${esc(CUSTOMER_ESTIMATE_WEBSITE)}</span></div>
<div class="eos">Prepared with <b>elite</b>OS</div>
</div></body></html>`;
}

export function buildEstimateProposalPdfFilename(header) {
  return `Elite Stone Fabrication Proposal - ${proposalNumberLabel(header).replace(/[^A-Za-z0-9._ -]/g, "")}.pdf`;
}
