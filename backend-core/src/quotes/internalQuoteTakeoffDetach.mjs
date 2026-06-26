/**
 * Detach reviewed AI Takeoff import from an Internal Estimate draft (v6.1).
 *
 * Removes imported rooms/pieces only; preserves audit history; does not delete source takeoff job.
 *
 * @module internalQuoteTakeoffDetach
 */

import { calculateQuote } from "./quoteCalculator.js";
import { replaceQuoteLinesAndRooms } from "./quotePersist.js";
import {
  mergeRowOrganizationId,
  organizationScopeOrFilter,
  tableHasOrganizationId,
} from "../organizations/organizationContext.js";
import { appendTakeoffImportAuditEvent } from "./internalQuoteTakeoffAudit.mjs";
import { isActiveTakeoffImport } from "./internalQuoteTakeoffImportChecklist.mjs";

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function applyQuoteHeaderOrgScope(qb, orgId, hasOrg) {
  if (!orgId || !hasOrg) return qb;
  const filt = organizationScopeOrFilter(orgId);
  return filt ? qb.or(filt) : qb;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} quoteId
 * @param {string|null} orgId
 * @param {boolean} hasQuoteHeadersOrg
 */
async function fetchScopedQuote(db, quoteId, orgId, hasQuoteHeadersOrg) {
  let qb = db
    .from("quote_headers")
    .select("id,quote_number,quote_status,quote_source,calculation_snapshot,archived_at,is_current_revision")
    .eq("id", quoteId)
    .eq("quote_source", "internal_quote")
    .limit(1);
  qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
  const { data, error } = await qb;
  if (error) throw error;
  return data?.[0] ?? null;
}

