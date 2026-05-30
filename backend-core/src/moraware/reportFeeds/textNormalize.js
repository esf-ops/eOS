import { normalizeSpaces } from "./parseCsv.js";

const LOCATION_PREFIX_RE = /^(dyersville|lisbon|iowa\s*city|north\s*branch|south\s*yard)\s*[-–—]\s*/i;

/** Normalize a Moraware report name for identity matching (not display). */
export function normalizeReportName(raw) {
  let s = normalizeSpaces(raw).toLowerCase();
  if (!s) return "";
  s = s
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[/\\]/g, " ")
    .replace(/[().,]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/#/g, " ")
    .replace(/\$/g, " ");
  s = s.replace(/\s*##\s*$/g, "").replace(/\s*##\$\s*$/g, "");
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeReportNameWithoutLocationPrefix(raw) {
  const stripped = normalizeSpaces(raw).replace(LOCATION_PREFIX_RE, "").trim();
  return normalizeReportName(stripped);
}

/** Stable match key for Account Name + Job Name enrichment. */
export function makeIdentityMatchKey(accountName, jobName) {
  const account = normalizeReportNameWithoutLocationPrefix(accountName);
  const job = normalizeReportName(jobName);
  return `${account}||${job}`;
}
