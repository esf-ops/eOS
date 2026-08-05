/**
 * Client-side Estimates library grouping, filters, and labels.
 */

/**
 * @param {unknown} value
 */
function clean(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  if (/^unknown contact$/i.test(s)) return null;
  if (/^customer not identified$/i.test(s)) return null;
  if (/^project not named$/i.test(s)) return null;
  if (/^AAMk/i.test(s) && s.length > 24) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return null;
  return s;
}

/**
 * @param {string|null|undefined} filename
 */
export function filenameWithoutExtension(filename) {
  const raw = clean(filename);
  if (!raw) return null;
  return raw.replace(/\.(pdf|png|jpe?g|heic|webp|svg)$/i, "").trim() || raw;
}

/**
 * @param {object} item
 */
export function resolveEstimateDisplayName(item = {}) {
  const scope = item.scope && typeof item.scope === "object" ? item.scope : {};
  return (
    clean(item.estimateName) ||
    clean(item.displayName) ||
    clean(scope.projectName) ||
    clean(scope.quoteFlowEstimateName) ||
    clean(item.projectName) ||
    clean(item.subject) ||
    filenameWithoutExtension(item.planFilename || scope.planFilename) ||
    clean(item.customerName) ||
    clean(item.accountName) ||
    "Untitled estimate"
  );
}

/**
 * @param {object} item
 */
export function resolveEstimateCustomer(item = {}) {
  return clean(item.customerName) || clean(item.accountName) || null;
}

/**
 * @param {object} item
 */
export function resolveEstimateSource(item = {}) {
  const key = String(item.scopeSource?.key || item.scope?.source || "").toLowerCase();
  if (item.scopeSource?.label) return item.scopeSource;
  if (key.includes("manual")) return { key: "manual", label: "Manual scope" };
  if (key.includes("ai") || key.includes("takeoff") || item.takeoffJobId || item.sourceTakeoffResultId) {
    return { key: "ai_takeoff", label: "AI Takeoff" };
  }
  return { key: "unknown", label: "Unknown" };
}

/**
 * @param {string|null|undefined} iso
 */
export function formatEstimateTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

/**
 * @param {string|null|undefined} iso
 * @param {number} [withinMs]
 */
export function isRecentlyUpdated(iso, withinMs = 7 * 24 * 60 * 60 * 1000) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= withinMs;
}

/**
 * @param {object[]} items
 */
export function computeEstimateStats(items = []) {
  const list = Array.isArray(items) ? items : [];
  let aiSourced = 0;
  let manual = 0;
  let unknownSource = 0;
  let recentlyUpdated = 0;
  let totalCountertopSf = 0;
  let totalOpenEdgeLf = 0;
  for (const item of list) {
    const source = resolveEstimateSource(item);
    if (source.key === "ai_takeoff") aiSourced += 1;
    else if (source.key === "manual") manual += 1;
    else unknownSource += 1;
    if (isRecentlyUpdated(item.updatedAt || item.createdAt)) recentlyUpdated += 1;
    const summary = item.scopeSummary && typeof item.scopeSummary === "object" ? item.scopeSummary : {};
    const sf = Number(summary.countertopSf);
    if (Number.isFinite(sf) && sf > 0) totalCountertopSf += sf;
    const lf = Number(summary.openEdgeLf);
    if (Number.isFinite(lf) && lf > 0) totalOpenEdgeLf += lf;
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    total: list.length,
    aiSourced,
    manual,
    unknownSource,
    recentlyUpdated,
    totalCountertopSf: round2(totalCountertopSf),
    totalOpenEdgeLf: round2(totalOpenEdgeLf)
  };
}

/**
 * @param {object} item
 */
export function resolveEstimateStatusKey(item = {}) {
  return String(item.status?.key || "").toLowerCase() || "scope_set";
}

/**
 * @param {object[]} items
 * @param {{ view?: string, source?: string, status?: string, search?: string, sort?: string }} [opts]
 */
