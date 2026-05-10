/**
 * Sanitized Moraware JSON/XML-parse tree key-shape audit for expanded discovery.
 * No full values unless includeRawSnippets is true (caller must keep those files in debug/ only).
 */

import { analyzeJobNotesScope as analyzeJobNotesScopeCore } from "../../../src/morawareOperational.js";

/** @typedef {{ category: string, terms: string[] }} DetectorGroup */

/** Focused path substring detectors (lowercase path is matched). */
export const DETECTOR_GROUPS = /** @type {DetectorGroup[]} */ ([
  {
    category: "address_contact",
    terms: ["address", "city", "state", "zip", "postal", "contact", "phone", "email"]
  },
  {
    category: "notes_communication",
    terms: ["note", "comment", "instruction", "reminder", "alert", "jwd"]
  },
  {
    category: "schedule_activity",
    terms: [
      "activity",
      "phase",
      "status",
      "start",
      "end",
      "date",
      "time",
      "duration",
      "assign",
      "assigned",
      "resource",
      "employee",
      "crew",
      "truck",
      "machine"
    ]
  },
  {
    category: "files_issues",
    terms: [
      "file",
      "attachment",
      "document",
      "pdf",
      "issue",
      "problem",
      "service",
      "repair",
      "remake",
      "change"
    ]
  },
  {
    category: "forms_quote_staging",
    terms: [
      "room",
      "sqft",
      "square",
      "color",
      "edge",
      "thickness",
      "backsplash",
      "sink",
      "faucet",
      "stove",
      "brace",
      "electrical",
      "invoice",
      "proposal",
      "salesorder",
      "billing"
    ]
  }
]);

const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_PATHS = 8000;
const DEFAULT_MAX_ARRAY_SAMPLE = 5;

/**
 * Heuristic job-notes scope signals (delegates to `src/morawareOperational.js`).
 * @param {string} notesText
 * @param {boolean | { includeRawSnippets?: boolean }} [includeRawSnippetsOrOpts]
 */
export function analyzeJobNotesScope(notesText, includeRawSnippetsOrOpts = false) {
  const opts =
    typeof includeRawSnippetsOrOpts === "object" && includeRawSnippetsOrOpts !== null
      ? includeRawSnippetsOrOpts
      : { includeRawSnippets: Boolean(includeRawSnippetsOrOpts) };
  return analyzeJobNotesScopeCore(notesText, opts);
}

function describeStringShape(s, includeRawSnippets) {
  if (typeof s !== "string") return `non_string:${typeof s}`;
  if (!s) return "empty_string";
  if (includeRawSnippets) {
    const t = s.length > 48 ? `${s.slice(0, 48)}…` : s;
    return `raw_snippet:${t.replace(/\s+/g, " ")}`;
  }
  if (s.length <= 64) return `string_len_${s.length}`;
  return "string_len_gt_64";
}

