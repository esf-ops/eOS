/**
 * Account Directory workspace — pure helpers (no React, no DOM, no API).
 * Exported for Node tests and TypeScript re-export shell.
 */

const VALID_PANELS = ["overview", "financials", "relationship", "notes", "followups", "contacts", "locations", "connections", "insights"];

export const WORKSPACE_PANEL_TABS = Object.freeze({
  overview: "Overview",
  financials: "Financials",
  relationship: "Relationship",
  notes: "Notes",
  followups: "Follow-ups",
  contacts: "Contacts",
  locations: "Locations",
  connections: "Connections",
  insights: "Insights"
});

export function panelFromTab(tab) {
  const found = Object.entries(WORKSPACE_PANEL_TABS).find(([, label]) => label === tab);
  return found ? found[0] : "overview";
}

export function tabFromPanel(panel) {
  return WORKSPACE_PANEL_TABS[panel] || "Overview";
}

const VALID_TABS = ["accounts", "prospects", "needs_review", "archived", "status_review", "moraware_review"];
const VALID_PAGE_SIZES = [25, 50, 100];
const VALID_SORTS = ["name_asc", "name_desc", "updated_desc", "updated_asc"];
const VALID_QB_ENRICHMENT = ["suggested_match", "needs_review", "not_linked"];
const VALID_INTELLIGENCE = ["overdue", "collection", "financially_active"];

/** Summary strip cards — exclusive presets (not stackable with leftover filters). */
export const SUMMARY_CARD_PRESETS = Object.freeze({
  total: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: ""
  },
  active: {
    tab: "accounts",
    status: "active",
    linked: "",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: ""
  },
  prospects: {
    tab: "prospects",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: ""
  },
  needsReview: {
    tab: "needs_review",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: ""
  },
  archived: {
    tab: "archived",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: ""
  },
  qbLinked: {
    tab: "accounts",
    status: "",
    linked: "true",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: ""
  },
  qbSuggested: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "suggested_match",
    missingContact: "",
    missingLocation: ""
  },
  qbNeedsReview: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "needs_review",
    missingContact: "",
    missingLocation: ""
  },
  noContact: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "true",
    missingLocation: ""
  },
  noLocation: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: "true"
  }
});

/**
 * Parse URLSearchParams string → structured URL state.
 * Falls back safely for invalid/missing values.
 * @param {string} searchStr
 */
export function parseUrlState(searchStr) {
  const p = new URLSearchParams(String(searchStr ?? "").replace(/^\?/, ""));

  const rawTab = p.get("tab") ?? "";
  const tab = VALID_TABS.includes(rawTab) ? rawTab : "accounts";

  const rawPage = parseInt(p.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawPageSize = parseInt(p.get("pageSize") ?? "50", 10);
  const pageSize = VALID_PAGE_SIZES.includes(rawPageSize) ? rawPageSize : 50;

  const rawSort = p.get("sort") ?? "";
  const sort = VALID_SORTS.includes(rawSort) ? rawSort : "name_asc";

  const rawQbEnrichment = p.get("qbEnrichment") ?? "";
  const qbEnrichment = VALID_QB_ENRICHMENT.includes(rawQbEnrichment) ? rawQbEnrichment : "";
  const rawIntelligence = p.get("intelligence") ?? "";
  const intelligence = VALID_INTELLIGENCE.includes(rawIntelligence) ? rawIntelligence : "";

  const rawPanel = p.get("panel") ?? "";
  const panel = VALID_PANELS.includes(rawPanel) ? rawPanel : null;

  return {
    tab,
    page,
    pageSize,
    search: p.get("search") ?? "",
    status: p.get("status") ?? "",
    linked: p.get("linked") ?? "",
    missingContact: p.get("missingContact") ?? "",
    missingLocation: p.get("missingLocation") ?? "",
    qbEnrichment,
    intelligence,
    sort,
    account: p.get("account") ?? null,
    panel
  };
}

/**
 * Serialize URL state → query string (minimal — omits default values).
 * @param {ReturnType<typeof parseUrlState>} state
 */
export function serializeUrlState(state) {
  const p = new URLSearchParams();
  if (state.tab && state.tab !== "accounts") p.set("tab", state.tab);
  if (state.page && state.page > 1) p.set("page", String(state.page));
  if (state.pageSize && state.pageSize !== 50) p.set("pageSize", String(state.pageSize));
  if (state.search) p.set("search", state.search);
  if (state.status) p.set("status", state.status);
  if (state.linked) p.set("linked", state.linked);
  if (state.missingContact) p.set("missingContact", state.missingContact);
  if (state.missingLocation) p.set("missingLocation", state.missingLocation);
  if (state.qbEnrichment) p.set("qbEnrichment", state.qbEnrichment);
  if (state.intelligence) p.set("intelligence", state.intelligence);
  if (state.sort && state.sort !== "name_asc") p.set("sort", state.sort);
  if (state.account) p.set("account", state.account);
  if (state.account && state.panel && state.panel !== "overview") p.set("panel", state.panel);
  const q = p.toString();
  return q ? `?${q}` : "";
}

/**
 * Apply an exclusive summary-card preset: clear search/filters/page/account, then set only that card's scope.
 * Preserves pageSize + sort.
 * @param {ReturnType<typeof parseUrlState>} prev
 * @param {keyof typeof SUMMARY_CARD_PRESETS} cardKey
 */
export function applySummaryCardPreset(prev, cardKey) {
  const preset = SUMMARY_CARD_PRESETS[cardKey];
  if (!preset) {
    return {
      ...prev,
      search: "",
      status: "",
      linked: "",
      qbEnrichment: "",
      missingContact: "",
      missingLocation: "",
      intelligence: "",
      page: 1,
      account: null,
      panel: null
    };
  }
  return {
    ...prev,
    search: "",
    page: 1,
    account: null,
    panel: null,
    tab: preset.tab,
    status: preset.status,
    linked: preset.linked,
    qbEnrichment: preset.qbEnrichment,
    missingContact: preset.missingContact,
    missingLocation: preset.missingLocation,
    intelligence: ""
  };
}

/**
 * True when URL state matches exactly that summary card's exclusive preset (no leftover filters/search).
 * @param {ReturnType<typeof parseUrlState>} state
 * @param {keyof typeof SUMMARY_CARD_PRESETS} cardKey
 */
export function isSummaryCardActive(state, cardKey) {
  const preset = SUMMARY_CARD_PRESETS[cardKey];
  if (!preset || !state) return false;
  return (
    !state.search &&
    state.tab === preset.tab &&
    (state.status || "") === preset.status &&
    (state.linked || "") === preset.linked &&
    (state.qbEnrichment || "") === preset.qbEnrichment &&
    (state.missingContact || "") === preset.missingContact &&
    (state.missingLocation || "") === preset.missingLocation &&
    !(state.intelligence || "")
  );
}

/**
 * Toolbar filter patch: stackable, except contradictory QB linked vs qbEnrichment.
 * - linked=true clears qbEnrichment
 * - non-empty qbEnrichment clears linked
 * @param {ReturnType<typeof parseUrlState>} prev
 * @param {Partial<ReturnType<typeof parseUrlState>>} patch
 */
export function applyToolbarFilterPatch(prev, patch) {
  const keys = Object.keys(patch || {});
  const isPageOnly = keys.length > 0 && keys.every((k) => k === "page");
  /** @type {ReturnType<typeof parseUrlState>} */
  const next = {
    ...prev,
    ...patch,
    page: isPageOnly ? (patch.page ?? prev.page) : 1
  };

  if (Object.prototype.hasOwnProperty.call(patch, "linked") && String(patch.linked) === "true") {
    next.qbEnrichment = "";
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "qbEnrichment") &&
    String(patch.qbEnrichment || "").trim()
  ) {
    next.linked = "";
  }
  return next;
}

