import { createHash } from "node:crypto";

import { finalizeInstallJobCard } from "../../install/installDashboardNormalizer.js";
import { CALENDAR_SCHEDULE_COLUMN_ALIASES } from "./calendarScheduleConstants.js";
import { normalizeSpaces } from "./parseCsv.js";

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

/** Normalize raw CSV keys (NBSP, trailing spaces) before field lookup. */
export function normalizeCalendarRawRow(rawRow) {
  if (!rawRow || typeof rawRow !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(rawRow)) {
    out[normalizeSpaces(key)] = value;
  }
  return out;
}

/**
 * @param {Record<string, unknown>} rawRow
 * @param {readonly string[]} aliases
 */
export function pickCalendarField(rawRow, aliases) {
  const row = normalizeCalendarRawRow(rawRow);
  for (const key of aliases) {
    const direct = cleanText(row[key]);
    if (direct) return direct;
  }
  const lowerMap = new Map(
    Object.entries(row).map(([k, v]) => [normalizeSpaces(k).toLowerCase(), v])
  );
  for (const key of aliases) {
    const v = lowerMap.get(normalizeSpaces(key).toLowerCase());
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

function mergeUniqueNotes(parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const t = cleanText(part);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join(" · ") || null;
}

function pickContactPhone(rawRow) {
  return (
    pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.cell) ||
    pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.phone1) ||
    pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.phone2) ||
    ""
  );
}

function dedupeContactPhones(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const phone = cleanText(value);
    if (!phone) continue;
    const key = phone.replace(/[^\d+]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phone);
  }
  return out;
}

/**
 * Install Dashboard stop grouping key (view 222 contract).
 * Activity Date + Sched Time + Assigned To + Activity Type + Job Name
 *
 * @param {Record<string, unknown>} fields
 */
export function buildCalendarScheduleGroupKey(fields) {
  return [
    cleanText(fields.calendar_date),
    cleanText(fields.scheduled_start_time),
    cleanText(fields.truck_or_crew_name) || "Unassigned",
    cleanText(fields.activity_type || fields.activity_type_name),
    cleanText(fields.job_name).toLowerCase()
  ].join("|");
}

/** Public alias for schedule-stop identity used in promotion idempotency. */
export const buildCalendarScheduleStopKey = buildCalendarScheduleGroupKey;

/**
 * @param {object} params
 */
export function buildCalendarScheduleRowHash(params) {
  return createHash("sha256").update(buildCalendarScheduleGroupKey(params)).digest("hex");
}

/** Whether a mapped row has the minimum calendar schedule fields for promotion. */
export function isCalendarScheduleRowPromotable(mapped) {
  return Boolean(cleanText(mapped?.calendar_date) && cleanText(mapped?.job_name));
}

/**
 * Map one enriched report-feed row into moraware_calendar_schedule_rows insert payload.
 * Worksheet-line dedupe happens in aggregateCalendarScheduleRows() during promotion.
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
    rawRow: rawInput,
    organizationId,
    reportFeedId = null,
    reportRunId = null,
    sourceViewId = null,
    jobId = null,
    identityStatus = "needs_identity_review"
  } = params;

  const rawRow = normalizeCalendarRawRow(rawInput);

  const calendarDate = parseCalendarDate(pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.calendarDate));
  const truckOrCrewRaw =
    pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.truckOrCrewName) || null;
  const truckOrCrew = truckOrCrewRaw || "Unassigned";
  const activityType = pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.activityType) || null;
  const jobNotes = pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.jobNotes);
  const addressNotes = pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.addressNotes);

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
    activity_type: activityType,
    activity_type_name: activityType,
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
    install_type: activityType,
    notes: mergeUniqueNotes([jobNotes, addressNotes]),
    raw_payload: {
      ...rawRow,
      job_status: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.jobStatus) || null,
      job_activity: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.jobActivity) || null,
      job_creation_date:
        pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.jobCreationDate) || null,
      job_salesperson: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.jobSalesperson) || null,
      account_salesperson:
        pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.accountSalesperson) || null,
      address_line2: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.addressLine2) || null,
      phone1: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.phone1) || null,
      phone2: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.phone2) || null,
      cell: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.cell) || null,
      email: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.email) || null,
      worksheet_edge: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.edge) || null,
      worksheet_room: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.room) || null,
      worksheet_form_name: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.formName) || null,
      worksheet_thickness: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.thickness) || null,
      activity_count: pickCalendarField(rawRow, CALENDAR_SCHEDULE_COLUMN_ALIASES.activityCount) || null
    },
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

/**
 * Aggregate worksheet-line duplicates into one Install Dashboard schedule stop.
 *
 * @param {ReturnType<typeof mapCalendarScheduleRow>[]} mappedRows
 */
