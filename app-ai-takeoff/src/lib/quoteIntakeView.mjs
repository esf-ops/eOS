/**
 * Query-param view switching for AI Takeoff + Estimator Queue (no React Router).
 */

/**
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function trimOrNull(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

/**
 * @param {string} search
 * @param {{ uiEnabled?: boolean }} [options]
 */
export function parseTakeoffAppLocation(search, options = {}) {
  const uiEnabled = options.uiEnabled !== false;
  const params = new URLSearchParams(
    search.startsWith("?") || search.startsWith("#") ? search : `?${search}`
  );
  const rawView = String(params.get("view") ?? "")
    .trim()
    .toLowerCase();
  const wantIntake = rawView === "intake";
  const intakeCaseId = trimOrNull(params.get("intakeCaseId"));
  const takeoffJobId = trimOrNull(params.get("takeoffJobId"));

  if (wantIntake && uiEnabled) {
    return { view: "intake", intakeCaseId, takeoffJobId };
  }
  return { view: "workbench", intakeCaseId: null, takeoffJobId };
}

/**
 * @param {{
 *   view: "workbench"|"intake",
 *   intakeCaseId?: string|null,
 *   takeoffJobId?: string|null,
 *   baseSearch?: string
 * }} input
 */
export function buildTakeoffSearch(input) {
  const params = new URLSearchParams(
    input.baseSearch
      ? input.baseSearch.startsWith("?")
        ? input.baseSearch
        : `?${input.baseSearch}`
      : ""
  );

  if (input.view === "intake") {
    params.set("view", "intake");
    const caseId = trimOrNull(input.intakeCaseId);
    if (caseId) params.set("intakeCaseId", caseId);
    else params.delete("intakeCaseId");
  } else {
    params.delete("view");
    params.delete("intakeCaseId");
  }

  if (input.takeoffJobId !== undefined) {
    const jobId = trimOrNull(input.takeoffJobId);
    if (jobId) params.set("takeoffJobId", jobId);
    else params.delete("takeoffJobId");
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * @param {string} search
 * @param {"push"|"replace"} [mode]
 */
export function applyTakeoffSearchToUrl(search, mode = "push") {
  const url = `${window.location.pathname}${search}${window.location.hash}`;
  if (mode === "replace") window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
}
