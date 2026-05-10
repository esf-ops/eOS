/**
 * GET /api/titans/today — Brain-only Titan/Saw activity signals (not machine telemetry).
 * See docs/TITANS_TODAY_DATA_DISCOVERY.md
 */

/* Keyword rules aligned with auditTitanTodayReadiness.js / readiness report */
const TYPE_KEYWORD_RES = [
  /\btitan\b/i,
  /\bsaw\b/i,
  /sawyer/i,
  /cutting/i,
  /\bcut\b/i,
  /\bcnc\b/i,
  /program/i,
  /production/i,
  /\bfab\b/i,
  /fabrication/i,
  /polish/i,
  /\bshop\b/i
];

/** Human-readable slug per keyword heuristic (parallel to TYPE_KEYWORD_RES). */
export const TYPE_KEYWORD_SLUGS = [
  "titan",
  "saw",
  "sawyer",
  "cutting",
  "cut",
  "cnc",
  "program",
  "production",
  "fab",
  "fabrication",
  "polish",
  "shop"
];

const LEADERSHIP_STATUSES = [
  "Queued for Titan",
  "Cutting Now",
  "Cut Complete",
  "Held / Needs Review",
  "Missing Material",
  "Waiting on Template",
  "Ready for Next Phase"
];

/** Shown alongside sync freshness — operational cadence expectation, not a coded scheduler. */
export const RECOMMENDED_SYNC_CADENCE =
  "For live Titan review, run recent operational sync every 5–15 minutes during production hours.";

const SHOP_GROUP_ORDER = ["titan_saw", "programming", "fabrication", "polish", "install_ready", "other_shop_activity"];

const SHOP_GROUP_LABELS = {
  titan_saw: "Titan / Saw (activity group)",
  programming: "Programming (activity group)",
  fabrication: "Fabrication (activity group)",
  polish: "Polish (activity group)",
  install_ready: "Install-ready (activity group)",
  other_shop_activity: "Other shop activity signals"
};

export function combinedActivityText(row) {
  return [row.activity_type, row.activity_status, row.phase_name, row.description, row.notes].map((x) => String(x ?? "")).join(" | ");
}

/** Prefer operational expansion names when present. */
export function activityTypeDisplay(row) {
  const v = row.activity_type_name ?? row.activity_type;
  return v != null ? String(v).trim() : "";
}

export function statusDisplay(row) {
  const v = row.status_name ?? row.activity_status;
  return v != null ? String(v).trim() : "";
}

/** Saw or Polish activity types from Brain text fields (confirmed ops expansion + legacy). */
export function isSawPolishActivity(row) {
  const t = activityTypeDisplay(row).toLowerCase();
  if (!t) return false;
  return /\bsaw\b/i.test(t) || /\bpolish\b/i.test(t);
}

/**
 * Interim checklist state from Moraware Brain fields only.
 * @returns {"complete"|"needs_review"|"machine_unresolved"}
 */
export function computeSawPolishChecklistState(row) {
  const statusText = statusDisplay(row);
  const hasStatus = statusText.length > 0;
  const sd = row.start_date != null ? String(row.start_date).trim() : "";
  const hasStart = /^\d{4}-\d{2}-\d{2}/.test(sd);
  const st = row.sched_time != null ? String(row.sched_time).trim() : "";
  const hasSchedTime = st.length > 0;

  if (/complete/i.test(statusText)) {
    return "complete";
  }
  if (!hasStatus || !hasStart || !hasSchedTime) {
    return "needs_review";
  }
  /** Moraware schedule/status present but Brain has no assigned_machine / Machines row yet — interim honesty. */
  return "machine_unresolved";
}

/**
 * Moraware-linked **activity grouping** — not validated as physical cells until Eric's paper list sign-off.
 */
export function classifyActivityGroupKey(row) {
  const blob = combinedActivityText(row).toLowerCase();
  if (/ready\s+for\s+next\s+phase|ready\s+for\s+install|(?<![\w/])\binstall\b|installed\b/.test(blob))
    return "install_ready";
  if (/\bpolish/.test(blob)) return "polish";
  if (/\bfabrication\b|\bfab\b/.test(blob)) return "fabrication";
  if (/saw\s*program|titan\s*program|\bcnc\b|\bprogramming\b|\bprogram\b/.test(blob)) return "programming";
  if (/\btitan\b|\bsaw\b|cutting|\bcut\b|sawyer/.test(blob)) return "titan_saw";
  return "other_shop_activity";
}

