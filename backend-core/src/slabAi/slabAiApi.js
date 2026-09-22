/**
 * slabOS AI Studio Brain API
 *
 * Auth: requireAuth() + requireHeadAccess("slab_ai")
 * Owns: context, generation history, feedback, knowledge search, AI-safe quote read adapters.
 * Does NOT own: pricing math, quote mutation, Moraware/QB writes.
 */

import { searchApprovedKnowledge } from "./knowledge/knowledgeRetrieval.mjs";
import { ensureSentinelKnowledge } from "./knowledge/knowledgeSentinel.mjs";
import { canAdministerKnowledge } from "./knowledge/knowledgeConstants.mjs";
import {
  insertGeneration,
  updateGeneration,
  listGenerations,
  getGeneration,
  upsertFeedback
} from "./slabAiPersistence.js";
import { searchQuotesForAi, retrieveQuoteForAi, isUuid } from "./slabAiQuoteActions.js";
import { searchAccountsForAi, retrieveAccountForAi } from "./slabAiAccountActions.mjs";
import { listAccountJobsForAi } from "./slabAiJobActions.mjs";
import { searchMaterialsForAi } from "./slabAiInventoryActions.mjs";
import { logAction } from "../auth/auditLog.js";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";

const HEAD = "slab_ai";

function jsonNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

function pickStr(v) {
  return String(v ?? "").trim();
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient
 * }} deps
 */
