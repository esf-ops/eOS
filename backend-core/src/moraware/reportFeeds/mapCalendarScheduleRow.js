import { createHash } from "node:crypto";

import { CALENDAR_SCHEDULE_COLUMN_ALIASES } from "./calendarScheduleConstants.js";

function buildMapUrl(address) {
  const parts = [address?.line1, address?.line2, address?.city, address?.state, address?.postalCode]
    .map((x) => cleanText(x))
    .filter(Boolean);
  if (!parts.length) return "";
  return `https://maps.google.com/?q=${encodeURIComponent(parts.join(", "))}`;
}

function cleanText(v) {
  if (v == null) return "";
  return String(v).replace(/\u00A0/g, " ").trim();
}

/**
 * @param {Record<string, unknown>} rawRow
 * @param {readonly string[]} aliases
 */
export function pickCalendarField(rawRow, aliases) {
  if (!rawRow || typeof rawRow !== "object") return "";
  const row = /** @type {Record<string, unknown>} */ (rawRow);
  for (const key of aliases) {
    const direct = cleanText(row[key]);
    if (direct) return direct;
  }
  const lowerMap = new Map(
    Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v])
  );
  for (const key of aliases) {
    const v = lowerMap.get(String(key).trim().toLowerCase());
    const t = cleanText(v);
    if (t) return t;
  }
  return "";
}

function parseCalendarDate(raw) {
  const s = cleanText(raw);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseSqft(raw) {
  const s = cleanText(raw).replace(/,/g, "");
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * @param {object} params
 */
export function buildCalendarScheduleRowHash(params) {
  const parts = [
    params.calendar_date,
    params.scheduled_start_time,
    params.truck_or_crew_name,
    params.moraware_job_id || params.job_id,
    params.job_name,
    params.activity_type_name || params.activity_type
  ].map((x) => cleanText(x));
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Map one enriched report-feed row into moraware_calendar_schedule_rows insert payload.
 *
 * @param {object} params
 * @param {Record<string, unknown>} params.rawRow
 * @param {string} params.organizationId
 * @param {string|null} [params.reportFeedId]
 * @param {string|null} [params.reportRunId]
 * @param {number|null} [params.sourceViewId]
 * @param {string|null} [params.jobId]
 * @param {string|null} [params.accountId]
 * @param {string} [params.identityStatus]
 */
export function mapCalendarScheduleRow(params) {
  const {
    rawRow,
    organizationId,
    reportFeedId = null,
    reportRunId = null,
    sourceViewId = null,
    jobId = null,
    accountId = null,
    identityStatus = "needs_identity_review"
  } = params;

  const calendarDate =
    parseCalendarDate(pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.calendarDate)) ||
    parseCalendarDate(pickCalendarField(rawRow, ["Date"]));

  const truckOrCrew =
    pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.truckOrCrewName) || null;

  const mapped = {
    organization_id: organizationId,
    report_feed_id: reportFeedId,
    report_run_id: reportRunId,
    source_system: "moraware",
    source_view_id: sourceViewId,
    source_url: null,
    calendar_date: calendarDate,
    scheduled_start_time:
      pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.scheduledStartTime) || null,
    scheduled_end_time:
      pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.scheduledEndTime) || null,
    duration: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.duration) || null,
    assigned_resource_id: null,
    assigned_resource_name:
      pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.assignedResourceName) || truckOrCrew,
    truck_or_crew_name: truckOrCrew,
    activity_type: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.activityType) || null,
    activity_type_name:
      pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.activityTypeName) ||
      pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.activityType) ||
      null,
    activity_status: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.activityStatus) || null,
    job_id: jobId || null,
    moraware_job_id: jobId || null,
    job_name: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.jobName) || null,
    account_name: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.accountName) || null,
    customer_name: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.customerName) || null,
    address_line1: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.addressLine1) || null,
    city: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.city) || null,
    state: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.state) || null,
    postal_code: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.postalCode) || null,
    sqft: parseSqft(pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.sqft)),
    material: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.material) || null,
    color: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.color) || null,
    install_type: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.installType) || null,
    notes: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.notes) || null,
    raw_payload: rawRow ?? {},
    identity_status: identityStatus,
    is_active: true,
    synced_at: new Date().toISOString(),
    promoted_at: new Date().toISOString(),
    superseded_at: null,
    superseded_by: null
  };

  mapped.row_hash = buildCalendarScheduleRowHash(mapped);
  return mapped;
}