export function isTitanLikeActivity(row) {
  const blob = combinedActivityText(row);
  return TYPE_KEYWORD_RES.some((re) => re.test(blob));
}

/** @param {object} row */
export function titanMatchedKeywordSlugs(row) {
  const blob = combinedActivityText(row);
  const slugs = [];
  for (let i = 0; i < TYPE_KEYWORD_RES.length; i++) {
    if (TYPE_KEYWORD_RES[i].test(blob)) slugs.push(TYPE_KEYWORD_SLUGS[i]);
  }
  return slugs;
}

function cappedSortedUniq(strings, max = 160) {
  return [...new Set(strings.map((s) => String(s ?? "").trim() || "(empty)"))].sort().slice(0, max);
}

function sanitizeSyncRowLite(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : null,
    mode: row.mode != null ? String(row.mode) : null,
    status: row.status != null ? String(row.status) : null,
    finished_at: row.finished_at != null ? String(row.finished_at) : null,
    started_at: row.started_at != null ? String(row.started_at) : null,
    ingest_operational: row.ingest_operational === undefined ? undefined : Boolean(row.ingest_operational)
  };
}

function sampleCandidatesLimited(titanActs, maxRows = 12) {
  return (titanActs ?? []).slice(0, maxRows).map((row) => ({
    jobId: String(row.job_id ?? ""),
    activityType: String(row.activity_type ?? "").slice(0, 200),
    activityStatus: String(row.activity_status ?? "").slice(0, 200),
    phaseName: row.phase_name != null ? String(row.phase_name).slice(0, 200) : null,
    startDate: row.start_date != null ? String(row.start_date) : null,
    keywordSlugsMatched: titanMatchedKeywordSlugs(row)
  }));
}

/**
 * Build debug-only mapping summary (additive to GET /api/titans/today?debug=1).
 * Omits secrets, raw_xml, Brain raw_json payloads.
 */
function buildTitansTodayDebug(opts) {
  const {
    selectedDate,
    totalActivitiesForDate,
    titanActs,
    allJobsPayload,
    latestSyncRow,
    syncFreshnessPickReason
  } = opts;

  const typesSeen = cappedSortedUniq(
    (titanActs ?? []).map((r) => r.activity_type),
    120
  );
  const statusesSeen = cappedSortedUniq(
    (titanActs ?? []).map((r) => r.activity_status),
    120
  );

  const activityGroupCounts = {};
  for (const j of allJobsPayload ?? []) {
    const k = String(j.activityGroupKey ?? "other_shop_activity");
    activityGroupCounts[k] = (activityGroupCounts[k] || 0) + 1;
  }

  return {
    selectedDate,
    candidateActivityCount: (titanActs ?? []).length,
    candidateJobCount: (allJobsPayload ?? []).length,
    /** Regex source strings driving `isTitanLikeActivity`; no credential data. */
    filterKeywordsUsed: TYPE_KEYWORD_RES.map((re, idx) => ({
      slug: TYPE_KEYWORD_SLUGS[idx],
      regexSource: re.source,
      regexFlags: re.flags
    })),
    rawActivityTypesSeen: typesSeen,
    rawStatusesSeen: statusesSeen,
    activityGroupCounts,
    timestampFieldsUsed: [
      "`brain_job_activities.synced_at` via `activityRecencyMs` when present (Brain ingest iso)",
      "else `start_date` calendar slice as midday UTC surrogate",
      "else deterministic `activity id` ordinal fallback for ordering only"
    ],
    omittedReasonCounts: {
      activities_on_date_not_matching_titan_keyword_heuristic: Math.max(
        0,
        Number(totalActivitiesForDate || 0) - (titanActs ?? []).length
      )
    },
    brainSyncRowUsed: sanitizeSyncRowLite(latestSyncRow),
    syncFreshnessPickReason: syncFreshnessPickReason || "unknown",
    sampleCandidates: sampleCandidatesLimited(titanActs, 12)
  };
}