export function filterAndSortEstimateItems(items = [], opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const q = String(opts.search || "")
    .trim()
    .toLowerCase();
  const view = String(opts.view || "all").toLowerCase();
  const sourceFilter = String(opts.source || "any").toLowerCase();
  const statusFilter = String(opts.status || "any").toLowerCase();
  const sort = String(opts.sort || "newest").toLowerCase();

  let next = list.filter((item) => {
    const source = resolveEstimateSource(item);
    const statusKey = resolveEstimateStatusKey(item);

    if (view === "ai" || view === "ai_sourced") {
      if (source.key !== "ai_takeoff") return false;
    } else if (view === "manual") {
      if (source.key !== "manual") return false;
    } else if (view === "recent" || view === "recently_updated") {
      if (!isRecentlyUpdated(item.updatedAt || item.createdAt)) return false;
    }

    if (sourceFilter === "ai" || sourceFilter === "ai_takeoff" || sourceFilter === "ai_sourced") {
      if (source.key !== "ai_takeoff") return false;
    } else if (sourceFilter === "manual") {
      if (source.key !== "manual") return false;
    } else if (sourceFilter === "unknown") {
      if (source.key !== "unknown") return false;
    }

    if (statusFilter !== "any" && statusFilter !== "") {
      if (statusKey !== statusFilter) return false;
    }

    if (!q) return true;
    const hay = [
      resolveEstimateDisplayName(item),
      resolveEstimateCustomer(item),
      item.subject,
      item.projectName,
      item.planFilename,
      source.label,
      item.status?.label
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  next = [...next].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
    return sort === "oldest" ? ta - tb : tb - ta;
  });

  return next;
}

/**
 * @param {object[]} items
 * @param {string} filter
 * @param {string} search
 */
export function filterEstimateItems(items = [], filter = "all", search = "") {
  return filterAndSortEstimateItems(items, { view: filter, search, sort: "newest" });
}


/**
 * Resolve open/exposed edge linear feet from common scope field names.
 * Canonical write path is piece.openEdgeLf (also syncs finishedEdgeLf).
 * @param {object|null|undefined} piece
 */
export function resolvePieceOpenEdgeLf(piece) {
  if (!piece || typeof piece !== "object") return 0;
  const candidates = [
    piece.openEdgeLf,
    piece.exposedEdgeLf,
    piece.exposedEdgeLinearFeet,
    piece.openEdgeLinearFeet,
    piece.edgeLinearFeet,
    piece.edgeLf,
    piece.finishedEdgeLf
  ];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const fe = piece.finishedEdge;
  if (fe && typeof fe === "object") {
    const inches = Number(fe.totalFinishedEdgeLengthIn);
    if (Number.isFinite(inches) && inches > 0) {
      return Math.round((inches / 12) * 100) / 100;
    }
    const lfAlias = Number(fe.totalFinishedEdgeLengthLf ?? fe.linearFeet ?? fe.total);
    if (Number.isFinite(lfAlias) && lfAlias > 0) {
      return Math.round(lfAlias * 100) / 100;
    }
  }
  return 0;
}

/**
 * Local SF + open-edge summary from rooms (mirrors presenter when detail is open).
 * @param {object[]|undefined} rooms
 */
export function summarizeRoomsLocal(rooms) {
  const list = Array.isArray(rooms) ? rooms : [];
  let roomCount = 0;
  let pieceCount = 0;
  let excludedPieceCount = 0;
  let countertopSf = 0;
  let backsplashSf = 0;
  let openEdgeLf = 0;
  for (const room of list) {
    if (!room) continue;
    const roomIncluded = room.included !== false;
    if (roomIncluded) roomCount += 1;
    for (const piece of Array.isArray(room.pieces) ? room.pieces : []) {
      if (!piece) continue;
      const included =
        piece.excluded !== true && piece.include !== false && piece.included !== false;
      if (!included) {
        excludedPieceCount += 1;
        continue;
      }
      if (!roomIncluded) continue;
      pieceCount += 1;
      const lengthIn = Number(piece.lengthIn) || 0;
      const depthIn = Number(piece.depthIn) || 0;
      const quantity = Math.max(1, Math.floor(Number(piece.quantity) || 1));
      const sf = lengthIn > 0 && depthIn > 0 ? (lengthIn * depthIn * quantity) / 144 : 0;
      const pieceType = String(piece.pieceType || "").toLowerCase();
      const isSplash =
        piece.includeBacksplash === true ||
        pieceType === "splash" ||
        pieceType === "backsplash" ||
        pieceType === "fhb";
      if (isSplash) backsplashSf += sf;
      else countertopSf += sf;
      openEdgeLf += resolvePieceOpenEdgeLf(piece) * quantity;
    }
    if (roomIncluded && room.includeBacksplash === true) {
      const h = Number(room.backsplashHeightIn) || 0;
      const len = Number(room.backsplashMeasuredLengthIn) || 0;
      if (h > 0 && len > 0) backsplashSf += (h * len) / 144;
    }
    if (roomIncluded && room.openEdgeLf != null && Number.isFinite(Number(room.openEdgeLf))) {
      // Room-level open edge is rare; include only when pieces did not carry LF.
      // Prefer piece-level totals already counted above.
    }
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    roomCount,
    pieceCount,
    excludedPieceCount,
    countertopSf: round2(countertopSf),
    backsplashSf: round2(backsplashSf),
    openEdgeLf: round2(openEdgeLf)
  };
}