function parseSchedTimeTo24h(raw) {
  const s = cleanText(raw);
  if (!s) return null;
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s);
  if (ampm) {
    let hour = Number.parseInt(ampm[1], 10);
    const minute = ampm[2];
    const isPm = ampm[3].toUpperCase() === "PM";
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}:00`;
  }
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) return `${String(Number.parseInt(hm[1], 10)).padStart(2, "0")}:${hm[2]}:00`;
  return s.length <= 5 ? `${s}:00` : s;
}

function scheduledStartIso(calendarDate, schedTime) {
  const d = cleanText(calendarDate);
  const t = parseSchedTimeTo24h(schedTime);
  if (!d) return null;
  if (!t) return `${d}T08:00:00-06:00`;
  return `${d}T${t}-06:00`;
}

function buildJobWarnings(job) {
  const warnings = [];
  if (!job.address?.line1 && !job.address?.city) warnings.push("Missing address");
  if (!job.scheduledStart) warnings.push("Missing scheduled time");
  if (!job.contact?.phone && !job.contact?.email && !job.contact?.name) warnings.push("Missing contact");
  if (job.scope?.sqft == null) warnings.push("Missing sqft");
  if (!job.scope?.material && !job.scope?.color) warnings.push("Missing material/color");
  if (!job.truckOrCrewName) warnings.push("Missing crew/truck");
  if (!job.status) warnings.push("Missing activity status");
  if (!job.activityType) warnings.push("Missing activity type");
  return warnings;
}

/**
 * Convert a moraware_calendar_schedule_rows DB row into Install Dashboard job card shape.
 * @param {Record<string, unknown>} row
 * @param {number} sequence
 */
export function calendarScheduleRowToInstallJob(row, sequence) {
  const calendarDate = cleanText(row.calendar_date);
  const truckOrCrew = cleanText(row.truck_or_crew_name) || null;
  const addr = {
    line1: cleanText(row.address_line1),
    line2: "",
    city: cleanText(row.city),
    state: cleanText(row.state),
    postalCode: cleanText(row.postal_code),
    latitude: null,
    longitude: null
  };

  const job = {
    id: cleanText(row.moraware_job_id || row.job_id || row.id) || `calendar-${sequence}`,
    morawareJobId: cleanText(row.moraware_job_id || row.job_id) || null,
    scheduledStart: scheduledStartIso(calendarDate, row.scheduled_start_time),
    scheduledEnd: scheduledStartIso(calendarDate, row.scheduled_end_time),
    sequence,
    customerName:
      cleanText(row.customer_name) || cleanText(row.account_name) || cleanText(row.job_name) || "—",
    accountName: cleanText(row.account_name) || "—",
    jobName: cleanText(row.job_name) || "—",
    status: cleanText(row.activity_status) || null,
    activityType: cleanText(row.activity_type_name || row.activity_type) || null,
    truckOrCrewName: truckOrCrew,
    address: addr,
    mapUrl: buildMapUrl(addr),
    contact: {
      name: cleanText(row.customer_name) || "",
      phone: "",
      email: ""
    },
    scope: {
      sqft: row.sqft != null ? Number(row.sqft) : null,
      rooms: [],
      material: cleanText(row.material),
      color: cleanText(row.color),
      edge: "",
      backsplash: "",
      sinkNotes: "",
      cutoutNotes: "",
      waterfall: false,
      fullHeightSplash: false
    },
    notes: cleanText(row.notes) ? [cleanText(row.notes)] : [],
    warnings: [],
    riskFlags: []
  };

  job.warnings = buildJobWarnings(job);
  if (job.warnings.length) job.riskFlags = ["Data audit: incomplete install-day mapping"];
  return job;
}

/** @param {ReturnType<typeof calendarScheduleRowToInstallJob>[]} jobs */
export function computeMissingFieldCounts(jobs) {
  const counts = {
    address: 0,
    scheduledTime: 0,
    crewTruck: 0,
    contact: 0,
    sqft: 0,
    materialColor: 0,
    activityStatus: 0,
    activityType: 0
  };
  for (const job of jobs) {
    if (!job.address?.line1 && !job.address?.city) counts.address += 1;
    if (!job.scheduledStart) counts.scheduledTime += 1;
    if (!job.truckOrCrewName) counts.crewTruck += 1;
    if (!job.contact?.phone && !job.contact?.email && !job.contact?.name) counts.contact += 1;
    if (job.scope?.sqft == null) counts.sqft += 1;
    if (!job.scope?.material && !job.scope?.color) counts.materialColor += 1;
    if (!job.status) counts.activityStatus += 1;
    if (!job.activityType) counts.activityType += 1;
  }
  return counts;
}
