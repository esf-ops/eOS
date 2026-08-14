/**
 * POST /api/internal/finance/quickbooks-sync
 * Auth: Authorization: Bearer <QB_FINANCE_SYNC_INGEST_TOKEN>
 *
 * Isolated from Sales ingest. SELECT-only workers. No QuickBooks writes.
 */

import express from "express";
import { requireQuickBooksFinanceSyncToken } from "./syncAuth.js";
import { shouldSkipCheckpoint } from "./checkpoints.js";
import {
  validateBeginPayload,
  validateCheckpointPayload,
  validateUpsertPayload,
  validateOpenApReplacePayload,
  validateUndepositedReplacePayload,
  validateReportSnapshotPayload,
  validateReconciliationPayload,
  validateCompletePayload
} from "./ingestValidate.js";
import {
  beginSyncRun,
  upsertDatasetRows,
  upsertCheckpoint,
  getCheckpoint,
  replaceOpenApSnapshot,
  replaceUndepositedSnapshot,
  insertReportSnapshot,
  insertReconciliation,
  completeSyncRun
} from "./ingestStore.js";

const jsonParser = express.json({ limit: "2mb" });

export function attachQuickBooksFinanceSyncRoutes(app, { getSupabase }) {
  app.post("/api/internal/finance/quickbooks-sync", jsonParser, async (req, res) => {
    try {
      if (!requireQuickBooksFinanceSyncToken(req, res)) return;
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
          status: run.status,
          domain: run.domain
        });
      }

      if (action === "checkpoint") {
        const parsed = validateCheckpointPayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const existing = await getCheckpoint(supabase, parsed.value);
        const force = Boolean(req.body?.force);
        if (parsed.value.status === "running" && shouldSkipCheckpoint(existing, { force })) {
          return res.status(200).json({
            ok: true,
            action: "checkpoint",
            skipped: true,
            reason: "already_success",
            checkpoint: existing
          });
        }
        const row = await upsertCheckpoint(supabase, parsed.value);
        return res.status(200).json({ ok: true, action: "checkpoint", skipped: false, checkpoint: row });
      }

      if (action === "upsert") {
        const parsed = validateUpsertPayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const result = await upsertDatasetRows(supabase, parsed.value.dataset, parsed.value.rows);
        return res.status(200).json({
          ok: true,
          action: "upsert",
          dataset: parsed.value.dataset,
          sync_run_id: parsed.value.syncRunId,
          upserted: result.upserted,
          received: parsed.value.rows.length
        });
      }

      if (action === "replace_open_ap") {
        const parsed = validateOpenApReplacePayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const result = await replaceOpenApSnapshot(
          supabase,
          parsed.value.organizationId,
          parsed.value.openAp
        );
        return res.status(200).json({
          ok: true,
          action: "replace_open_ap",
          sync_run_id: parsed.value.syncRunId,
          upserted: result.upserted,
          deleted: result.deleted
        });
      }

      if (action === "replace_undeposited") {
        const parsed = validateUndepositedReplacePayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const result = await replaceUndepositedSnapshot(
          supabase,
          parsed.value.organizationId,
          parsed.value.rows
        );
        return res.status(200).json({
          ok: true,
          action: "replace_undeposited",
          sync_run_id: parsed.value.syncRunId,
          upserted: result.upserted,
          deleted: result.deleted
        });
      }

      if (action === "upsert_report_snapshot") {
        const parsed = validateReportSnapshotPayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const result = await insertReportSnapshot(supabase, parsed.value);
        return res.status(200).json({
          ok: true,
          action: "upsert_report_snapshot",
          sync_run_id: parsed.value.syncRunId,
          ...result
        });
      }

      if (action === "upsert_reconciliation") {
        const parsed = validateReconciliationPayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const row = await insertReconciliation(supabase, parsed.value);
        return res.status(200).json({ ok: true, action: "upsert_reconciliation", result: row });
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

      return res.status(400).json({ ok: false, error: "unknown_action" });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "finance_sync_failed",
        message: String(err?.message || err)
      });
    }
  });
}
