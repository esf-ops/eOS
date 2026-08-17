/**
 * TRUSTED Moraware Job Worksheet scope-intelligence facts.
 *
 * Canonical grain: organization_id + source_job_id + source_form_id
 * (one fact per Job Worksheet form instance).
 *
 * Population: CURRENT_MORAWARE_JOB_SET (Option D full-census epoch).
 *
 * TRUSTED_NOW raw fields only. No material_family, upgrade score,
 * normalized backsplash, or Shop Comments analytics.
 */

import {
  filterCurrentMorawareJobSet,
  planPreparedFactsRebuild
} from "./morawareCurrentPopulation.mjs";

/** Verified 2026-08-17 scope validation against CURRENT_MORAWARE_JOB_SET. */
export const VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT = 10719;
export const VERIFIED_FOUNDATION_2026_JOBS_WITH_WORKSHEET = 3964;
export const VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET = 109;

export const VERIFIED_BROIHAHN_MORAWARE_ACCOUNT_IDS = Object.freeze(["553", "635"]);
export const VERIFIED_BROIHAHN_2026_JOB_COUNT = 13;
export const VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT = 39;
export const VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT = 1283.5;

/** Exact Job Worksheet field labels (validated). */
export const JOB_WORKSHEET_SCOPE_LABELS = Object.freeze({
  ROOM: "Room",
  SQFT: "Sq.Ft.",
  COLOR: "Color",
  EDGE: "Edge",
  THICKNESS: "Thickness",
  BACKSPLASH_TYPE: "Back Splash Type",
  BACKSPLASH_HEIGHT: "Back Splash Height",
  SINK_TYPE: "Sink Type",
  FAUCET_TYPE: "Faucet Type",
  STOVE_TYPE: "Stove Type",
  ELECTRICAL_CUTOUTS: "Electrical Cut-outs Needed",
  OVERHANG: "Island or Raised Bar Overhang",
  BRACES: "Braces Needed",
  DRY_TREAT: "Dry Treat",
  STONE_CARE_KIT: "Stone Care Kit"
});

const PLACEHOLDER_COLOR_RE =
  /^(see\s*below|tbd|n\/?a|na|none|null|unknown|customer[\s-]*supplied|\?+|-|--|\.)$/i;

function unwrapJobRaw(job) {
  const raw =
    job?.raw_payload && typeof job.raw_payload === "object"
      ? job.raw_payload
      : job && typeof job === "object"
        ? job
        : {};
  if (Array.isArray(raw.forms)) return raw;
  if (raw.raw_payload && typeof raw.raw_payload === "object" && Array.isArray(raw.raw_payload.forms)) {
    return raw.raw_payload;
  }
  return raw;
}

function isExactJobWorksheetTemplate(form) {
  return String(form?.formTemplateName || form?.templateName || "") === "Job Worksheet";
}

function fieldsForForm(form) {
  if (!form || typeof form !== "object") return [];
  if (Array.isArray(form.fields)) return form.fields;
  if (form.fieldsByLabel && typeof form.fieldsByLabel === "object") {
    return Object.values(form.fieldsByLabel);
  }
  return [];
}

function fieldHumanLabel(field) {
  return String(field?.label || field?.name || field?.fieldName || field?.normalizedLabel || "").trim();
}

function fieldLookupKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rawFieldString(field) {
  if (!field || typeof field !== "object") return null;
  const candidates = [field.value, field.answer, field.text, field.numericValue, field.numberValue];
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s !== "") return s;
  }
  return null;
}

/**
 * Exact-label lookup. Prefers human `label` over lowercased normalizedLabel.
 * @param {object[]} fields
 * @param {string} exactLabel
 */
export function getJobWorksheetFieldRaw(fields, exactLabel) {
  const want = fieldLookupKey(exactLabel);
  let fallback = null;
  for (const field of fields || []) {
    const human = fieldHumanLabel(field);
    if (!human) continue;
    if (fieldLookupKey(human) !== want) continue;
    const val = rawFieldString(field);
    // Prefer the field whose primary label matches (not only normalizedLabel).
    if (String(field.label || "").trim() === exactLabel) return val;
    if (fallback == null) fallback = val;
  }
  return fallback;
}

/**
 * Deterministic Sq.Ft. parse (allows zero). Blank / non-numeric → null.
 */
export function parseWorksheetSqft(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "true" || lower === "false" || lower === "yes" || lower === "no") return null;
  const m = s.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function isColorPlaceholder(colorRaw) {
  const s = String(colorRaw ?? "").trim();
  if (!s) return true;
  return PLACEHOLDER_COLOR_RE.test(s);
}

