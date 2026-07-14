/**
 * Validate structured Gemini takeoff pass outputs before mapping to TakeoffRun.
 */

const CONF = new Set(["high", "medium", "low"]);
const SEV = new Set(["informational", "estimator_review", "approval_blocking"]);
const SHAPES = new Set(["rect", "tri"]);
const PIECE_TYPES = new Set(["counter", "splash", "fhb"]);
const SPLASH_SCOPES = new Set([
  "no_stone",
  "standard",
  "full_height",
  "tile_by_others",
  "needs_review",
  null
]);

const PRICING_RE =
  /chargeable|pricedSquare|sellSquare|quoteTotal|"margin"|quote_library|import-from-takeoff|takeoff_import_v1|internalEstimateId|quoteLibraryId/i;

/**
 * @param {any} inventory
 * @param {{ maxPages: number }} opts
 */
export function validateInventoryPass(inventory, opts) {
  if (!inventory || typeof inventory !== "object") {
    fail("SCHEMA_FAILURE", "Inventory pass returned non-object JSON.");
  }
  if (PRICING_RE.test(JSON.stringify(inventory))) {
    fail("SCHEMA_FAILURE", "Inventory pass contained prohibited pricing/import fields.");
  }
  const pageCount = Number(inventory.pageCount ?? inventory.pages?.length ?? 0);
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    fail("NO_COUNTERTOP_CONTENT", "Inventory did not report a valid page count.");
  }
  if (pageCount > opts.maxPages) {
    fail("UNSUPPORTED_FILE", `Plan exceeds max pages (${opts.maxPages}).`);
  }
  if (inventory.countertopContentPresent === false) {
    fail("NO_COUNTERTOP_CONTENT", "Provider reported no countertop-relevant content.");
  }
  if (inventory.dimensionsAppearReadable === false) {
    // Soft — allow continue with warning; geometry may still fail later
  }
  return {
    pageCount,
    pages: normalizePages(inventory.pages, pageCount),
    countertopContentPresent: inventory.countertopContentPresent !== false,
    dimensionsAppearReadable: inventory.dimensionsAppearReadable !== false,
    roomLabelsVisible: Array.isArray(inventory.roomLabelsVisible)
      ? inventory.roomLabelsVisible.map(String).slice(0, 40)
      : [],
    confidence: CONF.has(inventory.confidence) ? inventory.confidence : "medium",
    warnings: normalizeWarnings(inventory.warnings)
  };
}

/**
 * @param {any} evidenceDoc
 * @param {{ maxPages: number }} opts
 */
export function validateEvidencePass(evidenceDoc, opts) {
  if (!evidenceDoc || typeof evidenceDoc !== "object") {
    fail("SCHEMA_FAILURE", "Evidence pass returned non-object JSON.");
  }
  if (PRICING_RE.test(JSON.stringify(evidenceDoc))) {
    fail("SCHEMA_FAILURE", "Evidence pass contained prohibited pricing/import fields.");
  }
  const list = Array.isArray(evidenceDoc.evidence) ? evidenceDoc.evidence : [];
  if (!list.length) {
    fail("EVIDENCE_FAILURE", "Evidence pass returned no evidence rows.");
  }
  const ids = new Set();
  const evidence = [];
  for (const row of list.slice(0, 200)) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id ?? "").trim();
    if (!id || ids.has(id)) continue;
    const pageNumber = Number(row.pageNumber);
    if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > opts.maxPages) {
      continue; // drop unsupported page refs
    }
    const bbox = normalizeBbox(row.bboxNorm ?? row.bbox);
    ids.add(id);
    evidence.push({
      id,
      pageNumber,
      label: String(row.label ?? "evidence").slice(0, 200),
      value: row.value == null ? null : typeof row.value === "number" ? row.value : String(row.value).slice(0, 120),
      unit: row.unit != null ? String(row.unit).slice(0, 40) : null,
      confidence: CONF.has(row.confidence) ? row.confidence : "medium",
      locationNote: row.locationNote != null ? String(row.locationNote).slice(0, 240) : null,
      bboxNorm: bbox,
      simulatedNote: "Live Gemini evidence — verify against plan; not authoritative for SF."
    });
  }
  if (!evidence.length) {
    fail("EVIDENCE_FAILURE", "No supported evidence rows survived validation.");
  }
  return {
    evidence,
    warnings: normalizeWarnings(evidenceDoc.warnings)
  };
}