/**
 * Format a pagination range string, e.g. "1–50 of 362".
 * @param {number} page
 * @param {number} pageSize
 * @param {number} total
 */
export function formatResultRange(page, pageSize, total) {
  if (!total || total === 0) return "0 results";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
}

/**
 * Build an array of page numbers (and "..." ellipsis strings) for pagination UI.
 * Always includes first, last, current, and neighbors.
 * @param {number} page current page (1-based)
 * @param {number} totalPages
 * @returns {(number|string)[]}
 */
export function buildPageNumbers(page, totalPages) {
  if (totalPages <= 1) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pagesSet = new Set([1, totalPages, page]);
  if (page > 1) pagesSet.add(page - 1);
  if (page < totalPages) pagesSet.add(page + 1);
  if (page > 3) pagesSet.add(2);
  if (page < totalPages - 2) pagesSet.add(totalPages - 1);

  const sorted = Array.from(pagesSet).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("...");
    result.push(sorted[i]);
  }
  return result;
}

/** Human-readable labels for audit action codes. */
export const ACTIVITY_LABELS = {
  create_account: "Account created",
  update_account: "Account updated",
  seed_import_account: "Imported from QuickBooks directory seed",
  archive_account: "Account archived",
  restore_account: "Account restored",
  link_quickbooks: "Linked to QuickBooks",
  deactivate_external_link: "External link removed",
  add_contact: "Contact added",
  update_contact: "Contact updated",
  remove_contact: "Contact removed",
  add_location: "Location added",
  update_location: "Location updated",
  remove_location: "Location removed",
  add_alias: "Alias added",
  update_alias: "Alias updated",
  remove_alias: "Alias removed",
  add_note: "Note added",
  update_note: "Note updated",
  archive_note: "Note archived",
  add_follow_up: "Follow-up added",
  update_follow_up: "Follow-up updated",
  complete_follow_up: "Follow-up completed",
  reopen_follow_up: "Follow-up reopened",
  archive_follow_up: "Follow-up archived"
};

/**
 * Return a friendly label for an audit action code.
 * Falls back to humanizing the raw code.
 * @param {string} action
 */
export function activityLabel(action) {
  return ACTIVITY_LABELS[String(action)] ?? String(action).replace(/_/g, " ");
}

/**
 * Return 1–2 character initials for an account or person name.
 * @param {string} name
 */
export function initials(name) {
  const n = String(name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}