export function localTodayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function parseIsoYmd(param) {
  const s = String(param ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Activity recency: prefer synced_at (Brain ingest), then start_date calendar.
 * brain_job_activities has no completed_at; Moraware completion is reflected via activity_status text.
 */
export function activityRecencyMs(row) {
  if (row.synced_at) {
    const t = new Date(row.synced_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  const sd = String(row.start_date ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) {
    const t = new Date(`${sd}T12:00:00.000Z`).getTime();
    if (Number.isFinite(t)) return t;
  }
  return Number(row.id) || 0;
}

/**
 * Map Moraware-ish activity strings to leadership-facing status.
 * @param {object} row — brain_job_activities row
 * @param {object | null} op — brain_job_operational_summary row or null
 */
export function mapToLeadershipStatus(row, op) {
  const type = String(row.activity_type ?? "").toLowerCase();
  const status = String(row.activity_status ?? "").toLowerCase();
  const blob = `${type} ${status} ${String(row.description ?? "").toLowerCase()} ${String(row.notes ?? "").toLowerCase()}`;

  if (/missing material|slab issue|no slab|material\s*risk|out of slab|needs stone|order stone hold/i.test(blob)) {
    return "Missing Material";
  }
  if (/waiting on template|template incomplete|needs template|template not|no template/i.test(blob)) {
    return "Waiting on Template";
  }
  if (
    /hold|held|delay|delayed|blocked|issue|problem|remake|cancel/i.test(status) ||
    /hold|blocked|issue|problem|remake/i.test(blob)
  ) {
    return "Held / Needs Review";
  }
  if (/complete|completed|done|finished|installed/.test(status)) {
    return "Cut Complete";
  }
  if (/active|in progress|in-progress|started|working|processing|running/.test(status) || /\b(run|running)\b/i.test(blob)) {
    return "Cutting Now";
  }
  if (/scheduled|confirmed|planned|queued|estimate|auto-schedule/.test(status)) {
    return "Queued for Titan";
  }

  if (op) {
    if (op.has_remake_signal === true || op.has_change_signal === true) return "Held / Needs Review";
    if (op.has_customer_service_signal === true && /service|cs|customer/i.test(blob)) return "Held / Needs Review";
  }

  return "Ready for Next Phase";
}

function isSqftFieldLabel(lab) {
  const s = String(lab ?? "").toLowerCase();
  return (
    s.includes("sq") ||
    s.includes("sqft") ||
    s.includes("square") ||
    s.includes("worksheet") ||
    s.includes("footage")
  );
}

async function fetchAllRows(buildQuery, pageSize = 1500) {
  const rows = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }
  return rows;
}

/**
 * Resolve worksheet Sq.Ft.: brain_jobs first; else sum sqft-like brain_fields (read-only; does not alter sync math).
 */
function sumSqftFromFieldRows(rows) {
  let sum = 0;
  for (const r of rows) {
    const lab = `${r.normalized_label ?? ""} ${r.label ?? ""}`;
    if (!isSqftFieldLabel(lab)) continue;
    const n = r.numeric_value != null ? safeNum(r.numeric_value) : safeNum(r.value);
    if (n != null && n > 0) sum += n;
  }
  return sum > 0 ? sum : null;
}

async function batchMaterialColors(supabase, jobIds) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const colorRe = /color|material|granite|quartz|slab/i;
  for (const part of chunkIds(jobIds, 100)) {
    const { data, error } = await supabase
      .from("brain_fields")
      .select("job_id,normalized_label,label,value")
      .in("job_id", part)
      .or("normalized_label.ilike.%color%,normalized_label.ilike.%material%,label.ilike.%color%,label.ilike.%material%");
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const jid = String(r.job_id);
      if (out.has(jid)) continue;
      const lab = `${r.normalized_label ?? ""} ${r.label ?? ""}`;
      if (!colorRe.test(lab)) continue;
      const v = String(r.value ?? "").trim();
      if (v) out.set(jid, v.slice(0, 200));
    }
  }
  return out;
}

async function batchCityByJob(supabase, jobIds) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!jobIds.length) return out;
  try {
    for (const part of chunkIds(jobIds, 150)) {
      const { data, error } = await supabase.from("brain_job_addresses").select("job_id,city").in("job_id", part);
      if (error) continue;
      for (const r of data ?? []) {
        const jid = String(r.job_id);
        if (out.has(jid)) continue;
        const c = r.city != null ? String(r.city).trim() : "";
        if (c) out.set(jid, c.slice(0, 120));
      }
    }
  } catch {
    /* brain_job_addresses optional */
  }
  return out;
}

