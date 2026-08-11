/**
 * Validate + persist QuickBooks Sales ODBC sync payloads (prepared facts).
 */

const TXN_TYPES = new Set(["estimate", "sales_order", "invoice", "payment"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const QB_SALES_SYNC_MAX_TRANSACTIONS = 500;
export const QB_SALES_SYNC_MAX_OPEN_AR = 5000;
export const QB_SALES_SYNC_WORKER_VERSION_DEFAULT = "1.0.0";

function isUuid(v) {
  return UUID_RE.test(String(v ?? "").trim());
}

function isYmd(v) {
  return YMD_RE.test(String(v ?? "").trim());
}

function toNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickStr(v, max = 500) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * @param {unknown} body
 */
export function validateBeginPayload(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  const workerVersion = pickStr(body?.worker_version, 64) || QB_SALES_SYNC_WORKER_VERSION_DEFAULT;
  const companyName = pickStr(body?.company_name, 200);
  const coverageStart = pickStr(body?.coverage_start_date, 16);
  const coverageEnd = pickStr(body?.coverage_end_date, 16);
  if (coverageStart && !isYmd(coverageStart)) errors.push("coverage_start_date must be YYYY-MM-DD");
  if (coverageEnd && !isYmd(coverageEnd)) errors.push("coverage_end_date must be YYYY-MM-DD");
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organizationId,
      workerVersion,
      companyName,
      coverageStartDate: coverageStart,
      coverageEndDate: coverageEnd
    }
  };
}

/**
 * @param {unknown} body
 */
