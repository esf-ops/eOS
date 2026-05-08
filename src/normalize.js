import fs from "node:fs/promises";

function parseCsvLine(line) {
  // Minimal CSV parser supporting:
  // - comma separators
  // - quoted fields with escaped quotes ("")
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export async function loadEsfnMapping(mappingCsvPath) {
  const text = await fs.readFile(mappingCsvPath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return new Map();

  const maybeHeader = parseCsvLine(lines[0]).map((s) => s.trim().toLowerCase());
  const startIdx =
    maybeHeader[0] === "moraware_id" && maybeHeader[1] === "esfn_label" ? 1 : 0;

  const map = new Map();
  for (let i = startIdx; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const morawareId = String(cols[0] ?? "").trim();
    const esfnLabel = String(cols[1] ?? "").trim();
    if (!morawareId || !esfnLabel) continue;
    map.set(morawareId, esfnLabel);
  }
  return map;
}

function normalizeKey(key, mapping) {
  const mapped = mapping.get(key);
  return mapped || key;
}

function renameKeysDeep(value, mapping, seen) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const arr = new Array(value.length);
    seen.set(value, arr);
    for (let i = 0; i < value.length; i += 1) {
      arr[i] = renameKeysDeep(value[i], mapping, seen);
    }
    return arr;
  }

  const out = {};
  seen.set(value, out);

  for (const [k, v] of Object.entries(value)) {
    const newKey = normalizeKey(k, mapping);
    out[newKey] = renameKeysDeep(v, mapping, seen);
  }

  return out;
}

/**
 * Phase 2: Normalization
 * Reads `eos_mapping.csv` (or a provided mapping file) and applies it across an entire payload.
 *
 * Behavior:
 * - If an object key matches a Moraware ID in the CSV, it is renamed to the ESFN label.
 * - Keys not present in the CSV are left unchanged.
 * - Arrays are traversed.
 * - Cycles are handled safely using a WeakMap.
 */
export async function normalizePayload({ rawPayload, mappingCsvPath }) {
  const v = String(process.env.MORAWARE_DISCOVERY ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") {
    throw new Error(
      "normalizePayload must not run in Moraware discovery mode (MORAWARE_DISCOVERY is set)."
    );
  }
  const resolvedMappingPath = mappingCsvPath || "eos_mapping.csv";
  const mapping = await loadEsfnMapping(resolvedMappingPath);
  const seen = new WeakMap();
  return renameKeysDeep(rawPayload, mapping, seen);
}

