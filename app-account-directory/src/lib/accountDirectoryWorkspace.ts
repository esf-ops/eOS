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
  sort: string;
  account: string | null;
};

export {
  parseUrlState,
  serializeUrlState,
  formatResultRange,
  buildPageNumbers,
  activityLabel,
  initials,
  ACTIVITY_LABELS,
} from "./accountDirectoryWorkspace.mjs";
