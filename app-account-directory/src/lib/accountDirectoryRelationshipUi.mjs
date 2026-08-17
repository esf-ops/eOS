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
 * Merge collection / payment health signals from already-loaded FE financials into
 * relationship health (relationship API no longer re-fetches full financials).
 */
export function enrichRelationshipHealthWithFinancials(health, financials) {
  const base =
    health && typeof health === "object"
      ? health
      : { state: "healthy", label: "Healthy", reason: null, signals: [] };
  const existing = asItems(base.signals).filter(
    (s) =>
      ![
        "collection_priority",
        "collection_attention",
        "collection_watch",
        "aging_unknown",
        "no_recent_payment",
        "recent_activity"
      ].includes(String(s?.code || ""))
  );
  const signals = [...existing];
  if (!financials || typeof financials !== "object") {
    return { ...base, signals };
  }

  const collection = financials.collectionAttention || null;
  if (collection?.code === "priority") {
    signals.push({
      code: "collection_priority",
      severity: "priority",
      label: "Collection priority",
      detail: collection.reason,
      target: "Financials"
    });
  } else if (collection?.code === "attention") {
    signals.push({
      code: "collection_attention",
      severity: "attention",
      label: "Overdue receivables",
      detail: collection.reason,
      target: "Financials"
    });
  } else if (collection?.code === "watch") {
    signals.push({
      code: "collection_watch",
      severity: "watch",
      label: "Overdue receivables",
      detail: collection.reason,
      target: "Financials"
    });
  } else if (collection?.code === "unknown" && Number(financials?.summary?.openAr) > 0) {
    signals.push({
      code: "aging_unknown",
      severity: "watch",
      label: "A/R due dates incomplete",
      detail: collection.reason,
      target: "Financials"
    });
  }

  const daysSince = financials.daysSinceLastPayment;
  if (financials.linked && daysSince != null && daysSince >= 90 && Number(financials?.summary?.openAr) > 0) {
    signals.push({
      code: "no_recent_payment",
      severity: daysSince >= 180 ? "attention" : "watch",
      label: "No recent payment",
      detail: `${daysSince} day(s) since last recorded payment.`,
      target: "Financials"
    });
  }

  if (
    financials.linked &&
    (financials.status === "ok" || financials.status === "stale") &&
    Array.isArray(financials.recentActivity) &&
    financials.recentActivity.length
  ) {
    signals.push({
      code: "recent_activity",
      severity: "healthy",
      label: "Recent financial activity",
      detail: "Recent invoices, payments, or quotes are on file.",
      target: "Relationship"
    });
  }

  const rank = { priority: 4, attention: 3, watch: 2, healthy: 1 };
  let state = "healthy";
  let label = "Healthy";
  for (const signal of signals) {
    if ((rank[signal.severity] || 0) > (rank[state] || 0)) {
      state = signal.severity;
      if (state === "priority") label = "Priority";
      else if (state === "attention") label = "Attention";
      else if (state === "watch") label = "Watch";
      else label = "Healthy";
    }
  }

  return {
    ...base,
    state,
    label,
    reason: signals.find((s) => s.severity === state)?.detail || base.reason || null,
    signals
  };
}

export function timelineFamilyClass(family, type) {
  const f = String(family || type || "").toLowerCase();
  if (f.includes("quote") || f.includes("estimate")) return "estimate";
  if (f.includes("quickbooks") || f.includes("invoice") || f.includes("payment") || f.includes("financial")) {
    return "financial";
  }
  if (f.includes("moraware")) return "moraware";
  if (f.includes("directory") || f.includes("audit") || f.includes("account")) return "directory";
  return "system";
}

/**
 * Build a render-safe Relationship view from partial / missing payloads.
 * Must not throw for null, {}, or missing nested objects.
 */
export function buildRelationshipView(relationship, timeline, context = {}) {
  const health = enrichRelationshipHealthWithFinancials(relationship?.health || null, context.financials || null);
  const signals = asItems(health?.signals);
  const items = asItems(timeline?.items);
  const lastEvent = items[0] || null;
  const internal = estimateLane(relationship?.estimates?.internal);
  const studio = estimateLane(relationship?.estimates?.studio);
  const hasGovernedPayload = Boolean(relationship && typeof relationship === "object");

  const timelineWhen = lastEvent?.at ? formatWhen(lastEvent.at) : null;
  const jobsAvailable = relationship?.moraware?.jobs_state === "available";
  const sqftAvailable = relationship?.moraware?.sqft_state === "available";

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
    jobCount2026: jobsAvailable ? Number(relationship?.moraware?.job_count_2026 ?? 0) : null,
    sqft2026: sqftAvailable ? Number(relationship?.moraware?.sqft_2026 ?? 0) : null,
    earliestJobDate: relationship?.moraware?.earliest_job_date || null,
    latestJobDate: relationship?.moraware?.latest_job_date || null,
    recentMorawareJobs: asItems(relationship?.moraware?.recent_jobs),
    timelineItems: items.map((entry) => ({
      ...entry,
      familyClass: timelineFamilyClass(entry?.family, entry?.type)
    })),
    emptyTimeline: items.length === 0,
    emptyCopy: RELATIONSHIP_EMPTY_TIMELINE,
    relationshipLoading: Boolean(context.relationshipLoading),
    financialsLoading: Boolean(context.financialsLoading)
  };
}
