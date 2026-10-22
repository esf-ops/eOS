/**
 * Estimating Command Center — pure domain model (prototype).
 *
 * Grain: customer (Account Directory UUID) → opportunity (QuickBooks Customer:Job) →
 * estimate revisions (QuickBooks estimate TxnIDs) → sold (sales order) → handoff → Moraware job.
 *
 * Counting contract (see docs/eliteos/ESTIMATING_COMMAND_CENTER_DESIGN.md §5):
 * - Quote counts are per opportunity, never per estimate row. Revisions are a separate metric.
 * - Dollar values use the current revision only (or the sold amount once sold).
 * - A multi-color opportunity is one job; the color report counts it once per color it contains.
 * - `null` means unknown and is never coerced to 0. Every metric carries a state and a reason.
 *
 * This module is intentionally framework-free so the same logic can move into Brain unchanged.
 */

const DAY_MS = 86_400_000;

export const METRIC_STATES = /** @type {const} */ (["ok", "partial", "stale", "unknown"]);

/** @param {string | null | undefined} iso */
function ts(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** @param {string | null | undefined} iso @param {string} from @param {string} to */
function inRange(iso, from, to) {
  const t = ts(iso);
  if (t == null) return false;
  return t >= ts(from) && t < ts(to) + DAY_MS;
}

/** Whole days between two ISO instants (floor). Returns null when either side is unknown. */
export function daysBetween(fromIso, toIso) {
  const a = ts(fromIso);
  const b = ts(toIso);
  if (a == null || b == null) return null;
  return Math.floor((b - a) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Source freshness
// ---------------------------------------------------------------------------

/**
 * @param {{ lastSuccessAt: string | null, staleAfterHours: number | null, kind?: string }} source
 * @param {string} asOf
 * @returns {{ state: "fresh" | "stale" | "snapshot" | "unknown" | "static", ageHours: number | null }}
 */
export function classifyFreshness(source, asOf) {
  if (source.kind === "static") return { state: "static", ageHours: null };
  const last = ts(source.lastSuccessAt);
  if (last == null) return { state: "unknown", ageHours: null };
  const ageHours = Math.max(0, (ts(asOf) - last) / 3_600_000);
  if (source.kind === "snapshot") return { state: "snapshot", ageHours };
  if (source.staleAfterHours == null) return { state: "unknown", ageHours };
  return { state: ageHours > source.staleAfterHours ? "stale" : "fresh", ageHours };
}

/**
 * Worst freshness across the sources a metric depends on.
 * @param {string[]} deps @param {Record<string, { state: string }>} freshnessByKey
 */
function dependencyState(deps, freshnessByKey) {
  const states = deps.map((d) => freshnessByKey[d]?.state ?? "unknown");
  if (states.includes("unknown")) return "unknown";
  if (states.includes("stale") || states.includes("snapshot")) return "stale";
  return "ok";
}

// ---------------------------------------------------------------------------
// Opportunity helpers
// ---------------------------------------------------------------------------

/** Active revisions ordered oldest → newest by txn date, then QuickBooks EditSequence. */
export function orderedRevisions(opp) {
  return [...(opp.revisions ?? [])]
    .filter((r) => r.isActive !== false)
    .sort((a, b) => (ts(a.txnDate) ?? 0) - (ts(b.txnDate) ?? 0) || String(a.editSequence ?? "").localeCompare(String(b.editSequence ?? "")));
}

export function currentRevision(opp) {
  const revs = orderedRevisions(opp);
  return revs.length ? revs[revs.length - 1] : null;
}

export function firstQuotedAt(opp) {
  const revs = orderedRevisions(opp);
  return revs.length ? revs[0].txnDate : null;
}

/** The revision that defines scope: the sold revision when known, otherwise the current one. */
export function scopeRevision(opp) {
  if (opp.sold?.estimateTxnId) {
    const hit = (opp.revisions ?? []).find((r) => r.txnId === opp.sold.estimateTxnId);
    if (hit) return hit;
  }
  return currentRevision(opp);
}

/** Sales orders on the project (first order plus change orders). Falls back to the single `sold` record. */
export function projectSalesOrders(opp) {
  if (Array.isArray(opp.financial?.salesOrders)) return opp.financial.salesOrders;
  return opp.sold ? [{ refNumber: opp.sold.refNumber, date: opp.sold.soldAt, amount: opp.sold.amount ?? null }] : [];
}

/**
 * @returns {"open" | "sold" | "lost" | "no_estimate"}
 */
export function opportunityStage(opp) {
  if (opp.sold) return "sold";
  if (opp.lost) return "lost";
  if (!currentRevision(opp)) return "no_estimate";
  return "open";
}

/**
 * @returns {"not_sold" | "awaiting_handoff" | "awaiting_tanya" | "in_progress" | "initiated"}
 */
export function handoffStage(opp) {
  if (!opp.sold) return "not_sold";
  if (!opp.handoff) return "awaiting_handoff";
  if (opp.handoff.morawareJobId) return "initiated";
  return opp.handoff.state === "in_progress" ? "in_progress" : "awaiting_tanya";
}

/**
 * Colors on the scope revision.
 * Returns `null` (unknown) when the revision has no line detail — not an empty list.
 * @returns {{ colors: { key: string, label: string, sqft: number | null }[], unmatchedText: string[] } | null}
 */
export function opportunityColors(opp) {
  const rev = scopeRevision(opp);
  if (!rev || !Array.isArray(rev.lines)) return null;
  /** @type {Map<string, { key: string, label: string, sqft: number | null }>} */
  const byKey = new Map();
  const unmatchedText = [];
  for (const line of rev.lines) {
    if (!line.isMaterial) continue;
    if (!line.colorKey) {
      if (line.desc) unmatchedText.push(line.desc);
      continue;
    }
    const prev = byKey.get(line.colorKey);
    const sqft = line.sqft ?? null;
    if (!prev) byKey.set(line.colorKey, { key: line.colorKey, label: line.colorLabel ?? line.colorKey, sqft });
    else prev.sqft = prev.sqft == null || sqft == null ? null : prev.sqft + sqft;
  }
  return { colors: [...byKey.values()], unmatchedText };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Sum that keeps unknown separate from zero.
 * @param {(number | null | undefined)[]} values
 */
export function knownSum(values) {
  let sum = 0;
  let known = 0;
  let unknown = 0;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      known += 1;
    } else unknown += 1;
  }
  return { value: known ? sum : values.length ? null : 0, known, unknown };
}

function metric({ key, label, value, format, drill, deps, freshnessByKey, unknownCount = 0, reason = null, definition }) {
  let state = "ok";
  let why = reason;
  if (value == null) {
    state = "unknown";
  } else if (unknownCount > 0) {
    state = "partial";
    why = why ?? `${unknownCount} record(s) missing this value are excluded, not counted as zero.`;
  }
  const dep = dependencyState(deps, freshnessByKey);
  if (state !== "unknown" && dep !== "ok") {
    state = "stale";
    const staleNote = "One or more source feeds are past their freshness window.";
    why = why ? `${why} ${staleNote}` : staleNote;
  }
  if (state === "unknown" && !why) why = "No source data available to compute this value.";
  return { key, label, value, format, state, reason: why, drill: drill ?? [], deps, definition };
}

/**
 * @param {any[]} opps
 * @param {{ from: string, to: string, asOf: string, freshnessByKey: Record<string, { state: string }> }} ctx
 */
export function computeMetrics(opps, ctx) {
  const { from, to, asOf, freshnessByKey } = ctx;
  const quoteDeps = ["qb_estimates"];
  const soldDeps = ["qb_estimates", "qb_sales_orders"];

  const quotedInRange = opps.filter((o) => inRange(firstQuotedAt(o), from, to));
  const revisionsInRange = opps.flatMap((o) => orderedRevisions(o).filter((r) => inRange(r.txnDate, from, to)).map((r) => ({ opp: o, r })));
  const soldInRange = opps.filter((o) => o.sold && inRange(o.sold.soldAt, from, to));
  const cohortSold = quotedInRange.filter((o) => o.sold && ts(o.sold.soldAt) <= ts(asOf));
  const open = opps.filter((o) => opportunityStage(o) === "open");
  const awaiting = opps.filter((o) => ["awaiting_handoff", "awaiting_tanya", "in_progress"].includes(handoffStage(o)));

  const quotedValue = knownSum(quotedInRange.map((o) => currentRevision(o)?.total));
  const ordersInRange = opps.flatMap((o) => projectSalesOrders(o).filter((s) => inRange(s.date, from, to)).map((s) => ({ o, s })));
  const soldValue = knownSum(ordersInRange.map((x) => x.s.amount));
  const openValue = knownSum(open.map((o) => currentRevision(o)?.total));
  const daysToClose = soldInRange.map((o) => daysBetween(firstQuotedAt(o), o.sold.soldAt)).filter((d) => d != null).sort((a, b) => a - b);

  const ids = (list) => list.map((o) => o.id);

  return [
    metric({
      key: "opportunities_quoted",
      label: "Opportunities quoted",
      value: quotedInRange.length,
      format: "count",
      drill: ids(quotedInRange),
      deps: quoteDeps,
      freshnessByKey,
      definition: "Distinct opportunities whose first active estimate revision is dated in the period. Revisions do not add to this count.",
    }),
    metric({
      key: "estimate_revisions",
      label: "Estimate revisions",
      value: revisionsInRange.length,
      format: "count",
      drill: [...new Set(revisionsInRange.map((x) => x.opp.id))],
      deps: quoteDeps,
      freshnessByKey,
      definition: "Active QuickBooks estimate transactions dated in the period, including first quotes and re-quotes.",
    }),
    metric({
      key: "quoted_value",
      label: "Quoted value",
      value: quotedValue.value,
      format: "money",
      unknownCount: quotedValue.unknown,
      drill: ids(quotedInRange),
      deps: quoteDeps,
      freshnessByKey,
      definition: "Sum of the current revision total for opportunities first quoted in the period. Superseded revisions are excluded.",
    }),
    metric({
      key: "sold_count",
      label: "Jobs sold",
      value: soldInRange.length,
      format: "count",
      drill: ids(soldInRange),
      deps: soldDeps,
      freshnessByKey,
      definition: "Opportunities whose sold event (QuickBooks sales order linked to an estimate) is dated in the period.",
    }),
    metric({
      key: "sold_value",
      label: "Sales orders ($)",
      value: soldValue.value,
      format: "money",
      unknownCount: soldValue.unknown,
      drill: [...new Set(ordersInRange.map((x) => x.o.id))],
      deps: soldDeps,
      freshnessByKey,
      definition: "Sum of every QuickBooks sales order dated in the period, including change orders. Same definition as the Sales dashboard and Account 360 \"Sales Orders\".",
    }),
    metric({
      key: "cohort_close_rate",
      label: "Close rate (cohort)",
      value: quotedInRange.length ? cohortSold.length / quotedInRange.length : null,
      format: "percent",
      reason: quotedInRange.length ? null : "No opportunities were first quoted in this period, so there is no denominator.",
      drill: ids(cohortSold),
      deps: soldDeps,
      freshnessByKey,
      definition: "Of opportunities first quoted in the period, the share sold as of today. Recent cohorts are still maturing.",
    }),
    metric({
      key: "open_pipeline_value",
      label: "Open pipeline",
      value: openValue.value,
      format: "money",
      unknownCount: openValue.unknown,
      drill: ids(open),
      deps: quoteDeps,
      freshnessByKey,
      definition: "Current revision total of every opportunity that is quoted, not sold and not marked lost, regardless of period.",
    }),
    metric({
      key: "median_days_to_close",
      label: "Median days to close",
      value: daysToClose.length ? daysToClose[Math.floor((daysToClose.length - 1) / 2)] : null,
      format: "days",
      reason: daysToClose.length ? null : "No jobs sold in this period.",
      drill: ids(soldInRange),
      deps: soldDeps,
      freshnessByKey,
      definition: "Median days from first estimate revision to sold event for jobs sold in the period.",
    }),
    metric({
      key: "awaiting_handoff",
      label: "Sold, not yet in Moraware",
      value: awaiting.length,
      format: "count",
      drill: ids(awaiting),
      deps: ["qb_sales_orders", "moraware_jobs"],
      freshnessByKey,
      definition: "Sold opportunities without a confirmed Moraware job ID, regardless of period.",
    }),
  ];
}

// ---------------------------------------------------------------------------
// Attention queue
// ---------------------------------------------------------------------------

export const ATTENTION_RULES = {
  followUpDueDays: 3,
  staleQuoteDays: 21,
  handoffSlaDays: 1,
  morawareSlaDays: 2,
  revisionChurn: 3,
};

/**
 * @returns {{ oppId: string, kind: string, severity: "high" | "medium" | "low", ageDays: number | null, message: string }[]}
 */
export function attentionQueue(opps, asOf, rules = ATTENTION_RULES) {
  const items = [];
  for (const o of opps) {
    const stage = opportunityStage(o);
    const hand = handoffStage(o);
    const cur = currentRevision(o);
    if (stage === "open" && cur) {
      const lastTouch = o.lastFollowUpAt ?? cur.txnDate;
      const age = daysBetween(lastTouch, asOf);
      if (o.lastFollowUpAt == null && o.followUpSource === "unavailable") {
        if (age != null && age >= rules.followUpDueDays) {
          items.push({ oppId: o.id, kind: "follow_up_unknown", severity: "medium", ageDays: age, message: `No follow-up record; quote sent ${age}d ago` });
        }
      } else if (age != null && age >= rules.followUpDueDays) {
        items.push({ oppId: o.id, kind: "follow_up_due", severity: age >= rules.staleQuoteDays ? "high" : "medium", ageDays: age, message: `Follow-up due — last touch ${age}d ago` });
      }
      if (orderedRevisions(o).length >= rules.revisionChurn) {
        items.push({ oppId: o.id, kind: "revision_churn", severity: "low", ageDays: null, message: `${orderedRevisions(o).length} revisions — confirm scope with customer` });
      }
    }
    if (hand === "awaiting_handoff") {
      const age = daysBetween(o.sold.soldAt, asOf);
      if (age != null && age >= rules.handoffSlaDays) items.push({ oppId: o.id, kind: "handoff_missing", severity: "high", ageDays: age, message: `Sold ${age}d ago — handoff not sent to Tanya` });
    }
    if (hand === "awaiting_tanya" || hand === "in_progress") {
      const age = daysBetween(o.handoff.receivedAt, asOf);
      if (age != null && age >= rules.morawareSlaDays) items.push({ oppId: o.id, kind: "moraware_overdue", severity: "high", ageDays: age, message: `Handoff ${age}d old — no Moraware job yet` });
    }
    if (stage !== "no_estimate") {
      if (!o.salesRep?.qbSalesRepListId) items.push({ oppId: o.id, kind: "data_missing_rep", severity: "low", ageDays: null, message: "No QuickBooks sales rep on estimate" });
      if (!o.customer?.accountId) items.push({ oppId: o.id, kind: "data_unlinked_customer", severity: "low", ageDays: null, message: "QuickBooks customer not linked to Account Directory" });
      if (!o.branch?.branchKey) items.push({ oppId: o.id, kind: "data_unmapped_branch", severity: "low", ageDays: null, message: o.branch?.qbClassName ? `Class "${o.branch.qbClassName}" not mapped to a branch` : "No QuickBooks class on estimate" });
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.ageDays ?? -1) - (a.ageDays ?? -1));
}

// ---------------------------------------------------------------------------
// Color report
// ---------------------------------------------------------------------------

/**
 * Per-color job counts. A job with N colors appears under N colors, so the per-color
 * job counts can sum to more than `totals.jobs`.
 */
export function colorReport(opps, { from, to }) {
  const scoped = opps.filter((o) => inRange(firstQuotedAt(o), from, to) || (o.sold && inRange(o.sold.soldAt, from, to)));
  /** @type {Map<string, { key: string, label: string, quotedJobs: Set<string>, soldJobs: Set<string>, sqft: number, sqftUnknown: number }>} */
  const rows = new Map();
  let multiColorJobs = 0;
  let unknownColorJobs = 0;
  let unmatchedTextJobs = 0;
  let appearances = 0;
  for (const o of scoped) {
    const c = opportunityColors(o);
    if (c == null) {
      unknownColorJobs += 1;
      continue;
    }
    if (c.unmatchedText.length) unmatchedTextJobs += 1;
    if (c.colors.length === 0 && !c.unmatchedText.length) unknownColorJobs += 1;
    if (c.colors.length > 1) multiColorJobs += 1;
    for (const col of c.colors) {
      appearances += 1;
      let row = rows.get(col.key);
      if (!row) {
        row = { key: col.key, label: col.label, quotedJobs: new Set(), soldJobs: new Set(), sqft: 0, sqftUnknown: 0 };
        rows.set(col.key, row);
      }
      row.quotedJobs.add(o.id);
      if (o.sold) row.soldJobs.add(o.id);
      if (col.sqft == null) row.sqftUnknown += 1;
      else row.sqft += col.sqft;
    }
  }
  const out = [...rows.values()]
    .map((r) => ({
      key: r.key,
      label: r.label,
      jobs: r.quotedJobs.size,
      soldJobs: r.soldJobs.size,
      sqft: r.sqftUnknown === r.quotedJobs.size ? null : r.sqft,
      sqftUnknownJobs: r.sqftUnknown,
      drill: [...r.quotedJobs],
    }))
    .sort((a, b) => b.jobs - a.jobs || a.label.localeCompare(b.label));
  return { rows: out, totals: { jobs: scoped.length, colorAppearances: appearances, multiColorJobs, unknownColorJobs, unmatchedTextJobs } };
}

// ---------------------------------------------------------------------------
// Job table + handoff queue
// ---------------------------------------------------------------------------

export function jobRow(o, asOf) {
  const cur = currentRevision(o);
  const colors = opportunityColors(o);
  return {
    id: o.id,
    customer: o.customer?.name ?? null,
    customerLinked: Boolean(o.customer?.accountId),
    project: o.projectName ?? null,
    branch: o.branch?.branchKey ?? null,
    branchRaw: o.branch?.qbClassName ?? null,
    salesRep: o.salesRep?.userName ?? o.salesRep?.initials ?? null,
    salesRepMapped: Boolean(o.salesRep?.userName),
    accountOwner: o.accountOwner?.name ?? null,
    estimator: o.estimator?.name ?? null,
    stage: opportunityStage(o),
    handoff: handoffStage(o),
    revisions: orderedRevisions(o).length,
    currentRef: cur?.refNumber ?? null,
    currentTotal: cur?.total ?? null,
    soldAmount: o.sold ? knownSum(projectSalesOrders(o).map((s) => s.amount)).value : null,
    colors: colors ? colors.colors.map((c) => c.label) : null,
    colorKeys: colors ? colors.colors.map((c) => c.key) : [],
    firstQuotedAt: firstQuotedAt(o),
    ageDays: daysBetween(firstQuotedAt(o), asOf),
    morawareJobId: o.handoff?.morawareJobId ?? null,
  };
}

/**
 * @param {ReturnType<typeof jobRow>[]} rows
 * @param {{ branch?: string, salesRep?: string, stage?: string, color?: string, search?: string, ids?: string[] | null }} f
 */
export function filterJobRows(rows, f) {
  const q = String(f.search ?? "").trim().toLowerCase();
  const idSet = f.ids ? new Set(f.ids) : null;
  return rows.filter((r) => {
    if (idSet && !idSet.has(r.id)) return false;
    if (f.branch && (f.branch === "__unknown" ? r.branch != null : r.branch !== f.branch)) return false;
    if (f.salesRep && (f.salesRep === "__unknown" ? r.salesRep != null : r.salesRep !== f.salesRep)) return false;
    if (f.stage && r.stage !== f.stage) return false;
    if (f.color && !r.colorKeys.includes(f.color)) return false;
    if (q && ![r.customer, r.project, r.currentRef, r.salesRep, r.accountOwner].some((v) => String(v ?? "").toLowerCase().includes(q))) return false;
    return true;
  });
}

export function handoffQueue(opps, asOf) {
  const order = { awaiting_handoff: 0, awaiting_tanya: 1, in_progress: 2, initiated: 3 };
  return opps
    .filter((o) => o.sold)
    .map((o) => ({
      id: o.id,
      stage: handoffStage(o),
      customer: o.customer?.name ?? null,
      project: o.projectName ?? null,
      soldAt: o.sold.soldAt,
      salesOrderRef: o.sold.refNumber ?? null,
      linkMethod: o.sold.linkMethod,
      amount: o.sold.amount ?? null,
      daysSinceSold: daysBetween(o.sold.soldAt, asOf),
      receivedAt: o.handoff?.receivedAt ?? null,
      morawareJobId: o.handoff?.morawareJobId ?? null,
      colors: opportunityColors(o)?.colors.map((c) => c.label) ?? null,
      branch: o.branch?.branchKey ?? null,
    }))
    .sort((a, b) => order[a.stage] - order[b.stage] || (b.daysSinceSold ?? 0) - (a.daysSinceSold ?? 0));
}
