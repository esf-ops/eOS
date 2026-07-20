/**
 * Studio / Elite 100 Digital Estimate edge authority.
 *
 * Source of truth for Studio-priced edges is Estimate Scope
 * (`included` | `w_edge` | `d_edge`) — the same modes Studio pricing uses.
 * Do not invent a separate generic DE edge catalog with alternate labels.
 */

/** @typedef {"included"|"w_edge"|"d_edge"} StudioEdgeMode */

export const STUDIO_EDGE_MODES = Object.freeze([
  {
    mode: "included",
    optionToken: "included",
    label: "Included edges (eased)"
  },
  {
    mode: "w_edge",
    optionToken: "w_edge",
    label: "W edge"
  },
  {
    mode: "d_edge",
    optionToken: "d_edge",
    label: "D edge"
  }
]);

const MODE_BY_TOKEN = new Map(
  STUDIO_EDGE_MODES.flatMap((m) => [
    [m.mode, m],
    [m.optionToken, m],
    // Legacy DE seed used "eased" for included — map it back to authority.
    ...(m.mode === "included" ? [["eased", m]] : [])
  ])
);

/**
 * Normalize Studio / legacy DE edge tokens to a canonical Studio mode.
 * @param {unknown} raw
 * @returns {StudioEdgeMode}
 */
export function normalizeStudioEdgeMode(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!key || key === "eased" || key === "included_edges" || key === "included_edges_(eased)") {
    return "included";
  }
  if (key === "w" || key === "w-edge" || key === "waterfall") return "w_edge";
  if (key === "d" || key === "d-edge" || key === "dupont") return "d_edge";
  if (MODE_BY_TOKEN.has(key)) return /** @type {StudioEdgeMode} */ (MODE_BY_TOKEN.get(key).mode);
  return "included";
}

/**
 * Customer-facing label matching Estimate Scope / Studio pricing.
 * @param {unknown} raw
 */
export function studioEdgeDisplayLabel(raw) {
  const mode = normalizeStudioEdgeMode(raw);
  return STUDIO_EDGE_MODES.find((m) => m.mode === mode)?.label || "Included edges (eased)";
}

/**
 * Build estimator-approved edge option list for one room.
 * Always includes the original approved edge; alternatives only when explicitly approved.
 *
 * @param {{
 *   roomKey: string,
 *   groupId?: string|null,
 *   originalEdgeMode?: string|null,
 *   approvedEdgeModes?: string[]|null,
 *   baseOption: (row: object) => object
 * }} args
 */
export function buildAuthoritativeEdgeOptionDefinitions(args) {
  const roomKey = String(args.roomKey || "").trim();
  const groupId = args.groupId ?? null;
  const original = normalizeStudioEdgeMode(args.originalEdgeMode || "included");
  const approvedRaw = Array.isArray(args.approvedEdgeModes) ? args.approvedEdgeModes : null;
  /** @type {StudioEdgeMode[]} */
  let modes;
  if (approvedRaw && approvedRaw.length) {
    const set = new Set(approvedRaw.map(normalizeStudioEdgeMode));
    set.add(original);
    modes = STUDIO_EDGE_MODES.map((m) => m.mode).filter((m) => set.has(m));
  } else {
    // Edge choice enabled without explicit alternatives → original only.
    // Do not invent D/W/eased as a generic trio.
    modes = [original];
  }

  return modes.map((mode) => {
    const def = STUDIO_EDGE_MODES.find((m) => m.mode === mode) || STUDIO_EDGE_MODES[0];
    return args.baseOption({
      groupId,
      optionKey: `edge:${roomKey}:${def.optionToken}`,
      displayLabel: def.label,
      includedInBaseline: mode === original,
      defaultQty: mode === original ? 1 : 0,
      sellPrice: 0,
      pricingMode: "per_lf",
      compatibilityJson: {
        roomKey,
        role: "edge_selection",
        edgeMode: def.optionToken,
        originalEdgeMode: original,
        authoritative: true
      }
    });
  });
}

/**
 * Default approved alternatives when Studio enables the edge customer-choice group.
 * Uses the same governed Studio catalog as Estimate Scope (not Internal Estimate profiles).
 * @param {string|null|undefined} originalEdgeMode
 * @returns {StudioEdgeMode[]}
 */
export function defaultApprovedStudioEdgeModes(originalEdgeMode) {
  const original = normalizeStudioEdgeMode(originalEdgeMode);
  // Estimator opted into customer edge choice → allow the full Studio-governed set,
  // with the priced original marked as baseline by the builder.
  return STUDIO_EDGE_MODES.map((m) => m.mode).filter(
    (m) => m === original || m === "included" || m === "w_edge" || m === "d_edge"
  );
}
