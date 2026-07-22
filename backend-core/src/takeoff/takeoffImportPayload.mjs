/**
 * takeoffImportPayload — approved takeoff snapshot for Internal Estimate import (v5.9).
 *
 * Builds schemaVersion takeoff_import_v1 from reviewed takeoff + review state.
 * Raw AI output is never authoritative — only included, reviewed pieces import.
 *
 * @module takeoffImportPayload
 */

import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { planTakeoffImport } from "./takeoffImportPlanner.mjs";
import { TAKEOFF_STATUS } from "./takeoffContract.mjs";
import {
  applyReviewFiltersToTakeoffResult,
  classifyBacksplashTotals,
  evaluateTakeoffApprovalGate,
} from "./takeoffApprovalGate.mjs";
import { emptyReviewState, normalizeReviewState } from "./takeoffReviewStatus.mjs";
import { buildTakeoffSourceMetaForImport } from "./takeoffImportMeasurements.mjs";
import {
  resolveRunBacksplashEligible,
  sumEligibleBacksplashLengthIn
} from "./takeoffBacksplashEligibility.mjs";
import {
  buildApprovedScopeSummary,
  deriveFabricationQuantitiesFromImportPayload,
  normalizeRunCutouts
} from "./takeoffCutoutScope.mjs";
import { attachDraftPieceGeometry } from "./takeoffPieceGeometryAuthority.mjs";

export const TAKEOFF_IMPORT_SCHEMA_VERSION = "takeoff_import_v1";

const CUTOUT_KEYWORDS = /\b(sink|cooktop|faucet|cord\s*hole|cutout|cook\s*top)\b/i;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function sfFromRun(lengthIn, depthIn) {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  return round2((l * d) / 144);
}

function resolvePieceType(run) {
  if (run.pieceType === "splash" || run.isBacksplash) return "splash";
  if (run.pieceType === "fhb") return "fhb";
  return "counter";
}

function backsplashMetaForRun(run, area) {
  const pt = resolvePieceType(run);
  const { eligible } = resolveRunBacksplashEligible(run, area);
  if (pt === "counter") {
    if (area.backsplashScope === "no_stone" || area.backsplashScope === "tile_by_others") {
      return {
        scope: area.backsplashScope,
        eligible: false,
        heightIn: null,
        linearIn: 0,
        sqft: 0,
        type: "none"
      };
    }
    // Counter runs: eligibility only. Customer chooses height later — do not invent 4".
    return {
      scope: area.backsplashScope ?? "stone",
      eligible,
      heightIn: null,
      linearIn: eligible ? Number(run.lengthIn) || 0 : 0,
      sqft: 0,
      type: eligible ? "eligible" : "none"
    };
  }
  // Explicit splash / FHB geometry pieces keep measured height as optional metadata.
  const h = Number(run.depthIn) || 0;
  let type = "standard";
  if (pt === "fhb" || h >= 48) type = "full_height";
  else if (h > 4.5) type = "high";
  else if (h <= 0) type = "eligible";
  return {
    scope: area.backsplashScope ?? "stone",
    eligible: true,
    heightIn: h > 0 ? h : null,
    linearIn: Number(run.lengthIn) || 0,
    sqft: h > 0 ? sfFromRun(run.lengthIn, run.depthIn) : 0,
    type,
  };
}

