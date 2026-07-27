/**
 * Semantic Takeoff draft equality — dirty comparison + unchanged Save no-op.
 * Pure helpers; no I/O.
 *
 * Includes material editable fields; excludes volatile server/UI metadata.
 * Normalizes boolean backsplash false/null/undefined to a stable false.
 */

const VOLATILE_KEYS = new Set([
  "id",
  "resultId",
  "createdAt",
  "updatedAt",
  "savedAt",
  "clientMutationRevision",
  "requestId",
  "correctionId",
  "saveStatus",
  "schemaVersion",
  "status",
  "_meta",
  "_corrections",
  "qaGate",
  "validationDiagnostics",
  "computedMeasurements",
  "importPlan",
  "aiProvidedTotals"
]);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function asBool(value) {
  return value === true;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function asNumOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function asStr(value) {
  return value == null ? "" : String(value);
}

/**
 * Canonical finished-edge sides for compare.
 * @param {object|null|undefined} finishedEdge
 */
function normalizeFinishedEdge(finishedEdge) {
  if (!finishedEdge || typeof finishedEdge !== "object") return null;
  const sides = finishedEdge.exposedSides && typeof finishedEdge.exposedSides === "object"
    ? finishedEdge.exposedSides
    : {};
  return {
    finishedEdgeConfirmed: asBool(finishedEdge.finishedEdgeConfirmed ?? finishedEdge.approved),
    approved: asBool(finishedEdge.approved ?? finishedEdge.finishedEdgeConfirmed),
    totalFinishedEdgeLengthIn: asNumOrNull(finishedEdge.totalFinishedEdgeLengthIn),
    frontIn: asNumOrNull(finishedEdge.frontIn),
    backIn: asNumOrNull(finishedEdge.backIn),
    leftIn: asNumOrNull(finishedEdge.leftIn),
    rightIn: asNumOrNull(finishedEdge.rightIn),
    exposedSides: {
      front: asBool(sides.front),
      back: asBool(sides.back),
      left: asBool(sides.left),
      right: asBool(sides.right)
    },
    source: asStr(finishedEdge.source) || null,
    approvalSource: asStr(finishedEdge.approvalSource) || null
  };
}

/**
 * @param {object} run
 */
function normalizeRun(run) {
  if (!run || typeof run !== "object") return null;
  const eligible = asBool(run.backsplashEligible);
  const geom =
    run.backsplashGeometry && typeof run.backsplashGeometry === "object"
      ? run.backsplashGeometry
      : null;
  return {
    id: asStr(run.id),
    label: asStr(run.label),
    pieceType: asStr(run.pieceType || (run.isBacksplash ? "splash" : "counter")),
    lengthIn: asNumOrNull(run.lengthIn),
    depthIn: asNumOrNull(run.depthIn),
    quantity: asNumOrNull(run.quantity) ?? 1,
    included: run.included === false ? false : true,
    notes: asStr(run.notes),
    pieceTopology: asStr(run.pieceTopology) || null,
    attachedSide: asStr(run.attachedSide) || null,
    cutouts: Array.isArray(run.cutouts)
      ? run.cutouts.map((c) => ({
          type: asStr(c?.type),
          count: asNumOrNull(c?.count) ?? 0,
          notes: asStr(c?.notes)
        }))
      : [],
    backsplashEligible: eligible,
    backsplashEligibleLengthIn: eligible
      ? asNumOrNull(run.backsplashEligibleLengthIn) ?? asNumOrNull(run.lengthIn) ?? 0
      : 0,
    backsplashEligibilitySource: eligible
      ? asStr(run.backsplashEligibilitySource) || "estimator_confirmed"
      : asStr(run.backsplashEligibilitySource) || null,
    backsplashGeometry: geom
      ? {
          backsplashEligible: asBool(geom.backsplashEligible ?? eligible),
          backsplashEligibleLengthIn: asNumOrNull(geom.backsplashEligibleLengthIn),
          backsplashEdge: asStr(geom.backsplashEdge) || "back"
        }
      : eligible
        ? {
            backsplashEligible: true,
            backsplashEligibleLengthIn:
              asNumOrNull(run.backsplashEligibleLengthIn) ?? asNumOrNull(run.lengthIn) ?? 0,
            backsplashEdge: "back"
          }
        : null,
    finishedEdge: normalizeFinishedEdge(run.finishedEdge),
    _estimatorOwned: asBool(run._estimatorOwned || run._manual),
    _manual: asBool(run._manual)
  };
}

/**
 * @param {object} area
 */
function normalizeArea(area) {
  if (!area || typeof area !== "object") return null;
  const runs = Array.isArray(area.runs) ? area.runs.map(normalizeRun).filter(Boolean) : [];
  return {
    id: asStr(area.id),
    label: asStr(area.label),
    backsplashIncluded: asBool(area.backsplashIncluded),
    backsplashHeightIn: asNumOrNull(area.backsplashHeightIn),
    backsplashScope: asStr(area.backsplashScope) || null,
    runs
  };
}

/**
 * @param {object} room
 */
function normalizeRoom(room) {
  if (!room || typeof room !== "object") return null;
  const areas = Array.isArray(room.areas)
    ? room.areas.map(normalizeArea).filter(Boolean)
    : [];
  const runs = Array.isArray(room.runs) ? room.runs.map(normalizeRun).filter(Boolean) : [];
  const pieces = Array.isArray(room.pieces)
    ? room.pieces.map(normalizeRun).filter(Boolean)
    : [];
  return {
    id: asStr(room.id),
    name: asStr(room.name),
    roomType: asStr(room.roomType),
    _estimatorOwned: asBool(room._estimatorOwned || room._manual),
    _manual: asBool(room._manual),
    areas,
    runs,
    pieces
  };
}

/**
 * Canonical draft for dirty / no-op equality (stable key order via JSON.stringify).
 * @param {unknown} takeoff
 */
export function normalizeTakeoffDraftForCompare(takeoff) {
  if (!takeoff || typeof takeoff !== "object") return null;
  const rooms = Array.isArray(takeoff.rooms)
    ? takeoff.rooms.map(normalizeRoom).filter(Boolean)
    : [];
  return { rooms };
}

/**
 * Stable fingerprint string for semantic draft compare.
 * @param {unknown} takeoff
 */
export function takeoffDraftCompareFingerprint(takeoff) {
  return JSON.stringify(normalizeTakeoffDraftForCompare(takeoff));
}

/**
 * @param {unknown} a
 * @param {unknown} b
 */
export function takeoffDraftsSemanticallyEqual(a, b) {
  return takeoffDraftCompareFingerprint(a) === takeoffDraftCompareFingerprint(b);
}

/**
 * Strip known volatile top-level keys from a shallow clone (diagnostics only).
 * @param {object} obj
 */
export function stripVolatileTakeoffKeys(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  for (const k of VOLATILE_KEYS) delete out[k];
  return out;
}
