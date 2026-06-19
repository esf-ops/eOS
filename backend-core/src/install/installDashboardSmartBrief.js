/**
 * Deterministic Smart Stop Briefs for Install Dashboard (v1 — no AI/API).
 */

const CALL_AHEAD_PATTERNS = [
  "call",
  "in route",
  "on way",
  "on the way",
  "when leaving",
  "30 minutes",
  "30 min"
];

const ACCESS_NOTE_PATTERNS = ["code", "lockbox", "garage", "gate", "key", "door code"];

const SITE_ACCESS_PATTERNS = [
  "stairs",
  "elevator",
  "parking",
  "hard hat",
  "hard-hat",
  "alley",
  "3rd floor",
  "third floor",
  "walk up",
  "walk-up"
];

const LABOR_NOTE_PATTERNS = ["3rd guy", "third guy", "helper", "heavy", "brace", "support", "movers"];

const SEALER_PATTERNS = ["dry treat", "sealer", "countertop seal", "apply seal"];

const PREMIUM_MATERIAL_PATTERNS = [
  "quartzite",
  "marble",
  "onyx",
  "dolomite",
  "cristallo",
  "taj mahal",
  "super white"
];

const FULL_HEIGHT_PATTERNS = ["full hgt", "full height", "fhb", "full height backsplash", "full-height backsplash"];

const WATERFALL_PATTERN = "waterfall";
const TEAR_OUT_PATTERN = "tear out";

/**
 * @param {unknown} job
 */
function collectPhones(job) {
  const phones = [];
  if (Array.isArray(job?.allPhones)) phones.push(...job.allPhones);
  if (Array.isArray(job?.contact?.allPhones)) phones.push(...job.contact.allPhones);
  if (job?.primaryPhone) phones.push(job.primaryPhone);
  if (job?.contact?.phone) phones.push(job.contact.phone);
  return phones.map((p) => String(p ?? "").trim()).filter(Boolean);
}

function hasUsablePhone(job) {
  return collectPhones(job).length > 0;
}

function hasUsableAddress(job) {
  const a = job?.address ?? {};
  const line1 = String(a.line1 ?? "").trim();
  const city = String(a.city ?? "").trim();
  const state = String(a.state ?? "").trim();
  return Boolean(line1 && (city || state));
}

