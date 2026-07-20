/**
 * HR Workforce API — role + route smoke tests (no network, no Supabase).
 * Run: npm run eos:test:hr-workforce
 */

import assert from "node:assert/strict";
import { attachHrWorkforceRoutes, computeHasHrHeadAccess, HR_HEAD_SLUG } from "./hrWorkforceApi.js";
import {
  EXECUTIVE_DASHBOARD_SLUG,
  hasExecutiveDashboardAssignment,
  isValidAccessSlug,
  listAssignedDepartmentGroups,
  sectionIdsForDepartments
} from "./workforceDepartments.js";
import { isManagerRole, isWorkforceManager } from "./workforceGradeEngine.js";

assert.equal(HR_HEAD_SLUG, "hr");

/** @type {Map<string, Function[]>} */
const routes = new Map();

const app = {
  get(path, ...handlers) {
    routes.set(`GET ${path}`, handlers);
  },
  post(path, ...handlers) {
    routes.set(`POST ${path}`, handlers);
  },
  patch(path, ...handlers) {
    routes.set(`PATCH ${path}`, handlers);
  },
  delete(path, ...handlers) {
    routes.set(`DELETE ${path}`, handlers);
  }
};

attachHrWorkforceRoutes(app, {
  requireAuth: () => (_req, _res, next) => next(),
  requireHeadAccess: () => (_req, _res, next) => next(),
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ data: [], error: null })
        })
      })
    })
  })
});

assert.ok(routes.has("GET /api/hr/workforce/dashboard"));
assert.ok(routes.has("GET /api/hr/workforce/access"));
assert.ok(routes.has("GET /api/hr/workforce/sections"));
assert.ok(routes.has("GET /api/hr/workforce/mistakes/log"));
assert.ok(routes.has("GET /api/hr/workforce/departments/assignments"));
assert.ok(routes.has("GET /api/hr/workforce/departments/eligible-users"));
assert.ok(routes.has("POST /api/hr/workforce/departments/assignments"));
assert.ok(routes.has("DELETE /api/hr/workforce/departments/assignments/:id"));
assert.ok(routes.has("POST /api/hr/workforce/mistakes"));
assert.ok(routes.has("PATCH /api/hr/workforce/mistakes/:id"));
assert.ok(routes.has("DELETE /api/hr/workforce/mistakes/:id"));
assert.ok(routes.has("POST /api/hr/workforce/sections/:id/value"));
assert.ok(routes.has("POST /api/hr/workforce/sections/:id/quick-count"));
assert.ok(routes.has("POST /api/hr/workforce/report/generate"));
assert.ok(routes.has("POST /api/hr/workforce/categories"));

// Eligible-users is server-side only — browser must not query auth.users
const eligibleHandlers = routes.get("GET /api/hr/workforce/departments/eligible-users");
assert.ok(eligibleHandlers?.length >= 3, "auth + head + handler");

// Dashboard / employees use isWorkforceManager for canManageCategories only — must not throw
assert.doesNotThrow(() => {
  const viewer = { id: "u-viewer", role: "viewer" };
  assert.equal(isWorkforceManager(viewer), false);
});

assert.doesNotThrow(() => {
  assert.equal(isWorkforceManager({ role: undefined }), false);
  assert.equal(isWorkforceManager(null), false);
  assert.equal(isWorkforceManager(undefined), false);
});

// Normal HR user (viewer): can access head, cannot manage categories
assert.equal(isWorkforceManager({ role: "viewer" }), false);
assert.equal(isWorkforceManager({ role: "estimator" }), false);

// Manager roles can manage categories / Department Access
assert.equal(isWorkforceManager({ role: "admin" }), true);
assert.equal(isWorkforceManager({ role: "executive" }), true);
assert.equal(isWorkforceManager({ role: "hr" }), true);
assert.equal(isWorkforceManager({ role: "super_admin" }), true);

assert.equal(isManagerRole("HR"), true, "role check is case-insensitive");

// HR Head access eligibility (authoritative app model — not auth.users)
assert.equal(computeHasHrHeadAccess({ role: "viewer" }, ["hr"]), true, "explicit HR head grant");
assert.equal(computeHasHrHeadAccess({ role: "viewer" }, ["sales"]), false, "other head only");
assert.equal(computeHasHrHeadAccess({ role: "hr" }, []), true, "hr role default");
assert.equal(computeHasHrHeadAccess({ role: "admin" }, []), true);
assert.equal(computeHasHrHeadAccess({ role: "executive" }, []), true);
assert.equal(computeHasHrHeadAccess({ role: "super_admin" }, []), true);
assert.equal(computeHasHrHeadAccess({ role: "viewer" }, []), false);
assert.equal(
  computeHasHrHeadAccess({ role: "viewer" }, ["sales"]),
  false,
  "explicit rows replace role defaults"
);
assert.equal(
  computeHasHrHeadAccess({ role: "hr" }, ["sales"]),
  false,
  "explicit non-hr rows replace hr role default"
);

// Executive Dashboard assignment grants full scorecard semantics without manage rights
assert.equal(isValidAccessSlug(EXECUTIVE_DASHBOARD_SLUG), true);
assert.equal(hasExecutiveDashboardAssignment([{ slug: EXECUTIVE_DASHBOARD_SLUG }]), true);
assert.equal(
  listAssignedDepartmentGroups([{ slug: EXECUTIVE_DASHBOARD_SLUG }, { slug: "plumbing" }]).length,
  1,
  "executive assignment excluded from department section mapping"
);
assert.equal(sectionIdsForDepartments([EXECUTIVE_DASHBOARD_SLUG]).size, 0);

// Role managers retain manage rights; executive assignment alone does not imply System Admin / role manage
assert.equal(isWorkforceManager({ role: "viewer" }), false, "exec assignment is not a role");
assert.equal(isWorkforceManager({ role: "admin" }), true, "admin still full manage");

// Normal department assignment remains scoped
const plumbingOnly = sectionIdsForDepartments(["plumbing"]);
assert.equal(plumbingOnly.size, 1);
assert.ok(plumbingOnly.has("b2000001-0001-4001-8001-000000000008"));

// POST /mistakes guard stack includes auth + head access only (no manager role middleware)
const mistakeHandlers = routes.get("POST /api/hr/workforce/mistakes");
assert.equal(mistakeHandlers?.length, 4, "auth + head + json + handler");

const categoryHandlers = routes.get("POST /api/hr/workforce/categories");
assert.ok(categoryHandlers?.length >= 3);

console.log("hrWorkforceApi.test.mjs: ok");
