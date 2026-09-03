/**
 * Quote Flow — estimator Starting Configuration.
 *
 * Distinct from customer-requested selections:
 *   Customer requested → resolved → estimator confirmed request
 *   → seeds Starting Configuration (editable)
 *   → Set Scope applies Starting Configuration into official estimate scope
 *
 * Starting Configuration is what Internal Estimate opens with and what future
 * Digital Estimate will show as the initial included configuration.
 * It is NOT "allowed customer choices."
 */

import {
  applyConfirmedSelectionsToScope,
  matchRoomHintToRooms,
  normalizeMaterialGroupLabel,
  REQUESTED_SELECTIONS_VERSION
} from "./quoteFlowRequestedSelections.mjs";
import { sanitizeQueueSourceText } from "./quoteFlowQueueSourceMeta.mjs";

export const STARTING_CONFIGURATION_VERSION = "qf_starting_config_v1";

export function emptyStartingConfiguration() {
  return {
    version: STARTING_CONFIGURATION_VERSION,
    status: "draft",
    updatedAt: null,
    seededFromRequestedSelectionIds: [],
    seededAt: null,
    quote: {
      materialGroup: null,
      colorName: "",
      colorTbd: false,
      edgeProfileToken: null
    },
    rooms: [],
    addOns: {},
    warnings: [],
    userSet: false
  };
}

/**
 * Build a starting-configuration draft from estimator-confirmed requested selections.
 * Does not mutate official estimate scope.
 */
export function seedStartingConfigurationFromConfirmed(requestedSelections, opts = {}) {
  const roomsFromTakeoff = Array.isArray(opts.roomsFromTakeoff) ? opts.roomsFromTakeoff : [];
  const confirmed = (Array.isArray(requestedSelections?.items) ? requestedSelections.items : []).filter(
    (i) => i?.status === "confirmed"
  );
  const base = emptyStartingConfiguration();
  if (!confirmed.length) {
    return { ...base, status: "empty", updatedAt: new Date().toISOString() };
  }

  // Reuse confirmed→scope mapping as the field authority, then project into starting shape.
  const projected = applyConfirmedSelectionsToScope(
    {
      rooms: roomsFromTakeoff.map((r) => ({
        id: r.id,
        name: r.name,
        pieces: Array.isArray(r.pieces) ? r.pieces : []
      })),
      addOns: {}
    },
    { items: confirmed },
    { roomsFromTakeoff }
  );

  const roomConfigs = (projected.rooms || []).map((r) => ({
    roomId: r.id,
    roomName: r.name || null,
    materialGroup: r.materialGroupOverride || null,
    colorName: r.colorNameOverride || null,
    colorTbd: !r.colorNameOverride && Boolean(r.materialGroupOverride),
    includeBacksplash: r.includeBacksplash,
    backsplashHeightIn: r.backsplashHeightIn ?? null,
    backsplashHeightMode: r.backsplashHeightMode ?? null,
    edgeProfileToken: projected.edgeProfileToken || null
  }));

  return {
    version: STARTING_CONFIGURATION_VERSION,
    status: "draft",
    updatedAt: new Date().toISOString(),
    seededFromRequestedSelectionIds: confirmed.map((i) => i.id),
    seededAt: new Date().toISOString(),
    quote: {
      materialGroup: normalizeMaterialGroupLabel(projected.materialGroup) || null,
      colorName: sanitizeQueueSourceText(projected.colorName, 120) || "",
      colorTbd: projected.colorTbd === true,
      edgeProfileToken: projected.edgeProfileToken || null
    },
    rooms: roomConfigs,
    addOns: projected.addOns && typeof projected.addOns === "object" ? { ...projected.addOns } : {},
    warnings: Array.isArray(projected.customerRequestedWarnings)
      ? projected.customerRequestedWarnings
      : [],
    userSet: false,
    sourceRequestedVersion: requestedSelections?.extractionVersion || REQUESTED_SELECTIONS_VERSION
  };
}

