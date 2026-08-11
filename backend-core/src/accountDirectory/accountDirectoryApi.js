/**
 * Account Directory Head API — standalone account identity (no Estimate Studio wiring).
 *
 * Routes under /api/account-directory/*
 * Auth: requireAuth + requireHeadAccess("account_directory") + capability checks in service.
 *
 * Mutating routes use express.json() — Brain has no global JSON body parser.
 */

import express from "express";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { logAction } from "../auth/auditLog.js";
import {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  ACCOUNT_DIRECTORY_HEAD_SLUG,
  permissionsForRole,
  roleHasCapability
} from "./accountDirectoryAuth.mjs";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectorySupabaseStore } from "./accountDirectorySupabaseStore.mjs";
import { AccountDirectoryError, createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { normalizeAccountWritePayload } from "./accountDirectoryPayload.mjs";
import {
  dismissSuggestion,
  getAdQbCustomerEnrichmentFeedStatus,
  listAdQbLinkSuggestions
} from "./qbCustomerEnrichment/feedStatus.js";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";

const jsonParser = express.json({ limit: "256kb" });

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

function requestId(req) {
  return (
    String(req?.headers?.["x-vercel-id"] ?? "").trim() ||
    String(req?.headers?.["x-request-id"] ?? "").trim() ||
    null
  );
}

function actorRole(req) {
  return req?.user?.role ?? req?.eosProfile?.role ?? req?.profile?.role ?? null;
}

function actorUserId(req) {
  return req?.user?.id ? String(req.user.id) : null;
}

/**
 * @param {{
 *   store?: any,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   _memoryStore?: any,
 *   _supabaseStore?: any
 * }} deps
 */
export function resolveAccountDirectoryStore(deps) {
  if (deps.store) return deps.store;
  const mode = String(process.env.ACCOUNT_DIRECTORY_STORE ?? "memory").trim().toLowerCase();
  if (mode === "supabase") {
    if (!deps._supabaseStore) {
      deps._supabaseStore = createAccountDirectorySupabaseStore(deps.getSupabase);
    }
    return deps._supabaseStore;
  }
  if (!deps._memoryStore) {
    deps._memoryStore = createAccountDirectoryMemoryStore();
  }
  return deps._memoryStore;
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   store?: any
 * }} deps
 */
