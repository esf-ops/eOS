/**
 * Detail panel payloads and data quality issue rows for Sales Dashboard.
 */

function normKey(s) {
  return String(s ?? "").trim().toLowerCase();
}

function sqft(job) {
  const n = Number(job?.worksheet_sqft ?? job?.sqft ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {Array<object>} accounts — merged account summary rows
 * @param {Array<object>} currentJobs
 * @param {Array<object>} quotes
 * @param {Array<object>} forecasts
 * @param {object} colorAnalytics
 */
export function buildAccountDetailIndex(accounts, currentJobs, quotes, forecasts, colorAnalytics) {
  const shareMap = new Map((colorAnalytics?.accountColorShares ?? []).map((a) => [a.accountKey, a]));
  const jobsByAccount = new Map();
  for (const j of currentJobs) {
    const k = normKey(j.account_name);
    const list = jobsByAccount.get(k) || [];
    list.push(j);
    jobsByAccount.set(k, list);
  }

  const quotesByAccount = new Map();
  for (const q of quotes) {
    const k = normKey(q.customer_name);
    const list = quotesByAccount.get(k) || [];
    list.push(q);
    quotesByAccount.set(k, list);
  }

  const index = {};
  for (const acct of accounts) {
    const k = normKey(acct.account);
    const shares = shareMap.get(k) || {};
    const jobs = (jobsByAccount.get(k) || []).sort((a, b) => String(b.reportDate).localeCompare(String(a.reportDate))).slice(0, 15);
    const relatedQuotes = (quotesByAccount.get(k) || []).slice(0, 10).map((q) => ({
      id: q.id,
      quoteNumber: q.quote_number,
      status: q.quote_status,
      source: q.quote_source,
      grandTotal: Number(q.grand_total) || 0,
      estimatedSqft: Number(q.estimated_sqft) || 0,
      createdAt: q.created_at
    }));

    const colors = new Map();
    for (const j of jobs) {
      if (!j.color) continue;
      const ck = `${j.color}|||${j.stone ?? ""}`;
      colors.set(ck, (colors.get(ck) || 0) + sqft(j));
    }
    const topColors = [...colors.entries()]
      .map(([key, sqftVal]) => {
        const [color, material] = key.split("|||");
        return { color, material, sqft: sqftVal };
      })
      .sort((a, b) => b.sqft - a.sqft)
      .slice(0, 8);

    index[k] = {
      account: acct.account,
      canonicalAccountName: acct.canonicalAccountName ?? null,
      assignedRep: acct.normalizedSalesperson ?? null,
      branch: acct.branch ?? null,
      morawareSalesperson: jobs[0]?.morawareSalesperson ?? null,
      currentSqft: acct.currentSqft ?? 0,
      priorSqft: acct.priorSqft ?? 0,
      yoySqft: acct.yoySqft ?? 0,
      yoyPct: acct.yoyPct ?? null,
      eliteShare: shares.eliteShare ?? acct.eliteShare ?? null,
      outShare: shares.outShare ?? acct.outShare ?? null,
      jobCount: acct.jobCount ?? 0,
      quoteCount: acct.quoteCount ?? 0,
      focusScore: acct.focusScore ?? 0,
      focusReasons: acct.focusReasons ?? [],
      attributionStatus: acct.attributionStatus ?? null,
      lastJobDate: acct.lastJobDate ?? null,
      topColors,
      recentJobs: jobs.map((j) => ({
        jobId: j.source_job_id,
        reportDate: j.reportDate,
        sqft: sqft(j),
        status: j.status_name,
        color: j.color ?? null,
        stone: j.stone ?? null
      })),
      relatedQuotes,
      forecastCount: forecasts.filter((f) => normKey(f.customer_name) === k).length,
      mappingNotes:
        acct.attributionStatus !== "approved_mapped"
          ? ["Account is not approved-mapped in Sales Account Mapping Admin."]
          : []
    };
  }
  return index;
}

/**
 * Pick accounts included in detail panel index — bounded for API payload size.
 * @param {Array<object>} accounts
 * @param {object} filters
 * @param {number} limit
 */
export function pickAccountsForDetailIndex(accounts, filters, limit = 100) {
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  const accountFilter = norm(filters?.account);
  const priority = [];

  for (const a of accounts) {
    let score = 0;
    if (accountFilter && norm(a.account).includes(accountFilter)) score += 1000;
    if ((a.focusScore ?? 0) > 0) score += 500 + (a.focusScore ?? 0);
    score += Math.min(400, (a.currentSqft ?? 0) / 100);
    priority.push({ account: a, score });
  }

  return priority
    .sort((a, b) => b.score - a.score || (b.account.currentSqft ?? 0) - (a.account.currentSqft ?? 0))
    .slice(0, limit)
    .map((p) => p.account);
}

/**
 * @param {object} colorAnalytics
 * @param {Array<object>} currentJobs
 * @param {Array<object>} worksheetRows
 */
export function buildColorDetailIndex(colorAnalytics, currentJobs, worksheetRows) {
  const index = {};
  for (const row of colorAnalytics?.colorRows ?? []) {
    const k = row.key;
    const relatedJobs = currentJobs
      .filter((j) => `${String(j.color ?? "").trim()}|||${String(j.stone ?? "").trim()}` === k)
      .slice(0, 20)
      .map((j) => ({
        jobId: j.source_job_id,
        account: j.account_name,
        sqft: sqft(j),
        reportDate: j.reportDate,
        rep: j.normalizedSalesperson
      }));

    const accounts = new Map();
    for (const j of currentJobs) {
      if (`${String(j.color ?? "").trim()}|||${String(j.stone ?? "").trim()}` !== k) continue;
      const ak = normKey(j.account_name);
      accounts.set(ak, (accounts.get(ak) || 0) + sqft(j));
    }
    const topAccounts = [...accounts.entries()]
      .map(([accountKey, sqftVal]) => {
        const job = currentJobs.find((j) => normKey(j.account_name) === accountKey);
        return { account: job?.account_name ?? accountKey, sqft: sqftVal };
      })
      .sort((a, b) => b.sqft - a.sqft)
      .slice(0, 10);

    index[k] = {
      ...row,
      topAccounts,
      relatedJobs,
      worksheetRowCount: worksheetRows.filter(
        (w) => `${String(w.color ?? "").trim()}|||${String(w.stone ?? "").trim()}` === k
      ).length
    };
  }
  return index;
}

/**
 * Attach navigation hints for data-quality workflow.
 */
function enrichIssueActions(issue) {
  const byType = {
    unmapped_account: {
      navigateTab: "accounts",
      filterPatch: { unmappedOnly: true, tab: "accounts" },
      actionLabel: "View in Accounts"
    },
    missing_sqft: {
      navigateTab: "data_explorer",
      filterPatch: { tab: "data_explorer" },
      actionLabel: "View in Data Explorer"
    },
    missing_salesperson: {
      navigateTab: "accounts",
      filterPatch: { tab: "accounts" },
      actionLabel: "View in Accounts"
    },
    unknown_color: {
      navigateTab: "colors_materials",
      filterPatch: { unknownColorsOnly: true, tab: "colors_materials" },
      actionLabel: "View in Colors / Materials"
    },
    worksheet_facts_unavailable: {
      navigateTab: "data_quality",
      filterPatch: { tab: "data_quality" },
      actionLabel: "View details"
    },
    worksheet_out_of_range: {
      navigateTab: "colors_materials",
      filterPatch: { tab: "colors_materials", quickRange: "custom" },
      actionLabel: "Widen date range"
    },
    sync_incomplete: {
      navigateTab: "command_center",
      filterPatch: { tab: "command_center" },
      actionLabel: "View Command Center"
    }
  };
  const action = byType[issue.type] || { navigateTab: "data_quality", actionLabel: "View in dashboard" };
  return { ...issue, ...action };
}

/**
 * Structured actionable data quality issues.
 */
export function buildDataQualityIssues({
  filteredCurrent,
  priorJobs,
  accountSummary,
  colorMix,
  colorAnalytics,
  syncHealth,
  dataConfidence,
  worksheet,
  intelligenceQuality
}) {
  const issues = [];

  const unmapped = filteredCurrent.filter((j) => j.attributionStatus !== "approved_mapped");
  if (unmapped.length) {
    issues.push({
      id: "unmapped_accounts",
      type: "unmapped_account",
      severity: "high",
      title: "Unmapped account attribution",
      count: unmapped.length,
      sqftImpact: unmapped.reduce((s, j) => s + sqft(j), 0),
      owner: "Sales Account Mapping Admin",
      suggestedFix: "Approve alias rows in Sales Account Mapping Admin.",
      samples: unmapped.slice(0, 5).map((j) => ({ account: j.account_name, sqft: sqft(j) }))
    });
  }

  const missingSqft = filteredCurrent.filter((j) => sqft(j) <= 0);
  if (missingSqft.length) {
    issues.push({
      id: "missing_sqft",
      type: "missing_sqft",
      severity: "medium",
      title: "Jobs missing worksheet sqft",
      count: missingSqft.length,
      sqftImpact: 0,
      owner: "Moraware sync / KPI facts",
      suggestedFix: "Verify worksheet sqft extraction in prepared facts rebuild.",
      samples: missingSqft.slice(0, 5).map((j) => ({ jobId: j.source_job_id, account: j.account_name }))
    });
  }

  const missingSp = filteredCurrent.filter((j) => !j.normalizedSalesperson);
  if (missingSp.length) {
    issues.push({
      id: "missing_salesperson",
      type: "missing_salesperson",
      severity: "medium",
      title: "Missing assigned salesperson",
      count: missingSp.length,
      sqftImpact: missingSp.reduce((s, j) => s + sqft(j), 0),
      owner: "Sales Account Mapping Admin",
      suggestedFix: "Map accounts to assigned reps or verify Moraware salesperson fields.",
      samples: missingSp.slice(0, 5).map((j) => ({ account: j.account_name }))
    });
  }

  const unknownColors = colorAnalytics?.unknownColors ?? colorMix?.unknownColorRows ?? [];
  if (unknownColors.length) {
    issues.push({
      id: "unknown_colors",
      type: "unknown_color",
      severity: "medium",
      title: "Unknown or unmapped colors",
      count: unknownColors.length,
      sqftImpact: unknownColors.reduce((s, c) => s + (Number(c.sqft) || 0), 0),
      owner: "Slab Inventory / Elite 100 catalog",
      suggestedFix: "Review color catalog matches and alias reviews.",
      samples: unknownColors.slice(0, 5).map((c) => ({ color: c.color ?? c.color_name, sqft: c.sqft }))
    });
  }

  if (!worksheet?.available) {
    issues.push({
      id: "worksheet_missing",
      type: "worksheet_facts_unavailable",
      severity: "low",
      title: "Worksheet color/stone/room facts not populated",
      count: 0,
      sqftImpact: 0,
      owner: "Moraware report feeds",
      suggestedFix: "Promote Sales Worksheet report feed (view 220) to moraware_prepared_sales_worksheet_facts.",
      samples: []
    });
  } else if (worksheet.rows?.length && !colorAnalytics?.currentRowCount) {
    issues.push({
      id: "worksheet_out_of_range",
      type: "worksheet_out_of_range",
      severity: "low",
      title: "Worksheet facts exist but none in selected date range",
      count: worksheet.rows.length,
      sqftImpact: 0,
      owner: "Dashboard filters",
      suggestedFix: "Widen the date range to include worksheet job creation dates.",
      samples: []
    });
  }

  if (syncHealth?.latestGroupComplete === false) {
    issues.push({
      id: "sync_incomplete",
      type: "sync_incomplete",
      severity: "high",
      title: "Latest Moraware import group incomplete",
      count: 1,
      sqftImpact: 0,
      owner: "Moraware sync",
      suggestedFix: "Wait for sync completion or use last complete group fallback.",
      samples: [{ lastSync: syncHealth.lastSyncAt }]
    });
  }

  for (const cand of intelligenceQuality?.issueCandidates ?? []) {
    if (cand.type === "forecast_missing_org") {
      issues.push({
        id: "forecast_missing_org",
        type: "forecast_missing_org",
        severity: "medium",
        title: "Forecast events missing organization scope",
        count: cand.count,
        sqftImpact: 0,
        owner: "Quote forecast pipeline",
        suggestedFix: "Backfill quote_forecast_events.organization_id or ensure quote_headers linkage.",
        samples: []
      });
    }
    if (cand.type === "unmatched_worksheet_rows") {
      issues.push({
        id: "unmatched_worksheet_rows",
        type: "unmatched_worksheet_rows",
        severity: "medium",
        title: "Worksheet rows not joined to job facts",
        count: cand.count,
        sqftImpact: cand.sqftImpact ?? 0,
        owner: "Moraware worksheet promotion",
        suggestedFix: "Verify job_id on moraware_prepared_sales_worksheet_facts matches sales_moraware_job_facts.source_job_id.",
        samples: []
      });
    }
  }

  return {
    dataConfidenceScore: dataConfidence,
    syncFreshness: syncHealth?.lastSyncAt ?? null,
    worksheetFactsAvailable: worksheet?.available ?? false,
    issueCount: issues.length,
    issues: issues.map(enrichIssueActions)
  };
}

/**
 * Build active filter chips for the response meta.
 */
export function buildActiveFilterChips(filters) {
  if (!filters?.ok) return [];
  const chips = [];
  chips.push({ key: "quickRange", label: `Range: ${filters.dateRange?.quickRange || "ytd"}` });
  if (filters.branch) chips.push({ key: "branch", label: `Branch: ${filters.branch}`, clearParam: "branch" });
  if (filters.salesperson) chips.push({ key: "salesperson", label: `Rep: ${filters.salesperson}`, clearParam: "salesperson" });
  if (filters.account) chips.push({ key: "account", label: `Account: ${filters.account}`, clearParam: "account" });
  if (filters.collectionStatus) chips.push({ key: "collectionStatus", label: `Collection: ${filters.collectionStatus}`, clearParam: "collectionStatus" });
  if (filters.eliteGroup) chips.push({ key: "eliteGroup", label: `Elite group: ${filters.eliteGroup}`, clearParam: "eliteGroup" });
  if (filters.color) chips.push({ key: "color", label: `Color: ${filters.color}`, clearParam: "color" });
  if (filters.dormantOnly) chips.push({ key: "dormantOnly", label: "Dormant only", clearParam: "dormantOnly" });
  if (filters.behindPriorYearOnly) chips.push({ key: "behindPriorYearOnly", label: "Behind prior year", clearParam: "behindPriorYearOnly" });
  if (filters.unmappedOnly) chips.push({ key: "unmappedOnly", label: "Unmapped only", clearParam: "unmappedOnly" });
  if (filters.unknownColorsOnly) chips.push({ key: "unknownColorsOnly", label: "Unknown colors", clearParam: "unknownColorsOnly" });
  if (filters.quotedNotProducedOnly) chips.push({ key: "quotedNotProducedOnly", label: "Quoted not produced", clearParam: "quotedNotProducedOnly" });
  if (filters.forecastWindow) chips.push({ key: "forecastWindow", label: `Forecast: ${filters.forecastWindow}`, clearParam: "forecastWindow" });
  return chips;
}