/**
 * @param {any} geometry
 * @param {{ maxPages: number, evidenceIds: Set<string> }} opts
 */
export function validateGeometryPass(geometry, opts) {
  if (!geometry || typeof geometry !== "object") {
    fail("SCHEMA_FAILURE", "Geometry pass returned non-object JSON.");
  }
  if (PRICING_RE.test(JSON.stringify(geometry))) {
    fail("SCHEMA_FAILURE", "Geometry pass contained prohibited pricing/import fields.");
  }

  const roomsIn = Array.isArray(geometry.rooms) ? geometry.rooms : [];
  if (!roomsIn.length) {
    fail("PARTIAL_EXTRACTION", "Geometry pass returned no rooms.");
  }

  const roomIds = new Set();
  const pieceIds = new Set();
  const rooms = [];
  const warnings = normalizeWarnings(geometry.warnings);

  for (const room of roomsIn.slice(0, 40)) {
    if (!room || typeof room !== "object") continue;
    const id = String(room.id ?? "").trim();
    if (!id || roomIds.has(id)) {
      warnings.push({
        code: "DUPLICATE_OR_MISSING_ROOM_ID",
        severity: "estimator_review",
        message: "Room skipped due to missing/duplicate id.",
        blocking: false,
        estimatorActionRequired: true
      });
      continue;
    }
    roomIds.add(id);
    const pieces = [];
    for (const p of Array.isArray(room.pieces) ? room.pieces.slice(0, 80) : []) {
      if (!p || typeof p !== "object") continue;
      const pid = String(p.id ?? "").trim();
      if (!pid || pieceIds.has(pid)) {
        warnings.push({
          code: "DUPLICATE_OR_MISSING_PIECE_ID",
          severity: "estimator_review",
          message: "Piece skipped due to missing/duplicate id.",
          blocking: false,
          estimatorActionRequired: true
        });
        continue;
      }
      pieceIds.add(pid);
      const lengthIn = dimOrNull(p.lengthIn ?? p.measurement?.lengthIn);
      const depthIn = dimOrNull(p.depthIn ?? p.measurement?.depthIn);
      const shape = SHAPES.has(p.shape ?? p.measurement?.shape) ? p.shape ?? p.measurement.shape : "rect";
      const pieceType = PIECE_TYPES.has(p.pieceType ?? p.measurement?.pieceType)
        ? p.pieceType ?? p.measurement.pieceType
        : "counter";
      const evidenceIds = Array.isArray(p.evidenceIds)
        ? p.evidenceIds.map(String).filter((eid) => opts.evidenceIds.has(eid)).slice(0, 20)
        : [];
      if ((lengthIn == null || depthIn == null) && pieceType === "counter") {
        warnings.push({
          code: "MISSING_DIMENSION",
          severity: "approval_blocking",
          message: `Piece ${pid} is missing length or depth.`,
          roomId: id,
          pieceId: pid,
          blocking: true,
          estimatorActionRequired: true
        });
      }
      pieces.push({
        id: pid,
        label: String(p.label ?? "Piece").slice(0, 120),
        roomId: id,
        measurement: {
          lengthIn,
          depthIn,
          shape,
          pieceType,
          measuredSf: 0,
          evidenceIds
        },
        cutouts: Array.isArray(p.cutouts)
          ? p.cutouts.slice(0, 10).map((c) => ({
              type: String(c?.type ?? "other").slice(0, 40),
              label: c?.label != null ? String(c.label).slice(0, 80) : undefined,
              confidence: CONF.has(c?.confidence) ? c.confidence : undefined
            }))
          : [],
        notes: Array.isArray(p.notes) ? p.notes.map(String).slice(0, 10) : [],
        requiresEstimatorReview: Boolean(p.requiresEstimatorReview)
      });
    }
    const splashScope = SPLASH_SCOPES.has(room.backsplashScope) ? room.backsplashScope : null;
    rooms.push({
      id,
      name: String(room.name ?? "Room").slice(0, 120),
      roomType: room.roomType != null ? String(room.roomType).slice(0, 60) : undefined,
      sourcePages: Array.isArray(room.sourcePages)
        ? room.sourcePages.map(Number).filter((n) => n >= 1 && n <= opts.maxPages).slice(0, 20)
        : [1],
      confidence: CONF.has(room.confidence) ? room.confidence : "medium",
      pieces,
      measuredCountertopSf: 0,
      measuredBacksplashSf: 0,
      areaMeta: {
        areaId: `${id}-area`,
        areaLabel: String(room.name ?? "Room").slice(0, 120),
        backsplashScope: splashScope,
        backsplashLinearIn: dimOrNull(room.backsplashLinearIn),
        backsplashHeightIn: dimOrNull(room.backsplashHeightIn)
      }
    });
  }

  if (!rooms.length) {
    fail("PARTIAL_EXTRACTION", "No valid rooms survived geometry validation.");
  }

  for (const msg of Array.isArray(geometry.missingDimensions) ? geometry.missingDimensions : []) {
    warnings.push({
      code: "MISSING_DIMENSION",
      severity: "approval_blocking",
      message: String(msg).slice(0, 300),
      blocking: true,
      estimatorActionRequired: true
    });
  }
  for (const msg of Array.isArray(geometry.contradictions) ? geometry.contradictions : []) {
    warnings.push({
      code: "CONFLICTING_DIMENSION",
      severity: "approval_blocking",
      message: String(msg).slice(0, 300),
      blocking: true,
      estimatorActionRequired: true
    });
  }

  const totals = geometry.providerProposedTotals ?? {};
  const providerTotals = {
    providerProposedCountertopSf: numOrNull(totals.countertopSf ?? totals.countertopExactSf),
    providerProposedBacksplashSf: numOrNull(totals.backsplashSf ?? totals.backsplashExactSf),
    providerProposedCombinedSf: numOrNull(totals.combinedSf ?? totals.combinedExactSf)
  };

  return {
    pages: normalizePages(geometry.pages, opts.maxPages),
    rooms,
    providerTotals,
    confidence: CONF.has(geometry.confidence) ? geometry.confidence : "medium",
    warnings,
    unsupportedDowngraded: false
  };
}

