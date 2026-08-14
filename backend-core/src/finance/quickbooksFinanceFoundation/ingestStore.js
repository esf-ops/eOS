/**
 * Persist Full Finance Foundation prepared facts (idempotent upserts).
 */

import { QB_FINANCE_DATASETS } from "./constants.js";
import { nextCheckpointStatus } from "./checkpoints.js";
import {
  extractBalanceSheetControlTotals,
  extractProfitAndLossControlTotals,
  reconcileBalanceSheetIdentity
} from "./reconcileReports.js";
import { buildDepositCashEvents } from "./cashNormalize.js";

export async function beginSyncRun(supabase, value) {
  const { data, error } = await supabase
    .from("qb_finance_sync_runs")
    .insert({
      organization_id: value.organizationId,
      domain: value.domain,
      run_kind: value.runKind,
      status: "running",
      worker_version: value.workerVersion,
      company_name: value.companyName,
      coverage_start_date: value.coverageStartDate,
      coverage_end_date: value.coverageEndDate,
      report_basis: value.reportBasis,
      warnings: []
    })
    .select("id, started_at, status, domain")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertDatasetRows(supabase, dataset, rows, chunkSize = 200) {
  const meta = QB_FINANCE_DATASETS[dataset];
  if (!meta) throw new Error(`unknown dataset ${dataset}`);
  if (!meta.conflict) {
    throw new Error(`dataset ${dataset} is insert-only; use dedicated action`);
  }
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase.from(meta.table).upsert(slice, {
      onConflict: meta.conflict,
      count: "exact"
    });
    if (error) throw new Error(error.message);
    upserted += count ?? slice.length;
  }
  return { upserted };
}

export async function upsertCheckpoint(supabase, value) {
  const now = new Date().toISOString();
  const status = nextCheckpointStatus("pending", value.status === "running" ? "start" : value.status === "success" ? "succeed" : value.status === "failed" ? "fail" : "reset");
  const row = {
    organization_id: value.organizationId,
    domain: value.domain,
    dataset: value.dataset,
    period_start: value.periodStart,
    period_end: value.periodEnd,
    status: value.status || status,
    sync_run_id: value.syncRunId,
    row_count: value.rowCount,
    source_count: value.sourceCount,
    warning_count: value.warningCount,
    error_summary: value.errorSummary,
    updated_at: now
  };
  if (value.status === "running") row.started_at = now;
  if (value.status === "success" || value.status === "failed") row.completed_at = now;

  const { data, error } = await supabase
    .from("qb_finance_sync_checkpoints")
    .upsert(row, { onConflict: "organization_id,domain,dataset,period_start,period_end" })
    .select("id, status, period_start, period_end, dataset, domain")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCheckpoint(supabase, value) {
  const { data, error } = await supabase
    .from("qb_finance_sync_checkpoints")
    .select("id, status, period_start, period_end, dataset, domain, row_count")
    .eq("organization_id", value.organizationId)
    .eq("domain", value.domain)
    .eq("dataset", value.dataset)
    .eq("period_start", value.periodStart)
    .eq("period_end", value.periodEnd)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function replaceOpenApSnapshot(supabase, organizationId, rows) {
  const nowIso = new Date().toISOString();
  const incomingIds = rows.map((r) => r.qb_bill_id);
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200).map((r) => ({ ...r, synced_at: nowIso, updated_at: nowIso }));
    const { error } = await supabase.from("qb_finance_open_ap_current").upsert(slice, {
      onConflict: "organization_id,qb_bill_id"
    });
    if (error) throw new Error(error.message);
  }
  const { data: existing, error: readErr } = await supabase
    .from("qb_finance_open_ap_current")
    .select("qb_bill_id")
    .eq("organization_id", organizationId);
  if (readErr) throw new Error(readErr.message);
  const keep = new Set(incomingIds);
  const toDelete = (existing || []).map((r) => r.qb_bill_id).filter((id) => id && !keep.has(id));
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 200) {
    const slice = toDelete.slice(i, i + 200);
    const { error, count } = await supabase
      .from("qb_finance_open_ap_current")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId)
      .in("qb_bill_id", slice);
    if (error) throw new Error(error.message);
    deleted += count ?? slice.length;
  }
  if (rows.length === 0) {
    const { error, count } = await supabase
      .from("qb_finance_open_ap_current")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    deleted += count ?? 0;
  }
  return { upserted: rows.length, deleted };
}

