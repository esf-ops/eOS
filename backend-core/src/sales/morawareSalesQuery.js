/**
 * Deterministic Moraware Sales query helpers — tag classification, in-memory
 * filtering, and summary aggregation for POST /api/sales/query.
 *
 * Read-only analytics only. No SQL construction; callers load bounded fact rows
 * from sales_moraware_job_facts and filter here.
 */

/** @typedef {{ id: string, label: string, patterns: RegExp[] }} MorawareSalesTagRule */

export const MORAWARE_SALES_TAG_RULES = Object.freeze([
  {
    id: "full_height_backsplash",
    label: "Full height backsplash",
    patterns: [
      /\bfhbs\b/i,
      /full[\s-]*height[\s-]*backsplash/i,
      /full[\s-]*height[\s-]*splash/i,
      /full[\s-]*splash/i,
      /backsplash[\s-]*to[\s-]*cabinets/i,
      /splash[\s-]*to[\s-]*cabinets/i
    ]
  },
  {
    id: "customer_service",
    label: "Customer service",
    patterns: [
      /customer[\s-]*service/i,
      /\bservice\b/i,
      /\bwarranty\b/i,
      /\brepair\b/i,
      /\bcallback\b/i,
      /call[\s-]*back/i,
      /return[\s-]*trip/i,
      /\bissue\b/i,
      /\bfix\b/i
    ]
  },
  {
    id: "tear_out",
    label: "Tear out",
    patterns: [/tear[\s-]*out/i, /\btearout\b/i, /\bdemo\b/i, /remove[\s-]*existing/i, /\bremoval\b/i]
  },
  {
    id: "remnant",
    label: "Remnant",
    patterns: [/\bremnants?\b/i, /\bremt?s?\b/i, /\brem\b/i]
  },
  {
    id: "vanity",
    label: "Vanity",
    patterns: [/\bvanities\b/i, /\bvanity\b/i]
  },
  {
    id: "kitchen",
    label: "Kitchen",
    patterns: [/\bkitchen\b/i]
  },
  {
    id: "bath",
    label: "Bath",
    patterns: [/\bbathroom\b/i, /\bmaster[\s-]*bath\b/i, /\bmain[\s-]*bath\b/i, /\blower[\s-]*bath\b/i, /\bpowder[\s-]*bath\b/i, /\bbath\b/i]
  },
  {
    id: "wet_bar",
    label: "Wet bar",
    patterns: [/\bwet[\s-]*bar\b/i, /\bbar[\s-]*top\b/i, /\bbar\b/i]
  },
  {
    id: "fireplace",
    label: "Fireplace",
    patterns: [/\bfireplace\b/i, /\bhearth\b/i, /\bsurround\b/i]
  },
  {
    id: "shower",
    label: "Shower",
    patterns: [/\bshower\b/i, /\bcurb\b/i, /\bniche\b/i, /\bshelf(?:es)?\b/i, /\bbench\b/i]
  },
  {
    id: "laundry",
    label: "Laundry",
    patterns: [/\blaundry\b/i, /drop[\s-]*zone/i]
  }
]);

export const MORAWARE_SALES_TAG_BY_ID = Object.freeze(
  Object.fromEntries(MORAWARE_SALES_TAG_RULES.map((t) => [t.id, t]))
);

const DERIVED_MISSING_SQFT_TAG = Object.freeze({ id: "missing_sqft", label: "Missing sqft" });

