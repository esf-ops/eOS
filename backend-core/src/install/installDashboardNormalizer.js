/**
 * Normalizes Brain/Moraware rows into Install Dashboard day-view payloads.
 * Mapping is intentionally conservative — unknown fields become warnings, not guesses.
 */

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

export function isInstallLikeActivity(row) {
  const blob = [
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
  if (!job.address?.line1 && !job.address?.city) warnings.push("Missing address");
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

  const normalized = {
    id: jobId || String(activity?.id ?? ""),
    morawareJobId: jobId,
    scheduledStart,
    scheduledEnd: null,
    sequence,
    customerName: String(job?.account_name ?? job?.job_name ?? "").trim() || "—",
    accountName: String(job?.account_name ?? "").trim() || "—",
    jobName: String(job?.job_name ?? "").trim() || "—",
    status: String(activity?.activity_status_name ?? activity?.activity_status ?? job?.job_status ?? "").trim() || "Scheduled",
    address: addrObj,
    mapUrl: buildMapUrl(addrObj),
    contact: {
      name: contactName,
      phone,
      email
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

  normalized.warnings = [...new Set([...normalized.warnings, ...buildJobWarnings(normalized)])];

  if (normalized.warnings.length) {
    normalized.riskFlags = ["Data audit: incomplete install-day mapping"];
  }

  return normalized;
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