function nullIfBlank(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function roundSqft(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Extract one TRUSTED scope fact per Job Worksheet form.
 * Does not emit raw_payload, material_family, upgrades, or normalized backsplash.
 *
 * @param {object} job brain_moraware_jobs-shaped row (may include raw_payload)
 * @param {{ organizationId?: string|null }} [options]
 * @returns {object[]}
 */
export function extractMorawareJobWorksheetScopeFacts(job, options = {}) {
  const organizationId = options.organizationId ?? job?.organization_id ?? null;
  const sourceJobId = String(job?.source_job_id ?? "").trim();
  const sourceAccountId = nullIfBlank(job?.source_account_id);
  if (!sourceJobId) return [];

  const raw = unwrapJobRaw(job);
  const forms = Array.isArray(raw.forms) ? raw.forms : [];
  const byFormId = new Map();

  for (const form of forms) {
    if (!isExactJobWorksheetTemplate(form)) continue;
    const sourceFormId = String(form?.id ?? "").trim();
    if (!sourceFormId) continue;
    // Last occurrence wins if the same form id appears twice in one payload.
    const fields = fieldsForForm(form);
    const colorRaw = nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.COLOR));
    const sqftRaw = getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.SQFT);
    const fact = {
      organization_id: organizationId,
      source_account_id: sourceAccountId,
      source_job_id: sourceJobId,
      source_form_id: sourceFormId,
      form_name_raw: nullIfBlank(form.formName || form.name || form.rawFormName),
      room_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.ROOM)),
      color_raw: colorRaw,
      color_is_placeholder: isColorPlaceholder(colorRaw),
      sqft: parseWorksheetSqft(sqftRaw),
      edge_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.EDGE)),
      thickness_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.THICKNESS)),
      backsplash_type_raw: nullIfBlank(
        getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.BACKSPLASH_TYPE)
      ),
      backsplash_height_raw: nullIfBlank(
        getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.BACKSPLASH_HEIGHT)
      ),
      sink_type_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.SINK_TYPE)),
      faucet_type_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.FAUCET_TYPE)),
      stove_type_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.STOVE_TYPE)),
      electrical_cutouts_raw: nullIfBlank(
        getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.ELECTRICAL_CUTOUTS)
      ),
      overhang_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.OVERHANG)),
      braces_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.BRACES)),
      dry_treat_raw: nullIfBlank(getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.DRY_TREAT)),
      stone_care_kit_raw: nullIfBlank(
        getJobWorksheetFieldRaw(fields, JOB_WORKSHEET_SCOPE_LABELS.STONE_CARE_KIT)
      )
    };
    byFormId.set(sourceFormId, fact);
  }

  return [...byFormId.values()].sort((a, b) =>
    String(a.source_form_id).localeCompare(String(b.source_form_id))
  );
}

/**
 * Extract worksheet facts for CURRENT_MORAWARE_JOB_SET only.
 * Dedupes jobs by source_job_id (latest last_seen_at wins).
 */
export function extractCurrentMorawareJobWorksheetScopeFacts(jobs, population, options = {}) {
  const current = filterCurrentMorawareJobSet(jobs, population);
  const byJobId = new Map();
  for (const job of current) {
    const id = String(job?.source_job_id ?? "").trim();
    if (!id) continue;
    const prev = byJobId.get(id);
    if (!prev || String(job?.last_seen_at || "") > String(prev?.last_seen_at || "")) {
      byJobId.set(id, job);
    }
  }
  const facts = [];
  for (const job of byJobId.values()) {
    facts.push(...extractMorawareJobWorksheetScopeFacts(job, options));
  }
  return facts;
}

/**
 * Plan prepared worksheet-fact rebuild on the full-census epoch.
 * Incremental groups must not become the universe.
 */
export function planWorksheetScopeFactsRebuild({ jobs, population, latestCompleteGroup = null } = {}) {
  const base = planPreparedFactsRebuild({ jobs, population, latestCompleteGroup });
  const facts = extractCurrentMorawareJobWorksheetScopeFacts(base.jobs, population);
  return {
    ...base,
    worksheet_fact_count: facts.length,
    facts,
    table: "sales_moraware_job_worksheet_facts",
    unique_key: ["organization_id", "import_group_id", "source_job_id", "source_form_id"]
  };
}