/**
 * Interim Saw/Polish completion checklist — Brain Moraware fields only (no assigned_machine).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function buildSawPolishChecklistPayload(supabase, activities, localDateYmd, debug) {
  const label = "Saw/Polish completion signals";
  const machineAssignmentNote =
    "Machine row assignment is still being validated from Moraware JobActivity.Assignees. This view uses Moraware activity and status fields from the Brain until calendar-row assignment is confirmed.";
  const base = {
    label,
    machineAssignmentStatus: "unresolved",
    machineAssignmentNote,
    date: localDateYmd,
    sourceFieldsUsed: [
      "activity_type_name → activity_type",
      "status_name → activity_status",
      "phase_name",
      "start_date",
      "sched_time",
      "duration",
      "notes",
      "description"
    ],
    jobs: [],
    stats: {
      totalSawPolish: 0,
      complete: 0,
      needsReview: 0,
      machineUnresolved: 0,
      missingStatus: 0,
      missingScheduledTime: 0,
      missingMachineAssignment: 0
    }
  };

  const sp = (activities ?? []).filter(isSawPolishActivity);
  base.stats.totalSawPolish = sp.length;
  base.stats.missingMachineAssignment = sp.length;

  if (!sp.length) {
    return base;
  }

  const jobIds = [...new Set(sp.map((r) => String(r.job_id)))];
  /** @type {Map<string, object>} */
  const jobsMap = new Map();
  for (const part of chunkIds(jobIds, 200)) {
    const { data, error } = await supabase
      .from("brain_jobs")
      .select("job_id,job_name,account_name,worksheet_sqft,job_status")
      .in("job_id", part);
    if (error) throw new Error(error.message);
    for (const j of data ?? []) jobsMap.set(String(j.job_id), j);
  }

  const cityByJob = await batchCityByJob(supabase, jobIds);

  for (const row of sp) {
    const jid = String(row.job_id);
    const job = jobsMap.get(jid) ?? {};
    const checklistState = computeSawPolishChecklistState(row);
    const st = statusDisplay(row);
    if (!st) base.stats.missingStatus += 1;
    const schedT = row.sched_time != null ? String(row.sched_time).trim() : "";
    if (!schedT) base.stats.missingScheduledTime += 1;

    if (checklistState === "complete") base.stats.complete += 1;
    else if (checklistState === "needs_review") base.stats.needsReview += 1;
    else base.stats.machineUnresolved += 1;

    const notesFull = row.notes != null ? String(row.notes) : "";
    const descFull = row.description != null ? String(row.description) : "";

    base.jobs.push({
      activityRowId: row.id != null ? String(row.id) : null,
      jobId: jid,
      jobName: String(job?.job_name ?? "").trim() || "(unknown job)",
      account: String(job?.account_name ?? "").trim() || "",
      city: cityByJob.get(jid) ?? null,
      activityType: activityTypeDisplay(row) || String(row.activity_type ?? "").trim(),
      status: st || String(row.activity_status ?? "").trim(),
      phaseName: row.phase_name != null ? String(row.phase_name).trim() : null,
      scheduledDate: row.start_date != null ? String(row.start_date).slice(0, 10) : null,
      scheduledTime: row.sched_time != null ? String(row.sched_time).trim() : null,
      duration: row.duration != null ? String(row.duration).trim() : null,
      notesPreview: notesFull ? notesFull.slice(0, 120) : null,
      hasNotes: Boolean(notesFull.trim()),
      descriptionPreview: descFull ? descFull.slice(0, 120) : null,
      hasDescription: Boolean(descFull.trim()),
      checklistState,
      machineColumnLabel: "Resolving",
      machineAssignmentUnresolved: true
    });
  }

  const stateOrder = { needs_review: 0, machine_unresolved: 1, complete: 2 };
  base.jobs.sort((a, b) => {
    const da = stateOrder[a.checklistState] ?? 9;
    const db = stateOrder[b.checklistState] ?? 9;
    if (da !== db) return da - db;
    return String(a.scheduledTime ?? "").localeCompare(String(b.scheduledTime ?? ""));
  });

  if (debug) {
    base.developerDebug = {
      machineAssignmentStatus: "unresolved",
      sourceFieldsUsed: base.sourceFieldsUsed,
      totalSawPolishRows: sp.length,
      missingStatusCount: base.stats.missingStatus,
      missingScheduledTimeCount: base.stats.missingScheduledTime,
      missingMachineAssignmentCount: base.stats.missingMachineAssignment,
      checklistStateCounts: {
        complete: base.stats.complete,
        needs_review: base.stats.needsReview,
        machine_unresolved: base.stats.machineUnresolved
      }
    };
  }

  return base;
}