export async function replaceUndepositedSnapshot(supabase, organizationId, rows) {
  const nowIso = new Date().toISOString();
  const incomingIds = rows.map((r) => r.qb_txn_id);
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200).map((r) => ({ ...r, synced_at: nowIso, updated_at: nowIso }));
    const { error } = await supabase.from("qb_finance_undeposited_current").upsert(slice, {
      onConflict: "organization_id,qb_txn_id"
    });
    if (error) throw new Error(error.message);
  }
  const { data: existing, error: readErr } = await supabase
    .from("qb_finance_undeposited_current")
    .select("qb_txn_id")
    .eq("organization_id", organizationId);
  if (readErr) throw new Error(readErr.message);
  const keep = new Set(incomingIds);
  const toDelete = (existing || []).map((r) => r.qb_txn_id).filter((id) => id && !keep.has(id));
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 200) {
    const slice = toDelete.slice(i, i + 200);
    const { error, count } = await supabase
      .from("qb_finance_undeposited_current")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId)
      .in("qb_txn_id", slice);
    if (error) throw new Error(error.message);
    deleted += count ?? slice.length;
  }
  if (rows.length === 0) {
    const { error, count } = await supabase
      .from("qb_finance_undeposited_current")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    deleted += count ?? 0;
  }
  return { upserted: rows.length, deleted };
}

export async function insertReportSnapshot(supabase, value) {
  const totals =
    value.reportType === "balance_sheet"
      ? extractBalanceSheetControlTotals(value.lines)
      : extractProfitAndLossControlTotals(value.lines);
  const controlTotals = { ...totals, ...(value.controlTotals || {}) };

  const { data: snap, error } = await supabase
    .from("qb_finance_report_snapshots")
    .insert({
      organization_id: value.organizationId,
      report_type: value.reportType,
      source_view: value.sourceView,
      report_basis: value.reportBasis,
      period_start: value.periodStart,
      period_end: value.periodEnd,
      as_of_date: value.asOfDate,
      is_opening: value.isOpening,
      control_totals: controlTotals,
      sync_run_id: value.syncRunId
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const lineRows = value.lines.map((l) => ({
    ...l,
    snapshot_id: snap.id
  }));
  for (let i = 0; i < lineRows.length; i += 200) {
    const slice = lineRows.slice(i, i + 200);
    const { error: lineErr } = await supabase.from("qb_finance_report_lines").insert(slice);
    if (lineErr) throw new Error(lineErr.message);
  }

  let identity = null;
  if (value.reportType === "balance_sheet") {
    identity = reconcileBalanceSheetIdentity(value.lines);
    const { error: recErr } = await supabase.from("qb_finance_reconciliation_results").insert({
      organization_id: value.organizationId,
      sync_run_id: value.syncRunId,
      check_type: identity.check_type,
      report_basis: value.reportBasis,
      as_of_date: value.asOfDate,
      eliteos_value: identity.eliteos_value,
      quickbooks_value: identity.quickbooks_value,
      delta: identity.delta,
      tolerance_abs: identity.tolerance_abs,
      status: identity.status,
      notes: identity.notes
    });
    if (recErr) throw new Error(recErr.message);
  }

  if (value.isOpening) {
    const openingRows = value.lines
      .filter((l) => l.label)
      .map((l) => ({
        organization_id: value.organizationId,
        as_of_date: value.asOfDate,
        report_basis: value.reportBasis,
        line_label: l.label,
        amount: l.amount,
        row_type: l.row_type,
        snapshot_id: snap.id,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
    if (openingRows.length) {
      const { error: openErr } = await supabase.from("qb_finance_opening_balances").upsert(openingRows, {
        onConflict: "organization_id,as_of_date,report_basis,line_label"
      });
      if (openErr) throw new Error(openErr.message);
    }
  }

  return { snapshot_id: snap.id, control_totals: controlTotals, identity, line_count: lineRows.length };
}

export async function insertReconciliation(supabase, value) {
  const { data, error } = await supabase
    .from("qb_finance_reconciliation_results")
    .insert(value)
    .select("id, status, check_type")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function completeSyncRun(supabase, value) {
  const { data, error } = await supabase
    .from("qb_finance_sync_runs")
    .update({
      status: value.status,
      completed_at: new Date().toISOString(),
      row_counts: value.rowCounts,
      warnings: value.warnings,
      error_summary: value.errorSummary,
      updated_at: new Date().toISOString()
    })
    .eq("id", value.syncRunId)
    .eq("organization_id", value.organizationId)
    .select("id, status, completed_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export function cashEventsFromDepositPayload(organizationId, deposits, depositLines) {
  return buildDepositCashEvents({ organizationId, deposits, depositLines });
}
