/**
 * POST /api/internal/sales/quickbooks-sync — Windows ODBC worker ingest.
 * Auth: Authorization: Bearer <QB_SALES_SYNC_INGEST_TOKEN>
 *
 * ListID enrichment: worker may send qb_customer_list_id (ODBC CustomerId).
 * qb_root_customer_list_id is resolved server-side from ad_qb_customer_facts
 * (exact ParentId walk). Never writes Account Directory identity / links.
 */

import express from "express";
import { requireQuickBooksSalesSyncToken } from "./syncAuth.js";
import {
  beginSyncRun,
  completeSyncRun,
  replaceOpenArSnapshot,
  upsertFinancialTransactions,
  validateBeginPayload,
  validateCompletePayload,
  validateOpenArReplacePayload,
  validateTransactionChunk
} from "./syncIngest.js";
import { enrichFinancialRowsWithRootListIds } from "./resolveQbRootCustomerListId.js";

const jsonParser = express.json({ limit: "2mb" });

/**
 * @param {import('express').Express} app
 * @param {{ getSupabase: () => import('@supabase/supabase-js').SupabaseClient }} deps
 */
export function attachQuickBooksSalesSyncRoutes(app, { getSupabase }) {
  app.post("/api/internal/sales/quickbooks-sync", jsonParser, async (req, res) => {
    try {
      if (!requireQuickBooksSalesSyncToken(req, res)) return;

      const action = String(req.body?.action ?? "").trim().toLowerCase();
      const supabase = getSupabase();

      if (action === "begin") {
        const parsed = validateBeginPayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const run = await beginSyncRun(supabase, parsed.value);
        return res.status(200).json({
          ok: true,
          action: "begin",
          sync_run_id: run.id,
          started_at: run.started_at,
          status: run.status
        });
      }

      if (action === "upsert_transactions") {
        const parsed = validateTransactionChunk(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const enriched = await enrichFinancialRowsWithRootListIds(
          supabase,
          parsed.value.organizationId,
          parsed.value.transactions
        );
        const result = await upsertFinancialTransactions(supabase, enriched.rows);
        return res.status(200).json({
          ok: true,
          action: "upsert_transactions",
          sync_run_id: parsed.value.syncRunId,
          upserted: result.upserted,
          received: enriched.rows.length,
          identity_coverage: enriched.coverage,
          unresolved_root_count: enriched.unresolvedCount,
          warnings: enriched.warnings
        });
      }

      if (action === "replace_open_ar") {
        const parsed = validateOpenArReplacePayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        // Tag open A/R rows for coverage by_type (not a transaction_type column).
        const tagged = parsed.value.openAr.map((r) => ({ ...r, transaction_type: "open_ar" }));
        const enriched = await enrichFinancialRowsWithRootListIds(
          supabase,
          parsed.value.organizationId,
          tagged
        );
        const rowsForStore = enriched.rows.map((r) => {
          const { transaction_type: _t, ...rest } = r;
          return rest;
        });
        const result = await replaceOpenArSnapshot(
          supabase,
          parsed.value.organizationId,
          rowsForStore
        );
        return res.status(200).json({
          ok: true,
          action: "replace_open_ar",
          sync_run_id: parsed.value.syncRunId,
          upserted: result.upserted,
          deleted: result.deleted,
          identity_coverage: enriched.coverage,
          unresolved_root_count: enriched.unresolvedCount,
          warnings: enriched.warnings
        });
      }

      if (action === "complete") {
        const parsed = validateCompletePayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const run = await completeSyncRun(supabase, parsed.value);
        return res.status(200).json({
          ok: true,
          action: "complete",
          sync_run_id: run.id,
          status: run.status,
          completed_at: run.completed_at
        });
      }

      return res.status(400).json({
        ok: false,
        error: "unknown_action",
        details: ["action must be begin|upsert_transactions|replace_open_ar|complete"]
      });
    } catch (err) {
      const message = String(err?.message ?? err);
      // Never echo secrets / connection strings.
      const safe =
        /password|token|secret|authorization|basic\s+/i.test(message)
          ? "ingest_failed"
          : message.slice(0, 300);
      return res.status(500).json({ ok: false, error: safe });
    }
  });
}