export function attachAccountDirectoryRoutes(app, deps) {
  const { requireAuth, requireHeadAccess, getSupabase } = deps;
  if (typeof requireAuth !== "function") throw new Error("attachAccountDirectoryRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") {
    throw new Error("attachAccountDirectoryRoutes: requireHeadAccess required");
  }
  if (typeof getSupabase !== "function") throw new Error("attachAccountDirectoryRoutes: getSupabase required");

  const headAccess = requireHeadAccess(ACCOUNT_DIRECTORY_HEAD_SLUG, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const writeGuard = [...guard, jsonParser];
  const store = resolveAccountDirectoryStore(deps);
  const service = createAccountDirectoryService({
    store,
    logAction,
    getSupabase
  });

  async function orgId(req) {
    try {
      const ctx = await resolveOrganizationContext({ req, supabase: getSupabase(), mode: "authenticated" });
      return ctx.organizationId || null;
    } catch {
      return null;
    }
  }

  async function withOrg(req, res, fn) {
    jsonNoStore(res);
    const organizationId = await orgId(req);
    if (!organizationId) {
      return res.status(400).json({ ok: false, error: "Organization context is required." });
    }
    try {
      const result = await fn({
        organizationId,
        role: actorRole(req),
        actorUserId: actorUserId(req),
        requestId: requestId(req)
      });
      return result;
    } catch (e) {
      if (e instanceof AccountDirectoryError) {
        return res.status(e.status).json({
          ok: false,
          error: e.message,
          code: e.code,
          ...(e.extra && e.extra.detail ? {} : e.extra || {})
        });
      }
      console.error("[account-directory]", e?.message || e);
      return res.status(500).json({ ok: false, error: "Account Directory request failed." });
    }
  }

  app.get("/api/account-directory/permissions", ...guard, async (req, res) => {
    jsonNoStore(res);
    const permissions = permissionsForRole(actorRole(req));
    res.json({ ok: true, permissions });
  });

  app.get("/api/account-directory/summary", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const summary = await service.getSummary(ctx);
      res.json({ ok: true, summary });
    });
  });

  app.get("/api/account-directory/accounts", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const data = await service.listAccounts({
        ...ctx,
        tab: req.query?.tab,
        status: req.query?.status,
        search: req.query?.search ?? req.query?.q,
        page: req.query?.page,
        pageSize: req.query?.pageSize ?? req.query?.limit,
        sort: req.query?.sort,
        linked: req.query?.linked,
        missingContact: req.query?.missingContact,
        missingLocation: req.query?.missingLocation
      });
      res.json({ ok: true, ...data });
    });
  });

  app.get("/api/account-directory/accounts/:accountId", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.getAccount({
        ...ctx,
        accountId: String(req.params.accountId)
      });
      res.json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/accounts", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const normalized = normalizeAccountWritePayload(req.body, { requireDisplayName: true });
      if (!normalized.ok) {
        return res.status(400).json({ ok: false, error: normalized.error, code: normalized.code });
      }
      const account = await service.createAccount({
        ...ctx,
        payload: normalized.payload,
        asProspect: false
      });
      res.status(201).json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/prospects", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const normalized = normalizeAccountWritePayload(req.body, { requireDisplayName: true });
      if (!normalized.ok) {
        return res.status(400).json({ ok: false, error: normalized.error, code: normalized.code });
      }
      const account = await service.createAccount({
        ...ctx,
        payload: normalized.payload,
        asProspect: true
      });
      res.status(201).json({ ok: true, account });
    });
  });

  app.patch("/api/account-directory/accounts/:accountId", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const normalized = normalizeAccountWritePayload(req.body, { requireDisplayName: false });
      if (!normalized.ok) {
        return res.status(400).json({ ok: false, error: normalized.error, code: normalized.code });
      }
      // If client sent blank displayName explicitly, reject
      if (
        req.body &&
        (Object.prototype.hasOwnProperty.call(req.body, "displayName") ||
          Object.prototype.hasOwnProperty.call(req.body, "name")) &&
        !normalized.payload.displayName
      ) {
        return res.status(400).json({
          ok: false,
          error: "Account name is required.",
          code: "display_name_required"
        });
      }
      const account = await service.updateAccount({
        ...ctx,
        accountId: String(req.params.accountId),
        payload: normalized.payload
      });
      res.json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/accounts/:accountId/archive", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.archiveAccount({
        ...ctx,
        accountId: String(req.params.accountId),
        rowVersion: req.body?.rowVersion
      });
      res.json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/accounts/:accountId/restore", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.restoreAccount({
        ...ctx,
        accountId: String(req.params.accountId),
        rowVersion: req.body?.rowVersion
      });
      res.json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/accounts/:accountId/contacts", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.addContact({
        ...ctx,
        accountId: String(req.params.accountId),
        payload: req.body || {}
      });
      res.status(201).json({ ok: true, account });
    });
  });

  app.patch("/api/account-directory/accounts/:accountId/contacts/:contactId", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.updateContact({
        ...ctx,
        accountId: String(req.params.accountId),
        contactId: String(req.params.contactId),
        payload: req.body || {}
      });
      res.json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/accounts/:accountId/locations", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.addLocation({
        ...ctx,
        accountId: String(req.params.accountId),
        payload: req.body || {}
      });
      res.status(201).json({ ok: true, account });
    });
  });

  app.patch("/api/account-directory/accounts/:accountId/locations/:locationId", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.updateLocation({
        ...ctx,
        accountId: String(req.params.accountId),
        locationId: String(req.params.locationId),
        payload: req.body || {}
      });
      res.json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/accounts/:accountId/aliases", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.addAlias({
        ...ctx,
        accountId: String(req.params.accountId),
        payload: req.body || {}
      });
      res.status(201).json({ ok: true, account });
    });
  });

  app.patch("/api/account-directory/accounts/:accountId/aliases/:aliasId", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.updateAlias({
        ...ctx,
        accountId: String(req.params.accountId),
        aliasId: String(req.params.aliasId),
        payload: req.body || {}
      });
      res.json({ ok: true, account });
    });
  });

  app.post("/api/account-directory/accounts/:accountId/link-quickbooks", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.linkQuickBooks({
        ...ctx,
        accountId: String(req.params.accountId),
        payload: req.body || {}
      });
      res.status(201).json({ ok: true, account });
    });
  });

  app.get("/api/account-directory/qb-enrichment/status", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      if (!roleHasCapability(ctx.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
        return res.status(403).json({ ok: false, error: "Permission denied." });
      }
      const feed = await getAdQbCustomerEnrichmentFeedStatus(getSupabase(), ctx.organizationId);
      res.json({ ok: true, feed });
    });
  });

  app.get("/api/account-directory/qb-enrichment/suggestions", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      if (!roleHasCapability(ctx.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW)) {
        return res.status(403).json({ ok: false, error: "Permission denied." });
      }
      const listed = await listAdQbLinkSuggestions(getSupabase(), ctx.organizationId, {
        limit: req.query?.limit
      });
      res.json({
        ok: true,
        unavailable: Boolean(listed.unavailable),
        items: listed.items || []
      });
    });
  });

  app.post(
    "/api/account-directory/qb-enrichment/suggestions/:suggestionId/dismiss",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        if (!roleHasCapability(ctx.role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK)) {
          return res.status(403).json({ ok: false, error: "Permission denied." });
        }
        const row = await dismissSuggestion(getSupabase(), {
          organizationId: ctx.organizationId,
          suggestionId: String(req.params.suggestionId),
          actorUserId: ctx.actorUserId
        });
        if (!row) {
          return res.status(404).json({ ok: false, error: "Suggestion not found." });
        }
        res.json({ ok: true, suggestion: row });
      });
    }
  );

  /**
   * Explicit secondary action: create AD account/prospect from suggestion, then link via
   * the existing linkQuickBooks authority. Never called by sync.
   */
  app.post(
    "/api/account-directory/qb-enrichment/suggestions/:suggestionId/create-and-link",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        if (!roleHasCapability(ctx.role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK)) {
          return res.status(403).json({ ok: false, error: "Permission denied." });
        }
        if (!roleHasCapability(ctx.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT)) {
          return res.status(403).json({ ok: false, error: "Permission denied." });
        }
        const supabase = getSupabase();
        const { data: suggestion, error } = await supabase
          .from("ad_qb_link_suggestions")
          .select("id,qb_list_id,qb_full_name,qb_name,status")
          .eq("organization_id", ctx.organizationId)
          .eq("id", String(req.params.suggestionId))
          .maybeSingle();
        if (error || !suggestion) {
          return res.status(404).json({ ok: false, error: "Suggestion not found." });
        }
        if (!["open", "needs_review", "conflict"].includes(String(suggestion.status))) {
          return res.status(409).json({ ok: false, error: "Suggestion is not open for linking." });
        }
        // Jobs must never become AD links — suggestions are roots only, but double-check facts.
        const { data: fact } = await supabase
          .from("ad_qb_customer_facts")
          .select("is_job,qb_list_id")
          .eq("organization_id", ctx.organizationId)
          .eq("qb_list_id", suggestion.qb_list_id)
          .maybeSingle();
        if (fact?.is_job) {
          return res.status(400).json({
            ok: false,
            code: "job_list_id_forbidden",
            error: "Child/job ListIDs cannot become Account Directory QuickBooks links."
          });
        }
        const asProspect = Boolean(req.body?.asProspect);
        const displayName = String(
          req.body?.displayName || suggestion.qb_full_name || suggestion.qb_name || ""
        ).trim();
        if (!displayName) {
          return res.status(400).json({ ok: false, error: "displayName is required." });
        }
        const created = await service.createAccount({
          ...ctx,
          payload: {
            displayName,
            legalName: req.body?.legalName || null,
            source: "qb_customer_enrichment_suggestion"
          },
          asProspect
        });
        const linked = await service.linkQuickBooks({
          ...ctx,
          accountId: created.id,
          payload: {
            externalId: suggestion.qb_list_id,
            externalDisplayName: suggestion.qb_full_name || suggestion.qb_name || null,
            externalSystem: ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM
          }
        });
        res.status(201).json({ ok: true, account: linked, createdFromSuggestion: true });
      });
    }
  );

  app.post(
    "/api/account-directory/accounts/:accountId/external-links/:linkId/deactivate",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        const account = await service.deactivateExternalLink({
          ...ctx,
          accountId: String(req.params.accountId),
          linkId: String(req.params.linkId)
        });
        res.json({ ok: true, account });
      });
    }
  );

  app.delete("/api/account-directory/accounts/:accountId", ...guard, async (req, res) => {
    jsonNoStore(res);
    res.status(405).json({
      ok: false,
      code: "hard_delete_unavailable",
      error: "Hard delete is not available. Archive the account instead."
    });
  });
}

export { ACCOUNT_DIRECTORY_HEAD_SLUG };
