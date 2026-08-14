import { QB_FINANCE_BROWSER_FORBIDDEN_KEYS } from "../quickbooksFinanceFoundation/constants.js";
import { scrubFinanceIdsForBrowser } from "../quickbooksFinanceFoundation/sanitize.js";
import { FINANCE_READ_EXTRA_FORBIDDEN_KEYS } from "./constants.js";

const FORBIDDEN = new Set([
  ...QB_FINANCE_BROWSER_FORBIDDEN_KEYS,
  ...FINANCE_READ_EXTRA_FORBIDDEN_KEYS
]);

const FORBIDDEN_KEY_RE =
  /(list_?id|txn_?id|editsequence|raw_payload|ingest_token|sync_run|snapshot_id|qb_[a-z0-9_]*id)$/i;

export function isForbiddenFinanceKey(key) {
  const k = String(key ?? "");
  if (FORBIDDEN.has(k)) return true;
  return FORBIDDEN_KEY_RE.test(k);
}

export function scrubFinanceValueForBrowser(value, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(value)) {
    return value.map((item) => scrubFinanceValueForBrowser(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const base = scrubFinanceIdsForBrowser(value);
    const out = {};
    for (const [key, nested] of Object.entries(base)) {
      if (isForbiddenFinanceKey(key)) continue;
      out[key] = scrubFinanceValueForBrowser(nested, depth + 1);
    }
    return out;
  }
  return value;
}

export function assertNoForbiddenKeys(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoForbiddenKeys(item, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (isForbiddenFinanceKey(key)) {
        throw new Error(`forbidden finance key leaked at ${path}.${key}`);
      }
      assertNoForbiddenKeys(nested, `${path}.${key}`);
    }
  }
}
