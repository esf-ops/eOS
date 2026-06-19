/**
 * Normalizes Brain/Moraware rows into Install Dashboard day-view payloads.
 * Mapping is intentionally conservative — unknown fields become warnings, not guesses.
 */

import { buildInstallSmartBrief } from "./installDashboardSmartBrief.js";

const CHICAGO_TZ = "America/Chicago";

export function todayDateInChicago(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHICAGO_TZ }).format(now);
}

export function parseIsoDateParam(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/** @param {unknown} raw */
function digRawField(raw, keys) {
  if (!raw || typeof raw !== "object") return "";
  const obj = /** @type {Record<string, unknown>} */ (raw);
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === "object" && v !== null && "_text" in v) {
      const t = String(/** @type {{ _text?: unknown }} */ (v)._text ?? "").trim();
      if (t) return t;
    }
    const t = String(v).trim();
    if (t) return t;
  }
  return "";
}

/**
 * status_name || activity_status || raw_json status || job_status || null
 * @param {Record<string, unknown>|null|undefined} activity
 * @param {Record<string, unknown>|null|undefined} [job]
 */
export function normalizeActivityStatus(activity, job = null) {
  const statusName = String(activity?.status_name ?? "").trim();
  const activityStatus = String(activity?.activity_status ?? "").trim();
  const rawStatus = digRawField(activity?.raw_json, [
    "status_name",
    "Status Name",
    "status",
    "Status",
    "activity_status",
    "Activity Status"
  ]);
  const jobStatus = String(job?.job_status ?? "").trim();
  return statusName || activityStatus || rawStatus || jobStatus || null;
}

/**
 * activity_type_name || activity_type || raw_json type || null
 * @param {Record<string, unknown>|null|undefined} activity
 */
export function normalizeActivityType(activity) {
  const typeName = String(activity?.activity_type_name ?? "").trim();
  const activityType = String(activity?.activity_type ?? "").trim();
  const rawType = digRawField(activity?.raw_json, [
    "activity_type_name",
    "Activity Type Name",
    "activity_type",
    "Activity Type",
    "type",
    "Type"
  ]);
  return typeName || activityType || rawType || null;
}

export function isInstallLikeActivity(row) {
  const blob = [
    normalizeActivityType(row),
    row?.activity_type,
    row?.activity_type_name,
    row?.description,
    row?.phase_name
  ]
    .map((x) => String(x ?? "").toLowerCase())
    .join(" ");
  if (!blob) return false;
  if (/template|inspection checklist|measure template/.test(blob) && !/\binstall\b/.test(blob)) {
    return false;
  }
  return /\binstall\b|installed\b|install day|ready for install/.test(blob);
}

export function extractAssignedLabel(rawJson) {
  return digRawField(rawJson, [
    "assigned_to",
    "assignedTo",
    "Assigned To",
    "assigned",
    "AssignedTo",
    "crew",
    "truck",
    "resource"
  ]);
}

export function buildMapUrl(address) {
  const parts = [address?.line1, address?.line2, address?.city, address?.state, address?.postalCode]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return `https://maps.google.com/?q=${encodeURIComponent(parts.join(", "))}`;
}

function buildJobWarnings(job) {
  const warnings = [];
  if (!job.address?.line1 && !job.address?.city) warnings.push("Address missing");
  if (!job.scheduledStart) warnings.push("Missing scheduled time");
  if (!job.contact?.phone && !job.contact?.email && !job.contact?.name) warnings.push("Missing contact");
  if (job.scope?.sqft == null) warnings.push("Missing sqft");
  if (!job.scope?.material && !job.scope?.color) warnings.push("Missing material/color");
  return warnings;
}

/**
 * @param {{
 *   activity: Record<string, unknown>,
 *   job: Record<string, unknown>|null,
 *   address: Record<string, unknown>|null,
 *   summary: Record<string, unknown>|null,
 *   scopeSignals: Record<string, unknown>|null,
 *   sequence: number
 * }} input
 */