export function aggregateCalendarScheduleRows(mappedRows) {
  /** @type {Map<string, { base: ReturnType<typeof mapCalendarScheduleRow>, sqftSum: number, colors: Set<string>, rooms: Set<string>, edges: Set<string>, worksheetLines: object[], sourceRowCount: number }>} */
  const groups = new Map();

  for (const row of mappedRows) {
    const key = buildCalendarScheduleGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        base: { ...row, raw_payload: { ...(row.raw_payload ?? {}) } },
        sqftSum: 0,
        colors: new Set(),
        rooms: new Set(),
        edges: new Set(),
        worksheetLines: [],
        sourceRowCount: 0
      });
    }

    const group = groups.get(key);
    group.sourceRowCount += 1;

    const sqft = row.sqft != null ? Number(row.sqft) : 0;
    if (Number.isFinite(sqft) && sqft > 0) group.sqftSum += sqft;

    const color = cleanText(row.color);
    if (color) group.colors.add(color);

    const raw = row.raw_payload ?? {};
    const room = cleanText(raw.worksheet_room);
    if (room) group.rooms.add(room);
    const edge = cleanText(raw.worksheet_edge);
    if (edge) group.edges.add(edge);

    group.worksheetLines.push({
      room: room || null,
      color: color || null,
      sqft: row.sqft != null ? Number(row.sqft) : null,
      edge: edge || null,
      formName: cleanText(raw.worksheet_form_name) || null,
      thickness: cleanText(raw.worksheet_thickness) || null
    });
  }

  return [...groups.values()].map((group) => {
    const out = {
      ...group.base,
      sqft: group.sqftSum > 0 ? group.sqftSum : group.base.sqft,
      color: [...group.colors].join(", ") || group.base.color,
      notes: group.base.notes,
      raw_payload: {
        ...(group.base.raw_payload ?? {}),
        aggregated: {
          sourceRowCount: group.sourceRowCount,
          rooms: [...group.rooms],
          colors: [...group.colors],
          edges: [...group.edges],
          worksheetLines: group.worksheetLines,
          worksheetSqftTotal: group.sqftSum > 0 ? group.sqftSum : null
        }
      }
    };
    out.row_hash = buildCalendarScheduleRowHash(out);
    return out;
  });
}

/**
 * Safety dedupe: one planned stop per schedule-stop key before write.
 * @param {ReturnType<typeof mapCalendarScheduleRow>[]} plannedStops
 */
export function dedupePlannedScheduleStops(plannedStops) {
  const byKey = new Map();
  for (const row of plannedStops) {
    byKey.set(buildCalendarScheduleGroupKey(row), row);
  }
  return [...byKey.values()];
}

/**
 * @param {ReturnType<typeof mapCalendarScheduleRow>[]} plannedStops
 */
export function collectCalendarDatesFromStops(plannedStops) {
  return [...new Set(plannedStops.map((row) => cleanText(row.calendar_date)).filter(Boolean))].sort();
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
  if (!job.address?.line1 && !job.address?.city) warnings.push("Address missing");
  if (!job.scheduledStart) warnings.push("Missing scheduled time");
  if (!job.contact?.name && !job.contact?.email && !job.contact?.phone) warnings.push("Missing contact");
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
  const raw = /** @type {Record<string, unknown>} */ (row.raw_payload ?? {});
  const aggregated = /** @type {Record<string, unknown>} */ (raw.aggregated ?? {});

  const addr = {
    line1: cleanText(row.address_line1),
    line2: cleanText(raw.address_line2),
    city: cleanText(row.city),
    state: cleanText(row.state),
    postalCode: cleanText(row.postal_code),
    latitude: null,
    longitude: null
  };

  const rooms = Array.isArray(aggregated.rooms)
    ? aggregated.rooms.map((r) => cleanText(r)).filter(Boolean)
    : cleanText(raw.worksheet_room)
      ? [cleanText(raw.worksheet_room)]
      : [];

  const colors = Array.isArray(aggregated.colors)
    ? aggregated.colors.map((c) => cleanText(c)).filter(Boolean)
    : cleanText(row.color)
      ? cleanText(row.color)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

  const edges = Array.isArray(aggregated.edges)
    ? aggregated.edges.map((e) => cleanText(e)).filter(Boolean)
    : cleanText(raw.worksheet_edge)
      ? [cleanText(raw.worksheet_edge)]
      : [];

  const contactName = cleanText(row.customer_name) || "";
  const accountName = cleanText(row.account_name) || "—";
  const allPhones = dedupeContactPhones([
    cleanText(raw.cell),
    cleanText(raw.phone1),
    cleanText(raw.phone2),
    pickContactPhone(raw)
  ]);
  const primaryPhone = allPhones[0] || "";
  const contactEmail = cleanText(raw.email);

  const job = {
    id: cleanText(row.moraware_job_id || row.job_id || row.id) || `calendar-${sequence}`,
    morawareJobId: cleanText(row.moraware_job_id || row.job_id) || null,
    scheduledStart: scheduledStartIso(calendarDate, row.scheduled_start_time),
    scheduledEnd: scheduledStartIso(calendarDate, row.scheduled_end_time),
    sequence,
    customerName: accountName !== "—" ? accountName : contactName || "—",
    accountName,
    jobName: cleanText(row.job_name) || "—",
    status: cleanText(row.activity_status) || null,
    activityType: cleanText(row.activity_type_name || row.activity_type) || null,
    truckOrCrewName: truckOrCrew,
    address: addr,
    mapUrl: buildMapUrl(addr),
    contact: {
      name: contactName || accountName,
      phone: primaryPhone,
      email: contactEmail,
      allPhones
    },
    scope: {
      sqft: row.sqft != null ? Number(row.sqft) : null,
      rooms,
      material: cleanText(row.material),
      color: colors.join(", "),
      edge: edges.join(", "),
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
  return finalizeInstallJobCard(job);
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