/**
 * Merge estimator patch onto starting configuration without wiping unrelated fields.
 */
export function patchStartingConfiguration(existing, patch = {}, actorUserId = null) {
  const base =
    existing && typeof existing === "object" ? { ...existing } : emptyStartingConfiguration();
  const p = patch && typeof patch === "object" ? patch : {};
  const quote = {
    ...(base.quote && typeof base.quote === "object" ? base.quote : {}),
    ...(p.quote && typeof p.quote === "object" ? p.quote : {})
  };
  if (quote.materialGroup != null) {
    quote.materialGroup = normalizeMaterialGroupLabel(quote.materialGroup);
  }
  if (quote.colorName != null) {
    quote.colorName = sanitizeQueueSourceText(quote.colorName, 120) || "";
  }
  if (p.colorTbd === true || quote.colorTbd === true) {
    quote.colorTbd = true;
  } else if (p.colorTbd === false || quote.colorTbd === false) {
    quote.colorTbd = false;
  }

  let rooms = Array.isArray(base.rooms) ? base.rooms.map((r) => ({ ...r })) : [];
  if (Array.isArray(p.rooms)) {
    const byId = new Map(rooms.map((r) => [String(r.roomId), { ...r }]));
    for (const row of p.rooms) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.roomId || "").trim();
      if (!id) continue;
      const prev = byId.get(id) || { roomId: id };
      byId.set(id, {
        ...prev,
        ...row,
        roomId: id,
        materialGroup:
          row.materialGroup != null
            ? normalizeMaterialGroupLabel(row.materialGroup)
            : prev.materialGroup,
        colorName:
          row.colorName != null
            ? sanitizeQueueSourceText(row.colorName, 120)
            : prev.colorName
      });
    }
    rooms = [...byId.values()];
  }

  const addOns = {
    ...(base.addOns && typeof base.addOns === "object" ? base.addOns : {}),
    ...(p.addOns && typeof p.addOns === "object" ? p.addOns : {})
  };

  return {
    ...base,
    ...p,
    version: STARTING_CONFIGURATION_VERSION,
    status: p.status || base.status || "draft",
    quote,
    rooms,
    addOns,
    warnings: Array.isArray(p.warnings) ? p.warnings : base.warnings || [],
    userSet: true,
    updatedAt: new Date().toISOString(),
    updatedByUserId: actorUserId || base.updatedByUserId || null
  };
}

/**
 * Apply Starting Configuration into official estimate scope (Set Scope authority).
 * Raw/unconfirmed AI suggestions must never call this — only estimator starting config.
 */
