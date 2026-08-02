/**
 * Studio V2 workspace deep-link helpers (navigation only).
 * Preferred URL: ?studioV2=1&caseId=<intakeCaseId>
 * Optional alias: estimateId (same intake case id — not a revision id).
 */

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidStudioV2CaseId(raw) {
  const id = String(raw || "").trim();
  if (!id || id.length < 8 || id.length > 128) return false;
  // Reject characters that break path segments or look like XSS/injection.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return false;
  return true;
}

/**
 * @param {string} [search]
 * @returns {{ studioV2: boolean, caseId: string | null, caseIdInvalid: boolean }}
 */
export function parseStudioV2WorkspaceDeepLink(search = "") {
  try {
    const q = String(search || "");
    const params = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
    const studioV2 = params.get("studioV2") === "1";
    if (!studioV2) return { studioV2: false, caseId: null, caseIdInvalid: false };
    const rawParam = params.get("caseId") ?? params.get("estimateId");
    if (rawParam == null || String(rawParam).trim() === "") {
      return { studioV2: true, caseId: null, caseIdInvalid: false };
    }
    const raw = String(rawParam).trim();
    if (!isValidStudioV2CaseId(raw)) {
      return { studioV2: true, caseId: null, caseIdInvalid: true };
    }
    return { studioV2: true, caseId: raw, caseIdInvalid: false };
  } catch {
    return { studioV2: false, caseId: null, caseIdInvalid: false };
  }
}

/**
 * Build a query string that preserves unrelated params, keeps studioV2=1,
 * and sets or clears the workspace case id.
 *
 * @param {string} [search]
 * @param {string | null} caseId
 * @returns {string} search including leading "?" when non-empty, else ""
 */
export function buildStudioV2WorkspaceSearch(search = "", caseId = null) {
  const q = String(search || "");
  const params = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
  params.set("studioV2", "1");
  params.delete("estimateId");
  if (caseId && isValidStudioV2CaseId(caseId)) {
    params.set("caseId", String(caseId).trim());
  } else {
    params.delete("caseId");
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

/**
 * @param {{ caseId?: string | null, mode?: "push" | "replace", search?: string, pathname?: string, hash?: string }} [opts]
 * @returns {{ search: string, applied: boolean }}
 */
export function applyStudioV2WorkspaceUrl(opts = {}) {
  if (typeof window === "undefined" || !window.history) {
    return { search: "", applied: false };
  }
  const mode = opts.mode === "replace" ? "replace" : "push";
  const currentSearch =
    opts.search != null ? String(opts.search) : String(window.location.search || "");
  const nextSearch = buildStudioV2WorkspaceSearch(currentSearch, opts.caseId ?? null);
  const pathname = opts.pathname != null ? String(opts.pathname) : window.location.pathname;
  const hash = opts.hash != null ? String(opts.hash) : window.location.hash || "";
  const nextUrl = `${pathname}${nextSearch}${hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
  if (nextUrl === currentUrl) {
    return { search: nextSearch, applied: false };
  }
  if (mode === "replace") {
    window.history.replaceState(window.history.state, "", nextUrl);
  } else {
    window.history.pushState(window.history.state, "", nextUrl);
  }
  return { search: nextSearch, applied: true };
}