async function batchSqftFallback(supabase, jobIdsNeeding) {
  /** @type {Map<string, number>} */
  const out = new Map();
  if (!jobIdsNeeding.length) return out;
  for (const part of chunkIds(jobIdsNeeding, 50)) {
    const { data, error } = await supabase
      .from("brain_fields")
      .select("job_id,normalized_label,label,numeric_value,value")
      .in("job_id", part);
    if (error) throw new Error(error.message);
    const byJob = new Map();
    for (const r of data ?? []) {
      const jid = String(r.job_id);
      const list = byJob.get(jid) || [];
      list.push(r);
      byJob.set(jid, list);
    }
    for (const jid of part) {
      const rows = byJob.get(jid) || [];
      const s = sumSqftFromFieldRows(rows);
      if (s != null) out.set(jid, s);
    }
  }
  return out;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ localDateYmd: string, limit: number, debug?: boolean }} opts
 */
export async function buildTitansTodayPayload(supabase, opts) {
  const localDateYmd = opts.localDateYmd;
  const limit = clampLimit(opts.limit);
  const debug = Boolean(opts.debug);

  /** @type {{ row: object | null, pickReason: string }} */
  let latestSyncPick = { row: null, pickReason: "not_queried" };
  let syncFreshness = { lastBrainSyncAt: null, ageSeconds: null, freshnessLabel: "Unknown" };
  try {
    latestSyncPick = await fetchLatestRelevantBrainSync(supabase);
    const iso = latestSyncPick.row?.finished_at ? String(latestSyncPick.row.finished_at) : null;
    syncFreshness = computeSyncFreshness(iso);
  } catch {
    latestSyncPick = { row: null, pickReason: "query_error" };
    syncFreshness = { lastBrainSyncAt: null, ageSeconds: null, freshnessLabel: "Unknown" };
  }

  const activities = await fetchAllRows((from, to) =>
    supabase
      .from("brain_job_activities")
      .select(
        "id,job_id,activity_index,activity_type,activity_type_name,activity_status,status_name,phase_name,start_date,sched_time,duration,description,notes,raw_json,synced_at"
      )
      .eq("start_date", localDateYmd)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const sawPolishChecklist = await buildSawPolishChecklistPayload(supabase, activities, localDateYmd, debug);

  const titanActs = activities.filter(isTitanLikeActivity);

  if (titanActs.length === 0) {
    const emptyPayload = {
      ok: true,
      label: "Titan/Saw activity signals",
      source: "eOS Brain",
      lastUpdated: new Date().toISOString(),
      localDate: localDateYmd,
      activeTitanJobs: 0,
      completedToday: 0,
      heldOrNeedsReview: 0,
      totalSqftToday: 0,
      averageCompletionPace: null,
      syncFreshness,
      recommendedSyncCadence: RECOMMENDED_SYNC_CADENCE,
      pace: buildPaceFromCompletedJobs([]),
      shops: rollupShopBuckets([]),
      jobs: [],
      sawPolishChecklist,
      emptyStateMessage:
        activities.length === 0
          ? "No activities were found in the eOS Brain for this calendar date. Run operational sync or pick another day."
          : "No Titan/Saw keyword activity signals for this date. Saw/Polish completion signals may still appear below if applicable.",
      notes: [
        "Uses Moraware activity signals from the eOS Brain.",
        "Moraware status “Complete” is the crossed-off / done signal for an activity row (not equipment sensors).",
        "Activity ‘shops’ are Moraware-derived groups — validate with Eric's paper Titan list.",
        `Server local calendar date: ${localDateYmd}.`
      ]
    };
    if (debug) {
      emptyPayload.debug = buildTitansTodayDebug({
        selectedDate: localDateYmd,
        totalActivitiesForDate: activities.length,
        titanActs: [],
        allJobsPayload: [],
        latestSyncRow: latestSyncPick.row,
        syncFreshnessPickReason: latestSyncPick.pickReason
      });
    }
    return emptyPayload;
  }

  /** @type {Map<string, object[]>} */
  const byJob = new Map();
  for (const a of titanActs) {
    const jid = String(a.job_id);
    if (!byJob.has(jid)) byJob.set(jid, []);
    byJob.get(jid).push(a);
  }

  const jobIds = [...byJob.keys()];

  const jobsMap = new Map();
  for (const part of chunkIds(jobIds, 200)) {
    const { data, error } = await supabase
      .from("brain_jobs")
      .select("job_id,job_name,account_name,worksheet_sqft,job_status")
      .in("job_id", part);
    if (error) throw new Error(error.message);
    for (const j of data ?? []) jobsMap.set(String(j.job_id), j);
  }

  const opMap = new Map();
  for (const part of chunkIds(jobIds, 150)) {
    const { data, error } = await supabase.from("brain_job_operational_summary").select("*").in("job_id", part);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) opMap.set(String(r.job_id), r);
  }

  /** Representative activity per job = most recently updated / synced */
  const repByJob = new Map();
  for (const jid of jobIds) {
    const list = byJob.get(jid) || [];
    let best = list[0];
    let bestMs = activityRecencyMs(best);
    for (const row of list.slice(1)) {
      const ms = activityRecencyMs(row);
      if (ms >= bestMs) {
        best = row;
        bestMs = ms;
      }
    }
    repByJob.set(jid, best);
  }

  const materialByJob = await batchMaterialColors(supabase, jobIds);
  const needSqft = jobIds.filter((jid) => {
    const ws = safeNum(jobsMap.get(jid)?.worksheet_sqft);
    return ws == null || ws <= 0;
  });
  const sqftFallback = await batchSqftFallback(supabase, needSqft);

  /** @type {Array<{ jobId: string, sortMs: number, payload: object }>} */
  const fullRows = [];

  for (const jid of jobIds) {
    const job = jobsMap.get(jid) ?? {};
    const act = repByJob.get(jid);
    const op = opMap.get(jid) ?? null;

    const status = mapToLeadershipStatus(act, op);

    const materialColor = materialByJob.get(jid) ?? null;

    const ws = safeNum(job?.worksheet_sqft);
    const squareFootage =
      ws != null && ws > 0 ? ws : sqftFallback.get(jid) ?? null;

    const lastMs = activityRecencyMs(act);
    const lastPhaseUpdate = Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null;

    const activityGroupKey = classifyActivityGroupKey(act);
    const activityGroupLabel = SHOP_GROUP_LABELS[activityGroupKey] ?? SHOP_GROUP_LABELS.other_shop_activity;

    const payload = {
      jobId: jid,
      jobName: String(job?.job_name ?? "").trim() || "(unknown job)",
      account: String(job?.account_name ?? "").trim() || "",
      materialColor,
      squareFootage,
      status,
      activityGroupKey,
      activityGroupLabel,
      rawActivityType: act.activity_type != null ? String(act.activity_type) : null,
      rawActivityStatus: act.activity_status != null ? String(act.activity_status) : null,
      lastPhaseUpdate,
      signals: {
        hasSlabSignal: Boolean(op?.has_slab_signal),
        hasChangeSignal: Boolean(op?.has_change_signal),
        hasRemakeSignal: Boolean(op?.has_remake_signal),
        hasCustomerServiceSignal: Boolean(op?.has_customer_service_signal),
        hasRepairSignal: Boolean(op?.has_repair_signal)
      }
    };

    fullRows.push({ jobId: jid, sortMs: lastMs, payload });
  }

  fullRows.sort((a, b) => b.sortMs - a.sortMs);

  const allJobsPayload = fullRows.map((r) => r.payload);

  let activeTitanJobs = 0;
  let completedToday = 0;
  let heldOrNeedsReview = 0;
  let totalSqftToday = 0;

  const HELD_SET = new Set(["Held / Needs Review", "Missing Material", "Waiting on Template"]);

  for (const j of allJobsPayload) {
    if (j.status !== "Cut Complete") activeTitanJobs += 1;
    if (j.status === "Cut Complete") completedToday += 1;
    if (HELD_SET.has(j.status)) heldOrNeedsReview += 1;
    const sf = safeNum(j.squareFootage);
    if (sf != null && sf > 0) totalSqftToday += sf;
  }

  const completedForPace = allJobsPayload.filter((j) => j.status === "Cut Complete" && j.lastPhaseUpdate);
  let averageCompletionPace = null;
  if (completedForPace.length >= 2) {
    const times = completedForPace.map((j) => new Date(j.lastPhaseUpdate).getTime()).filter(Number.isFinite);
    if (times.length >= 2) {
      const minT = Math.min(...times);
      const maxT = Math.max(...times);
      const hours = (maxT - minT) / 3600000;
      const sumSq = completedForPace.reduce((acc, j) => acc + (safeNum(j.squareFootage) || 0), 0);
      if (hours > 0.25 && sumSq > 0) averageCompletionPace = sumSq / hours;
    }
  }

  const limitedJobs = allJobsPayload.slice(0, limit);
  const completedOnly = allJobsPayload.filter((j) => j.status === "Cut Complete");
  const pace = buildPaceFromCompletedJobs(completedOnly);
  const shops = rollupShopBuckets(allJobsPayload);

  const fullPayload = {
    ok: true,
    label: "Titan/Saw activity signals",
    source: "eOS Brain",
    lastUpdated: new Date().toISOString(),
    localDate: localDateYmd,
    activeTitanJobs,
    completedToday,
    heldOrNeedsReview,
    totalSqftToday,
    averageCompletionPace,
    syncFreshness,
    recommendedSyncCadence: RECOMMENDED_SYNC_CADENCE,
    pace,
    shops,
    jobs: limitedJobs,
    sawPolishChecklist,
    emptyStateMessage: null,
    notes: [
      "Uses Moraware activity signals from the eOS Brain.",
      "Moraware status “Complete” is the crossed-off / done signal for an activity row (not equipment sensors).",
      "Average time between completion signals derives from Brain/Moraware timestamps — not shop cycle timers.",
      "Activity shop cards are heuristic groups pending validation vs Eric's Titan paper list.",
      `Metrics cover all Titan/Saw-like jobs for ${localDateYmd}; the jobs array is limited to ${limit} (most recent first).`,
      `Leadership status enum: ${LEADERSHIP_STATUSES.join("; ")}.`
    ]
  };

  if (debug) {
    fullPayload.debug = buildTitansTodayDebug({
      selectedDate: localDateYmd,
      totalActivitiesForDate: activities.length,
      titanActs,
      allJobsPayload,
      latestSyncRow: latestSyncPick.row,
      syncFreshnessPickReason: latestSyncPick.pickReason
    });
  }

  return fullPayload;
}

