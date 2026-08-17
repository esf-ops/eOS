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
import { getAccountDirectoryFinancials } from "./accountDirectoryFinancialIntelligence.mjs";
import {
  getAccountDirectoryHistoryTransactions,
  getAccountDirectoryOpenInvoices,
  getAccountDirectoryRelationship,
  getAccountDirectoryTimeline,
  getAccountDirectoryTrend
} from "./accountDirectory360.mjs";
import {
  getAccountDirectoryInsightEvidence,
  getAccountDirectoryInsights
} from "./accountDirectoryInsights.mjs";
import {
  listStatusReviewQueue,
  decideStatusReview
} from "./accountDirectoryStatusReview.mjs";
import {
  archiveAccountNote,
  createAccountNote,
  listAccountNotes,
  updateAccountNote
} from "./accountDirectoryNotes.mjs";
import {
  archiveAccountFollowUp,
  completeAccountFollowUp,
  createAccountFollowUp,
  listAccountFollowUps,
  listAssignableStaff,
  reopenAccountFollowUp,
  updateAccountFollowUp
} from "./accountDirectoryFollowUps.mjs";
import { listMorawareReconciliationQueue } from "./accountDirectoryMorawareReconciliation.mjs";
import {
  dismissSuggestion,
  getAdQbCustomerEnrichmentFeedStatus,
  listAdQbLinkSuggestions
} from "./qbCustomerEnrichment/feedStatus.js";

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

