/**
 * TypeScript shell — runtime implementation is in accountDirectoryWorkspace.mjs.
 * Re-exports pure URL / formatting / activity helpers for use in React components.
 */

export type UrlState = {
  tab: string;
  page: number;
  pageSize: number;
  search: string;
  status: string;
  linked: string;
  missingContact: string;
  missingLocation: string;
  qbEnrichment: string;
  intelligence: string;
  sort: string;
  account: string | null;
  panel: string | null;
};

export {
  parseUrlState,
  serializeUrlState,
  applySummaryCardPreset,
  isSummaryCardActive,
  applyToolbarFilterPatch,
  SUMMARY_CARD_PRESETS,
  formatResultRange,
  buildPageNumbers,
  activityLabel,
  initials,
  ACTIVITY_LABELS,
  panelFromTab,
  tabFromPanel,
  WORKSPACE_PANEL_TABS,
} from "./accountDirectoryWorkspace.mjs";