function typeLabel(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

function matchDetectorCategories(pathLower) {
  const hits = [];
  for (const g of DETECTOR_GROUPS) {
    for (const t of g.terms) {
      if (pathLower.includes(t)) {
        hits.push(g.category);
        break;
      }
    }
  }
  return hits;
}

function bumpDetectorHits(store, categories, area, path, valueType) {
  for (const cat of categories) {
    const k = `${cat}|${area}|${path}`;
    const prev = store.get(k) || {
      detector_category: cat,
      matched_key_path: path,
      payload_area: area,
      count: 0,
      value_type: new Set()
    };
    prev.count += 1;
    prev.value_type.add(valueType);
    store.set(k, prev);
  }
}

export function createKeyShapeCollector(options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPathEntries = options.maxPathEntries ?? DEFAULT_MAX_PATHS;
  const maxArraySample = options.maxArraySample ?? DEFAULT_MAX_ARRAY_SAMPLE;
  const includeRawSnippets = Boolean(options.includeRawSnippets);

  /** @type {Map<string, any>} */
  const pathMap = new Map();
  /** @type {Map<string, any>} */
  const detectorMap = new Map();

  function ensurePath(area, path) {
    const key = `${area}::${path}`;
    let rec = pathMap.get(key);
    if (!rec) {
      if (pathMap.size >= maxPathEntries) return null;
      rec = {
        key_path: path,
        payload_area: area,
        value_types: new Set(),
        count: 0,
        array_child_keys: null,
        example_scalar_kinds: []
      };
      pathMap.set(key, rec);
    }
    return rec;
  }

  function recordScalar(area, path, value) {
    const pl = path.toLowerCase();
    const cats = matchDetectorCategories(pl);
    const t = typeLabel(value);
    if (cats.length) bumpDetectorHits(detectorMap, cats, area, path, t);

    const rec = ensurePath(area, path);
    if (!rec) return;
    rec.count += 1;
    if (value === null || value === undefined) {
      rec.value_types.add("null");
      return;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      rec.value_types.add(typeof value);
      if (rec.example_scalar_kinds.length < 3) {
        if (typeof value === "string") {
          rec.example_scalar_kinds.push(describeStringShape(value, includeRawSnippets));
        } else {
          rec.example_scalar_kinds.push(String(typeof value));
        }
      }
      return;
    }
    rec.value_types.add(t);
  }

  function walk(area, value, path, depth, branchSeen) {
    if (depth > maxDepth || pathMap.size >= maxPathEntries) return;
    if (value === null || value === undefined) {
      recordScalar(area, path || "$", value);
      return;
    }
    const typ = typeof value;
    if (typ !== "object") {
      recordScalar(area, path || "$", value);
      return;
    }
    if (branchSeen.has(value)) return;
    branchSeen.add(value);
    try {
      if (Array.isArray(value)) {
        const arrPath = path || "$";
        const pl = arrPath.toLowerCase();
        const cats = matchDetectorCategories(pl);
        if (cats.length) bumpDetectorHits(detectorMap, cats, area, arrPath, "array");

        const rec = ensurePath(area, arrPath);
        if (rec) {
          rec.count += 1;
          rec.value_types.add("array");
          rec.array_child_keys = rec.array_child_keys || new Set();
        }
        const n = Math.min(value.length, maxArraySample);
        for (let i = 0; i < n; i++) {
          const el = value[i];
          if (el && typeof el === "object" && !Array.isArray(el)) {
            for (const k of Object.keys(el)) {
              if (!String(k).startsWith("@_")) rec?.array_child_keys?.add(k);
            }
          }
          const next = `${arrPath}[${i}]`;
          walk(area, el, next, depth + 1, branchSeen);
        }
        return;
      }

      const objPath = path || "$";
      const pl = objPath.toLowerCase();
      const cats = matchDetectorCategories(pl);
      if (cats.length) bumpDetectorHits(detectorMap, cats, area, objPath, "object");

      const rec = ensurePath(area, objPath);
      if (rec) {
        rec.count += 1;
        rec.value_types.add("object");
      }

      for (const k of Object.keys(value)) {
        const next = objPath === "$" ? k : `${objPath}.${k}`;
        walk(area, value[k], next, depth + 1, branchSeen);
      }
    } finally {
      branchSeen.delete(value);
    }
  }

  return {
    ingest(area, root) {
      if (root == null) return;
      walk(area, root, "", 0, new WeakSet());
    },
    finalize() {
      const paths = [...pathMap.values()].map((r) => ({
        key_path: r.key_path,
        payload_area: r.payload_area,
        value_type: [...r.value_types].sort().join("|"),
        count: r.count,
        array_child_keys: r.array_child_keys ? [...r.array_child_keys].sort().slice(0, 80) : null,
        example_scalar_kinds: r.example_scalar_kinds
      }));
      paths.sort((a, b) => b.count - a.count || a.key_path.localeCompare(b.key_path));

      const shape_summaries_by_area = {};
      const perAreaCap = 150;
      for (const p of paths) {
        const a = p.payload_area;
        if (!shape_summaries_by_area[a]) shape_summaries_by_area[a] = [];
        shape_summaries_by_area[a].push(p);
      }
      for (const a of Object.keys(shape_summaries_by_area)) {
        const arr = shape_summaries_by_area[a].sort((x, y) => y.count - x.count);
        shape_summaries_by_area[a] = {
          total_path_rows: arr.length,
          top_paths: arr.slice(0, perAreaCap)
        };
      }

      const detector_hits = [...detectorMap.values()]
        .map((r) => ({
          detector_category: r.detector_category,
          matched_key_path: r.matched_key_path,
          payload_area: r.payload_area,
          count: r.count,
          value_type: [...r.value_type].sort().join("|")
        }))
        .sort((a, b) => b.count - a.count || a.matched_key_path.localeCompare(b.matched_key_path));

      return {
        guards: {
          max_depth: maxDepth,
          max_path_entries: maxPathEntries,
          max_array_sample: maxArraySample,
          paths_recorded: paths.length
        },
        detector_groups: DETECTOR_GROUPS,
        paths,
        shape_summaries_by_area,
        detector_hits
      };
    }
  };
}

export function buildKeyShapesTxtReport({ generatedAt, keyJsonSummary, includeRawSnippets, keyShapesEnabled }) {
  const lines = [
    "MORAWARE KEY-SHAPE AUDIT (sanitized)",
    `generatedAt: ${generatedAt}`,
    `MORAWARE_DISCOVERY_KEY_SHAPES: ${keyShapesEnabled ? "1" : "0"}`,
    `MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS: ${includeRawSnippets ? "1 (may contain PII — debug/ only)" : "0"}`,
    "",
    ...(includeRawSnippets
      ? [
          "WARNING: raw snippets may include customer names, addresses, and pricing text.",
          "Do not commit debug output; treat as confidential.",
          ""
        ]
      : ["Key-shape mode is value-free except type/length hints on scalars.", ""]),
    `paths_recorded: ${keyJsonSummary?.guards?.paths_recorded ?? 0}`,
    `detector_hit_rows: ${keyJsonSummary?.detector_hits?.length ?? 0}`,
    "",
    "Top 40 paths by count:",
    ...(keyJsonSummary?.paths ?? []).slice(0, 40).map((p) => `  ${p.count}x [${p.payload_area}] ${p.key_path} :: ${p.value_type}`),
    "",
    "Top 30 detector hits:",
    ...(keyJsonSummary?.detector_hits ?? []).slice(0, 30).map((d) => `  ${d.count}x ${d.detector_category} [${d.payload_area}] ${d.matched_key_path}`)
  ];
  return lines.join("\n");
}
