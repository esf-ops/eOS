/**
 * Parent ↔ Takeoff readiness contract for Consolidated Takeoff Review.
 * Used by Estimate Record iframe embedding and local review harnesses.
 */

export const TAKEOFF_REVIEW_READY = "TAKEOFF_REVIEW_READY";
export const TAKEOFF_REVIEW_DRAFT_SAVED = "TAKEOFF_REVIEW_DRAFT_SAVED";
export const TAKEOFF_WATERFALL_CHANGED = "TAKEOFF_WATERFALL_CHANGED";
/** iframe → Quote Flow parent: worksheet dirty flag for modal close guards. */
export const TAKEOFF_REVIEW_DIRTY = "eliteos-takeoff-review-dirty";
/** Quote Flow parent → iframe: request current reviewed measurements for Set Scope. */
export const QUOTE_FLOW_REQUEST_SET_SCOPE = "eliteos-quote-flow-request-set-scope";
/** Quote Flow iframe → parent: reviewed takeoffResult ready for Set Scope. */
export const QUOTE_FLOW_SET_SCOPE_PAYLOAD = "eliteos-quote-flow-set-scope-payload";
/** Quote Flow parent → iframe: trigger Save draft from modal sticky actions. */
export const QUOTE_FLOW_REQUEST_SAVE_DRAFT = "eliteos-quote-flow-request-save-draft";

/**
 * @param {object} draft
 * @returns {{ roomCount: number, pieceCount: number, waterfalls: Array<object> }}
 */
export function summarizeTakeoffDraftForReady(draft) {
  const rooms = Array.isArray(draft?.rooms) ? draft.rooms : [];
  let pieceCount = 0;
  /** @type {Array<object>} */
  const waterfalls = [];
  for (const room of rooms) {
    for (const area of Array.isArray(room.areas) ? room.areas : []) {
      for (const run of Array.isArray(area.runs) ? area.runs : []) {
        if (!run || run.included === false) continue;
        pieceCount += 1;
        const panels = Array.isArray(run.waterfallPanels) ? run.waterfallPanels : [];
        if (panels.length) {
          for (const p of panels) {
            waterfalls.push({
              id: String(p.id || `${run.id}-${p.side || "left"}`),
              roomId: String(room.id || ""),
              roomName: String(room.name || "Room"),
              pieceId: String(run.id || ""),
              pieceLabel: String(run.label || "Piece"),
              side: String(p.side || "left"),
              panelWidthIn: Number(p.panelWidthIn) || Number(run.depthIn) || 0,
              panelHeightIn: Number(p.panelHeightIn) || 0,
              quantity: Number(p.quantity) || 1,
              includedInScope: p.included !== false
            });
          }
        } else if (run.waterfallSegmentLengthsIn && typeof run.waterfallSegmentLengthsIn === "object") {
          for (const [side, height] of Object.entries(run.waterfallSegmentLengthsIn)) {
            const h = Number(height);
            if (!(h > 0)) continue;
            waterfalls.push({
              id: `${run.id}-${side}`,
              roomId: String(room.id || ""),
              roomName: String(room.name || "Room"),
              pieceId: String(run.id || ""),
              pieceLabel: String(run.label || "Piece"),
              side: String(side),
              panelWidthIn: Number(run.depthIn) || 36,
              panelHeightIn: h,
              quantity: 1,
              includedInScope: true
            });
          }
        }
      }
    }
  }
  return { roomCount: rooms.length, pieceCount, waterfalls };
}

/**
 * Resolve open/exposed edge LF from a takeoff run / piece for Set Scope payloads.
 * @param {object|null|undefined} run
 */
export function resolveRunOpenEdgeLf(run) {
  if (!run || typeof run !== "object") return 0;
  const candidates = [
    run.openEdgeLf,
    run.exposedEdgeLf,
    run.exposedEdgeLinearFeet,
    run.openEdgeLinearFeet,
    run.edgeLinearFeet,
    run.edgeLf,
    run.finishedEdgeLf
  ];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const fe = run.finishedEdge;
  if (fe && typeof fe === "object") {
    const totalIn = Number(fe.totalFinishedEdgeLengthIn);
    if (Number.isFinite(totalIn) && totalIn > 0) {
      return Math.round((totalIn / 12) * 100) / 100;
    }
    const lfAlias = Number(fe.totalFinishedEdgeLengthLf ?? fe.linearFeet ?? fe.total);
    if (Number.isFinite(lfAlias) && lfAlias > 0) {
      return Math.round(lfAlias * 100) / 100;
    }
  }
  return 0;
}

/**
 * Stamp canonical openEdgeLf onto every run before Quote Flow Set Scope postMessage.
 * Preserves finishedEdge and other legacy fields.
 * @param {object|null|undefined} draft
 */
