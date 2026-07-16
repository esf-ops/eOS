/**
 * Build immutable customer-safe + pricing-evidence snapshots at publish time.
 * Public path never reads quote_headers after this freeze.
 */

import { filterCustomerFacingCustomLines } from "../quoteDelivery/estimateContentSanitizer.js";
import {
  DIGITAL_ESTIMATE_ENGINE_VERSION,
  DIGITAL_ESTIMATE_TERMS_VERSION
} from "./digitalEstimateConfig.mjs";
import { sha256CanonicalJson } from "./digitalEstimateToken.mjs";

/**
 * @param {{
 *   header: Record<string, unknown>,
 *   publishedAt: string,
 *   pricingValidThrough: string,
 *   termsDisclosureVersion?: string,
 *   calculationEngineVersion?: string
 * }} input
 */
export function buildPublicationFreezePayloads(input) {
  const header = input.header;
  const snapshot =
    header.calculation_snapshot && typeof header.calculation_snapshot === "object"
      ? header.calculation_snapshot
      : {};
  const iu =
    snapshot.internal_ui && typeof snapshot.internal_ui === "object" ? snapshot.internal_ui : {};

  const customerDisplayTotal = Math.round(Number(iu.customer_display_total));
  const printSnap =
    iu.customer_estimate_print_snapshot && typeof iu.customer_estimate_print_snapshot === "object"
      ? iu.customer_estimate_print_snapshot
      : null;

  const rooms = buildCustomerRooms(iu, snapshot, printSnap);
  const lineItems = buildCustomerLineItems(iu, printSnap);
  const notes = parseNotes(iu.customer_estimate_customer_facing_notes ?? iu.customerFacingNotes);

  const project = {
    customerName: str(header.customer_name),
    projectName: str(header.project_name) || str(iu.project_name),
    projectAddress: str(header.project_address)
  };

  const customerSnapshot = {
    documentTitle: "Digital Estimate",
    quoteNumber: str(header.quote_number),
    revisionLabel: str(header.revision_label) || revisionLabelFallback(header.revision_number),
    revisionNumber: num(header.revision_number) || 1,
    publishedAt: input.publishedAt,
    pricingValidThrough: input.pricingValidThrough,
    project,
    rooms,
    lineItems,
    totals: {
      estimatedProjectTotal: customerDisplayTotal,
      currency: "USD",
      rounding: "integer_usd"
    },
    notes,
    disclosures: {
      version: input.termsDisclosureVersion || DIGITAL_ESTIMATE_TERMS_VERSION,
      text: "This digital estimate is provided for planning and review. Totals are frozen at publication and are not recalculated in your browser."
    },
    materialGroupDisplay: str(snapshot.materialGroup ?? snapshot.material_group ?? header.estimated_material_group),
    colorDisplay: extractPrimaryColorLabel(iu, rooms)
  };

  const pricingEvidence = {
    sourceQuoteId: header.id,
    organizationId: header.organization_id ?? null,
    quoteFamilyRootId: header.quote_family_root_id || header.id,
    revisionNumber: num(header.revision_number) || 1,
    quoteNumber: header.quote_number,
    quoteSource: header.quote_source,
    materialProgramDefault: iu.material_program_default ?? snapshot.materialProgramDefault ?? null,
    calculationSnapshotCopy: snapshot,
    customerDisplayTotal,
    printSnapshotFinalRounded: printSnap ? Math.round(Number(printSnap.finalRounded)) : null,
    calculationEngineVersion: input.calculationEngineVersion || DIGITAL_ESTIMATE_ENGINE_VERSION,
    termsDisclosureVersion: input.termsDisclosureVersion || DIGITAL_ESTIMATE_TERMS_VERSION,
    frozenAt: input.publishedAt
  };

  const sourceQuoteFingerprint = sha256CanonicalJson({
    id: header.id,
    quote_number: header.quote_number,
    revision_number: header.revision_number,
    calculation_snapshot: snapshot
  });

  return {
    customerSnapshot,
    pricingEvidence,
    customerSnapshotHash: sha256CanonicalJson(customerSnapshot),
    pricingEvidenceHash: sha256CanonicalJson(pricingEvidence),
    sourceQuoteFingerprint
  };
}

function buildCustomerRooms(iu, snapshot, printSnap) {
  const fromPrint = Array.isArray(printSnap?.rooms) ? printSnap.rooms : null;
  if (fromPrint?.length) {
    return fromPrint.map((r) => ({
      name: str(r.name ?? r.roomName) || "Room",
      summaryLines: Array.isArray(r.summaryLines)
        ? r.summaryLines.map((s) => str(s)).filter(Boolean).slice(0, 8)
        : Array.isArray(r.lines)
          ? r.lines.map((s) => str(s)).filter(Boolean).slice(0, 8)
          : [],
      materialLabel: str(r.materialLabel ?? r.materialGroup ?? r.group),
      colorLabel: str(r.colorLabel ?? r.color ?? r.colorName)
    }));
  }

  const rooms = Array.isArray(iu.estimate_rooms) ? iu.estimate_rooms : [];
  return rooms.map((r) => ({
    name: str(r.name ?? r.room_name) || "Room",
    summaryLines: buildRoomSummaryLines(r),
    materialLabel: str(r.materialGroup ?? r.group ?? snapshot.materialGroup),
    colorLabel: str(r.colorName ?? r.color_name ?? r.colorLabel ?? r.materialColor)
  }));
}

function buildRoomSummaryLines(room) {
  const lines = [];
  const ct = Number(room.countertopSqft ?? room.countertop_sqft);
  const bs = Number(room.backsplashSqft ?? room.backsplash_sqft);
  if (Number.isFinite(ct) && ct > 0) lines.push(`Countertop ${Math.round(ct)} sf`);
  if (Number.isFinite(bs) && bs > 0) lines.push(`Backsplash ${Math.round(bs)} sf`);
  return lines.slice(0, 8);
}

function buildCustomerLineItems(iu, printSnap) {
  if (Array.isArray(printSnap?.summaryRows) && printSnap.summaryRows.length) {
    return printSnap.summaryRows
      .filter((row) => row && row.key !== "project_total")
      .map((row) => ({
        label: str(row.label) || "Item",
        amount: num(row.displayAmount ?? row.amount)
      }))
      .filter((row) => row.amount != null);
  }
  const custom = filterCustomerFacingCustomLines(iu.custom_line_items);
  return custom.map((line) => ({
    label: str(line.name) || "Item",
    amount: num(line.lineTotal)
  }));
}

function extractPrimaryColorLabel(iu, rooms) {
  for (const r of rooms || []) {
    if (r?.colorLabel) return r.colorLabel;
  }
  return null;
}

function parseNotes(raw) {
  if (raw == null || !String(raw).trim()) return [];
  return String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function revisionLabelFallback(n) {
  const num = Number(n) || 1;
  return `R${num}`;
}

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