function hasNonBlank(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * Color analytics — SqFt by Color is valid (same worksheet grain).
 * Placeholders are separated but raw is preserved.
 */
export function aggregateWorksheetColors(facts, { includePlaceholders = true } = {}) {
  const map = new Map();
  for (const f of facts || []) {
    if (!hasNonBlank(f.color_raw)) continue;
    const placeholder = f.color_is_placeholder === true || isColorPlaceholder(f.color_raw);
    if (!includePlaceholders && placeholder) continue;
    const key = String(f.color_raw);
    if (!map.has(key)) {
      map.set(key, {
        color_raw: key,
        is_placeholder: placeholder,
        worksheet_count: 0,
        job_ids: new Set(),
        sqft: 0
      });
    }
    const row = map.get(key);
    row.worksheet_count += 1;
    row.job_ids.add(String(f.source_job_id));
    if (f.sqft != null && Number.isFinite(Number(f.sqft))) row.sqft += Number(f.sqft);
  }
  return [...map.values()]
    .map((r) => ({
      color_raw: r.color_raw,
      is_placeholder: r.is_placeholder,
      worksheet_count: r.worksheet_count,
      job_count: r.job_ids.size,
      sqft: roundSqft(r.sqft)
    }))
    .sort((a, b) => b.sqft - a.sqft || b.worksheet_count - a.worksheet_count || a.color_raw.localeCompare(b.color_raw));
}

/** Room analytics — SqFt by Room is valid. No room normalization. */
export function aggregateWorksheetRooms(facts) {
  const map = new Map();
  for (const f of facts || []) {
    if (!hasNonBlank(f.room_raw)) continue;
    const key = String(f.room_raw);
    if (!map.has(key)) {
      map.set(key, { room_raw: key, worksheet_count: 0, job_ids: new Set(), sqft: 0 });
    }
    const row = map.get(key);
    row.worksheet_count += 1;
    row.job_ids.add(String(f.source_job_id));
    if (f.sqft != null && Number.isFinite(Number(f.sqft))) row.sqft += Number(f.sqft);
  }
  return [...map.values()]
    .map((r) => ({
      room_raw: r.room_raw,
      worksheet_count: r.worksheet_count,
      job_count: r.job_ids.size,
      sqft: roundSqft(r.sqft)
    }))
    .sort((a, b) => b.sqft - a.sqft || b.worksheet_count - a.worksheet_count || a.room_raw.localeCompare(b.room_raw));
}

/**
 * Edge analytics — worksheet + distinct-job counts only.
 * No SqFt by Edge. No edge LF.
 */
export function aggregateWorksheetEdges(facts) {
  const map = new Map();
  for (const f of facts || []) {
    if (!hasNonBlank(f.edge_raw)) continue;
    const key = String(f.edge_raw);
    if (!map.has(key)) {
      map.set(key, { edge_raw: key, worksheet_count: 0, job_ids: new Set() });
    }
    const row = map.get(key);
    row.worksheet_count += 1;
    row.job_ids.add(String(f.source_job_id));
  }
  return [...map.values()]
    .map((r) => ({
      edge_raw: r.edge_raw,
      worksheet_count: r.worksheet_count,
      distinct_job_count: r.job_ids.size
    }))
    .sort(
      (a, b) =>
        b.worksheet_count - a.worksheet_count ||
        b.distinct_job_count - a.distinct_job_count ||
        a.edge_raw.localeCompare(b.edge_raw)
    );
}

/** Thickness — same-grain SqFt allowed; raw values preserved. */
export function aggregateWorksheetThicknesses(facts) {
  const map = new Map();
  for (const f of facts || []) {
    if (!hasNonBlank(f.thickness_raw)) continue;
    const key = String(f.thickness_raw);
    if (!map.has(key)) {
      map.set(key, { thickness_raw: key, worksheet_count: 0, job_ids: new Set(), sqft: 0 });
    }
    const row = map.get(key);
    row.worksheet_count += 1;
    row.job_ids.add(String(f.source_job_id));
    if (f.sqft != null && Number.isFinite(Number(f.sqft))) row.sqft += Number(f.sqft);
  }
  return [...map.values()]
    .map((r) => ({
      thickness_raw: r.thickness_raw,
      worksheet_count: r.worksheet_count,
      job_count: r.job_ids.size,
      sqft: roundSqft(r.sqft)
    }))
    .sort(
      (a, b) =>
        b.worksheet_count - a.worksheet_count || a.thickness_raw.localeCompare(b.thickness_raw)
    );
}

/** Frequency helper for a raw fabrication field (no invented quantities). */
export function aggregateWorksheetFieldFrequency(facts, fieldKey, outKey) {
  const map = new Map();
  for (const f of facts || []) {
    const raw = f?.[fieldKey];
    if (!hasNonBlank(raw)) continue;
    const key = String(raw);
    if (!map.has(key)) {
      map.set(key, { [outKey]: key, worksheet_count: 0, job_ids: new Set() });
    }
    const row = map.get(key);
    row.worksheet_count += 1;
    row.job_ids.add(String(f.source_job_id));
  }
  return [...map.values()]
    .map((r) => ({
      [outKey]: r[outKey],
      worksheet_count: r.worksheet_count,
      job_count: r.job_ids.size
    }))
    .sort((a, b) => b.worksheet_count - a.worksheet_count || String(a[outKey]).localeCompare(String(b[outKey])));
}

export function aggregateWorksheetSinks(facts) {
  return aggregateWorksheetFieldFrequency(facts, "sink_type_raw", "sink_type_raw");
}

export function sumWorksheetScopeSqft(facts) {
  let total = 0;
  for (const f of facts || []) {
    if (f.sqft != null && Number.isFinite(Number(f.sqft))) total += Number(f.sqft);
  }
  return roundSqft(total) ?? 0;
}

export function coverageByJob(facts, predicate) {
  const jobs = new Set();
  const withFact = new Set();
  for (const f of facts || []) {
    const id = String(f.source_job_id || "");
    if (!id) continue;
    jobs.add(id);
    if (predicate(f)) withFact.add(id);
  }
  return {
    jobs_with_fact: withFact.size,
    // Note: jobs without worksheets never appear in facts; caller should use job universe for full coverage.
    jobs_in_fact_set: jobs.size
  };
}

/**
 * Safe read-contract shape for future Account 360 (not wired to UI here).
 * Never includes raw_payload, material_family, upgrades, or normalized backsplash.
 */
export function buildWorksheetScopeReadModel(facts, { state = "available", notes = null } = {}) {
  const list = Array.isArray(facts) ? facts : [];
  if (state === "unavailable") {
    return {
      state: "unavailable",
      worksheet_count: null,
      job_count: null,
      sqft: null,
      colors: [],
      rooms: [],
      edges: [],
      thicknesses: [],
      sinks: [],
      notes: notes || "Worksheet scope facts are unavailable."
    };
  }
  const jobIds = new Set(list.map((f) => String(f.source_job_id)).filter(Boolean));
  return {
    state: "available",
    worksheet_count: list.length,
    job_count: jobIds.size,
    sqft: sumWorksheetScopeSqft(list),
    colors: aggregateWorksheetColors(list, { includePlaceholders: true }),
    rooms: aggregateWorksheetRooms(list),
    edges: aggregateWorksheetEdges(list),
    thicknesses: aggregateWorksheetThicknesses(list),
    sinks: aggregateWorksheetSinks(list),
    notes
  };
}

/**
 * Strip any accidental payload keys before browser/API serialization.
 */
export function scrubWorksheetScopeFactForBrowser(fact) {
  if (!fact || typeof fact !== "object") return fact;
  const {
    raw_payload: _raw,
    rawPayload: _raw2,
    forms: _forms,
    material_family: _mf,
    upgrade_score: _us,
    upgrade_options: _uo,
    options_derived: _od,
    backsplash_type_normalized: _btn,
    shop_comments: _sc,
    ...safe
  } = fact;
  return safe;
}

export function assertNoForbiddenWorksheetScopeKeys(value, path = "root") {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoForbiddenWorksheetScopeKeys(v, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    const key = String(k).toLowerCase();
    if (
      key === "raw_payload" ||
      key === "rawpayload" ||
      key === "material_family" ||
      key === "upgrade_score" ||
      key === "upgrade_options" ||
      key === "options_derived" ||
      key === "shop_comments"
    ) {
      throw new Error(`Forbidden worksheet scope key at ${path}.${k}`);
    }
    assertNoForbiddenWorksheetScopeKeys(v, `${path}.${k}`);
  }
}

/**
 * Map extracted facts to prepared-table rows for a population epoch.
 */
export function toPreparedWorksheetFactRows(facts, { organizationId, importGroupId, syncRunId = null } = {}) {
  const org = String(organizationId || "").trim();
  const epoch = String(importGroupId || "").trim();
  if (!org || !epoch) return [];
  return (facts || []).map((f) => ({
    organization_id: org,
    import_group_id: epoch,
    sync_run_id: syncRunId,
    source_job_id: f.source_job_id,
    source_account_id: f.source_account_id,
    source_form_id: f.source_form_id,
    form_name_raw: f.form_name_raw,
    room_raw: f.room_raw,
    color_raw: f.color_raw,
    color_is_placeholder: f.color_is_placeholder === true,
    sqft: f.sqft,
    edge_raw: f.edge_raw,
    thickness_raw: f.thickness_raw,
    backsplash_type_raw: f.backsplash_type_raw,
    backsplash_height_raw: f.backsplash_height_raw,
    sink_type_raw: f.sink_type_raw,
    faucet_type_raw: f.faucet_type_raw,
    stove_type_raw: f.stove_type_raw,
    electrical_cutouts_raw: f.electrical_cutouts_raw,
    overhang_raw: f.overhang_raw,
    braces_raw: f.braces_raw,
    dry_treat_raw: f.dry_treat_raw,
    stone_care_kit_raw: f.stone_care_kit_raw
  }));
}