export function applyStartingConfigurationToScope(scope, startingConfiguration, opts = {}) {
  const cfg =
    startingConfiguration && typeof startingConfiguration === "object"
      ? startingConfiguration
      : null;
  if (!cfg || cfg.status === "empty") {
    return scope && typeof scope === "object" ? { ...scope } : {};
  }

  const base = scope && typeof scope === "object" ? { ...scope } : {};
  const rooms = Array.isArray(base.rooms) ? base.rooms.map((r) => ({ ...r })) : [];
  const addOns = {
    ...(base.addOns && typeof base.addOns === "object" ? base.addOns : {}),
    ...(cfg.addOns && typeof cfg.addOns === "object" ? cfg.addOns : {})
  };
  const quote = cfg.quote && typeof cfg.quote === "object" ? cfg.quote : {};

  for (const row of Array.isArray(cfg.rooms) ? cfg.rooms : []) {
    const idx = rooms.findIndex((r) => String(r.id) === String(row.roomId));
    if (idx < 0) continue;
    rooms[idx] = {
      ...rooms[idx],
      ...(row.materialGroup ? { materialGroupOverride: row.materialGroup } : {}),
      ...(row.colorName ? { colorNameOverride: row.colorName } : {}),
      ...(row.includeBacksplash != null ? { includeBacksplash: row.includeBacksplash } : {}),
      ...(row.backsplashHeightIn != null ? { backsplashHeightIn: row.backsplashHeightIn } : {}),
      ...(row.backsplashHeightMode ? { backsplashHeightMode: row.backsplashHeightMode } : {})
    };
    if (row.edgeProfileToken || quote.edgeProfileToken) {
      const token = row.edgeProfileToken || quote.edgeProfileToken;
      const pieces = Array.isArray(rooms[idx].pieces)
        ? rooms[idx].pieces.map((p) => ({ ...p, edgeProfileToken: token }))
        : rooms[idx].pieces;
      rooms[idx] = { ...rooms[idx], pieces };
    }
  }

  // Quote-level seeds when room list empty or for header fields.
  let materialGroup = quote.materialGroup || base.materialGroup || null;
  let colorName = quote.colorName != null ? quote.colorName : base.colorName || "";
  let colorTbd = quote.colorTbd === true;
  let edgeProfileToken = quote.edgeProfileToken || base.edgeProfileToken || null;

  if (edgeProfileToken) {
    for (let i = 0; i < rooms.length; i += 1) {
      if (Array.isArray(rooms[i].pieces)) {
        rooms[i] = {
          ...rooms[i],
          pieces: rooms[i].pieces.map((p) => ({
            ...p,
            edgeProfileToken: p.edgeProfileToken || edgeProfileToken
          }))
        };
      }
    }
  }

  const warnings = [
    ...(Array.isArray(base.customerRequestedWarnings) ? base.customerRequestedWarnings : []),
    ...(Array.isArray(cfg.warnings) ? cfg.warnings : [])
  ];

  return {
    ...base,
    rooms,
    addOns,
    ...(materialGroup ? { materialGroup } : {}),
    colorName: colorName || "",
    colorTbd,
    ...(edgeProfileToken ? { edgeProfileToken } : {}),
    quoteFlowStartingConfiguration: {
      version: STARTING_CONFIGURATION_VERSION,
      appliedAt: new Date().toISOString(),
      status: "promoted",
      snapshot: cfg
    },
    customerRequestedWarnings: warnings
  };
}

/**
 * Prefer existing estimator-edited starting config; otherwise seed from confirmed.
 */
export function resolveStartingConfigurationForSetScope({
  existingStartingConfiguration,
  requestedSelections,
  roomsFromTakeoff
}) {
  const existing =
    existingStartingConfiguration && typeof existingStartingConfiguration === "object"
      ? existingStartingConfiguration
      : null;
  if (existing?.userSet === true || (existing?.status === "draft" && existing?.seededAt)) {
    // Keep estimator work; optionally refresh warnings only.
    return existing;
  }
  return seedStartingConfigurationFromConfirmed(requestedSelections, { roomsFromTakeoff });
}

export function mergeStartingConfigurationSafe(prevCfg, nextCfg) {
  const prev = prevCfg && typeof prevCfg === "object" ? prevCfg : null;
  const next = nextCfg && typeof nextCfg === "object" ? nextCfg : null;
  if (!prev) return next;
  if (!next) return prev;
  // Estimator-edited starting config always wins across AI/email reruns.
  if (prev.userSet === true) return prev;
  if (next.userSet === true) return next;
  if (prev.seededAt && !next.seededAt) return prev;
  return { ...prev, ...next };
}

export function summarizeStartingConfiguration(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : null;
  if (!c) return { present: false, roomCount: 0, userSet: false };
  return {
    present: true,
    status: c.status || "draft",
    userSet: c.userSet === true,
    materialGroup: c.quote?.materialGroup || null,
    colorName: c.quote?.colorName || null,
    colorTbd: c.quote?.colorTbd === true,
    edgeProfileToken: c.quote?.edgeProfileToken || null,
    roomCount: Array.isArray(c.rooms) ? c.rooms.length : 0,
    addOnKeys: Object.keys(c.addOns || {}),
    warningCount: Array.isArray(c.warnings) ? c.warnings.length : 0
  };
}

// Re-export for callers that seed room lists from takeoff room hints.
export { matchRoomHintToRooms };