function isImportedRoom(room) {
  if (!room || typeof room !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (room);
  const src = r.takeoffImportSource;
  if (src && typeof src === "object" && src.importedFromTakeoff) return true;
  return false;
}

/**
 * Pure helper — rooms kept after detaching takeoff import (testable without DB).
 *
 * @param {Array<Record<string, unknown>>} roomDrafts
 * @param {Record<string, unknown>|null|undefined} takeoffImport
 */
export function filterRoomsAfterTakeoffDetach(roomDrafts, takeoffImport) {
  const importedIds = new Set(
    Array.isArray(takeoffImport?.importedRoomIds)
      ? takeoffImport.importedRoomIds.map(String)
      : roomDrafts.filter(isImportedRoom).map((r) => String(r.id))
  );
  const remaining = roomDrafts.filter((r) => !importedIds.has(String(r.id)) && !isImportedRoom(r));
  return remaining.length ? remaining : [defaultEmptyRoom()];
}

/**
 * Mark takeoff import block detached with audit event (pure).
 *
 * @param {Record<string, unknown>} takeoffImport
 * @param {{ userId?: string|null, userEmail?: string|null, quoteId?: string, removedRoomCount?: number }} ctx
 */
export function markTakeoffImportDetached(takeoffImport, ctx) {
  const now = new Date().toISOString();
  return appendTakeoffImportAuditEvent(
    {
      ...takeoffImport,
      status: "detached",
      detachedAt: now,
      detachedBy: ctx.userId ?? ctx.userEmail ?? "unknown",
    },
    {
      type: "takeoff_import_detached",
      userId: ctx.userId ?? null,
      userEmail: ctx.userEmail ?? null,
      metadata: {
        removedRoomCount: ctx.removedRoomCount ?? 0,
        quoteId: ctx.quoteId ?? null,
      },
    }
  );
}

function defaultEmptyRoom() {
  return {
    id: `room-${Date.now()}`,
    name: "Main",
    roomType: "Kitchen",
    materialGroup: "Group Promo",
    calcMode: "Guided Shape",
    guidedShapeGroups: [],
    guidedPieces: [],
    linear: { wallFt: 0, splashIn: 4, islandL: 0, islandW: 0 },
    direct: { counter: 0, splash: 0 },
    fhbMode: "Off",
    fhbDirectSf: 0,
    fhbOutlets: 0,
    fhbPieces: [],
    addons: {},
    tear: false,
    raised: "No",
    notes: "",
    vanity: { size: "", source: "Stock", depth: 21, qty: 1, programSink: 0, bowl: 0 },
  };
}

/**
 * @param {{
 *   db: import("@supabase/supabase-js").SupabaseClient,
 *   organizationId: string,
 *   quoteId: string,
 *   userId?: string|null,
 *   userEmail?: string|null,
 * }} params
 */
export async function detachTakeoffImportFromQuote({
  db,
  organizationId,
  quoteId,
  userId = null,
  userEmail = "unknown",
}) {
  if (!isUuid(organizationId)) {
    throw Object.assign(new Error("organizationId must be a valid UUID"), { statusCode: 400 });
  }
  if (!isUuid(quoteId)) {
    throw Object.assign(new Error("quoteId must be a valid UUID"), { statusCode: 400 });
  }

  const hasQuoteHeadersOrg = await tableHasOrganizationId(db, "quote_headers");
  const row = await fetchScopedQuote(db, quoteId, organizationId, hasQuoteHeadersOrg);
  if (!row) throw Object.assign(new Error("Quote not found"), { statusCode: 404 });
  if (row.archived_at) throw Object.assign(new Error("Quote is archived"), { statusCode: 400 });
  if (String(row.quote_status ?? "") !== "draft") {
    throw Object.assign(
      new Error("Takeoff import can only be detached while quote_status is draft."),
      { statusCode: 422 }
    );
  }

  const snap = row.calculation_snapshot && typeof row.calculation_snapshot === "object"
    ? row.calculation_snapshot
    : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  const takeoffImport = iu.takeoff_import;
  if (!isActiveTakeoffImport(takeoffImport)) {
    throw Object.assign(new Error("No active takeoff import on this quote."), { statusCode: 422 });
  }

  const roomDrafts = Array.isArray(iu.estimate_room_drafts) ? [...iu.estimate_room_drafts] : [];
  const importedIds = new Set(
    Array.isArray(takeoffImport.importedRoomIds)
      ? takeoffImport.importedRoomIds.map(String)
      : roomDrafts.filter(isImportedRoom).map((r) => String(r.id))
  );

  const nextRoomDrafts = filterRoomsAfterTakeoffDetach(roomDrafts, takeoffImport);

  const calcBody = {
    quoteSource: "internal_quote",
    engine: "guided_shape_groups_v1",
    rooms: nextRoomDrafts,
    materialGroup: null,
    internalMaterialBasis: iu.internal_material_basis ?? "wholesale",
  };
  const calc = await calculateQuote(calcBody, { db });

  const now = new Date().toISOString();
  const detachedImport = markTakeoffImportDetached(takeoffImport, {
    userId,
    userEmail,
    quoteId,
    removedRoomCount: importedIds.size,
  });

  const snapshotToStore = {
    ...calc.snapshot,
    internal_ui_version: 1,
    internal_ui: {
      ...iu,
      quote_workflow: "draft",
      estimate_room_drafts: nextRoomDrafts,
      estimate_rooms: calcBody.rooms,
      takeoff_import: detachedImport,
      takeoff_import_checklist: null,
    },
  };

  let ub = db
    .from("quote_headers")
    .update({
      calculation_snapshot: snapshotToStore,
      updated_at: now,
    })
    .eq("id", quoteId)
    .eq("quote_source", "internal_quote");
  ub = applyQuoteHeaderOrgScope(ub, organizationId, hasQuoteHeadersOrg);
  const { error: uErr } = await ub;
  if (uErr) throw Object.assign(new Error(uErr.message), { statusCode: 503 });

  await replaceQuoteLinesAndRooms(db, {
    quoteId,
    body: { rooms: nextRoomDrafts },
    calc,
    organizationContext: { organizationId },
    quoteSource: "internal_quote",
  });

  return {
    ok: true,
    quoteId,
    removedRoomCount: importedIds.size,
    remainingRoomCount: nextRoomDrafts.length,
    takeoffJobId: takeoffImport.takeoffJobId ?? null,
    detachedAt: now,
  };
}
