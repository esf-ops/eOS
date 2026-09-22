/**
 * Brain Agent HTTP API — read-only gateway + agent run.
 * Auth: requireAuth + requireHeadAccess(slab_ai)
 *
 * Brain has no global JSON body parser — POST routes must attach express.json locally.
 */

import express from "express";
import {
  createGatewayContext,
  executeCapability,
  listPermittedCapabilities,
  ensureFoundationCapabilities,
} from "./gateway.mjs";
import { runBrainAgent } from "./agentRuntime.mjs";
import { validateAnswerAgainstEvidence } from "./answerValidation.mjs";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { logAction } from "../auth/auditLog.js";
import { getOllamaConfig } from "./ollamaProvider.mjs";

const HEAD = "slab_ai";

/** Same small-body convention as Account Directory / Sales / HR APIs. */
const jsonParser = express.json({ limit: "256kb" });

function jsonNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

/**
 * @param {import('express').Express} app
 */
export function attachBrainAgentRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  if (typeof requireAuth !== "function") throw new Error("attachBrainAgentRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") throw new Error("attachBrainAgentRoutes: requireHeadAccess required");
  if (typeof getSupabase !== "function") throw new Error("attachBrainAgentRoutes: getSupabase required");

  ensureFoundationCapabilities();

  const headAccess = requireHeadAccess(HEAD, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const db = () => getSupabase();

  async function orgId(req) {
    const ctx = await resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
    return ctx.organizationId || req.user?.organization_id || null;
  }

  app.get("/api/brain-agent/capabilities", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const caps = await listPermittedCapabilities({ db: db(), user: req.user });
      const ollama = getOllamaConfig();
      res.json({
        ok: true,
        mode: "read",
        capabilities: caps,
        providerHint: {
          aiProvider: String(process.env.AI_PROVIDER || "openai"),
          ollamaConfigured: Boolean(ollama.model),
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/brain-agent/execute", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const name = String(req.body?.capability || req.body?.name || "").trim();
      const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
      if (!name) return res.status(400).json({ ok: false, error: "capability is required" });

      const ctx = await createGatewayContext({
        db: db(),
        getSupabase,
        user: req.user,
        organizationId,
      });
      const result = await executeCapability({ name, input, ctx });

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "brain_agent_capability_execute",
        entityType: "brain_capability",
        entityId: name,
        metadata: {
          ok: Boolean(result.ok),
          mode: "read",
          evidence_count: (result.evidence || []).length,
        },
        req,
      });

      const status = result.ok ? 200 : result.status || 400;
      res.status(status).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/brain-agent/run", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const message = String(req.body?.message || "").trim();
      if (!message) return res.status(400).json({ ok: false, error: "message is required" });

      const context =
        req.body?.context && typeof req.body.context === "object" ? req.body.context : {};
      const debug =
        String(process.env.BRAIN_AGENT_DEBUG || "") === "1" ||
        (Boolean(req.body?.debug) &&
          ["admin", "super_admin", "executive"].includes(String(req.user?.role || "")));

      const gatewayCtx = await createGatewayContext({
        db: db(),
        getSupabase,
        user: req.user,
        organizationId,
      });

      const result = await runBrainAgent({
        message,
        context,
        gatewayCtx,
        debug,
      });

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "brain_agent_run",
        entityType: "brain_agent",
        entityId: null,
        metadata: {
          ok: Boolean(result.ok),
          answer_state: result.answerState,
          tool_calls: result.toolCalls,
          evidence_count: (result.evidence || []).length,
          mode: "read",
        },
        req,
      });

      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/brain-agent/validate-answer", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const validation = validateAnswerAgainstEvidence({
        answerText: req.body?.answerText || "",
        citedEvidenceIds: req.body?.citedEvidenceIds || [],
        evidenceBag: req.body?.evidenceBag || [],
        authoritativeNumbers: req.body?.authoritativeNumbers || [],
        requiresAuthoritative: req.body?.requiresAuthoritative !== false,
      });
      res.status(validation.ok ? 200 : 422).json({ ok: validation.ok, validation });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