function normalizePages(pages, maxPages) {
  if (!Array.isArray(pages) || !pages.length) {
    return [{ pageNumber: 1, role: "plan", notes: [] }];
  }
  return pages
    .slice(0, maxPages)
    .map((p, i) => ({
      pageNumber: Number(p?.pageNumber) || i + 1,
      role: ["plan", "elevation", "schedule", "other", "unknown"].includes(p?.role) ? p.role : "unknown",
      notes: Array.isArray(p?.notes) ? p.notes.map(String).slice(0, 10) : []
    }))
    .filter((p) => p.pageNumber >= 1 && p.pageNumber <= maxPages);
}

function normalizeWarnings(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).map((w) => ({
    code: String(w?.code ?? "PROVIDER_WARNING").slice(0, 80),
    severity: SEV.has(w?.severity) ? w.severity : "informational",
    message: String(w?.message ?? "Provider warning").slice(0, 400),
    blocking: w?.severity === "approval_blocking",
    estimatorActionRequired: w?.severity !== "informational",
    roomId: w?.roomId ?? null,
    pieceId: w?.pieceId ?? null,
    field: w?.field ?? null
  }));
}

function normalizeBbox(b) {
  if (!b || typeof b !== "object") return null;
  const x = Number(b.x);
  const y = Number(b.y);
  const w = Number(b.w ?? b.width);
  const h = Number(b.h ?? b.height);
  if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  return { x, y, w, h };
}

function dimOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fail(code, message) {
  const err = new Error(message);
  err.statusCode = 422;
  err.code = code;
  throw err;
}