export function attachSlabAiRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  if (typeof requireAuth !== "function") throw new Error("attachSlabAiRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") throw new Error("attachSlabAiRoutes: requireHeadAccess required");
  if (typeof getSupabase !== "function") throw new Error("attachSlabAiRoutes: getSupabase required");

  const headAccess = requireHeadAccess(HEAD, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const db = () => getSupabase();

  async function orgId(req) {
    const ctx = await resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
    return ctx.organizationId || req.user?.organization_id || null;
  }

  app.get("/api/slab-ai/context", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      res.json({
        ok: true,
        userId: req.user.id,
        organizationId: organizationId || null,
        role: req.user.role || "viewer",
        displayName: req.user.fullName || req.user.full_name || null,
        head: HEAD,
        canAdministerKnowledge: canAdministerKnowledge(req.user)
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/generations", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const result = await listGenerations(db(), {
        organizationId,
        userId: req.user.id,
        limit: req.query.limit
      });
      if (result.installed === false) {
        return res.status(503).json({
          ok: false,
          installed: false,
          error: "Apply eliteos_slab_ai_v1.sql to enable durable history."
        });
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/generations/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const result = await getGeneration(db(), {
        organizationId,
        userId: req.user.id,
        id
      });
      if (result.installed === false) {
        return res.status(503).json({ ok: false, installed: false });
      }
      if (!result.ok) return res.status(result.status || 404).json(result);
      const g = result.generation;
      res.json({
        ok: true,
        generation: {
          id: g.id,
          toolId: g.tool_id,
          promptVersion: g.prompt_version,
          provider: g.provider,
          model: g.model,
          modelClass: g.model_class,
          status: g.status,
          title: g.title,
          inputSnapshot: g.input_snapshot,
          outputContent: g.output_content,
          warnings: g.warnings || [],
          assumptions: g.assumptions || [],
          sources: g.source_metadata || [],
          usageMetadata: g.usage_metadata || {},
          startedAt: g.started_at,
          completedAt: g.completed_at,
          latencyMs: g.latency_ms,
          createdAt: g.created_at
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/slab-ai/generations", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const body = req.body || {};
      const toolId = pickStr(body.toolId);
      if (!toolId) return res.status(400).json({ ok: false, error: "toolId required" });

      // Data minimization: store form snapshot only (no system prompts / secrets)
      const inputSnapshot =
        body.inputSnapshot && typeof body.inputSnapshot === "object" ? body.inputSnapshot : {};

      const clientId = pickStr(body.id || body.clientGenerationId);
      const row = {
        organization_id: organizationId,
        user_id: req.user.id,
        tool_id: toolId,
        prompt_version: pickStr(body.promptVersion) || "0.0.0",
        provider: pickStr(body.provider) || null,
        model: pickStr(body.model) || null,
        model_class: pickStr(body.modelClass) || null,
        status: "started",
        title: pickStr(body.title).slice(0, 160) || `${toolId} generation`,
        input_snapshot: inputSnapshot,
        retrieval_count: Number(body.retrievalCount) || 0,
        action_count: Number(body.actionCount) || 0
      };
      if (clientId && isUuid(clientId)) row.id = clientId;

      const result = await insertGeneration(db(), row);

      if (result.installed === false) {
        return res.status(503).json({
          ok: false,
          installed: false,
          error: "Apply eliteos_slab_ai_v1.sql to enable durable history."
        });
      }
      if (!result.ok) return res.status(500).json(result);

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_generation_started",
        entityType: "slab_ai_generation",
        entityId: result.id,
        metadata: { tool_id: toolId },
        req
      });

      res.status(201).json({ ok: true, id: result.id });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/slab-ai/generations/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });

      const body = req.body || {};
      const patch = {};
      if (body.status) patch.status = pickStr(body.status);
      if (body.outputContent != null) patch.output_content = String(body.outputContent).slice(0, 200000);
      if (body.warnings) patch.warnings = body.warnings;
      if (body.assumptions) patch.assumptions = body.assumptions;
      if (body.sourceMetadata) patch.source_metadata = body.sourceMetadata;
      if (body.usageMetadata) patch.usage_metadata = body.usageMetadata;
      if (body.latencyMs != null) patch.latency_ms = Number(body.latencyMs) || null;
      if (body.retrievalCount != null) patch.retrieval_count = Number(body.retrievalCount) || 0;
      if (body.actionCount != null) patch.action_count = Number(body.actionCount) || 0;
      if (body.errorCode) patch.error_code = pickStr(body.errorCode).slice(0, 80);
      if (body.title) patch.title = pickStr(body.title).slice(0, 160);
      if (["completed", "failed", "aborted"].includes(patch.status)) {
        patch.completed_at = new Date().toISOString();
      }

      const result = await updateGeneration(db(), { id, organizationId, patch });
      if (result.installed === false) {
        return res.status(503).json({ ok: false, installed: false });
      }
      if (!result.ok) return res.status(result.status || 500).json(result);

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_generation_updated",
        entityType: "slab_ai_generation",
        entityId: id,
        metadata: { status: patch.status || null },
        req
      });

      res.json({ ok: true, id });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/slab-ai/generations/:id/feedback", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const id = pickStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const rating = pickStr(req.body?.rating || req.body?.feedback);
      if (rating !== "up" && rating !== "down") {
        return res.status(400).json({ ok: false, error: "rating must be up or down" });
      }
      const result = await upsertFeedback(db(), {
        generationId: id,
        organizationId,
        userId: req.user.id,
        rating,
        comment: req.body?.comment || req.body?.note
      });
      if (result.installed === false) {
        return res.status(503).json({ ok: false, installed: false });
      }
      if (!result.ok) return res.status(result.status || 400).json(result);

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_feedback",
        entityType: "slab_ai_generation",
        entityId: id,
        metadata: { rating },
        req
      });

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/knowledge/search", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const query = pickStr(req.query.q || req.query.query);
      const sourceTypes = pickStr(req.query.sourceTypes || req.query.source_types)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (pickStr(req.query.seed_sentinel) === "1") {
        await ensureSentinelKnowledge(db(), organizationId);
      }

      const result = await searchApprovedKnowledge({
        db: db(),
        organizationId,
        query,
        sourceTypes: sourceTypes.length ? sourceTypes : undefined,
        manufacturer: pickStr(req.query.manufacturer) || undefined,
        machineModel: pickStr(req.query.machineModel || req.query.machine_model) || undefined,
        material: pickStr(req.query.material) || undefined,
        limit: req.query.limit,
        mode: pickStr(req.query.mode) || "hybrid",
        debug: pickStr(req.query.debug) === "1"
      });

      if (result.installed === false) {
        return res.status(503).json({
          ok: false,
          installed: false,
          error: "Apply eliteos_slab_ai_v1.sql to enable knowledge retrieval.",
          passages: []
        });
      }

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_search",
        entityType: "slab_ai_knowledge",
        entityId: null,
        metadata: {
          query_len: query.length,
          result_count: (result.passages || []).length,
          source_types: sourceTypes
        },
        req
      });

      res.json({
        ok: true,
        passages: result.passages,
        documents: result.documents || []
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/quotes/search", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const started = Date.now();
      const result = await searchQuotesForAi({
        db: db(),
        organizationId,
        query: pickStr(req.query.q || req.query.query),
        limit: req.query.limit,
        accountId: pickStr(req.query.accountId) || null,
      });
      if (!result.ok) {
        return res.status(result.status || 500).json(result);
      }

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_search_quotes",
        entityType: "quote_header",
        entityId: null,
        metadata: {
          result_count: result.returned ?? result.rows?.length ?? 0,
          truncated: Boolean(result.truncated),
          latency_ms: Date.now() - started,
          mode: "read",
          domain: "quote"
        },
        req
      });

      res.json({
        ok: true,
        rows: result.rows || result.items || [],
        items: result.items || result.rows || [],
        total: result.totalMatches ?? result.returned ?? 0,
        totalMatches: result.totalMatches ?? 0,
        returned: result.returned ?? 0,
        truncated: Boolean(result.truncated),
        ambiguous: Boolean(result.ambiguous),
        queryTooShort: Boolean(result.queryTooShort),
        retrievedAt: result.retrievedAt || null,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/quotes/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }
      const started = Date.now();
      const result = await retrieveQuoteForAi({
        db: db(),
        organizationId,
        quoteId: pickStr(req.params.id)
      });
      if (!result.ok) {
        return res.status(result.status || 500).json(result);
      }

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_retrieve_quote",
        entityType: "quote_header",
        entityId: result.quote.quoteId,
        entityLabel: result.quote.quoteNumber,
        metadata: { latency_ms: Date.now() - started, mode: "read", domain: "quote" },
        req
      });

      res.json({ ok: true, quote: result.quote });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // --- Phase 5 operational context (read-only, cross-head gated) ---

  app.get("/api/slab-ai/accounts/search", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const started = Date.now();
      const result = await searchAccountsForAi({
        db: db(),
        getSupabase,
        user: req.user,
        organizationId,
        query: pickStr(req.query.q || req.query.query),
        limit: req.query.limit,
      });
      if (!result.ok) return res.status(result.status || 500).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_search_accounts",
        entityType: "account_directory_account",
        entityId: null,
        metadata: {
          result_count: result.returned,
          truncated: result.truncated,
          ambiguous: result.ambiguous,
          latency_ms: Date.now() - started,
          mode: "read",
          domain: "account",
        },
        req,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/accounts/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const started = Date.now();
      const result = await retrieveAccountForAi({
        db: db(),
        getSupabase,
        user: req.user,
        organizationId,
        accountId: pickStr(req.params.id),
      });
      if (!result.ok) return res.status(result.status || 500).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_retrieve_account",
        entityType: "account_directory_account",
        entityId: result.account?.accountId,
        entityLabel: result.account?.accountName,
        metadata: { latency_ms: Date.now() - started, mode: "read", domain: "account" },
        req,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/accounts/:id/jobs", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await listAccountJobsForAi({
        db: db(),
        getSupabase,
        user: req.user,
        organizationId,
        accountId: pickStr(req.params.id),
        limit: req.query.limit,
      });
      if (!result.ok) return res.status(result.status || 500).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_list_account_jobs",
        entityType: "account_directory_account",
        entityId: pickStr(req.params.id),
        metadata: { result_count: result.returned, mode: "read", domain: "job" },
        req,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/materials/search", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await searchMaterialsForAi({
        db: db(),
        user: req.user,
        organizationId,
        query: pickStr(req.query.q || req.query.query),
        limit: req.query.limit,
      });
      if (!result.ok) return res.status(result.status || 500).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_search_materials",
        entityType: "slab_inventory",
        entityId: null,
        metadata: { result_count: result.returned, truncated: result.truncated, mode: "read", domain: "inventory" },
        req,
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/actions/catalog", ...guard, async (req, res) => {
    jsonNoStore(res);
    const { userMayAccessHead } = await import("./slabAiPermissionIntersection.mjs");
    const domains = [
      { action: "searchQuotes", domain: "quote", requiredHead: null, mode: "read" },
      { action: "retrieveQuote", domain: "quote", requiredHead: null, mode: "read" },
      { action: "searchAccounts", domain: "account", requiredHead: "account_directory", mode: "read" },
      { action: "retrieveAccount", domain: "account", requiredHead: "account_directory", mode: "read" },
      { action: "listAccountJobs", domain: "job", requiredHead: "account_directory", mode: "read" },
      { action: "retrieveJob", domain: "job", requiredHead: "account_directory", mode: "read" },
      { action: "searchJobs", domain: "job", requiredHead: null, mode: "read", available: false },
      { action: "searchMaterials", domain: "inventory", requiredHead: "slab_inventory", mode: "read" },
      { action: "retrieveMaterialInventory", domain: "inventory", requiredHead: "slab_inventory", mode: "read" },
      { action: "retrieveAccountFinancialSummary", domain: "finance", requiredHead: "finance", mode: "read", available: false },
    ];
    const catalog = [];
    for (const d of domains) {
      let allowed = d.available === false ? false : true;
      if (d.requiredHead && allowed) {
        const check = await userMayAccessHead({ db: db(), user: req.user, headSlug: d.requiredHead });
        allowed = check.allowed;
      }
      catalog.push({ ...d, allowed, available: d.available !== false });
    }
    res.json({ ok: true, actions: catalog, note: "All Phase 5 actions are read-only. Finance company-head actions are not exposed." });
  });

  console.log("[slab-ai] mounted /api/slab-ai/*");
}