export function normalizeInstallJobRow(input) {
  const { activity, job, address, summary, scopeSignals, sequence } = input;
  const jobId = String(activity?.job_id ?? job?.job_id ?? "").trim();
  const schedTime = String(activity?.sched_time ?? "").trim();
  const startDate = String(activity?.start_date ?? "").trim();
  const scheduledStart =
    startDate && schedTime
      ? `${startDate}T${schedTime.length <= 5 ? `${schedTime}:00` : schedTime}-06:00`
      : startDate
        ? `${startDate}T08:00:00-06:00`
        : null;

  const line1 = String(address?.address_line1 ?? "").trim();
  const city = String(address?.city ?? "").trim();
  const state = String(address?.state ?? "").trim();
  const postalCode = String(address?.zip ?? address?.postal_code ?? "").trim();

  const contactName = String(address?.contact_name ?? "").trim();
  const phone = String(address?.cell ?? address?.phone ?? "").trim();
  const email = String(address?.email ?? "").trim();

  const operationalNotes = String(summary?.operational_notes_text ?? "").trim();
  const activityNotes = String(activity?.notes ?? "").trim();
  const description = String(activity?.description ?? "").trim();
  const notes = [activityNotes, description, operationalNotes].map((n) => n.trim()).filter(Boolean);

  const rawNotes = String(job?.notes ?? "").trim();
  if (rawNotes && !notes.includes(rawNotes)) notes.push(rawNotes.slice(0, 500));

  const sqft =
    job?.worksheet_sqft != null
      ? Number(job.worksheet_sqft)
      : job?.total_sqft != null
        ? Number(job.total_sqft)
        : scopeSignals?.detected_sqft_line_count
          ? null
          : null;

  const addrObj = {
    line1,
    line2: "",
    city,
    state,
    postalCode,
    latitude: null,
    longitude: null
  };

  const status = normalizeActivityStatus(activity, job);
  const activityType = normalizeActivityType(activity);

  const normalized = {
    id: jobId || String(activity?.id ?? ""),
    morawareJobId: jobId,
    scheduledStart,
    scheduledEnd: null,
    sequence,
    customerName: String(job?.account_name ?? "").trim() || contactName || "—",
    accountName: String(job?.account_name ?? "").trim() || "—",
    jobName: String(job?.job_name ?? "").trim() || "—",
    status,
    activityType,
    address: addrObj,
    mapUrl: buildMapUrl(addrObj),
    contact: {
      name: contactName,
      phone,
      email,
      allPhones: phone ? [phone] : []
    },
    scope: {
      sqft: Number.isFinite(sqft) ? sqft : null,
      rooms: [],
      material: "",
      color: "",
      edge: "",
      backsplash: "",
      sinkNotes: "",
      cutoutNotes: "",
      waterfall: false,
      fullHeightSplash: false
    },
    notes,
    warnings: [],
    riskFlags: []
  };

  if (!extractAssignedLabel(activity?.raw_json)) {
    normalized.warnings.push("Missing crew/truck assignment on activity");
  }
  if (!status) normalized.warnings.push("Missing activity status");
  if (!activityType) normalized.warnings.push("Missing activity type");

  normalized.warnings = [...new Set([...normalized.warnings, ...buildJobWarnings(normalized)])];

  if (normalized.warnings.length) {
    normalized.riskFlags = ["Data audit: incomplete install-day mapping"];
  }

  return finalizeInstallJobCard(normalized);
}

export function crewFromAssignedLabel(label, branch = "") {
  const name = String(label ?? "").trim() || "Unassigned crew";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return {
    id: slug || "unassigned",
    name,
    truckName: name,
    branch: branch || ""
  };
}

/** Default Install Dashboard field/template crews (ordered). */
export const INSTALL_DASHBOARD_ALLOWED_CREW_LABELS = Object.freeze([
  "Truck A",
  "Truck B",
  "Truck C",
  "Truck D",
  "Truck H",
  "Kyle",
  "Template A Ron",
  "Template B Alan",
  "Template - Dyersville"
]);