export function validateTransactionChunk(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  const syncRunId = pickStr(body?.sync_run_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  if (!isUuid(syncRunId)) errors.push("sync_run_id must be a uuid");
  const rowsIn = Array.isArray(body?.transactions) ? body.transactions : null;
  if (!rowsIn) errors.push("transactions must be an array");
  if (rowsIn && rowsIn.length > QB_SALES_SYNC_MAX_TRANSACTIONS) {
    errors.push(`transactions exceeds max ${QB_SALES_SYNC_MAX_TRANSACTIONS}`);
  }

  /** @type {Array<object>} */
  const transactions = [];
  if (rowsIn) {
    for (let i = 0; i < rowsIn.length; i += 1) {
      const row = rowsIn[i];
      const transactionType = pickStr(row?.transaction_type, 32);
      const sourceId = pickStr(row?.source_id, 200);
      const transactionDate = pickStr(row?.transaction_date, 16);
      const amount = toNumber(row?.amount);
      if (!TXN_TYPES.has(transactionType || "")) {
        errors.push(`transactions[${i}].transaction_type invalid`);
        continue;
      }
      if (!sourceId) {
        errors.push(`transactions[${i}].source_id required`);
        continue;
      }
      if (!isYmd(transactionDate)) {
        errors.push(`transactions[${i}].transaction_date must be YYYY-MM-DD`);
        continue;
      }
      if (amount == null) {
        errors.push(`transactions[${i}].amount must be numeric`);
        continue;
      }
      transactions.push({
        organization_id: organizationId,
        transaction_type: transactionType,
        source_id: sourceId,
        reference_number: pickStr(row?.reference_number, 120),
        transaction_date: transactionDate,
        customer_name: pickStr(row?.customer_name, 300),
        amount,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { organizationId, syncRunId, transactions }
  };
}

/**
 * @param {unknown} body
 */
export function validateOpenArReplacePayload(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  const syncRunId = pickStr(body?.sync_run_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  if (!isUuid(syncRunId)) errors.push("sync_run_id must be a uuid");
  const rowsIn = Array.isArray(body?.open_ar) ? body.open_ar : null;
  if (!rowsIn) errors.push("open_ar must be an array");
  if (rowsIn && rowsIn.length > QB_SALES_SYNC_MAX_OPEN_AR) {
    errors.push(`open_ar exceeds max ${QB_SALES_SYNC_MAX_OPEN_AR}`);
  }
  const allowEmpty = Boolean(body?.allow_empty_open_ar);

  /** @type {Array<object>} */
  const openAr = [];
  if (rowsIn) {
    for (let i = 0; i < rowsIn.length; i += 1) {
      const row = rowsIn[i];
      const sourceInvoiceId = pickStr(row?.source_invoice_id, 200);
      const balance = toNumber(row?.balance);
      if (!sourceInvoiceId) {
        errors.push(`open_ar[${i}].source_invoice_id required`);
        continue;
      }
      if (balance == null || balance <= 0) {
        errors.push(`open_ar[${i}].balance must be a positive number`);
        continue;
      }
      const invoiceDate = pickStr(row?.invoice_date, 16);
      if (invoiceDate && !isYmd(invoiceDate)) {
        errors.push(`open_ar[${i}].invoice_date must be YYYY-MM-DD`);
        continue;
      }
      openAr.push({
        organization_id: organizationId,
        source_invoice_id: sourceInvoiceId,
        reference_number: pickStr(row?.reference_number, 120),
        invoice_date: invoiceDate,
        customer_name: pickStr(row?.customer_name, 300),
        original_amount: toNumber(row?.original_amount),
        balance,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  if (errors.length === 0 && openAr.length === 0 && !allowEmpty) {
    errors.push("open_ar is empty; refusing to wipe current snapshot (set allow_empty_open_ar=true to override)");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { organizationId, syncRunId, openAr, allowEmpty }
  };
}

/**
 * @param {unknown} body
 */
export function validateCompletePayload(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  const syncRunId = pickStr(body?.sync_run_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  if (!isUuid(syncRunId)) errors.push("sync_run_id must be a uuid");
  const status = pickStr(body?.status, 32) || "success";
  if (!["success", "partial", "failed"].includes(status)) {
    errors.push("status must be success|partial|failed");
  }
  const warnings = Array.isArray(body?.warnings)
    ? body.warnings.map((w) => pickStr(w, 400)).filter(Boolean).slice(0, 50)
    : [];
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organizationId,
      syncRunId,
      status,
      companyName: pickStr(body?.company_name, 200),
      coverageStartDate: pickStr(body?.coverage_start_date, 16),
      coverageEndDate: pickStr(body?.coverage_end_date, 16),
      estimatesCount: toNumber(body?.estimates_count),
      salesOrdersCount: toNumber(body?.sales_orders_count),
      invoicesCount: toNumber(body?.invoices_count),
      paymentsCount: toNumber(body?.payments_count),
      openArCount: toNumber(body?.open_ar_count),
      warnings,
      errorSummary: pickStr(body?.error_summary, 500)
    }
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} value
 */
export async function beginSyncRun(supabase, value) {
  const { data, error } = await supabase
    .from("sales_quickbooks_sync_runs")
    .insert({
      organization_id: value.organizationId,
      status: "running",
      worker_version: value.workerVersion,
      company_name: value.companyName,
      coverage_start_date: value.coverageStartDate,
      coverage_end_date: value.coverageEndDate,
      warnings: []
    })
    .select("id, started_at, status")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Chunked idempotent upsert of financial transactions.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<object>} rows
 * @param {number} [chunkSize]
 */
export async function upsertFinancialTransactions(supabase, rows, chunkSize = 200) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from("sales_quickbooks_financial_transactions")
      .upsert(slice, {
        onConflict: "organization_id,transaction_type,source_id",
        count: "exact"
      });
    if (error) throw new Error(error.message);
    upserted += count ?? slice.length;
  }
  return { upserted };
}

/**
 * Replace current Open A/R snapshot safely after validation.
 * Empty payloads without allowEmpty are rejected by validateOpenArReplacePayload.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @param {Array<object>} rows
 */
export async function replaceOpenArSnapshot(supabase, organizationId, rows) {
  const nowIso = new Date().toISOString();
  const incomingIds = rows.map((r) => r.source_invoice_id);

  // Upsert accepted rows first so a mid-flight failure does not wipe A/R.
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200).map((r) => ({ ...r, synced_at: nowIso, updated_at: nowIso }));
    const { error } = await supabase.from("sales_quickbooks_open_ar_current").upsert(slice, {
      onConflict: "organization_id,source_invoice_id"
    });
    if (error) throw new Error(error.message);
  }

  // Remove invoices no longer open (paid / disappeared).
  const { data: existing, error: readErr } = await supabase
    .from("sales_quickbooks_open_ar_current")
    .select("source_invoice_id")
    .eq("organization_id", organizationId);
  if (readErr) throw new Error(readErr.message);

  const keep = new Set(incomingIds);
  const toDelete = (existing || [])
    .map((r) => r.source_invoice_id)
    .filter((id) => id && !keep.has(id));

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 200) {
    const slice = toDelete.slice(i, i + 200);
    const { error, count } = await supabase
      .from("sales_quickbooks_open_ar_current")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId)
      .in("source_invoice_id", slice);
    if (error) throw new Error(error.message);
    deleted += count ?? slice.length;
  }

  // Explicit empty replace (allowEmpty): wipe org snapshot.
  if (rows.length === 0) {
    const { error, count } = await supabase
      .from("sales_quickbooks_open_ar_current")
      .delete({ count: "exact" })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    deleted = count ?? deleted;
  }

  return { upserted: rows.length, deleted };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} value
 */
export async function completeSyncRun(supabase, value) {
  const { data, error } = await supabase
    .from("sales_quickbooks_sync_runs")
    .update({
      status: value.status,
      completed_at: new Date().toISOString(),
      company_name: value.companyName,
      coverage_start_date: value.coverageStartDate,
      coverage_end_date: value.coverageEndDate,
      estimates_count: value.estimatesCount,
      sales_orders_count: value.salesOrdersCount,
      invoices_count: value.invoicesCount,
      payments_count: value.paymentsCount,
      open_ar_count: value.openArCount,
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
