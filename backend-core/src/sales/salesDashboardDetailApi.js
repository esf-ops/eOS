/**
 * GET /api/sales/dashboard/detail — on-demand account/color detail panel.
 */

import { parseDashboardFilters, dateInInclusiveRange, rowMatchesDashboardFilters } from "./salesDashboardFilters.js";
import { loadDashboardDataSources, resolveDashboardOrganizationId } from "./salesDashboardDataSources.js";
import { buildIntelligenceFromSources } from "./salesDashboardMetrics.js";
import { finalizeIntelligenceBundle, attachIntelligenceFieldsToJobs, buildColorAnalyticsFromIntelligenceRows } from "./salesIntelligenceFacts.js";
import { buildSingleAccountDetail, buildSingleColorDetail } from "./salesDashboardDetails.js";
import { createDashboardTimer, isDashboardTimingEnabled } from "./salesDashboardTiming.js";

function enrichedJobShape(j) {
  return {
    ...j,
    source_job_id: j.job_id,
    account_name: j.account_raw,
    normalizedSalesperson: j.normalized_salesperson || j.assigned_rep,
    assignedSalesperson: j.assigned_rep,
    morawareSalesperson: j.salesperson_raw,
    branch: j.branch,
    status_name: j.job_status,
    job_status: j.job_status,
    reportDate: j.report_date,
    attributionStatus: j.attribution_status,
    worksheet_sqft: j.worksheet_sqft,
    colorCollectionStatus: j.colorCollectionStatus,
    color: j.color,
    stone: j.stone,
    eliteGroup: j.eliteGroup,
    manufacturer: j.manufacturer,
    room: j.room
  };
}

function filterCurrentJobs(bundle, filters) {
  const rows = bundle.worksheetMaterial ?? [];
  const shapedJobs = (bundle.productionJobs ?? []).map((p) => enrichedJobShape(p));
  const jobsWithColor = attachIntelligenceFieldsToJobs(shapedJobs, rows);
  const currentRange = filters.dateRange;
  return jobsWithColor.filter((r) => {
    const d = String(r.reportDate ?? r.report_date ?? "").slice(0, 10);
    return dateInInclusiveRange(d, currentRange) && rowMatchesDashboardFilters(r, filters);
  });
}

export async function salesDashboardDetailHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const organizationId = resolveDashboardOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales dashboard detail requires organization_id context." } };
  }

  const type = String(req.query?.type ?? "").trim().toLowerCase();
  const id = String(req.query?.id ?? "").trim();
  if (!id || (type !== "account" && type !== "color")) {
    return { status: 400, body: { ok: false, error: "Detail requires type=account|color and id." } };
  }

  const filters = parseDashboardFilters(req.query ?? {});
  if (!filters.ok) {
    return { status: 400, body: { ok: false, error: filters.error } };
  }

  const timer = createDashboardTimer();
  timer.mark("auth_org_resolve");

  try {
    const sources = await loadDashboardDataSources(supabase, organizationId);
    timer.mark("load_cached_sources");

    const bundle = finalizeIntelligenceBundle(buildIntelligenceFromSources(sources, organizationId), filters);
    timer.mark("finalize_intelligence_bundle");

    const filteredCurrent = filterCurrentJobs(bundle, filters);
    const colorAnalytics = buildColorAnalyticsFromIntelligenceRows(
      bundle.worksheetMaterial ?? [],
      filters.dateRange,
      filters.priorRange
    );
    timer.mark("build_color_analytics");

    let detail = null;
    if (type === "account") {
      detail = buildSingleAccountDetail(
        id,
        bundle.accountFacts ?? [],
        filteredCurrent,
        bundle.quoteFacts ?? [],
        bundle.forecastFacts ?? [],
        colorAnalytics
      );
    } else {
      detail = buildSingleColorDetail(id, colorAnalytics, filteredCurrent, bundle.worksheetMeta?.rows ?? []);
    }
    timer.mark("build_detail_panel");

    const debugTiming = isDashboardTimingEnabled() ? timer.finish() : undefined;

    return {
      status: 200,
      body: {
        ok: true,
        organization_id: organizationId,
        type,
        id,
        detail,
        meta: {
          cacheHit: Boolean(sources._cacheHit),
          debugTiming
        }
      }
    };
  } catch (e) {
    return { status: 500, body: { ok: false, error: String(e?.message ?? e) } };
  }
}
