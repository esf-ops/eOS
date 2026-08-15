/**
 * Staff Finance Head — governed read APIs.
 *
 * GET /api/finance/overview
 * GET /api/finance/pnl
 * GET /api/finance/balance-sheet
 * GET /api/finance/ar
 * GET /api/finance/ap
 * GET /api/finance/cash
 * GET /api/finance/ar/invoices
 * GET /api/finance/ap/bills
 * GET /api/finance/accounts
 * GET /api/finance/journal-entries
 * GET /api/finance/transaction-activity
 * GET /api/finance/reconciliation
 *
 * Auth: requireAuth + requireRole(finance roles) + requireHeadAccess("finance")
 * Org: authenticated user's organization_id only (no query-org override).
 * QuickBooks remains read-only. Browser never queries qb_finance_*.
 */

import { FINANCE_ALLOWED_ROLES, FINANCE_HEAD_SLUG } from "./constants.js";
import { resolveAsOfDate, resolvePnlPeriod } from "./periods.js";
import { scrubFinanceValueForBrowser } from "./serialize.js";
import { createFinanceReadService } from "./service.js";

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

function send(res, payload) {
  jsonNoStore(res);
  res.json(scrubFinanceValueForBrowser(payload));
}

function sendError(res, status, error) {
  jsonNoStore(res);
  res.status(status).json({ ok: false, error });
}

export function attachFinanceReadRoutes(app, deps) {
  const { requireAuth, requireRole, requireHeadAccess, getSupabase } = deps;
  if (typeof requireAuth !== "function" || typeof requireRole !== "function") {
    throw new Error("attachFinanceReadRoutes: requireAuth and requireRole are required");
  }
  if (typeof requireHeadAccess !== "function" || typeof getSupabase !== "function") {
    throw new Error("attachFinanceReadRoutes: requireHeadAccess and getSupabase are required");
  }

  const service = deps.service || createFinanceReadService({ getSupabase, env: deps.env, now: deps.now });
  const stack = [
    requireAuth(),
    requireRole([...FINANCE_ALLOWED_ROLES]),
    requireHeadAccess(FINANCE_HEAD_SLUG, { getSupabase })
  ];

  app.get("/api/finance/overview", ...stack, async (req, res) => {
    try {
      send(res, await service.getOverview(req, req.query || {}));
    } catch (e) {
      sendError(res, 500, "Finance overview failed.");
      console.error("GET /api/finance/overview", e);
    }
  });

  app.get("/api/finance/pnl", ...stack, async (req, res) => {
    try {
      const period = resolvePnlPeriod(req.query || {});
      if (!period.ok) return sendError(res, 400, period.error);
      send(res, await service.getPnl(req, period));
    } catch (e) {
      sendError(res, 500, "Finance P&L failed.");
      console.error("GET /api/finance/pnl", e);
    }
  });

  app.get("/api/finance/balance-sheet", ...stack, async (req, res) => {
    try {
      const asOf = resolveAsOfDate(req.query || {});
      if (!asOf.ok) return sendError(res, 400, asOf.error);
      send(res, await service.getBalanceSheet(req, asOf));
    } catch (e) {
      sendError(res, 500, "Finance Balance Sheet failed.");
      console.error("GET /api/finance/balance-sheet", e);
    }
  });

  app.get("/api/finance/ar", ...stack, async (req, res) => {
    try {
      send(res, await service.getAr(req));
    } catch (e) {
      sendError(res, 500, "Finance A/R failed.");
      console.error("GET /api/finance/ar", e);
    }
  });

  app.get("/api/finance/ap", ...stack, async (req, res) => {
    try {
      send(res, await service.getAp(req));
    } catch (e) {
      sendError(res, 500, "Finance A/P failed.");
      console.error("GET /api/finance/ap", e);
    }
  });

  app.get("/api/finance/cash", ...stack, async (req, res) => {
    try {
      send(res, await service.getCash(req));
    } catch (e) {
      sendError(res, 500, "Finance cash failed.");
      console.error("GET /api/finance/cash", e);
    }
  });

  app.get("/api/finance/ar/invoices", ...stack, async (req, res) => {
    try {
      send(res, await service.getArInvoices(req, req.query || {}));
    } catch (e) {
      sendError(res, 500, "Finance invoice detail failed.");
      console.error("GET /api/finance/ar/invoices", e);
    }
  });

  app.get("/api/finance/ap/bills", ...stack, async (req, res) => {
    try {
      send(res, await service.getApBills(req, req.query || {}));
    } catch (e) {
      sendError(res, 500, "Finance bill detail failed.");
      console.error("GET /api/finance/ap/bills", e);
    }
  });

  app.get("/api/finance/accounts", ...stack, async (req, res) => {
    try {
      send(res, await service.getAccounts(req, req.query || {}));
    } catch (e) {
      sendError(res, 500, "Finance account detail failed.");
      console.error("GET /api/finance/accounts", e);
    }
  });

  app.get("/api/finance/journal-entries", ...stack, async (req, res) => {
    try {
      send(res, await service.getJournalEntries(req, req.query || {}));
    } catch (e) {
      sendError(res, 500, "Finance journal detail failed.");
      console.error("GET /api/finance/journal-entries", e);
    }
  });

  app.get("/api/finance/transaction-activity", ...stack, async (req, res) => {
    try {
      send(res, await service.getTransactionActivity(req, req.query || {}));
    } catch (e) {
      sendError(res, 500, "Finance transaction activity failed.");
      console.error("GET /api/finance/transaction-activity", e);
    }
  });

  app.get("/api/finance/reconciliation", ...stack, async (req, res) => {
    try {
      send(res, await service.getReconciliation(req));
    } catch (e) {
      sendError(res, 500, "Finance reconciliation failed.");
      console.error("GET /api/finance/reconciliation", e);
    }
  });
}

export { FINANCE_HEAD_SLUG, FINANCE_ALLOWED_ROLES };