export function normalizeInstallDashboardCrewLabel(label) {
  return String(label ?? "").trim().replace(/\s+/g, " ");
}

export function isInstallDashboardAllowedCrew(label) {
  const norm = normalizeInstallDashboardCrewLabel(label).toLowerCase();
  if (!norm || norm === "unassigned") return false;
  return INSTALL_DASHBOARD_ALLOWED_CREW_LABELS.some(
    (allowed) => allowed.toLowerCase() === norm
  );
}

/** @param {{ id: string, name: string, truckName?: string, branch?: string }[]} crews */
export function sortInstallDashboardCrews(crews) {
  const order = new Map(
    INSTALL_DASHBOARD_ALLOWED_CREW_LABELS.map((name, index) => [name.toLowerCase(), index])
  );
  return [...crews].sort((a, b) => {
    const ai = order.get(normalizeInstallDashboardCrewLabel(a.name).toLowerCase()) ?? 999;
    const bi = order.get(normalizeInstallDashboardCrewLabel(b.name).toLowerCase()) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

/** @param {Record<string, unknown>[]} rows */
export function filterInstallDashboardCalendarRows(rows) {
  const totalRowCount = rows.length;
  const allowedRows = rows.filter((row) => isInstallDashboardAllowedCrew(row.truck_or_crew_name));
  return {
    rows: allowedRows,
    totalRowCount,
    excludedRowCount: totalRowCount - allowedRows.length
  };
}

export function buildFormattedAddress(address) {
  const a = address ?? {};
  const line1 = String(a.line1 ?? "").trim();
  const line2 = String(a.line2 ?? "").trim();
  const cityState = [a.city, a.state].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  const postalCode = String(a.postalCode ?? "").trim();
  const locality = [cityState, postalCode].filter(Boolean).join(" ");
  const parts = [line1, line2, locality].filter(Boolean);
  return parts.join(" · ");
}

function dedupePhones(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const phone = String(value ?? "").trim();
    if (!phone) continue;
    const key = phone.replace(/[^\d+]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phone);
  }
  return out;
}

/**
 * @param {{ name?: string, phone?: string, email?: string, allPhones?: string[] }} contact
 */
export function buildInstallContactPhones(contact) {
  const allPhones = dedupePhones([
    ...(Array.isArray(contact?.allPhones) ? contact.allPhones : []),
    contact?.phone
  ]);
  return {
    primaryPhone: allPhones[0] ?? "",
    allPhones
  };
}

/**
 * Enrich an install job card with field-facing display fields.
 * stopName/displayStopName always prefer Moraware job_name over contact/account text.
 * @param {Record<string, unknown>} job
 */
export function finalizeInstallJobCard(job) {
  const jobName = String(job.jobName ?? "").trim() || "Untitled job";
  const accountName = String(job.accountName ?? "").trim();
  const contactName = String(job.contact?.name ?? "").trim();
  const { primaryPhone, allPhones } = buildInstallContactPhones(
    /** @type {{ phone?: string, allPhones?: string[] }} */ (job.contact ?? {})
  );
  const formattedAddress = buildFormattedAddress(job.address);

  const finalized = {
    ...job,
    stopName: jobName,
    displayStopName: jobName,
    contactName,
    accountName: accountName || "—",
    customerName: accountName || contactName || "—",
    primaryPhone,
    allPhones,
    formattedAddress,
    contact: {
      ...(job.contact ?? {}),
      name: contactName,
      phone: primaryPhone,
      allPhones
    }
  };

  if (!formattedAddress && !(finalized.warnings ?? []).some((w) => /address/i.test(String(w)))) {
    finalized.warnings = [...(finalized.warnings ?? []), "Address missing"];
  }
  if (!primaryPhone && !(finalized.warnings ?? []).some((w) => /phone/i.test(String(w)))) {
    finalized.warnings = [...(finalized.warnings ?? []), "No phone on file"];
  }

  finalized.smartBrief = buildInstallSmartBrief(finalized);

  return finalized;
}