function chunkIds(ids, size) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function clampLimit(n) {
  const x = Number.parseInt(String(n ?? 50), 10);
  if (!Number.isFinite(x)) return 50;
  return Math.max(1, Math.min(200, x));
}

function computeSyncFreshness(lastBrainSyncAtIso) {
  if (!lastBrainSyncAtIso) {
    return { lastBrainSyncAt: null, ageSeconds: null, freshnessLabel: "Unknown" };
  }
  const t = new Date(lastBrainSyncAtIso).getTime();
  if (!Number.isFinite(t)) {
    return { lastBrainSyncAt: null, ageSeconds: null, freshnessLabel: "Unknown" };
  }
  const ageSeconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  let freshnessLabel = "Stale";
  if (ageSeconds <= 600) freshnessLabel = "Fresh";
  else if (ageSeconds <= 1800) freshnessLabel = "Aging";
  return { lastBrainSyncAt: lastBrainSyncAtIso, ageSeconds, freshnessLabel };
}

/** Gaps computed from Brain/Moraware completion signal timestamps only — not machine cycle time. */
function buildPaceFromCompletedJobs(completedPayloads) {
  const sorted = [...completedPayloads].sort(
    (a, b) => new Date(a.lastPhaseUpdate || 0).getTime() - new Date(b.lastPhaseUpdate || 0).getTime()
  );
  const withT = sorted
    .map((j) => ({ j, ms: new Date(j.lastPhaseUpdate).getTime() }))
    .filter((x) => Number.isFinite(x.ms));
  const completedJobCount = withT.length;
  const completedSqftAll = sorted.reduce((acc, j) => acc + (safeNum(j.squareFootage) || 0), 0);
  const nullBlock = () => ({
    completedJobCount: null,
    completedSqft: null,
    averageMinutesBetweenCompletions: null,
    longestGapMinutes: null,
    firstCompletionAt: null,
    lastCompletionAt: null,
    completedSqftPerHour: null
  });

  if (completedJobCount < 1) return nullBlock();
  const firstCompletionAt = new Date(withT[0].ms).toISOString();
  const lastCompletionAt = new Date(withT[withT.length - 1].ms).toISOString();
  /** Minutes between successive Moraware “complete” completions (chronological). */
  const gapsMin = [];
  for (let i = 1; i < withT.length; i++) {
    gapsMin.push((withT[i].ms - withT[i - 1].ms) / 60000);
  }
  let averageMinutesBetweenCompletions = gapsMin.length ? gapsMin.reduce((a, b) => a + b, 0) / gapsMin.length : null;
  let longestGapMinutes = gapsMin.length ? Math.max(...gapsMin) : null;

  let completedSqftPerHour = null;
  const spanH = (withT[withT.length - 1].ms - withT[0].ms) / 3600000;
  if (withT.length >= 2 && spanH > 0 && completedSqftAll > 0) {
    completedSqftPerHour = completedSqftAll / spanH;
  }

  if (completedJobCount === 1) {
    return {
      completedJobCount: 1,
      completedSqft: completedSqftAll > 0 ? completedSqftAll : null,
      averageMinutesBetweenCompletions: null,
      longestGapMinutes: null,
      firstCompletionAt,
      lastCompletionAt,
      completedSqftPerHour: null
    };
  }

  if (completedJobCount < 2 || gapsMin.length === 0) {
    return {
      completedJobCount,
      completedSqft: completedSqftAll > 0 ? completedSqftAll : null,
      averageMinutesBetweenCompletions: null,
      longestGapMinutes: null,
      firstCompletionAt,
      lastCompletionAt,
      completedSqftPerHour: null
    };
  }

  return {
    completedJobCount,
    completedSqft: completedSqftAll > 0 ? completedSqftAll : null,
    averageMinutesBetweenCompletions,
    longestGapMinutes,
    firstCompletionAt,
    lastCompletionAt,
    completedSqftPerHour
  };
}

