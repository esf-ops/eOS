import { QB_FINANCE_BROWSER_FORBIDDEN_KEYS } from "./constants.js";

export function scrubFinanceIdsForBrowser(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const key of QB_FINANCE_BROWSER_FORBIDDEN_KEYS) {
    if (key in out) delete out[key];
  }
  return out;
}
