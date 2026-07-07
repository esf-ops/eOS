/**
 * HR Workforce API — role + route smoke tests (no network, no Supabase).
 * Run: npm run eos:test:hr-workforce
 */

import assert from "node:assert/strict";
import { attachHrWorkforceRoutes, HR_HEAD_SLUG } from "./hrWorkforceApi.js";
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
assert.ok(routes.has("GET /api/hr/workforce/sections"));
assert.ok(routes.has("POST /api/hr/workforce/mistakes"));
assert.ok(routes.has("POST /api/hr/workforce/sections/:id/value"));
assert.ok(routes.has("POST /api/hr/workforce/categories"));

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

// Manager roles can manage categories
assert.equal(isWorkforceManager({ role: "admin" }), true);
assert.equal(isWorkforceManager({ role: "executive" }), true);
assert.equal(isWorkforceManager({ role: "hr" }), true);
assert.equal(isWorkforceManager({ role: "super_admin" }), true);

assert.equal(isManagerRole("HR"), true, "role check is case-insensitive");

// POST /mistakes guard stack includes auth + head access only (no manager role middleware)
const mistakeHandlers = routes.get("POST /api/hr/workforce/mistakes");
assert.equal(mistakeHandlers?.length, 4, "auth + head + json + handler");

const categoryHandlers = routes.get("POST /api/hr/workforce/categories");
assert.ok(categoryHandlers?.length >= 3);

console.log("hrWorkforceApi.test.mjs: ok");