function joinNotes(job) {
  const parts = [];
  if (Array.isArray(job?.notes)) parts.push(...job.notes);
  if (job?.addressNotes) parts.push(job.addressNotes);
  return parts
    .map((n) => String(n ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function collectSearchText(job) {
  const scope = job?.scope ?? {};
  return [
    joinNotes(job),
    job?.activityType,
    job?.status,
    scope.material,
    scope.color,
    scope.edge
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function includesAny(haystack, patterns) {
  const lower = String(haystack ?? "").toLowerCase();
  if (!lower) return false;
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) return pattern.test(lower);
    return lower.includes(String(pattern).toLowerCase());
  });
}

function includesPhrase(haystack, phrase) {
  return includesAny(haystack, [phrase]);
}

/**
 * @typedef {{ label: string, tone: "ok"|"info"|"warning"|"critical" }} SmartBadge
 */

/**
 * @param {Record<string, unknown>} job
 */
export function buildInstallSmartBrief(job) {
  /** @type {SmartBadge[]} */
  const badges = [];
  /** @type {string[]} */
  const missingFields = [];
  /** @type {string[]} */
  const highlights = [];

  const notesText = joinNotes(job);
  const searchText = collectSearchText(job);
  const sqft = job?.scope?.sqft != null ? Number(job.scope.sqft) : null;

  if (!hasUsableAddress(job)) {
    missingFields.push("address");
    badges.push({ label: "Missing address", tone: "critical" });
    highlights.push("Address incomplete — confirm before dispatch");
  }

  if (!hasUsablePhone(job)) {
    missingFields.push("phone");
    badges.push({ label: "Missing phone", tone: "warning" });
    highlights.push("No phone on file — confirm contact before leaving shop");
  }

  if (includesAny(notesText, CALL_AHEAD_PATTERNS)) {
    badges.push({ label: "Call ahead", tone: "info" });
    highlights.push("Customer expects a call-ahead");
  }

  if (includesAny(notesText, ACCESS_NOTE_PATTERNS)) {
    badges.push({ label: "Access note", tone: "warning" });
    highlights.push("Access code, lockbox, or gate details in notes");
  }

  if (includesAny(notesText, SITE_ACCESS_PATTERNS)) {
    badges.push({ label: "Site access", tone: "warning" });
    highlights.push("Site access constraints noted (stairs, parking, etc.)");
  }

  if (includesPhrase(searchText, TEAR_OUT_PATTERN)) {
    badges.push({ label: "Tear out", tone: "warning" });
    highlights.push("Tear-out work indicated");
  }

  if (includesPhrase(searchText, WATERFALL_PATTERN)) {
    badges.push({ label: "Waterfall", tone: "warning" });
    highlights.push("Waterfall detail called out");
  }

  if (includesAny(searchText, FULL_HEIGHT_PATTERNS)) {
    badges.push({ label: "Full-height backsplash", tone: "info" });
    highlights.push("Full-height backsplash called out");
  }

  if (Number.isFinite(sqft) && sqft >= 160) {
    badges.push({ label: "Very large job", tone: "warning" });
    highlights.push(`Large footprint (${sqft} sq ft)`);
  } else if (Number.isFinite(sqft) && sqft >= 100) {
    badges.push({ label: "Large job", tone: "info" });
  }

  if (includesAny(notesText, LABOR_NOTE_PATTERNS)) {
    badges.push({ label: "Labor note", tone: "warning" });
    highlights.push("Extra labor or support noted");
  }

  if (includesAny(notesText, SEALER_PATTERNS)) {
    badges.push({ label: "Sealer/treatment", tone: "info" });
  }

  if (includesAny(searchText, PREMIUM_MATERIAL_PATTERNS)) {
    badges.push({ label: "Premium/fragile material", tone: "warning" });
    highlights.push("Premium or fragile stone called out");
  }

  const dedupedBadges = dedupeBadges(badges);
  const severity = computeSmartBriefSeverity(dedupedBadges, missingFields);

  return {
    severity,
    badges: dedupedBadges,
    highlights: [...new Set(highlights)].slice(0, 4),
    missingFields
  };
}

function dedupeBadges(badges) {
  const seen = new Set();
  const out = [];
  for (const badge of badges) {
    if (seen.has(badge.label)) continue;
    seen.add(badge.label);
    out.push(badge);
  }
  return out;
}

function computeSmartBriefSeverity(badges, missingFields) {
  if (missingFields.includes("address")) return "critical";
  const tones = new Set(badges.map((b) => b.tone));
  if (tones.has("warning") || tones.has("critical")) return "warning";
  if (tones.has("info") || badges.length) return "info";
  return "ok";
}

function countBadge(jobs, label) {
  return jobs.filter((job) => (job.smartBrief?.badges ?? []).some((b) => b.label === label)).length;
}

function countSeverity(jobs, severity) {
  return jobs.filter((job) => job.smartBrief?.severity === severity).length;
}

/**
 * @param {Array<Record<string, unknown>>} jobs
 */
export function buildInstallDaySmartSummary(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const cities = [
    ...new Set(list.map((job) => String(job.address?.city ?? "").trim()).filter(Boolean))
  ];
  const totalSqft = list.reduce((sum, job) => {
    const n = job?.scope?.sqft != null ? Number(job.scope.sqft) : 0;
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const specialInstallCount =
    countBadge(list, "Tear out") +
    countBadge(list, "Waterfall") +
    countBadge(list, "Full-height backsplash") +
    countBadge(list, "Premium/fragile material");

  const warningCount = countSeverity(list, "warning");
  const criticalCount = countSeverity(list, "critical");

  return {
    callAheadCount: countBadge(list, "Call ahead"),
    accessNoteCount: countBadge(list, "Access note"),
    missingPhoneCount: countBadge(list, "Missing phone"),
    missingAddressCount: countBadge(list, "Missing address"),
    largeJobCount: countBadge(list, "Large job") + countBadge(list, "Very large job"),
    specialInstallCount,
    siteAccessCount: countBadge(list, "Site access"),
    laborNoteCount: countBadge(list, "Labor note"),
    premiumMaterialCount: countBadge(list, "Premium/fragile material"),
    criticalCount,
    warningCount,
    totalStops: list.length,
    totalSqft: totalSqft > 0 ? totalSqft : null,
    firstStopTime: list[0]?.scheduledStart ?? null,
    lastStopTime: list[list.length - 1]?.scheduledStart ?? null,
    cityCount: cities.length,
    cities,
    fieldAlertCount: list.filter((job) => {
      const s = job.smartBrief?.severity;
      return s === "warning" || s === "critical" || s === "info";
    }).length
  };
}

/**
 * Attach smartBrief to each job and smartSummary to meta.
 * @param {Record<string, unknown>} payload
 */
export function enrichInstallDayPayload(payload) {
  const jobs = (payload.jobs ?? []).map((job) => ({
    ...job,
    smartBrief: job.smartBrief ?? buildInstallSmartBrief(job)
  }));
  return {
    ...payload,
    jobs,
    meta: {
      ...(payload.meta ?? {}),
      smartSummary: buildInstallDaySmartSummary(jobs)
    }
  };
}