export function stampOpenEdgeLfOnTakeoffDraft(draft) {
  if (!draft || typeof draft !== "object") return draft;
  const rooms = Array.isArray(draft.rooms) ? draft.rooms : [];
  return {
    ...draft,
    rooms: rooms.map((room) => {
      if (!room || typeof room !== "object") return room;
      const areas = Array.isArray(room.areas) ? room.areas : [];
      return {
        ...room,
        areas: areas.map((area) => {
          if (!area || typeof area !== "object") return area;
          const runs = Array.isArray(area.runs) ? area.runs : [];
          return {
            ...area,
            runs: runs.map((run) => {
              if (!run || typeof run !== "object") return run;
              const openEdgeLf = resolveRunOpenEdgeLf(run);
              const fe =
                run.finishedEdge && typeof run.finishedEdge === "object"
                  ? { ...run.finishedEdge }
                  : null;
              return {
                ...run,
                openEdgeLf,
                finishedEdgeLf: openEdgeLf,
                exposedEdgeLf: openEdgeLf,
                ...(fe
                  ? {
                      finishedEdge: {
                        ...fe,
                        totalFinishedEdgeLengthIn:
                          Number.isFinite(Number(fe.totalFinishedEdgeLengthIn)) &&
                          Number(fe.totalFinishedEdgeLengthIn) >= 0
                            ? Number(fe.totalFinishedEdgeLengthIn)
                            : Math.round(openEdgeLf * 12 * 100) / 100
                      }
                    }
                  : openEdgeLf > 0
                    ? {
                        finishedEdge: {
                          totalFinishedEdgeLengthIn: Math.round(openEdgeLf * 12 * 100) / 100,
                          source: "quote_flow_set_scope"
                        }
                      }
                    : {})
              };
            })
          };
        })
      };
    })
  };
}

/**
 * Resolve postMessage target origin for parent Estimate Studio.
 * @param {{ localReview?: boolean }} [opts]
 */
export function resolveTakeoffParentOrigin(opts = {}) {
  // Prefer embedding parent (Quote Flow / Estimate Studio) so postMessage reaches the iframe host.
  try {
    if (typeof document !== "undefined" && document.referrer) {
      return new URL(document.referrer).origin;
    }
  } catch {
    /* ignore */
  }
  try {
    const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
    const configured = String(
      env.VITE_HEAD_URL_ELITE100_QUOTE_FLOW ||
        env.VITE_HEAD_URL_ELITE100_ESTIMATE_STUDIO ||
        env.VITE_HEAD_URL_ESTIMATE_STUDIO ||
        ""
    ).trim();
    if (configured) return new URL(configured).origin;
  } catch {
    /* ignore */
  }
  if (opts.localReview) return "*";
  try {
    const isDev = Boolean(import.meta?.env?.DEV);
    if (isDev) {
      try {
        if (new URLSearchParams(window.location.search).get("quoteFlowSetScope") === "1") {
          return "http://localhost:5197";
        }
      } catch {
        /* ignore */
      }
      return "http://localhost:5191";
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} type
 * @param {object} payload
 * @param {{ localReview?: boolean, takeoffJobId?: string|null }} [opts]
 */
export function postTakeoffParentMessage(type, payload, opts = {}) {
  try {
    if (typeof window === "undefined" || !window.parent || window.parent === window) return false;
    // Quote Flow Set Scope / dirty / saved signals must reach the embedding parent.
    // Parent validates event.origin against the Takeoff allowlist.
    let origin =
      type === QUOTE_FLOW_SET_SCOPE_PAYLOAD ||
      type === TAKEOFF_REVIEW_DIRTY ||
      type === TAKEOFF_REVIEW_DRAFT_SAVED
        ? "*"
        : resolveTakeoffParentOrigin({ localReview: opts.localReview });
    if (!origin) return false;
    window.parent.postMessage(
      {
        type,
        source: "consolidated-review",
        takeoffJobId: opts.takeoffJobId || null,
        ...payload
      },
      origin
    );
    return true;
  } catch {
    return false;
  }
}

export function localReviewStorageKey(takeoffJobId, revisionNumber) {
  return `eliteos-local-review-takeoff:${String(takeoffJobId || "job")}:r${String(revisionNumber || "1")}`;
}

export function loadLocalReviewDraft(takeoffJobId, revisionNumber) {
  try {
    const raw = sessionStorage.getItem(localReviewStorageKey(takeoffJobId, revisionNumber));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalReviewDraft(takeoffJobId, revisionNumber, draft) {
  try {
    sessionStorage.setItem(
      localReviewStorageKey(takeoffJobId, revisionNumber),
      JSON.stringify(draft)
    );
    return true;
  } catch {
    return false;
  }
}

/** Server-style waterfall price from physical dims + commercial options (review/tests). */
export function estimateWaterfallServerPrice(args = {}) {
  const width = Number(args.panelWidthIn) || 0;
  const height = Number(args.panelHeightIn) || 0;
  const qty = Math.max(1, Number(args.quantity) || 1);
  const miterKey = String(args.miterKey || "2-3in");
  const polish = Boolean(args.backsidePolish);
  const miterRates = { "2-3in": 65, "4in": 70, "5in": 75, "6in": 80 };
  const measuredSf = Math.round(((width * height) / 144) * 100) / 100;
  const billedSf = Math.ceil(measuredSf);
  const material = billedSf * 45; // illustrative room rate for review only
  const labor = 600 * qty;
  const polishAmt = polish ? 225 * qty : 0;
  const miterLf = Math.round((height / 12) * 100) / 100;
  const miter = Math.round(miterLf * (miterRates[miterKey] || 65) * 100) / 100;
  return Math.round((material + labor + polishAmt + miter) * 100) / 100;
}
