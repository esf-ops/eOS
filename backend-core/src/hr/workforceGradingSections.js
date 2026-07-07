/**
 * Default operational grading sections for eliteOS HR Head.
 * Seeded per organization on first dashboard load.
 * @module workforceGradingSections
 */

/** @typedef {"count"|"days"|"production"|"currency"|"hours"} MetricKind */

/**
 * @typedef {object} DefaultSectionTemplate
 * @property {string} id Stable UUID for idempotent seeding
 * @property {string} name
 * @property {string} goalDisplay
 * @property {number|null} goalNumeric
 * @property {MetricKind} metricKind
 * @property {boolean} gradingEnabled
 * @property {number} sortOrder
 * @property {string|null} [unitLabel]
 */

/** @type {ReadonlyArray<DefaultSectionTemplate>} */
export const DEFAULT_GRADING_SECTIONS = Object.freeze([
  {
    id: "b2000001-0001-4001-8001-000000000001",
    name: "Office induced service calls/remakes",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 10,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000002",
    name: "Templating induced service calls/remakes",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 20,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000003",
    name: "Template/Install lead times",
    goalDisplay: "14",
    goalNumeric: 14,
    metricKind: "days",
    gradingEnabled: true,
    sortOrder: 30,
    unitLabel: "days"
  },
  {
    id: "b2000001-0001-4001-8001-000000000004",
    name: "Outside partner remakes",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 40,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000005",
    name: "Outside partner missed quality control inspections",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 50,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000006",
    name: "Programming induced remakes/service calls",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 60,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000007",
    name: "Weekly quoting value",
    goalDisplay: "TBD",
    goalNumeric: null,
    metricKind: "currency",
    gradingEnabled: false,
    sortOrder: 70,
    unitLabel: "USD"
  },
  {
    id: "b2000001-0001-4001-8001-000000000008",
    name: "Plumbing accessories non billable service calls",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 80,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000009",
    name: "Shop induced remakes/service calls",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 90,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000010",
    name: "Weekly/daily shop production",
    goalDisplay: "9,250sf weekly / 1,850sf daily",
    goalNumeric: 9250,
    metricKind: "production",
    gradingEnabled: true,
    sortOrder: 100,
    unitLabel: "sf weekly"
  },
  {
    id: "b2000001-0001-4001-8001-000000000011",
    name: "Shop machinery down time",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "hours",
    gradingEnabled: true,
    sortOrder: 110,
    unitLabel: "hrs"
  },
  {
    id: "b2000001-0001-4001-8001-000000000012",
    name: "ESF non billable service calls",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 120,
    unitLabel: null
  },
  {
    id: "b2000001-0001-4001-8001-000000000013",
    name: "Installation induced service calls/remakes",
    goalDisplay: "0",
    goalNumeric: 0,
    metricKind: "count",
    gradingEnabled: true,
    sortOrder: 130,
    unitLabel: null
  }
]);

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {(error: unknown) => boolean} isMissingTableError
 */
export async function ensureDefaultGradingSections(db, organizationId, isMissingTableError) {
  try {
    const { data, error } = await db
      .from("workforce_grading_sections")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1);
    if (error) {
      if (isMissingTableError(error)) return { seeded: false, schemaReady: false };
      throw error;
    }
    if (data?.length) return { seeded: false, schemaReady: true };

    const rows = DEFAULT_GRADING_SECTIONS.map((s) => ({
      id: s.id,
      organization_id: organizationId,
      name: s.name,
      goal_display: s.goalDisplay,
      goal_numeric: s.goalNumeric,
      metric_kind: s.metricKind,
      grading_enabled: s.gradingEnabled,
      sort_order: s.sortOrder,
      unit_label: s.unitLabel,
      is_active: true
    }));

    const { error: insErr } = await db.from("workforce_grading_sections").upsert(rows, { onConflict: "id" });
    if (insErr) throw insErr;
    return { seeded: true, schemaReady: true };
  } catch (e) {
    if (isMissingTableError(e)) return { seeded: false, schemaReady: false };
    throw e;
  }
}

/**
 * @param {object} section DB row or API shape
 */
export function mapSectionRow(section) {
  return {
    sectionId: String(section.id),
    name: String(section.name ?? ""),
    goalDisplay: String(section.goal_display ?? section.goalDisplay ?? "0"),
    goalNumeric:
      section.goal_numeric != null || section.goalNumeric != null
        ? Number(section.goal_numeric ?? section.goalNumeric)
        : null,
    metricKind: String(section.metric_kind ?? section.metricKind ?? "count"),
    gradingEnabled: Boolean(section.grading_enabled ?? section.gradingEnabled ?? true),
    sortOrder: Number(section.sort_order ?? section.sortOrder ?? 0),
    unitLabel: section.unit_label ?? section.unitLabel ?? null,
    isActive: Boolean(section.is_active ?? section.isActive ?? true)
  };
}

/** Metric/total sections shown under Totals / Metrics (not count-based grade cards). */
export function isMetricTotalSection(section) {
  const kind = String(section?.metricKind ?? section?.metric_kind ?? "count");
  return kind === "days" || kind === "currency" || kind === "production";
}