function actorDisplayName(req) {
  return String(req?.user?.fullName || req?.user?.full_name || "").trim() || null;
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
        actorDisplayName: actorDisplayName(req),
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

  app.get("/api/account-directory/quickbooks-customers/search", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const data = await service.searchQuickBooksCustomers({
        ...ctx,
        query: req.query?.q ?? req.query?.query ?? ""
      });
      const json = JSON.stringify(data);
      if (/raw_payload|rawPayload|raw_hash|bill_city|bill_state/i.test(json)) {
        return res.status(500).json({ ok: false, error: "Unsafe QuickBooks payload blocked." });
      }
      res.json(data);
    });
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
        missingLocation: req.query?.missingLocation,
        qbEnrichment: req.query?.qbEnrichment,
        intelligence: req.query?.intelligence
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

  // Read-only QuickBooks Financial Intelligence (Slice A). Exact quickbooks_desktop
  // external_id → qb_root_customer_list_id. Never joins by name.
  app.get("/api/account-directory/accounts/:accountId/financials", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const financials = await getAccountDirectoryFinancials({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        env: process.env,
        now: new Date()
      });
      res.json({ ok: true, financials });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/financials/trend", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const trend = await getAccountDirectoryTrend({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        env: process.env,
        now: new Date(),
        period: req.query?.period
      });
      res.json({ ok: true, trend });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/financials/transactions", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const transactions = await getAccountDirectoryHistoryTransactions({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        page: req.query?.page,
        limit: req.query?.limit ?? req.query?.pageSize,
        type: req.query?.type
      });
      res.json({ ok: true, ...transactions });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/financials/invoices", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const invoices = await getAccountDirectoryOpenInvoices({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        page: req.query?.page,
        limit: req.query?.limit ?? req.query?.pageSize
      });
      res.json({ ok: true, ...invoices });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/relationship", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const relationship = await getAccountDirectoryRelationship({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        env: process.env,
        now: new Date()
      });
      const json = JSON.stringify(relationship);
      if (/raw_payload|rawPayload/i.test(json)) {
        return res.status(500).json({ ok: false, error: "Unsafe Moraware payload blocked." });
      }
      res.json({ ok: true, relationship });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/timeline", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const timeline = await getAccountDirectoryTimeline({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        page: req.query?.page,
        limit: req.query?.limit ?? req.query?.pageSize,
        family: req.query?.family ?? req.query?.type
      });
      res.json({ ok: true, ...timeline });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/notes", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const data = await listAccountNotes({
        store,
        getSupabase,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        actorUserId: ctx.actorUserId,
        actorDisplayName: ctx.actorDisplayName,
        page: req.query?.page,
        pageSize: req.query?.pageSize ?? req.query?.limit
      });
      res.json({ ok: true, ...data });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/follow-ups/assignees", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const data = await listAssignableStaff({
        store,
        getSupabase,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role
      });
      res.json({ ok: true, ...data });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/follow-ups", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const data = await listAccountFollowUps({
        store,
        getSupabase,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        actorUserId: ctx.actorUserId,
        actorDisplayName: ctx.actorDisplayName,
        page: req.query?.page,
        pageSize: req.query?.pageSize ?? req.query?.limit,
        status: req.query?.status
      });
      res.json({ ok: true, ...data });
    });
  });

  app.get("/api/account-directory/accounts/:accountId/insights", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const insights = await getAccountDirectoryInsights({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        env: process.env,
        now: new Date(),
        period: req.query?.period
      });
      res.json(insights);
    });
  });

  app.get("/api/account-directory/accounts/:accountId/insights/:insightId/evidence", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const evidence = await getAccountDirectoryInsightEvidence({
        supabase: getSupabase(),
        store,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        env: process.env,
        now: new Date(),
        period: req.query?.period,
        insightId: String(req.params.insightId)
      });
      res.json(evidence);
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

  app.post("/api/account-directory/accounts/:accountId/notes", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const note = await createAccountNote({
        store,
        logAction,
        getSupabase,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        actorUserId: ctx.actorUserId,
        actorDisplayName: ctx.actorDisplayName,
        requestId: ctx.requestId,
        payload: req.body || {}
      });
      res.status(201).json({ ok: true, note });
    });
  });

  app.patch("/api/account-directory/accounts/:accountId/notes/:noteId", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const note = await updateAccountNote({
        store,
        logAction,
        getSupabase,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        noteId: String(req.params.noteId),
        role: ctx.role,
        actorUserId: ctx.actorUserId,
        actorDisplayName: ctx.actorDisplayName,
        requestId: ctx.requestId,
        payload: req.body || {}
      });
      res.json({ ok: true, note });
    });
  });

  app.post(
    "/api/account-directory/accounts/:accountId/notes/:noteId/archive",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        const result = await archiveAccountNote({
          store,
          logAction,
          getSupabase,
          organizationId: ctx.organizationId,
          accountId: String(req.params.accountId),
          noteId: String(req.params.noteId),
          role: ctx.role,
          actorUserId: ctx.actorUserId,
          actorDisplayName: ctx.actorDisplayName,
          requestId: ctx.requestId,
          payload: req.body || {}
        });
        res.json({ ok: true, ...result });
      });
    }
  );

  app.delete("/api/account-directory/accounts/:accountId/notes/:noteId", ...guard, async (req, res) => {
    jsonNoStore(res);
    res.status(405).json({
      ok: false,
      code: "hard_delete_unavailable",
      error: "Hard delete is not available. Archive the note instead."
    });
  });

  app.post("/api/account-directory/accounts/:accountId/follow-ups", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const followUp = await createAccountFollowUp({
        store,
        logAction,
        getSupabase,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        role: ctx.role,
        actorUserId: ctx.actorUserId,
        actorDisplayName: ctx.actorDisplayName,
        requestId: ctx.requestId,
        payload: req.body || {}
      });
      res.status(201).json({ ok: true, followUp });
    });
  });

  app.patch("/api/account-directory/accounts/:accountId/follow-ups/:followUpId", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const followUp = await updateAccountFollowUp({
        store,
        logAction,
        getSupabase,
        organizationId: ctx.organizationId,
        accountId: String(req.params.accountId),
        followUpId: String(req.params.followUpId),
        role: ctx.role,
        actorUserId: ctx.actorUserId,
        actorDisplayName: ctx.actorDisplayName,
        requestId: ctx.requestId,
        payload: req.body || {}
      });
      res.json({ ok: true, followUp });
    });
  });

  app.post(
    "/api/account-directory/accounts/:accountId/follow-ups/:followUpId/complete",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        const followUp = await completeAccountFollowUp({
          store,
          logAction,
          getSupabase,
          organizationId: ctx.organizationId,
          accountId: String(req.params.accountId),
          followUpId: String(req.params.followUpId),
          role: ctx.role,
          actorUserId: ctx.actorUserId,
          actorDisplayName: ctx.actorDisplayName,
          requestId: ctx.requestId,
          payload: req.body || {}
        });
        res.json({ ok: true, followUp });
      });
    }
  );

  app.post(
    "/api/account-directory/accounts/:accountId/follow-ups/:followUpId/reopen",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        const followUp = await reopenAccountFollowUp({
          store,
          logAction,
          getSupabase,
          organizationId: ctx.organizationId,
          accountId: String(req.params.accountId),
          followUpId: String(req.params.followUpId),
          role: ctx.role,
          actorUserId: ctx.actorUserId,
          actorDisplayName: ctx.actorDisplayName,
          requestId: ctx.requestId,
          payload: req.body || {}
        });
        res.json({ ok: true, followUp });
      });
    }
  );

  app.post(
    "/api/account-directory/accounts/:accountId/follow-ups/:followUpId/archive",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        const result = await archiveAccountFollowUp({
          store,
          logAction,
          getSupabase,
          organizationId: ctx.organizationId,
          accountId: String(req.params.accountId),
          followUpId: String(req.params.followUpId),
          role: ctx.role,
          actorUserId: ctx.actorUserId,
          actorDisplayName: ctx.actorDisplayName,
          requestId: ctx.requestId,
          payload: req.body || {}
        });
        res.json({ ok: true, ...result });
      });
    }
  );

  app.delete("/api/account-directory/accounts/:accountId/follow-ups/:followUpId", ...guard, async (req, res) => {
    jsonNoStore(res);
    res.status(405).json({
      ok: false,
      code: "hard_delete_unavailable",
      error: "Hard delete is not available. Archive the follow-up instead."
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

  app.post("/api/account-directory/accounts/:accountId/link-moraware", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const account = await service.linkMoraware({
        ...ctx,
        accountId: String(req.params.accountId),
        payload: req.body || {}
      });
      res.status(201).json({ ok: true, account });
    });
  });

  app.get("/api/account-directory/moraware-reconciliation", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const data = await listMorawareReconciliationQueue({
        store,
        supabase: getSupabase(),
        organizationId: ctx.organizationId,
        role: ctx.role,
        query: req.query || {}
      });
      const json = JSON.stringify(data);
      if (/raw_payload|rawPayload/i.test(json)) {
        return res.status(500).json({ ok: false, error: "Unsafe Moraware payload blocked." });
      }
      res.json(data);
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
      if (!roleHasCapability(ctx.role, ACCOUNT_DIRECTORY_CAPABILITIES.EXTERNAL_LINK)) {
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

  // v1: create-and-link is intentionally omitted (orphan risk if create succeeds and
  // link fails). Production confirmation path is POST …/accounts/:id/link-quickbooks only.

  app.post(
    "/api/account-directory/accounts/:accountId/external-links/:linkId/deactivate",
    ...writeGuard,
    async (req, res) => {
      await withOrg(req, res, async (ctx) => {
        const account = await service.deactivateExternalLink({
          ...ctx,
          accountId: String(req.params.accountId),
          linkId: String(req.params.linkId),
          expectedSystem: req.body?.expectedSystem ? String(req.body.expectedSystem).trim() : null
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

  app.get("/api/account-directory/status-review", ...guard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const data = await listStatusReviewQueue({
        store,
        supabase: getSupabase(),
        organizationId: ctx.organizationId,
        role: ctx.role,
        query: {
          search: req.query?.search,
          proposedStatus: req.query?.proposedStatus,
          currentStatus: req.query?.currentStatus,
          reasonCode: req.query?.reasonCode,
          category: req.query?.category,
          qbState: req.query?.qbState,
          reviewed: req.query?.reviewed,
          page: req.query?.page,
          pageSize: req.query?.pageSize
        }
      });
      res.json(data);
    });
  });

  app.post("/api/account-directory/status-review/:accountId/decision", ...writeGuard, async (req, res) => {
    await withOrg(req, res, async (ctx) => {
      const result = await decideStatusReview({
        store,
        service,
        supabase: getSupabase(),
        organizationId: ctx.organizationId,
        role: ctx.role,
        actorUserId: ctx.actorUserId,
        requestId: ctx.requestId,
        accountId: String(req.params.accountId),
        decision: req.body?.decision,
        rowVersion: req.body?.rowVersion,
        evidenceFingerprint: req.body?.evidenceFingerprint,
        keepReason: req.body?.keepReason,
        note: req.body?.note
      });
      res.json(result);
    });
  });
}

export { ACCOUNT_DIRECTORY_HEAD_SLUG };