/**
 * Latest finished `brain_sync_runs`, prefer operational-marked rows for Titan pulse freshness semantics.
 */
async function fetchLatestRelevantBrainSync(supabase) {
  const compact = async (selectList) =>
    supabase
      .from("brain_sync_runs")
      .select(selectList)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(40);

  let { data, error } = await compact("id, mode, finished_at, started_at, status, ingest_operational");
  if (error) {
    const r = await compact("id, mode, finished_at, started_at, status");
    data = r.data;
    error = r.error;
  }
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) {
    return { row: null, pickReason: "no_finished_sync_runs" };
  }
  const prefersOps = rows.filter((row) =>
    Boolean(row.ingest_operational === true || /operational/i.test(String(row.mode ?? "")))
  );
  const chosen = prefersOps[0] ?? rows[0];
  return {
    row: chosen ?? null,
    pickReason: prefersOps[0] ? "prefer_operational_finished" : "latest_finished_any"
  };
}

function rollupShopBuckets(allJobsPayload) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const k of SHOP_GROUP_ORDER) map.set(k, []);
  for (const j of allJobsPayload) {
    const raw = j.activityGroupKey || "other_shop_activity";
    const k = SHOP_GROUP_ORDER.includes(raw) ? raw : "other_shop_activity";
    map.get(k).push(j);
  }
  const HELD_SET = new Set(["Held / Needs Review", "Missing Material", "Waiting on Template"]);
  /** @type {Array<object>} */
  const shops = [];

  for (const shopKey of SHOP_GROUP_ORDER) {
    const jobsIn = map.get(shopKey) ?? [];
    let activeJobs = 0;
    let completedToday = 0;
    let heldOrNeedsReview = 0;
    let totalSqftToday = 0;
    const completedSubs = [];
    for (const j of jobsIn) {
      if (j.status !== "Cut Complete") activeJobs += 1;
      if (j.status === "Cut Complete") {
        completedToday += 1;
        completedSubs.push(j);
      }
      if (HELD_SET.has(j.status)) heldOrNeedsReview += 1;
      const sf = safeNum(j.squareFootage);
      if (sf != null && sf > 0) totalSqftToday += sf;
    }
    const paceShop = buildPaceFromCompletedJobs(completedSubs);
    shops.push({
      shopKey,
      shopName: SHOP_GROUP_LABELS[shopKey] ?? shopKey,
      activeJobs,
      completedToday,
      heldOrNeedsReview,
      totalSqftToday,
      averageMinutesBetweenCompletions:
        paceShop?.averageMinutesBetweenCompletions != null ? paceShop.averageMinutesBetweenCompletions : null,
      jobs: jobsIn
    });
  }
  return shops;
}

export function parseTitansTodayQuery(req) {
  const dateRaw = parseIsoYmd(req.query?.date);
  const localDateYmd = dateRaw || localTodayYmd();
  const limit = clampLimit(req.query?.limit);
  const ds = String(req.query?.debug ?? "").trim();
  const debugRequested = ds === "1";
  return { localDateYmd, limit, dateInvalid: Boolean(req.query?.date && !dateRaw), debugRequested };
}
