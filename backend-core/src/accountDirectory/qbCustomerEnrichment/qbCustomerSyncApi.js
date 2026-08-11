/**
 * POST /api/internal/account-directory/quickbooks-customer-sync
 * Auth: Authorization: Bearer <QB_AD_CUSTOMER_SYNC_INGEST_TOKEN>
 */

import express from "express";
import { requireAdQbCustomerSyncToken } from "./syncAuth.js";
import {
  beginSyncRun,
  completeSyncRun,
  upsertCustomerFacts,
  validateBeginPayload,
  validateCompletePayload,
  validateCustomerChunk
} from "./syncIngest.js";

const jsonParser = express.json({ limit: "2mb" });

/**
 * @param {import('express').Express} app
 * @param {{
 *   getSupabase: () => import('@supabase/supabase-js').SupabaseClient,
 *   resolveAccountDirectoryStore?: () => any
 * }} deps
 */
export function attachAdQbCustomerSyncRoutes(app, { getSupabase, resolveAccountDirectoryStore }) {
  app.post("/api/internal/account-directory/quickbooks-customer-sync", jsonParser, async (req, res) => {
    try {
      if (!requireAdQbCustomerSyncToken(req, res)) return;

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

      if (action === "upsert_customers") {
        const parsed = validateCustomerChunk(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        // Guardrail: reject any payload that tries to smuggle AD identity writes.
        if (req.body?.accounts || req.body?.external_links || req.body?.link_quickbooks) {
          return res.status(400).json({
            ok: false,
            error: "identity_writes_forbidden",
            details: ["ingest may only upsert prepared customer facts"]
          });
        }
        const result = await upsertCustomerFacts(supabase, parsed.value.customers);
        return res.status(200).json({
          ok: true,
          action: "upsert_customers",
          sync_run_id: parsed.value.syncRunId,
          upserted: result.upserted,
          received: parsed.value.customers.length
        });
      }

      if (action === "complete") {
        const parsed = validateCompletePayload(req.body);
        if (!parsed.ok) {
          return res.status(400).json({ ok: false, error: "invalid_payload", details: parsed.errors });
        }
        const store = typeof resolveAccountDirectoryStore === "function" ? resolveAccountDirectoryStore() : null;
        const { run, reconcile } = await completeSyncRun(supabase, parsed.value, {
          accountDirectoryStore: store
        });
        return res.status(200).json({
          ok: true,
          action: "complete",
          sync_run_id: run.id,
          status: run.status,
          completed_at: run.completed_at,
          suggestions_open_count: run.suggestions_open_count ?? null,
          reconcile: reconcile
            ? {
                ok: reconcile.ok,
                open_count: reconcile.openCount,
                stats: reconcile.stats ?? null
              }
            : null
        });
      }

      return res.status(400).json({
        ok: false,
        error: "unknown_action",
        details: ["action must be begin|upsert_customers|complete"]
      });
    } catch (err) {
      const message = String(err?.message ?? err);
      const safe =
        /password|token|secret|authorization|basic\s+/i.test(message)
          ? "ingest_failed"
          : message.slice(0, 300);
      return res.status(500).json({ ok: false, error: safe });
    }
  });
}
