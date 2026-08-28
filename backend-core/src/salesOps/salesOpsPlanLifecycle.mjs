/**
 * Pure Sales Ops plan lifecycle helpers.
 * Status transitions are Brain-authoritative; clients cannot PATCH status.
 */

import { PLAN_STATUSES, PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY } from "./salesOpsConstants.js";

export const EDITABLE_STATUSES = Object.freeze(["draft"]);
export const REP_VISIBLE_STATUSES = Object.freeze(["approved", "active", "superseded", "archived"]);
export const PUBLISHABLE_STATUSES = Object.freeze(["approved"]);

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["in_review", "archived"]),
  in_review: Object.freeze(["approved", "draft", "archived"]),
  approved: Object.freeze(["active", "archived"]),
  active: Object.freeze(["superseded", "archived"]),
  superseded: Object.freeze(["archived"]),
  archived: Object.freeze([])
});

export class SalesOpsError extends Error {
  constructor(message, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "SalesOpsError";
  }
}

export function normalizePlanStatus(status) {
  const s = String(status ?? "").trim();
  return PLAN_STATUSES.includes(s) ? s : "";
}

export function canTransition(from, to) {
  const a = normalizePlanStatus(from);
  const b = normalizePlanStatus(to);
  if (!a || !b) return false;
  return (ALLOWED_TRANSITIONS[a] || []).includes(b);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Invalid plan lifecycle transition: ${from || "unknown"} → ${to || "unknown"}`);
    err.code = "invalid_transition";
    throw err;
  }
}

export function isMateriallyEditable(status) {
  return EDITABLE_STATUSES.includes(normalizePlanStatus(status));
}

export function asOfDateString(now = new Date()) {
  if (typeof now === "string" && /^\d{4}-\d{2}-\d{2}/.test(now)) return now.slice(0, 10);
  const d = now instanceof Date ? now : new Date(now);
  return d.toISOString().slice(0, 10);
}

export function periodStart(period) {
  return `${String(period).slice(0, 7)}-01`;
}

export function periodEnd(period) {
  const [y, m] = String(period).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(period).slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function dateInRange(asOf, start, end) {
  const d = String(asOf || "").slice(0, 10);
  const s = String(start || "").slice(0, 10);
  const e = String(end || "").slice(0, 10);
  if (!d || !s) return false;
  if (d < s) return false;
  if (e && d > e) return false;
  return true;
}

export function planCoversDate(plan, asOf) {
  const start = plan?.effectiveStartDate || plan?.startDate;
  const end = plan?.effectiveEndDate || plan?.endDate;
  return dateInRange(asOf, start, end);
}

export function planCoversPeriod(plan, period) {
  const start = plan?.effectiveStartDate || plan?.startDate;
  const end = plan?.effectiveEndDate || plan?.endDate;
  const ps = periodStart(period);
  const pe = periodEnd(period);
  if (!start) return false;
  if (pe < String(start).slice(0, 10)) return false;
  if (end && ps > String(end).slice(0, 10)) return false;
  return true;
}

export function snapshotPeriodTargets(periodTargets, period) {
  const row = (periodTargets || []).find((r) => r.period === period) || (periodTargets || [])[0] || {};
  return {
    period: period || row.period || null,
    installedTarget: Number(row.installedTarget ?? 0),
    rollingThreeMonthTarget: Number(row.rollingThreeMonthTarget ?? 0),
    qualifiedPipelineTarget: Number(row.qualifiedPipelineTarget ?? 0),
    northStarTarget: null
  };
}

export function isPrototypeBlueprint(key) {
  return String(key || "") === PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY;
}