function collectSuggestedAddOns(takeoffResult) {
  /** @type {Array<{ type: string, label: string, quantity: number, sourceNote: string, reviewRequired: boolean }>} */
  const addOns = [];
  const seen = new Set();

  for (const room of takeoffResult.rooms ?? []) {
    for (const area of room.areas ?? []) {
      for (const note of [...(area.notes ?? []), ...(area.assumptions ?? []), ...(room.notes ?? [])]) {
        if (!CUTOUT_KEYWORDS.test(note)) continue;
        const key = note.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        let type = "fabrication_note";
        if (/sink/i.test(note)) type = "sink_cutout";
        else if (/cooktop|cook top/i.test(note)) type = "cooktop_cutout";
        else if (/faucet/i.test(note)) type = "faucet_cutout";
        else if (/cord/i.test(note)) type = "cord_hole";
        addOns.push({
          type,
          label: note.trim().slice(0, 120),
          quantity: 1,
          sourceNote: note.trim(),
          reviewRequired: false,
        });
      }
      for (const ex of area.exclusions ?? []) {
        const label = typeof ex === "string" ? ex : String(ex?.label ?? ex?.note ?? "");
        if (!label || !CUTOUT_KEYWORDS.test(label)) continue;
        const key = `ex:${label.trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        addOns.push({
          type: "fabrication_note",
          label: label.trim(),
          quantity: 1,
          sourceNote: label.trim(),
          reviewRequired: true,
        });
      }
    }
  }
  return addOns;
}

/**
 * Build the approved import payload. Throws if approval gate blockers remain.
 *
 * @param {{
 *   takeoffJobId: string,
 *   takeoffResultId?: string|null,
 *   takeoffResult: object,
 *   reviewState?: object|null,
 *   computed?: object|null,
 *   validation?: object|null,
 *   qaGate?: object|null,
 *   dimensionEvidence?: object|null,
 *   sourceFileName?: string|null,
 *   approvedBy?: string|null,
 *   approvedAt?: string|null,
 *   createdBy?: string|null,
 *   requireApproved?: boolean,
 *   reviewStatus?: string|null,
 * }} params
 */
export function buildTakeoffImportPayload(params) {
  const {
    takeoffJobId,
    takeoffResultId = null,
    takeoffResult,
    reviewState = null,
    computed = null,
    validation = null,
    qaGate = null,
    dimensionEvidence = null,
    sourceFileName = null,
    approvedBy = null,
    approvedAt = null,
    createdBy = null,
    requireApproved = true,
    reviewStatus = "approved",
    /**
     * Consolidated approve-and-build only. When true, legacy gate blockers
     * (VALIDATION_ERRORS, QA do_not_import, evidence, etc.) do not throw —
     * the worksheet hard-blocker gate already authorized approval.
     */
    ignoreApprovalGateBlockers = false,
  } = params;

  const rs = reviewState ? normalizeReviewState(reviewState) : emptyReviewState();
  const gate = evaluateTakeoffApprovalGate({
    takeoffResult,
    computed,
    validation,
    qaGate,
    dimensionEvidence,
    reviewState: rs,
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus,
  });

  if (requireApproved && reviewStatus !== "approved") {
    throw new Error("Takeoff must be approved before building import payload.");
  }
  if (gate.blockers.length > 0 && !ignoreApprovalGateBlockers) {
    const first = gate.blockers[0];
    throw new Error(first.message ?? "Approval blockers prevent import payload.");
  }

  const filtered = applyReviewFiltersToTakeoffResult(takeoffResult, rs);
  const importReady = {
    ...filtered,
    status: TAKEOFF_STATUS.APPROVED,
  };

  const freshComputed = computed ?? computeTakeoffMeasurements(importReady);
  const bsTotals = classifyBacksplashTotals(importReady, rs);
  const importPlan = planTakeoffImport(importReady, freshComputed);
  const suggestedAddOns = collectSuggestedAddOns(importReady);

  /** @type {import('./takeoffImportPayload.mjs').TakeoffImportPayloadV1} */
  const payload = {
    schemaVersion: TAKEOFF_IMPORT_SCHEMA_VERSION,
    takeoffJobId,
    takeoffResultId,
    sourceFileName,
    approvedBy,
    approvedAt,
    totals: {
      countertopSqft: bsTotals.countertopSqft,
      standardBacksplashSqft: bsTotals.standardBacksplashSqft,
      highBacksplashSqft: bsTotals.highBacksplashSqft,
      fullHeightBacksplashSqft: bsTotals.fullHeightBacksplashSqft,
      combinedSqft: bsTotals.combinedSqft,
      chargeableCountertopSqft: freshComputed.chargeableCountertopSf,
      chargeableBacksplashSqft: freshComputed.chargeableBacksplashSf,
    },
    rooms: [],
    suggestedAddOns,
    unresolvedWarnings: (validation?.diagnostics ?? [])
      .filter((d) => d.level === "warning")
      .map((d) => ({ code: d.code, message: d.message, path: d.path ?? null })),
    importWarnings: importPlan.warnings.map((w) => ({
      code: w.code,
      level: w.level,
      message: w.message,
      path: w.path ?? null,
    })),
    audit: {
      createdBy,
      createdAt: approvedAt ?? new Date().toISOString(),
      approvedBy,
      approvedAt,
    },
  };

  for (const room of importReady.rooms ?? []) {
    const planRoom = importPlan.rooms.find((pr) => pr.roomId === room.id);
    const eligibility = sumEligibleBacksplashLengthIn(room);
    /** @type {import('./takeoffImportPayload.mjs').TakeoffImportRoom} */
    const importRoom = {
      name: room.name,
      type: room.roomType ?? room.type ?? null,
      sourcePages: room.sourcePages ?? [],
      pieces: [],
      eligibleBacksplashLengthIn: eligibility.eligibleBacksplashLengthIn,
      eligibleRunCount: eligibility.eligibleRunCount,
      excludedRunCount: eligibility.excludedRunCount,
      suggestedAddOns: suggestedAddOns.filter((a) =>
        a.sourceNote.toLowerCase().includes(String(room.name).toLowerCase())
      ),
    };

    for (let ai = 0; ai < (room.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      for (let ri = 0; ri < (area.runs ?? []).length; ri++) {
        const run = area.runs[ri];
        const pt = resolvePieceType(run);
        const isWaterfall =
          pt === "fhb" ||
          String(run.label ?? "").toLowerCase().includes("waterfall");
        if (isWaterfall) {
          const len = Number(run.lengthIn) || 0;
          const dep = Number(run.depthIn) || 0;
          if (len <= 0 || dep <= 0) continue;
        }

        const { eligible } = resolveRunBacksplashEligible(run, area);
        // Structured cutout contract — legacy strings/maps normalize here so no
        // downstream consumer ever string-parses cutouts again.
        const { cutouts } = normalizeRunCutouts(run.cutouts);
        const basePiece = {
          name: run.label,
          pieceType: pt,
          shapeType: run.shape ?? "rect",
          lengthIn: Number(run.lengthIn) || 0,
          depthIn: Number(run.depthIn) || 0,
          sqft: sfFromRun(run.lengthIn, run.depthIn),
          chargeableSqft: sfFromRun(run.lengthIn, run.depthIn),
          includedInTakeoff: true,
          sourcePage: run.sourcePage ?? area.sourcePages?.[0] ?? null,
          sourceEvidenceIds: run.sourceEvidenceIds ?? [],
          reviewStatus: "approved",
          runId: run.id ?? null,
          roomId: room.id ?? null,
          areaId: area.id ?? null,
          backsplashEligible: eligible,
          backsplashEligibleLengthIn: eligible
            ? Math.max(
                0,
                Number(run.backsplashEligibleLengthIn) || Number(run.lengthIn) || 0
              )
            : 0,
          cutouts,
          sideSplashLeftEligible: run.sideSplashLeftEligible === true,
          sideSplashRightEligible: run.sideSplashRightEligible === true,
          leftExposed: run.leftExposed,
          rightExposed: run.rightExposed,
          frontExposed: run.frontExposed,
          backExposed: run.backExposed,
          finishedEdge: run.finishedEdge || null,
          backsplashGeometry: run.backsplashGeometry || null,
          waterfall: isWaterfall || undefined,
          backsplash: backsplashMetaForRun(run, area),
          areaType: area.areaType || null
        };
        importRoom.pieces.push(
          run.finishedEdge?.approved === true || run.finishedEdge?.finishedEdgeConfirmed === true
            ? basePiece
            : attachDraftPieceGeometry(basePiece, {
                eligible,
                areaType: area.areaType || null
              })
        );
      }
    }

    if (planRoom?.guidedShapeGroups?.length) {
      importRoom.guidedShapeGroups = planRoom.guidedShapeGroups;
    }

    payload.rooms.push(importRoom);
  }

  // Physical-scope authority handoff: governed fabrication quantities plus a
  // read-only summary Pricing Setup renders instead of manual zero-fields.
  payload.fabricationQuantities = deriveFabricationQuantitiesFromImportPayload(payload);
  payload.scopeSummary = buildApprovedScopeSummary(payload);

  return payload;
}

/**
 * Convert import payload → Internal Estimate estimate_room_drafts shape.
 *
 * @param {TakeoffImportPayloadV1} payload
 */
export function takeoffImportPayloadToRoomDrafts(payload) {
  const drafts = [];
  const jobId = payload.takeoffJobId ?? null;
  const snapshotId = payload.takeoffResultId ?? null;

  for (const room of payload.rooms ?? []) {
    const roomSourcePages = room.sourcePages ?? [];
    const roomSource = buildTakeoffSourceMetaForImport({
      takeoffJobId: jobId,
      takeoffSnapshotId: snapshotId,
      sourcePages: roomSourcePages,
      sourcePlanName: payload.sourceFileName ?? null,
      approvedBy: payload.approvedBy ?? null,
      approvedAt: payload.approvedAt ?? null,
      lengthIn: 0,
      depthIn: 0,
      reviewStatus: "approved",
    });
    delete roomSource.originalDimensions;
    roomSource.importState = "imported_unmodified";

    const groups = room.guidedShapeGroups ?? [];
    const pieceMetaByLabel = new Map(
      (room.pieces ?? []).map((p) => [String(p.name), p])
    );

    drafts.push({
      // --- identity ---
      id: `takeoff-${room.name.replace(/\s+/g, "-").toLowerCase()}-${drafts.length}`,
      name: room.name,
      roomType: room.type ?? "Kitchen",

      // --- native IE calc mode ---
      calcMode: "Guided Shape",

      // --- shape data ---
      guidedShapeGroups: groups.map((g) => ({
        id: g.label.replace(/\s+/g, "-").toLowerCase(),
        name: g.label,
        shapeType: g.shapeType,
        overlapMode: g.overlapMode ?? "none",
        backsplashMode: g.backsplashMode ?? "include",
        pieces: (g.pieces ?? []).map((p) => {
          const meta = pieceMetaByLabel.get(String(p.label));
          const lengthIn = p.lengthIn;
          const depthIn = p.depthIn;
          return {
            id: `p-${p.label}`,
            name: p.label,
            pieceType: p.pieceType,
            lengthIn,
            depthIn,
            shape: p.shape ?? "rect",
            // Estimator area label — customer side-splash fallback after piece name.
            areaLabel: g.label || null,
            // Physical side-splash eligibility from the approved Takeoff run.
            ...(meta?.sideSplashLeftEligible != null
              ? { sideSplashLeftEligible: meta.sideSplashLeftEligible === true }
              : {}),
            ...(meta?.sideSplashRightEligible != null
              ? { sideSplashRightEligible: meta.sideSplashRightEligible === true }
              : {}),
            // addSplash is intentionally omitted for counter pieces: backsplash is
            // represented via explicit "Backsplash" shapeType groups (equivalent math).
            takeoffImportSource: buildTakeoffSourceMetaForImport({
              takeoffJobId: jobId,
              takeoffSnapshotId: snapshotId,
              sourcePages: roomSourcePages,
              sourcePlanName: payload.sourceFileName ?? null,
              approvedBy: payload.approvedBy ?? null,
              approvedAt: payload.approvedAt ?? null,
              lengthIn,
              depthIn,
              shape: p.shape ?? "rect",
              sourcePage: meta?.sourcePage ?? roomSourcePages[0] ?? null,
              reviewStatus: meta?.reviewStatus ?? "approved",
            }),
          };
        }),
      })),
      // guidedPieces is re-derived from guidedShapeGroups by normalizeGuidedShapeRoom()
      // on IE hydration — no need to duplicate here.

      // --- native IE full-height backsplash fields ---
      fhbMode: "Off",
      fhbDirectSf: 0,
      fhbOutlets: 0,
      fhbPieces: [],

      // --- native IE legacy linear/direct fields (unused in Guided Shape mode) ---
      linear: { wallFt: 0, splashIn: 4, islandL: 0, islandW: 0 },
      direct: { counter: 0, splash: 0 },

      // --- native IE room-level flags ---
      tear: false,
      raised: "No",
      notes: "",
      addons: {},

      // --- native IE material fields (estimator fills in before calculate) ---
      materialGroup: null,
      materialProgramOverride: "inherit",

      // --- native IE tax fields ---
      useTaxMode: "inherit_project",
      useTaxPercent: 0,
      useTaxBase: "countertop_material",

      // --- native IE vanity defaults (not a vanity room, but field is required) ---
      vanity: {
        size: "none",
        source: "Promo / Stock 100 Remnant",
        depth: 22.5,
        qty: 1,
        programSink: 0,
        bowl: 0,
        isVanityProgram: true,
        vanitySinkType: "oval_white",
        vanityExtraTrips: 0,
        outsideProgram: false,
      },

      // --- takeoff traceability (extra, not required for IE math) ---
      takeoffImportSource: roomSource,
    });
  }
  return drafts;
}

/**
 * @typedef {Object} TakeoffImportPayloadV1
 * @property {string} schemaVersion
 * @property {string} takeoffJobId
 * @property {string|null} takeoffResultId
 * @property {string|null} sourceFileName
 * @property {string|null} approvedBy
 * @property {string|null} approvedAt
 * @property {object} totals
 * @property {TakeoffImportRoom[]} rooms
 * @property {object[]} suggestedAddOns
 * @property {object[]} unresolvedWarnings
 * @property {object[]} importWarnings
 * @property {object} audit
 */

/**
 * @typedef {Object} TakeoffImportRoom
 * @property {string} name
 * @property {string|null} type
 * @property {number[]} sourcePages
 * @property {object[]} pieces
 * @property {object[]} [guidedShapeGroups]
 * @property {object[]} [suggestedAddOns]
 */
