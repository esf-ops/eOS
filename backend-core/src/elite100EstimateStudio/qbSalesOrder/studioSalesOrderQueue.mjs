/**
 * Durable QuickBooks SALES ORDER queue for Studio sold snapshots.
 *
 * Mark Sold (staff) → enqueue (idempotent per org + publication + acceptance + company)
 * → worker claims with a lease → verifies the open company file is the allowlisted
 * TEST company → looks for an existing sales order (lost acknowledgment) → adds once
 * → reads it back by TxnID → reconciles lines/subtotal/tax → "synced".
 *
 * "synced" is only ever set after a successful read-back reconciliation. A queued
 * row, a built plan, or an add response alone is never success.
 *
 * Writes are refused unless QB_SALES_ORDER_WRITE_ENABLED=1,
 * QB_SALES_ORDER_WRITE_ENVIRONMENT=test and the company is on
 * QB_SALES_ORDER_COMPANY_ALLOWLIST (first write enablement needs explicit approval).
 */

import { randomUUID } from "node:crypto";

import { buildStudioSalesOrderPlan } from "./studioSalesOrderPlan.mjs";
import {
  buildCompanyQueryRq,
  buildSalesOrderAddRq,
  buildSalesOrderByTxnIdRq,
  buildSalesOrderLookupRq,
  findSalesOrderForPlan,
  parseCompanyQueryRs,
  parseSalesOrderAddRs,
  parseSalesOrderQueryRs,
  reconcileSalesOrder
} from "./studioSalesOrderQbxml.mjs";

export const SALES_ORDER_JOB_STATUSES = Object.freeze({
  BLOCKED: "blocked",
  QUEUED: "queued",
  IN_PROGRESS: "in_progress",
  RETRY_WAIT: "retry_wait",
  OUTCOME_UNKNOWN: "outcome_unknown",
  NEEDS_ATTENTION: "needs_attention",
  SYNCED: "synced"
});

const S = SALES_ORDER_JOB_STATUSES;
const CLAIMABLE = new Set([S.QUEUED, S.RETRY_WAIT, S.OUTCOME_UNKNOWN]);
const MAX_ATTEMPTS = 6;
const LEASE_MS = 5 * 60 * 1000;
/** QuickBooks "object in use / busy" style status codes worth retrying. */
const RETRYABLE_QB_STATUS = new Set([3170, 3175, 3176, 3180, 3250]);
const REFERENCE_QB_STATUS = new Set([3120, 3130, 3140]);
const TRUTHY = new Set(["1", "true", "yes", "on"]);

