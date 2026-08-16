/**
 * Account 360 Relationship panel — safe view-model (no React).
 * Nested optional fields must never throw; missing data becomes a designed empty state.
 */

export const RELATIONSHIP_EMPTY_TIMELINE = "No recorded timeline activity";
export const COMMERCIAL_EMPTY = "No recent commercial activity on file";

export function formatWhen(value) {
  if (value == null || value === "") return null;
  const raw = String(value);
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const d = new Date(iso ? `${iso}T00:00:00` : raw.includes("T") ? raw : `${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso || raw.slice(0, 16);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sortableTime(value) {
  if (value == null || value === "") return null;
  const raw = String(value);
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const d = new Date(iso ? `${iso}T00:00:00` : raw);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function latestCommercialLabel(internal, studio, context) {
  const candidates = [
    context.lastInvoiceDate,
    context.lastPaymentDate,
    context.lastInvoice,
    context.lastPayment,
    ...internal.items.map((item) => item.updated_at),
    ...studio.items.map((item) => item.updated_at)
  ];
  let best = null;
  for (const value of candidates) {
    const t = sortableTime(value);
    if (t == null) continue;
    if (!best || t > best.t) best = { t, value };
  }
  const when = best ? formatWhen(best.value) : null;
  return when ? `Most recent commercial activity: ${when}` : COMMERCIAL_EMPTY;
}

function asItems(value) {
  return Array.isArray(value) ? value : [];
}

function estimateLane(lane) {
  const items = asItems(lane?.items);
  const state = lane?.state || (items.length ? "available" : "unavailable");
  return {
    state,
    items,
    notes: lane?.notes || null,
    hasItems: state === "available" && items.length > 0
  };
}

/**
 * Build a render-safe Relationship view from partial / missing payloads.
 * Must not throw for null, {}, or missing nested objects.
 */
export function buildRelationshipView(relationship, timeline, context = {}) {
  const health = relationship?.health || null;
  const signals = asItems(health?.signals);
  const items = asItems(timeline?.items);
  const lastEvent = items[0] || null;
  const internal = estimateLane(relationship?.estimates?.internal);
  const studio = estimateLane(relationship?.estimates?.studio);
  const hasGovernedPayload = Boolean(relationship && typeof relationship === "object");

  const timelineWhen = lastEvent?.at ? formatWhen(lastEvent.at) : null;

  return {
    hasGovernedPayload,
    healthLabel: health?.label || "Relationship status unavailable",
    healthReason: health?.reason || null,
    healthState: health?.state || null,
    signals,
    timelineRecencyLabel: timelineWhen || RELATIONSHIP_EMPTY_TIMELINE,
    lastTimelineActivity: lastEvent
      ? [lastEvent.title, lastEvent.detail].filter(Boolean).join(" — ") || "Recorded timeline activity"
      : null,
    commercialRecencyLabel: latestCommercialLabel(internal, studio, context),
    primaryContact: context.primaryContact || null,
    primaryLocation: context.primaryLocation || null,
    qbState: context.qbState || null,
    lastInvoice: context.lastInvoice || null,
    lastPayment: context.lastPayment || null,
    openOpportunity: context.openOpportunity || null,
    internal,
    studio,
    jobsNotes: relationship?.jobs?.notes || "Moraware job history is not connected to Account Directory yet.",
    quoteFlowNotes:
      relationship?.quoteFlow?.notes || "Quote Flow history is not connected to Account Directory yet.",
    morawareLinked: Boolean(relationship?.moraware?.linked),
    morawareJobsState: relationship?.moraware?.jobs_state || "unavailable",
    morawareSqftState: relationship?.moraware?.sqft_state || "unavailable",
    morawareAccounts: asItems(relationship?.moraware?.accounts),
    jobCount2026:
      relationship?.moraware?.jobs_state === "available" ? Number(relationship?.moraware?.job_count_2026 ?? 0) : null,
    sqft2026:
      relationship?.moraware?.sqft_state === "available"
        ? Number(relationship?.moraware?.sqft_2026 ?? 0)
        : null,
    earliestJobDate: relationship?.moraware?.earliest_job_date || null,
    latestJobDate: relationship?.moraware?.latest_job_date || null,
    recentMorawareJobs: asItems(relationship?.moraware?.recent_jobs),
    timelineItems: items,
    emptyTimeline: items.length === 0,
    emptyCopy: RELATIONSHIP_EMPTY_TIMELINE
  };
}
