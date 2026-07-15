/**
 * Workspace-level takeoff provenance (Phase 4B.4B.3).
 * Pure helpers — resolve simulated vs live labels for topbar, isolation banner, and warnings.
 */

export const TAKEOFF_WORKSPACE_MODE_SIMULATED = "simulated";
export const TAKEOFF_WORKSPACE_MODE_LIVE = "live";

/**
 * @typedef {"simulated"|"live"} TakeoffWorkspaceMode
 */

/**
 * Resolve the mode that should drive topbar/isolation banner copy.
 *
 * Rules:
 * 1. When a run is selected for inspection (including failed), use that run’s provider mode.
 * 2. Otherwise use the explicit provider selector (covers pre-run / empty history).
 * 3. Default to simulated.
 *
 * @param {{
 *   providerSelection?: string|null,
 *   selectedRun?: { provider?: { mode?: string|null }|null, providerMode?: string|null }|null
 * }} ctx
 * @returns {TakeoffWorkspaceMode}
 */
export function resolveTakeoffWorkspaceMode(ctx = {}) {
  const fromRun = normalizeMode(ctx.selectedRun?.provider?.mode ?? ctx.selectedRun?.providerMode);
  if (fromRun) return fromRun;
  const fromSelection = normalizeMode(ctx.providerSelection);
  if (fromSelection) return fromSelection;
  return TAKEOFF_WORKSPACE_MODE_SIMULATED;
}

/**
 * @param {TakeoffWorkspaceMode|string|null|undefined} mode
 * @returns {string}
 */
export function takeoffTopbarChipLabel(mode) {
  return normalizeMode(mode) === TAKEOFF_WORKSPACE_MODE_LIVE
    ? "LAB · live Gemini takeoff"
    : "LAB · simulated takeoff";
}

/**
 * Isolation banner disclosure lines for the takeoff workspace.
 * @param {TakeoffWorkspaceMode|string|null|undefined} mode
 * @returns {{ title: string, lines: string[], isLive: boolean }}
 */
export function takeoffIsolationBannerCopy(mode) {
  if (normalizeMode(mode) === TAKEOFF_WORKSPACE_MODE_LIVE) {
    return {
      isLive: true,
      title: "Live Gemini takeoff",
      lines: [
        "Isolated loopback only",
        "Approved synthetic fixtures only",
        "Attachment bytes sent only after acknowledgment + Run",
        "No production connection",
        "No pricing",
        "No Internal Estimate / Quote Library"
      ]
    };
  }
  return {
    isLive: false,
    title: "Simulated takeoff",
    lines: [
      "Attachment contents not read",
      "No Gemini",
      "No production connection",
      "No pricing",
      "No Internal Estimate / Quote Library"
    ]
  };
}

/**
 * In-workspace takeoff mode banner (same rules as isolation; slightly denser copy).
 * @param {TakeoffWorkspaceMode|string|null|undefined} mode
 */
export function takeoffWorkspaceBannerCopy(mode) {
  if (normalizeMode(mode) === TAKEOFF_WORKSPACE_MODE_LIVE) {
    return {
      isLive: true,
      title: "Live Gemini takeoff",
      lines: [
        "Isolated loopback only",
        "Approved synthetic fixtures only",
        "Attachment bytes sent only after acknowledgment + Run",
        "No production connection · no pricing · no Internal Estimate / Quote Library"
      ]
    };
  }
  return {
    isLive: false,
    title: "Simulated takeoff",
    lines: [
      "Attachment contents not read",
      "No Gemini",
      "No production connection",
      "Evidence is lab fixture geometry — not live AI"
    ]
  };
}

/**
 * Assert live-mode copy never claims bytes unread / no Gemini.
 * @param {{ title: string, lines: string[] }} copy
 */
export function liveBannerClaimsAreHonest(copy) {
  const blob = `${copy.title} ${copy.lines.join(" ")}`.toLowerCase();
  return (
    !blob.includes("attachment contents not read") &&
    !/\bno gemini\b/.test(blob) &&
    !blob.includes("simulated")
  );
}

/**
 * Assert simulated-mode copy retains unread / no Gemini disclosures.
 * @param {{ title: string, lines: string[] }} copy
 */
export function simulatedBannerClaimsAreHonest(copy) {
  const blob = `${copy.title} ${copy.lines.join(" ")}`.toLowerCase();
  return (
    blob.includes("simulated") &&
    blob.includes("attachment contents not read") &&
    blob.includes("no gemini")
  );
}

/**
 * @param {string|null|undefined} value
 * @returns {TakeoffWorkspaceMode|null}
 */
function normalizeMode(value) {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (v === TAKEOFF_WORKSPACE_MODE_LIVE) return TAKEOFF_WORKSPACE_MODE_LIVE;
  if (v === TAKEOFF_WORKSPACE_MODE_SIMULATED) return TAKEOFF_WORKSPACE_MODE_SIMULATED;
  return null;
}