function fail(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

/**
 * @param {{ env: Record<string, string|undefined>, companyName: string|null, mappingCompanyIdentity: string|null }} input
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function checkStudioSalesOrderWriteGate({ env, companyName, mappingCompanyIdentity }) {
  if (!TRUTHY.has(String(env.QB_SALES_ORDER_WRITE_ENABLED ?? "").trim().toLowerCase())) {
    return { ok: false, code: "qb_write_not_enabled", message: "QuickBooks sales order writes are not enabled." };
  }
  if (String(env.QB_SALES_ORDER_WRITE_ENVIRONMENT ?? "").trim().toLowerCase() !== "test") {
    return { ok: false, code: "qb_write_env_not_test", message: "Sales order writes are limited to the QuickBooks TEST company." };
  }
  const allow = String(env.QB_SALES_ORDER_COMPANY_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const company = String(companyName ?? "").trim();
  if (!company || !allow.includes(company)) {
    return { ok: false, code: "qb_company_not_allowlisted", message: `Open QuickBooks company "${company || "(unknown)"}" is not allowlisted for writes.` };
  }
  if (company !== String(mappingCompanyIdentity ?? "").trim()) {
    return { ok: false, code: "qb_company_mismatch", message: `Open QuickBooks company "${company}" does not match the configured mapping company.` };
  }
  return { ok: true };
}

/**
 * Staff-safe job view. Status label says "Synced" only for reconciled jobs.
 * @param {object|null} job
 * @param {{ typedCustomerJobAllowed?: boolean }} [opts]
 */
export function presentSalesOrderJob(job, opts = {}) {
  if (!job) return null;
  const label = {
    [S.BLOCKED]: "Blocked — fix setup",
    [S.QUEUED]: "Queued",
    [S.IN_PROGRESS]: "Sending to QuickBooks",
    [S.RETRY_WAIT]: "Retrying",
    [S.OUTCOME_UNKNOWN]: "Checking QuickBooks",
    [S.NEEDS_ATTENTION]: "Needs attention",
    [S.SYNCED]: "Synced"
  }[job.status] || job.status;
  return {
    jobId: job.id,
    status: job.status,
    statusLabel: label,
    synced: job.status === S.SYNCED,
    qbTxnId: job.qbTxnId || null,
    qbRefNumber: job.qbRefNumber || null,
    attempts: job.attempts,
    nextAttemptAt: job.nextAttemptAt || null,
    blockers: job.plan?.blockers || [],
    customer: job.plan?.customer || null,
    customerJobSelectedByStaff: Boolean(job.customerJob),
    companyIdentity: job.companyIdentity || job.plan?.companyIdentity || null,
    lastError: job.lastError || null,
    reconciliation: job.reconciliation || null,
    totalCents: job.plan?.totalCents ?? null,
    canRetry: job.status === S.NEEDS_ATTENTION || job.status === S.BLOCKED || job.status === S.RETRY_WAIT,
    typedCustomerJobAllowed: opts.typedCustomerJobAllowed === true
  };
}

export function createInMemorySalesOrderJobRepository() {
  /** @type {Map<string, any>} */
  const rows = new Map();
  const clone = (v) => (v == null ? v : structuredClone(v));
  return {
    async getByIdempotencyKey(organizationId, key) {
      for (const r of rows.values()) if (r.organizationId === organizationId && r.idempotencyKey === key) return clone(r);
      return null;
    },
    async getById(organizationId, id) {
      const r = rows.get(id);
      return r && r.organizationId === organizationId ? clone(r) : null;
    },
    async getLatestForEstimate(organizationId, studioEstimateId) {
      const list = [...rows.values()]
        .filter((r) => r.organizationId === organizationId && r.studioEstimateId === studioEstimateId)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return list.length ? clone(list[0]) : null;
    },
    async insert(job) {
      for (const r of rows.values()) {
        if (r.organizationId === job.organizationId && r.idempotencyKey === job.idempotencyKey) {
          return { job: clone(r), created: false };
        }
      }
      rows.set(job.id, clone({ ...job, rowVersion: 1 }));
      return { job: clone(rows.get(job.id)), created: true };
    },
    /** Compare-and-set on rowVersion; returns null when another worker won. */
    async update(organizationId, id, expectedRowVersion, patch) {
      const r = rows.get(id);
      if (!r || r.organizationId !== organizationId || r.rowVersion !== expectedRowVersion) return null;
      const next = { ...r, ...clone(patch), rowVersion: r.rowVersion + 1 };
      rows.set(id, next);
      return clone(next);
    },
    async listDue(now, { organizationId = null } = {}) {
      return [...rows.values()]
        .filter((r) => !organizationId || r.organizationId === organizationId)
        .filter(
          (r) =>
            (CLAIMABLE.has(r.status) && (!r.nextAttemptAt || r.nextAttemptAt <= now)) ||
            (r.status === S.IN_PROGRESS && r.leaseUntil && r.leaseUntil <= now)
        )
        .map(clone);
    }
  };
}

/**
 * @param {{
 *   repository: ReturnType<typeof createInMemorySalesOrderJobRepository>,
 *   loadMapping: (organizationId: string) => Promise<any>,
 *   resolveCustomerJob: (organizationId: string, soldSnapshot: any) => Promise<{ fullName?: string, listId?: string }|null>,
 *   env?: Record<string, string|undefined>,
 *   qbXmlVersion?: string,
 *   now?: () => Date
 * }} deps
 */
export function createStudioSalesOrderQueue(deps) {
  const { repository, loadMapping, resolveCustomerJob } = deps;
  const env = deps.env || process.env;
  const qbXmlVersion = deps.qbXmlVersion || "16.0";
  const clock = deps.now || (() => new Date());
  if (!repository) throw new Error("repository required");
  const typedCustomerJobAllowed =
    String(env.QB_SALES_ORDER_WRITE_ENVIRONMENT || "").trim().toLowerCase() === "test";
  const present = (job) => presentSalesOrderJob(job, { typedCustomerJobAllowed });

  async function buildPlan({ organizationId, soldSnapshot, acceptance, quoteNumber, customerJobOverride = null }) {
    const [mapping, customerJob] = await Promise.all([
      loadMapping(organizationId),
      resolveCustomerJob(organizationId, soldSnapshot, customerJobOverride)
    ]);
    const plan = buildStudioSalesOrderPlan({ organizationId, soldSnapshot, acceptance, mapping, customerJob, quoteNumber });
    if (customerJob?.unresolvedReason) {
      const b = plan.blockers.find((x) => x.code === "qb_customer_job_unresolved");
      if (b) {
        b.message = customerJob.unresolvedReason;
        b.candidates = customerJob.candidates || [];
      }
    }
    return plan;
  }

  async function loadSourceFor(job) {
    if (!deps.loadSource) return null;
    return deps.loadSource(job.organizationId, job.soldSnapshotId);
  }

  function event(job, type, detail = {}) {
    return [...(job.events || []), { at: clock().toISOString(), type, ...detail }].slice(-50);
  }

  function backoffIso(attempts) {
    const ms = Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 60 * 60_000);
    return new Date(clock().getTime() + ms).toISOString();
  }

  async function save(job, patch, type, detail) {
    const updated = await repository.update(job.organizationId, job.id, job.rowVersion, {
      ...patch,
      updatedAt: clock().toISOString(),
      events: event(job, type, detail)
    });
    if (!updated) throw fail("sales_order_job_conflict", "Sales order job changed concurrently.", 409);
    return updated;
  }

  async function failAttempt(job, { code, message, retryable, unknownOutcome = false }) {
    const attempts = job.attempts;
    const exhausted = attempts >= MAX_ATTEMPTS;
    if (unknownOutcome) {
      return save(job, {
        status: exhausted ? S.NEEDS_ATTENTION : S.OUTCOME_UNKNOWN,
        possiblyInQuickBooks: true,
        leaseUntil: null,
        attempt: null,
        nextAttemptAt: exhausted ? null : backoffIso(attempts),
        lastError: {
          code,
          message: exhausted ? `${message} The sales order may exist in QuickBooks; retry will check before adding.` : message,
          retryable: !exhausted
        }
      }, exhausted ? "needs_attention" : "outcome_unknown", { code });
    }
    return save(job, {
      status: retryable && !exhausted ? S.RETRY_WAIT : S.NEEDS_ATTENTION,
      leaseUntil: null,
      attempt: null,
      nextAttemptAt: retryable && !exhausted ? backoffIso(attempts) : null,
      lastError: { code, message, retryable: retryable && !exhausted }
    }, retryable && !exhausted ? "retry_scheduled" : "needs_attention", { code });
  }

  async function post(transport, xml) {
    const res = await transport.postQbXml(xml);
    if (res.status < 200 || res.status >= 300) {
      throw fail("qb_transport_http_error", `QuickBooks connector returned HTTP ${res.status}.`, 502);
    }
    return res.body;
  }

  function leaseIso() {
    return new Date(clock().getTime() + LEASE_MS).toISOString();
  }

  /** Claim a due job for one attempt; null when it is not claimable now. */
  async function claim(job) {
    const nowIso = clock().toISOString();
    const leaseExpired = job.status === S.IN_PROGRESS && job.leaseUntil && job.leaseUntil <= nowIso;
    if (!CLAIMABLE.has(job.status) && !leaseExpired) return null;
    if (!leaseExpired && job.nextAttemptAt && job.nextAttemptAt > nowIso) return null;
    const mustLookFirst =
      job.status === S.OUTCOME_UNKNOWN || Boolean(leaseExpired) || job.possiblyInQuickBooks === true || Boolean(job.qbTxnId);
    return save(job, {
      status: S.IN_PROGRESS,
      attempts: job.attempts + 1,
      leaseUntil: leaseIso(),
      attempt: { attemptId: randomUUID(), step: "company", mustLookFirst }
    }, "claimed", leaseExpired ? { recoveredExpiredLease: true } : {});
  }

  /** The single qbXML request for the job's current step. */
  function requestFor(job) {
    const a = job.attempt;
    const plan = job.plan;
    switch (a?.step) {
      case "company":
        return buildCompanyQueryRq(qbXmlVersion);
      case "lookup": {
        const since = new Date(new Date(job.createdAt).getTime() - 24 * 3600_000).toISOString().slice(0, 19);
        return buildSalesOrderLookupRq({ customer: plan.customer, fromModifiedDate: since, qbXmlVersion });
      }
      case "add":
        return buildSalesOrderAddRq(plan, { qbXmlVersion, requestId: job.id });
      case "readback":
        return buildSalesOrderByTxnIdRq(a.txnId, qbXmlVersion);
      default:
        throw fail("sales_order_step_invalid", "Sales order job has no pending QuickBooks step.", 409);
    }
  }

  function advance(job, attemptPatch, type, detail) {
    return save(job, { attempt: { ...job.attempt, ...attemptPatch }, leaseUntil: leaseIso() }, type, detail);
  }

  function unreadable(job, e) {
    return failAttempt(job, { code: "qb_response_unreadable", message: `Unreadable QuickBooks response: ${e?.message || e}`, retryable: true, unknownOutcome: true });
  }

  /**
   * Apply the QuickBooks response (or transport failure) for the current step.
   * Any failure after an add may have been sent is treated as "outcome unknown", so
   * the next attempt looks the order up before adding again.
   */
  async function applyResponse(job, { body = null, error = null }) {
    const a = job.attempt;
    const errMsg = error ? String(error?.message || error).slice(0, 500) : null;
    if (a.step === "company") {
      if (errMsg) return failAttempt(job, { code: "qb_unreachable", message: `QuickBooks connector unreachable: ${errMsg}`, retryable: true });
      let companyName;
      try {
        companyName = parseCompanyQueryRs(body).companyName;
      } catch (e) {
        return failAttempt(job, { code: "qb_response_unreadable", message: `Unreadable QuickBooks response: ${e?.message || e}`, retryable: true });
      }
      const gate = checkStudioSalesOrderWriteGate({ env, companyName, mappingCompanyIdentity: job.plan.companyIdentity });
      if (!gate.ok) {
        return save(job, { status: S.BLOCKED, leaseUntil: null, attempt: null, lastError: { code: gate.code, message: gate.message, retryable: false } }, "write_gate_blocked", { code: gate.code });
      }
      return advance(job, { step: a.mustLookFirst ? "lookup" : "add", companyName }, "company_verified");
    }
    if (a.step === "lookup") {
      if (errMsg) return failAttempt(job, { code: "qb_unreachable", message: `QuickBooks lookup failed: ${errMsg}`, retryable: true, unknownOutcome: true });
      let q;
      try {
        q = parseSalesOrderQueryRs(body);
      } catch (e) {
        return unreadable(job, e);
      }
      if (q.statusCode != null && q.statusCode !== 0 && q.statusCode !== 1) {
        return failAttempt(job, { code: `qb_status_${q.statusCode}`, message: q.statusMessage || "QuickBooks lookup failed.", retryable: RETRYABLE_QB_STATUS.has(q.statusCode), unknownOutcome: true });
      }
      const found = findSalesOrderForPlan(job.plan, q.rets);
      if (!found) return advance(job, { step: "add" }, "lookup_clear");
      if (found.txnId) return advance(job, { step: "readback", txnId: found.txnId }, "existing_found", { txnId: found.txnId });
      return finish(job, found);
    }
    if (a.step === "add") {
      if (errMsg) return failAttempt(job, { code: "qb_ack_lost", message: `No response from QuickBooks after sending: ${errMsg}`, retryable: true, unknownOutcome: true });
      let add;
      try {
        add = parseSalesOrderAddRs(body);
      } catch (e) {
        return unreadable(job, e);
      }
      if (add.statusCode !== 0) {
        const code = add.statusCode;
        const message = REFERENCE_QB_STATUS.has(code)
          ? `QuickBooks could not find a referenced customer, item, class, terms or tax code: ${add.statusMessage || code}. Check the central QuickBooks mapping.`
          : add.statusMessage || `QuickBooks returned status ${code}.`;
        return failAttempt(job, { code: `qb_status_${code}`, message, retryable: RETRYABLE_QB_STATUS.has(code) });
      }
      if (!add.ret?.txnId) {
        return failAttempt(job, { code: "qb_readback_missing", message: "QuickBooks accepted the sales order without a transaction ID.", retryable: true, unknownOutcome: true });
      }
      return save(job, {
        qbTxnId: add.ret.txnId,
        qbRefNumber: add.ret.refNumber || null,
        possiblyInQuickBooks: true,
        submittedAt: clock().toISOString(),
        attempt: { ...a, step: "readback", txnId: add.ret.txnId },
        leaseUntil: leaseIso()
      }, "added", { txnId: add.ret.txnId });
    }
    if (a.step === "readback") {
      if (errMsg) return failAttempt(job, { code: "qb_readback_missing", message: `Sales order read-back failed: ${errMsg}`, retryable: true, unknownOutcome: true });
      let q;
      try {
        q = parseSalesOrderQueryRs(body);
      } catch (e) {
        return unreadable(job, e);
      }
      const ret = q.rets[0];
      if (!ret) return failAttempt(job, { code: "qb_readback_missing", message: "QuickBooks accepted the sales order but it could not be read back.", retryable: true, unknownOutcome: true });
      return finish(job, ret);
    }
    throw fail("sales_order_step_invalid", `Unknown sales order step "${a.step}".`, 409);
  }

  function presentAgentWork(job) {
    return {
      jobId: job.id,
      organizationId: job.organizationId,
      attemptId: job.attempt.attemptId,
      step: job.attempt.step,
      requestType: { company: "CompanyQueryRq", lookup: "SalesOrderQueryRq", add: "SalesOrderAddRq", readback: "SalesOrderQueryRq" }[job.attempt.step],
      expectedCompany: job.plan.companyIdentity,
      leaseUntil: job.leaseUntil,
      qbXml: requestFor(job)
    };
  }

  async function finish(job, readBack) {
    const plan = job.plan;
    const reconciliation = reconcileSalesOrder(plan, readBack);
    const base = { qbTxnId: readBack.txnId, qbRefNumber: readBack.refNumber, reconciliation, leaseUntil: null, attempt: null };
    if (!reconciliation.ok) {
      return save(job, {
        ...base,
        status: S.NEEDS_ATTENTION,
        lastError: { code: "qb_reconciliation_failed", message: reconciliation.mismatches.map((m) => m.message).join(" "), retryable: false }
      }, "reconciliation_failed");
    }
    return save(job, { ...base, status: S.SYNCED, syncedAt: clock().toISOString(), lastError: null }, "synced", {
      txnId: readBack.txnId,
      refNumber: readBack.refNumber
    });
  }

  return {
    /**
     * Idempotent: repeated Mark Sold / double clicks return the same job.
     */
    async enqueueFromSold({ organizationId, soldSnapshot, acceptance, quoteNumber = null, actorUserId = null }) {
      if (!organizationId || !soldSnapshot?.id || !acceptance?.id) {
        throw fail("sales_order_source_missing", "Sold snapshot and acceptance are required.");
      }
      if (String(soldSnapshot.organization_id ?? organizationId) !== String(organizationId)) {
        throw fail("cross_org_denied", "Sold snapshot belongs to another organization.", 403);
      }
      let plan = await buildPlan({ organizationId, soldSnapshot, acceptance, quoteNumber });
      const existing = await repository.getByIdempotencyKey(organizationId, plan.idempotencyKey);
      if (existing) {
        if (existing.status === S.BLOCKED) {
          if (existing.customerJob) {
            plan = await buildPlan({ organizationId, soldSnapshot, acceptance, quoteNumber, customerJobOverride: existing.customerJob });
          }
          const job = await save(existing, { plan, status: plan.ok ? S.QUEUED : S.BLOCKED }, "replanned");
          return { created: false, job: present(job) };
        }
        return { created: false, job: present(existing) };
      }
      const nowIso = clock().toISOString();
      const { job, created } = await repository.insert({
        id: randomUUID(),
        organizationId,
        idempotencyKey: plan.idempotencyKey,
        soldSnapshotId: soldSnapshot.id,
        studioEstimateId: soldSnapshot.studio_estimate_id,
        acceptanceId: acceptance.id,
        publicationId: acceptance.publication_id,
        companyIdentity: plan.companyIdentity,
        quoteNumber,
        status: plan.ok ? S.QUEUED : S.BLOCKED,
        plan,
        attempts: 0,
        nextAttemptAt: null,
        leaseUntil: null,
        lastError: null,
        possiblyInQuickBooks: false,
        customerJob: null,
        qbTxnId: null,
        qbRefNumber: null,
        reconciliation: null,
        createdByUserId: actorUserId,
        createdAt: nowIso,
        updatedAt: nowIso,
        events: [{ at: nowIso, type: plan.ok ? "queued" : "blocked" }]
      });
      return { created, job: present(job) };
    },

    async getJob(organizationId, jobId) {
      return present(await repository.getById(organizationId, jobId));
    },

    /** Staff retry after fixing setup. Never re-opens a synced job. */
    async retry({ organizationId, jobId, soldSnapshot = null, acceptance = null }) {
      const job = await repository.getById(organizationId, jobId);
      if (!job) throw fail("sales_order_job_not_found", "Sales order job not found.", 404);
      if (job.status === S.SYNCED) throw fail("sales_order_already_synced", "This sales order is already synced.", 409);
      if (![S.NEEDS_ATTENTION, S.BLOCKED, S.RETRY_WAIT].includes(job.status)) {
        throw fail("sales_order_not_retryable", "This sales order is already being processed.", 409);
      }
      let plan = job.plan;
      const source = soldSnapshot && acceptance ? { soldSnapshot, acceptance } : await loadSourceFor(job);
      if (source) {
        plan = await buildPlan({
          organizationId,
          soldSnapshot: source.soldSnapshot,
          acceptance: source.acceptance,
          quoteNumber: job.quoteNumber,
          customerJobOverride: job.customerJob
        });
        if (plan.idempotencyKey !== job.idempotencyKey) {
          throw fail("sales_order_source_changed", "The accepted estimate or QuickBooks company changed; this job cannot be retried.", 409);
        }
      }
      // A job that may already exist in QuickBooks keeps looking before adding.
      const status = !plan.ok ? S.BLOCKED : job.possiblyInQuickBooks || job.qbTxnId ? S.OUTCOME_UNKNOWN : S.QUEUED;
      const updated = await save(job, { plan, status, attempt: null, nextAttemptAt: null, attempts: status === S.BLOCKED ? job.attempts : 0 }, "retry_requested");
      return present(updated);
    },

    /**
     * Staff picks the QuickBooks customer:job explicitly (ListID from the QuickBooks
     * customer mirror, or a FullName in the TEST company). Replans; never re-opens a
     * job that may already be in QuickBooks.
     */
    async selectCustomerJob({ organizationId, jobId, selection, actorUserId = null }) {
      const job = await repository.getById(organizationId, jobId);
      if (!job) throw fail("sales_order_job_not_found", "Sales order job not found.", 404);
      if (job.status !== S.BLOCKED && job.status !== S.NEEDS_ATTENTION) {
        throw fail("sales_order_not_editable", "The customer:job can only be changed while the sales order is blocked or needs attention.", 409);
      }
      if (job.possiblyInQuickBooks || job.qbTxnId) {
        throw fail("sales_order_possibly_created", "This sales order may already exist in QuickBooks; fix it there instead.", 409);
      }
      const listId = String(selection?.listId ?? "").trim();
      const fullName = String(selection?.fullName ?? "").trim();
      if (!listId && !fullName) throw fail("customer_job_required", "Choose a QuickBooks customer:job.");
      if (fullName.length > 209 || listId.length > 64) throw fail("customer_job_invalid", "Customer:job reference is too long.");
      const customerJob = { listId: listId || null, fullName: fullName || null, selectedByUserId: actorUserId, selectedAt: clock().toISOString() };
      const source = await loadSourceFor(job);
      let plan = job.plan;
      if (source) {
        plan = await buildPlan({
          organizationId,
          soldSnapshot: source.soldSnapshot,
          acceptance: source.acceptance,
          quoteNumber: job.quoteNumber,
          customerJobOverride: customerJob
        });
      }
      const status = plan.ok ? S.QUEUED : S.BLOCKED;
      const updated = await save(job, { customerJob, plan, status, attempt: null, nextAttemptAt: null, attempts: 0, lastError: null }, "customer_job_selected");
      return present(updated);
    },

    /**
     * Worker step for one job. `transport.postQbXml(xml)` reaches the Windows-side
     * QuickBooks connector; it must accept SalesOrderAdd (the read-only live gateway
     * transport refuses writes by design).
     */
    async processJob({ organizationId, jobId, transport }) {
      return present(await processJobRow({ organizationId, jobId, transport }));
    },

    async processDue({ transport, organizationId = null }) {
      const due = await repository.listDue(clock().toISOString(), { organizationId });
      const out = [];
      for (const j of due) {
        try {
          out.push(await this.processJob({ organizationId: j.organizationId, jobId: j.id, transport }));
        } catch (e) {
          if (e?.code !== "sales_order_job_conflict") throw e;
        }
      }
      return out;
    },

    /**
     * Pull protocol for the Windows QuickBooks agent (outbound-only from the VM).
     * Claims the next due job for the agent's organization and returns its first
     * qbXML request. The agent executes it against the open company file and
     * reports back with agentResult.
     */
    async agentNext({ organizationId }) {
      if (!organizationId) throw fail("agent_org_required", "Agent organization is required.", 403);
      const due = await repository.listDue(clock().toISOString(), { organizationId });
      for (const j of due) {
        try {
          const job = await claim(j);
          if (job) return { work: presentAgentWork(job) };
        } catch (e) {
          if (e?.code !== "sales_order_job_conflict") throw e;
        }
      }
      return { work: null };
    },

    /**
     * Agent reports the response (or its local failure) for exactly the step it was
     * given. Stale or duplicate reports never re-apply; an expired lease discards the
     * report and the next claim looks the order up before adding.
     */
    async agentResult({ organizationId, jobId, attemptId, step, responseXml = null, transportError = null }) {
      const job = await repository.getById(organizationId, jobId);
      if (!job) throw fail("sales_order_job_not_found", "Sales order job not found.", 404);
      const nowIso = clock().toISOString();
      if (
        job.status !== S.IN_PROGRESS ||
        !job.attempt ||
        job.attempt.attemptId !== attemptId ||
        job.attempt.step !== step ||
        !job.leaseUntil ||
        job.leaseUntil <= nowIso
      ) {
        return { stale: true, job: present(job), work: null };
      }
      const next = await applyResponse(job, {
        body: typeof responseXml === "string" ? responseXml : null,
        error: transportError ? new Error(String(transportError)) : responseXml == null ? new Error("Agent returned no response.") : null
      });
      return {
        stale: false,
        job: present(next),
        work: next.status === S.IN_PROGRESS && next.attempt ? presentAgentWork(next) : null
      };
    }
  };

  async function processJobRow({ organizationId, jobId, transport }) {
    let job = await repository.getById(organizationId, jobId);
    if (!job) throw fail("sales_order_job_not_found", "Sales order job not found.", 404);
    const claimed = await claim(job);
    if (!claimed) return job;
    job = claimed;
    while (job.status === S.IN_PROGRESS && job.attempt) {
      const xml = requestFor(job);
      let body = null;
      let error = null;
      try {
        body = await post(transport, xml);
      } catch (e) {
        error = e;
      }
      job = await applyResponse(job, { body, error });
    }
    return job;
  }
}