/** Normalize free text for case-insensitive matching. */
export function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build searchable corpus from a prepared fact row + optional enrichment. */
export function buildMorawareSearchCorpus(row, enrichment = {}) {
  const parts = [
    row?.account_name,
    row?.salesperson_name,
    row?.process_name,
    row?.status_name,
    row?.source_job_id,
    enrichment?.job_name,
    enrichment?.notes_excerpt
  ];
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

/** Extract a short notes excerpt from Moraware raw_payload form fields. */
export function extractNotesExcerptFromRawPayload(rawPayload, maxLen = 240) {
  if (!rawPayload || typeof rawPayload !== "object") return "";
  const forms = Array.isArray(rawPayload.forms) ? rawPayload.forms : [];
  const bits = [];
  for (const form of forms) {
    const fields = Array.isArray(form?.fields)
      ? form.fields
      : form?.fieldsByLabel && typeof form.fieldsByLabel === "object"
        ? Object.values(form.fieldsByLabel)
        : [];
    for (const field of fields) {
      if (!field || typeof field !== "object") continue;
      const label = String(field.normalizedLabel || field.label || field.name || "").trim();
      const val = String(field.text ?? field.value ?? field.answer ?? "").trim();
      if (label || val) bits.push(label && val ? `${label}>>${val}` : label || val);
    }
  }
  const joined = bits.join(" · ");
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen - 1)}…`;
}

/** True when worksheet sqft is not usable for analytics. */
export function rowMissingSqft(row) {
  if (row?.sqft_found === false) return true;
  const n = Number(row?.worksheet_sqft);
  return !Number.isFinite(n) || n <= 0;
}

/** Classify text-based tags (excludes missing_sqft — derived separately). */
export function classifyTextTags(searchCorpus) {
  const text = normalizeSearchText(searchCorpus);
  if (!text) return [];
  const matched = [];
  for (const rule of MORAWARE_SALES_TAG_RULES) {
    if (rule.patterns.some((re) => re.test(text))) matched.push(rule.id);
  }
  return matched;
}

/** Full tag list including derived missing_sqft when applicable. */
export function classifyMorawareJobTags(row, enrichment = {}) {
  const corpus = buildMorawareSearchCorpus(row, enrichment);
  const tags = classifyTextTags(corpus);
  if (rowMissingSqft(row) && !tags.includes("missing_sqft")) {
    tags.push("missing_sqft");
  }
  return tags;
}

function containsInsensitive(haystack, needle) {
  const h = normalizeSearchText(haystack);
  const n = normalizeSearchText(needle);
  if (!n) return true;
  return h.includes(n);
}

function rowDateYmd(row) {
  const s = String(row?.created_at_source ?? "").trim();
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function parseFiniteNumber(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Normalize and validate query filters from request body. */
export function normalizeMorawareQueryFilters(raw = {}) {
  const limitRaw = parseFiniteNumber(raw.limit);
  const limit = Math.min(250, Math.max(1, limitRaw == null ? 100 : Math.round(limitRaw)));

  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
  const tags = [...new Set(tagsRaw.map((t) => String(t ?? "").trim()).filter(Boolean))];

  return {
    date_from: String(raw.date_from ?? "").trim().slice(0, 10) || null,
    date_to: String(raw.date_to ?? "").trim().slice(0, 10) || null,
    account: String(raw.account ?? "").trim() || null,
    salesperson: String(raw.salesperson ?? "").trim() || null,
    text: String(raw.text ?? "").trim() || null,
    tags,
    min_sqft: parseFiniteNumber(raw.min_sqft),
    max_sqft: parseFiniteNumber(raw.max_sqft),
    missing_sqft: Boolean(raw.missing_sqft),
    limit
  };
}

function tagFilterWantsMissingSqft(filters) {
  return Boolean(filters.missing_sqft) || filters.tags.includes("missing_sqft");
}

function textTagsRequested(filters) {
  return filters.tags.filter((t) => t !== "missing_sqft");
}

/** Returns true if row passes all structured filters. */
export function rowMatchesMorawareQueryFilters(row, filters, enrichment = {}) {
  const dateYmd = rowDateYmd(row);
  if (filters.date_from && dateYmd && dateYmd < filters.date_from) return false;
  if (filters.date_to && dateYmd && dateYmd > filters.date_to) return false;
  if (filters.date_from && !dateYmd) return false;
  if (filters.date_to && !dateYmd) return false;

  if (filters.account && !containsInsensitive(row?.account_name, filters.account)) return false;
  if (filters.salesperson && !containsInsensitive(row?.salesperson_name, filters.salesperson)) return false;

  const corpus = buildMorawareSearchCorpus(row, enrichment);
  if (filters.text && !containsInsensitive(corpus, filters.text)) return false;

  const matchedTags = classifyMorawareJobTags(row, enrichment);
  const requestedTextTags = textTagsRequested(filters);
  if (requestedTextTags.length && !requestedTextTags.some((t) => matchedTags.includes(t))) return false;

  if (tagFilterWantsMissingSqft(filters) && !rowMissingSqft(row)) return false;

  const sqft = Number(row?.worksheet_sqft);
  if (filters.min_sqft != null) {
    if (!Number.isFinite(sqft) || sqft < filters.min_sqft) return false;
  }
  if (filters.max_sqft != null) {
    if (!Number.isFinite(sqft) || sqft > filters.max_sqft) return false;
  }

  return true;
}

function buildMatchReason(row, filters, enrichment, matchedTags) {
  const reasons = [];
  if (filters.account) reasons.push("account");
  if (filters.salesperson) reasons.push("salesperson");
  if (filters.text) reasons.push("text search");
  if (filters.tags.length) reasons.push("tags");
  if (filters.missing_sqft) reasons.push("missing sqft");
  if (filters.min_sqft != null || filters.max_sqft != null) reasons.push("sqft range");
  if (filters.date_from || filters.date_to) reasons.push("date range");
  if (!reasons.length) reasons.push("open query");
  if (matchedTags.length) reasons.push(`tags: ${matchedTags.join(", ")}`);
  if (enrichment?.job_name && filters.text && containsInsensitive(enrichment.job_name, filters.text)) {
    reasons.push("job name");
  }
  return reasons.join("; ");
}

export function mapMorawareQueryResultRow(row, filters, enrichment = {}) {
  const matchedTags = classifyMorawareJobTags(row, enrichment);
  const sqft = Number(row?.worksheet_sqft);
  const sqftFound = !rowMissingSqft(row);
  return {
    job_id: String(row?.source_job_id ?? "").trim() || null,
    job_name: String(enrichment?.job_name ?? row?.process_name ?? "").trim() || null,
    account: String(row?.account_name ?? "").trim() || null,
    salesperson: String(row?.salesperson_name ?? "").trim() || null,
    date: rowDateYmd(row),
    worksheet_sqft: sqftFound ? Math.round(sqft * 10) / 10 : null,
    sqft_found: sqftFound,
    matched_tags: matchedTags,
    match_reason: buildMatchReason(row, filters, enrichment, matchedTags),
    notes_excerpt: String(enrichment?.notes_excerpt ?? "").trim() || null
  };
}

export function buildMorawareQuerySummary(rows) {
  let jobsWithSqft = 0;
  let totalSqft = 0;
  let missingSqftCount = 0;
  for (const row of rows) {
    if (rowMissingSqft(row)) {
      missingSqftCount += 1;
      continue;
    }
    jobsWithSqft += 1;
    totalSqft += Number(row.worksheet_sqft) || 0;
  }
  const jobCount = rows.length;
  return {
    job_count: jobCount,
    jobs_with_sqft: jobsWithSqft,
    total_sqft: Math.round(totalSqft * 10) / 10,
    avg_sqft_per_job: jobsWithSqft > 0 ? Math.round((totalSqft / jobsWithSqft) * 10) / 10 : 0,
    missing_sqft_count: missingSqftCount
  };
}

export function buildMorawareTopAccounts(rows, limit = 8) {
  const map = new Map();
  for (const row of rows) {
    const account = String(row?.account_name ?? "").trim() || "Unassigned";
    const cur = map.get(account) || { account, job_count: 0, total_sqft: 0 };
    cur.job_count += 1;
    if (!rowMissingSqft(row)) cur.total_sqft += Number(row.worksheet_sqft) || 0;
    map.set(account, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.job_count - a.job_count || b.total_sqft - a.total_sqft)
    .slice(0, limit)
    .map((r) => ({ ...r, total_sqft: Math.round(r.total_sqft * 10) / 10 }));
}

export function buildMorawareTopSalespeople(rows, limit = 8) {
  const map = new Map();
  for (const row of rows) {
    const salesperson = String(row?.salesperson_name ?? "").trim() || "Unassigned";
    const cur = map.get(salesperson) || { salesperson, job_count: 0, total_sqft: 0 };
    cur.job_count += 1;
    if (!rowMissingSqft(row)) cur.total_sqft += Number(row.worksheet_sqft) || 0;
    map.set(salesperson, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.job_count - a.job_count || b.total_sqft - a.total_sqft)
    .slice(0, limit)
    .map((r) => ({ ...r, total_sqft: Math.round(r.total_sqft * 10) / 10 }));
}

export function buildMorawareTagBreakdown(rows) {
  const counts = new Map();
  for (const row of rows) {
    const tags = classifyMorawareJobTags(row, row.__enrichment);
    for (const tagId of tags) {
      counts.set(tagId, (counts.get(tagId) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, job_count]) => ({
      tag,
      label: tag === "missing_sqft" ? DERIVED_MISSING_SQFT_TAG.label : MORAWARE_SALES_TAG_BY_ID[tag]?.label || tag,
      job_count
    }))
    .sort((a, b) => b.job_count - a.job_count);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function formatDateLabel(ymd) {
  if (!ymd || ymd.length < 10) return ymd;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Human-readable chips describing filters applied. */
export function buildMorawareFiltersApplied(filters) {
  const chips = [];
  if (filters.date_from && filters.date_to) {
    chips.push({ key: "date_range", label: `${formatDateLabel(filters.date_from)}–${formatDateLabel(filters.date_to)}` });
  } else if (filters.date_from) {
    chips.push({ key: "date_from", label: `From ${formatDateLabel(filters.date_from)}` });
  } else if (filters.date_to) {
    chips.push({ key: "date_to", label: `Through ${formatDateLabel(filters.date_to)}` });
  }
  if (filters.account) chips.push({ key: "account", label: `Account: ${filters.account}` });
  if (filters.salesperson) chips.push({ key: "salesperson", label: `Salesperson: ${filters.salesperson}` });
  if (filters.text) chips.push({ key: "text", label: `Text: ${filters.text}` });
  for (const tagId of filters.tags) {
    const label = tagId === "missing_sqft" ? DERIVED_MISSING_SQFT_TAG.label : MORAWARE_SALES_TAG_BY_ID[tagId]?.label || tagId;
    chips.push({ key: "tag", label });
  }
  if (filters.missing_sqft && !filters.tags.includes("missing_sqft")) {
    chips.push({ key: "missing_sqft", label: DERIVED_MISSING_SQFT_TAG.label });
  }
  if (filters.min_sqft != null) chips.push({ key: "min_sqft", label: `Min ${filters.min_sqft} sqft` });
  if (filters.max_sqft != null) chips.push({ key: "max_sqft", label: `Max ${filters.max_sqft} sqft` });
  return chips;
}

/**
 * Filter prepared fact rows in memory and build the full query response payload.
 * @param {Array<object>} factRows
 * @param {object} filters normalized filters
 * @param {Map<string, { job_name?: string, notes_excerpt?: string }>} enrichmentByJobId
 */
export function executeMorawareSalesQuery(factRows, filters, enrichmentByJobId = new Map()) {
  const matched = [];
  for (const row of factRows || []) {
    const enrichment = enrichmentByJobId.get(String(row?.source_job_id ?? "")) || {};
    if (rowMatchesMorawareQueryFilters(row, filters, enrichment)) {
      matched.push({ ...row, __enrichment: enrichment });
    }
  }

  const totalCount = matched.length;
  const limited = matched.slice(0, filters.limit);
  const summary = buildMorawareQuerySummary(matched);
  const rows = limited.map((row) => mapMorawareQueryResultRow(row, filters, row.__enrichment));

  return {
    summary,
    filters_applied: buildMorawareFiltersApplied(filters),
    top_accounts: buildMorawareTopAccounts(matched),
    top_salespeople: buildMorawareTopSalespeople(matched),
    tag_breakdown: buildMorawareTagBreakdown(matched),
    total_count: totalCount,
    rows
  };
}

export { MONTH_NAMES, DERIVED_MISSING_SQFT_TAG };
