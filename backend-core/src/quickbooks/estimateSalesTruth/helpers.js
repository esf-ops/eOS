/**
 * Shared helpers for offline QuickBooks Estimate + Sales Financial Truth discovery.
 *
 * READ-ONLY against local materialized export folders. Never connects to QuickBooks,
 * CData, or network services. Never mutates the export directory.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { readQuickBooksJsonFile } from "../quickBooksJsonFileReader.js";
import { KNOWN_ENTITY_FOLDERS } from "../quickBooksExportReader.js";
import {
  parseQbBoolean,
  parseQbDate,
  parseQbTimestamp,
  unwrapQbScalar,
} from "../quickBooksStaging.js";
import { parseQbMoney, extractLinkedTxnRefs } from "../quickBooksIntelligenceFacts.js";

export {
  parseQbBoolean,
  parseQbDate,
  parseQbTimestamp,
  unwrapQbScalar,
  parseQbMoney,
  extractLinkedTxnRefs,
  KNOWN_ENTITY_FOLDERS,
};

/** Confidence / evidence labels used across discovery artifacts. */
export const EVIDENCE_LEVELS = Object.freeze([
  "CONFIRMED_FROM_QB_DATA",
  "STRONGLY_SUPPORTED_BY_QB_DATA",
  "CONFIRMED_LINK",
  "INFERRED_LINK",
  "INFERRED_FROM_QB_DATA",
  "PROPOSED",
  "PROPOSED_FROM_SLABOS",
  "NEEDS_BUSINESS_DECISION",
  "INSUFFICIENT_DATA",
  "MISSING_REFERENCE_DATA",
]);

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function textOf(value) {
  const v = unwrapQbScalar(value);
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

/**
 * @param {unknown} ref
 * @returns {string|null}
 */
export function refListId(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
  return textOf(/** @type {{ ListID?: unknown }} */ (ref).ListID);
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * @param {unknown} yearValue
 * @returns {number|null}
 */
export function yearOfDate(yearValue) {
  const d = parseQbDate(yearValue) ?? textOf(yearValue);
  if (!d || d.length < 4) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/**
 * Increment a Map counter.
 * @param {Map<string, number>} map
 * @param {string|null|undefined} key
 * @param {number} [by]
 */
export function bump(map, key, by = 1) {
  if (key == null || key === "") return;
  map.set(key, (map.get(key) || 0) + by);
}

/**
 * @param {Map<string, number>} map
 * @param {number} [limit]
 * @returns {Array<{ key: string, count: number }>}
 */
export function topEntries(map, limit = 25) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

/**
 * @param {Map<string, number>} map
 * @returns {Record<string, number>}
 */
export function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

/**
 * Field presence profiler for a stream of plain objects.
 */
export function createFieldProfiler() {
  /** @type {Map<string, { present: number, nonEmpty: number }>} */
  const fields = new Map();
  let records = 0;

  return {
    /**
     * @param {object} record
     * @param {string} [prefix]
     */
    observe(record, prefix = "") {
      if (!record || typeof record !== "object" || Array.isArray(record)) return;
      records += 1;
      for (const [key, value] of Object.entries(record)) {
        if (key === "@elementName") continue;
        const pathKey = prefix ? `${prefix}.${key}` : key;
        let entry = fields.get(pathKey);
        if (!entry) {
          entry = { present: 0, nonEmpty: 0 };
          fields.set(pathKey, entry);
        }
        entry.present += 1;
        if (value != null && value !== "" && !(Array.isArray(value) && value.length === 0)) {
          entry.nonEmpty += 1;
        }
      }
    },
    /**
     * @param {number} [nearlyAllThreshold]
     */
    snapshot(nearlyAllThreshold = 0.95) {
      /** @type {Array<{ field: string, present: number, nonEmpty: number, presentRate: number, nonEmptyRate: number, classification: string }>} */
      const rows = [];
      for (const [field, stats] of [...fields.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const presentRate = records ? stats.present / records : 0;
        const nonEmptyRate = records ? stats.nonEmpty / records : 0;
        let classification = "rare";
        if (presentRate >= nearlyAllThreshold) classification = "nearly_all";
        else if (presentRate >= 0.5) classification = "common";
        else if (presentRate >= 0.1) classification = "optional";
        rows.push({
          field,
          present: stats.present,
          nonEmpty: stats.nonEmpty,
          presentRate: round4(presentRate),
          nonEmptyRate: round4(nonEmptyRate),
          classification,
        });
      }
      return { recordCount: records, fields: rows };
    },
  };
}

/**
 * @param {number} n
 * @returns {number}
 */
export function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Prefer TotalAmount; fall back to Subtotal + SalesTaxTotal (Elite Stone invoice
 * export omits TotalAmount while still carrying subtotal/tax components).
 * @param {object} record
 * @returns {number|null}
 */
export function resolveTxnTotalAmount(record) {
  const direct = parseQbMoney(record?.TotalAmount);
  if (direct != null) return direct;
  const sub = parseQbMoney(record?.Subtotal);
  const tax = parseQbMoney(record?.SalesTaxTotal);
  if (sub == null && tax == null) return null;
  return round2((sub ?? 0) + (tax ?? 0));
}

/**
 * List JSON batch files in an entity folder (sorted).
 * @param {string} exportDir
 * @param {string} entityFolder
 * @returns {Promise<string[]>}
 */
export async function listEntityJsonFiles(exportDir, entityFolder) {
  const folderPath = path.join(exportDir, entityFolder);
  let entries;
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name)
    .sort();
}

/**
 * Iterate every record in an entity folder's batch JSON files.
 * Yields { record, fileName, batchIndex, recordIndex }.
 *
 * @param {string} exportDir
 * @param {string} entityFolder
 * @returns {AsyncGenerator<{ record: object, fileName: string, batchMeta: object }>}
 */
export async function* iterateEntityRecords(exportDir, entityFolder) {
  const files = await listEntityJsonFiles(exportDir, entityFolder);
  for (const fileName of files) {
    const filePath = path.join(exportDir, entityFolder, fileName);
    const readResult = await readQuickBooksJsonFile(filePath);
    if (!readResult.ok) {
      yield {
        record: null,
        fileName,
        batchMeta: { ok: false, error: readResult.error },
      };
      continue;
    }
    const data = readResult.data;
    const records = Array.isArray(data?.records) ? data.records : [];
    for (const record of records) {
      yield {
        record,
        fileName,
        batchMeta: {
          ok: true,
          entityType: data?.entityType ?? entityFolder,
          batchNumber: data?.batchNumber ?? null,
          recordCount: data?.recordCount ?? records.length,
        },
      };
    }
  }
}

/**
 * Extract Estimate RefNumber tokens from a Memo string.
 * Elite Stone convention observed: "Estimate YY-NNNN:" (and similar).
 *
 * @param {unknown} memo
 * @returns {string[]}
 */
export function extractEstimateRefNumbersFromMemo(memo) {
  const text = textOf(memo);
  if (!text) return [];
  const out = [];
  const re = /Estimate\s+([0-9]{1,2}-[0-9]{2,6})\b/gi;
  let match;
  while ((match = re.exec(text))) {
    out.push(match[1]);
  }
  return out;
}

/**
 * Classify Estimate RefNumber format without exposing the number itself.
 * @param {string|null} ref
 * @returns {string}
 */
export function classifyRefNumberFormat(ref) {
  if (!ref) return "missing";
  if (/^\d{2}-\d{4}$/.test(ref)) return "YY-NNNN";
  if (/^\d{2}-\d{5}$/.test(ref)) return "YY-NNNNN";
  if (/^\d{2}-\d{3}$/.test(ref)) return "YY-NNN";
  if (/^\d{2}-\d{2}-\d{4}$/.test(ref)) return "MM-DD-NNNN_legacy";
  if (/^\d+$/.test(ref)) return "numeric";
  return "other";
}

/**
 * Days between two YYYY-MM-DD dates (signed). Null if either invalid.
 * @param {string|null} a
 * @param {string|null} b
 * @returns {number|null}
 */
export function daysBetween(a, b) {
  if (!a || !b) return null;
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}

/**
 * Assert export directory is not written by checking mtime before/after.
 * Used by tests — discovery code itself never writes into the export.
 *
 * @param {string} exportDir
 * @returns {Promise<{ fingerprint: string }>}
 */
export async function fingerprintExportTree(exportDir) {
  const parts = [];
  async function walk(dir, depth) {
    if (depth > 3) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        parts.push(`D:${path.relative(exportDir, full)}`);
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const st = await fs.stat(full);
        parts.push(`F:${path.relative(exportDir, full)}:${st.size}:${st.mtimeMs}`);
      }
    }
  }
  await walk(exportDir, 0);
  return { fingerprint: parts.join("|") };
}

/**
 * Resolve QB_EXPORT_DIR from env or CLI argument.
 * @param {string|undefined} cliPath
 * @returns {string}
 */
export function resolveExportDir(cliPath) {
  const fromCli = typeof cliPath === "string" && cliPath.trim() ? cliPath.trim() : null;
  const fromEnv = process.env.QB_EXPORT_DIR?.trim() || null;
  const dir = fromCli || fromEnv;
  if (!dir) {
    throw new Error(
      "Export directory required. Set QB_EXPORT_DIR or pass the path as the first argument."
    );
  }
  return path.resolve(dir);
}
