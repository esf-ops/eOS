import assert from "node:assert/strict";
import express from "express";
import { attachSalesOpsRoutes } from "./salesOpsApi.js";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService } from "./salesOpsService.mjs";
import { createSalesOpsMondayClient } from "./salesOpsMonday.mjs";
import { PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY } from "./salesOpsConstants.js";
import { signHs256Jwt } from "./salesOpsJwt.mjs";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const REP_A = "00000000-0000-4000-8000-0000000000aa";
const REP_B = "00000000-0000-4000-8000-0000000000bb";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";

function requireAuthStub(users) {
  return () => (req, res, next) => {
    const token = String(req.header("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = users[token];
    if (!u) return res.status(401).json({ ok: false, error: "Unauthorized" });
    if (u.isActive === false) return res.status(403).json({ ok: false, error: "You do not have access to this head." });
    req.user = u;
    next();
  };
}

function requireHeadAccessStub(grants) {
  return (_slug) => (req, res, next) => {
    const id = req.user?.id;
    if (!grants.has(id)) return res.status(403).json({ ok: false, error: "You do not have access to this head." });
    next();
  };
}

async function main() {
  const store = createSalesOpsMemoryStore();
  const monday = createSalesOpsMondayClient({
    token: "x",
    signingSecret: "webhook-secret",
    inspectBoard: async () => ({ columns: [] }),
    listBoardItems: async () => [],
    getItem: async () => null,
    listItemUpdates: async () => [],
    getDoc: async () => ({ accessibility: "unsupported" }),
    changeColumnValues: async () => ({}),
    createUpdate: async () => ({ id: "u1" })
  });
  const svc = createSalesOpsService({ store, monday, audit: async () => {} });
  const draft = await svc.seedCedarValleyPlan({
    organizationId: ORG,
    userId: REP_A,
    createdBy: ADMIN,
    extras: { fullName: "Alex Sentinel" }
  });
  assert.equal(draft.status, "draft");

  const users = {
    a: { id: REP_A, email: "a@example.test", full_name: "Alex Sentinel", role: "sales", organization_id: ORG, isActive: true },
    b: { id: REP_B, email: "b@example.test", full_name: "Blake Sentinel", role: "sales", organization_id: ORG, isActive: true },
    admin: { id: ADMIN, email: "admin@example.test", full_name: "Admin Sentinel", role: "admin", organization_id: ORG, isActive: true },
    none: { id: "00000000-0000-4000-8000-0000000000ff", email: "none@example.test", role: "viewer", organization_id: ORG, isActive: true }
  };
  const grants = new Set([REP_A, REP_B, ADMIN]);

  const app = express();
  attachSalesOpsRoutes(app, {
    requireAuth: requireAuthStub(users),
    requireHeadAccess: requireHeadAccessStub(grants),
    getSupabase: () => ({}),
    store,
    monday,
    service: svc
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const meDraft = await fetch(`${base}/api/sales-ops/me/plan`, { headers: { Authorization: "Bearer a" } });
  assert.equal(meDraft.status, 404);

  const me = await fetch(`${base}/api/sales-ops/me`, { headers: { Authorization: "Bearer a" } });
  assert.equal(me.status, 200);
  const meBody = await me.json();
  assert.equal(meBody.ok, true);
  assert.equal(meBody.plan, null);

  const patchStatus = await fetch(`${base}/api/sales-ops/admin/plans/${draft.id}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer admin", "content-type": "application/json" },
    body: JSON.stringify({ status: "active" })
  });
  assert.equal(patchStatus.status, 400);

  await svc.publishSeededPlan(
    { userId: ADMIN, role: "admin", organizationId: ORG },
    draft.id,
    { effectiveStartDate: "2026-01-01" }
  );

  const mePlan = await fetch(`${base}/api/sales-ops/me/plan`, { headers: { Authorization: "Bearer a" } });
  assert.equal(mePlan.status, 200);
  const planBody = await mePlan.json();
  assert.equal(planBody.plan.blueprintKey, PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY);
  assert.equal(planBody.plan.status, "active");
  assert.match(planBody.plan.headline, /Alex's path/);

  const preview = await fetch(`${base}/api/sales-ops/admin/plans/${draft.id}/preview`, {
    headers: { Authorization: "Bearer admin" }
  });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.preview, true);
  assert.equal(previewBody.accounts, undefined);

  const spoofPreview = await fetch(`${base}/api/sales-ops/admin/plans/${draft.id}/preview`, {
    headers: { Authorization: "Bearer b" }
  });
  assert.equal(spoofPreview.status, 404);

  const denied = await fetch(`${base}/api/sales-ops/me`, { headers: { Authorization: "Bearer none" } });
  assert.equal(denied.status, 403);

  const unauth = await fetch(`${base}/api/sales-ops/me`);
  assert.equal(unauth.status, 401);

  const spoof = await fetch(`${base}/api/sales-ops/team/${REP_A}/plan`, { headers: { Authorization: "Bearer b" } });
  assert.equal(spoof.status, 404);

  const challenge = await fetch(`${base}/api/integrations/monday/sales-ops/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge: "abc123" })
  });
  assert.equal(challenge.status, 200);
  assert.equal((await challenge.json()).challenge, "abc123");

  const badJwt = await fetch(`${base}/api/integrations/monday/sales-ops/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer not-a-jwt" },
    body: JSON.stringify({ event: { type: "change_column_value", pulseId: "1" } })
  });
  assert.equal(badJwt.status, 401);

  const goodJwt = signHs256Jwt({ exp: Math.floor(Date.now() / 1000) + 120 }, "webhook-secret");
  const okHook = await fetch(`${base}/api/integrations/monday/sales-ops/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${goodJwt}` },
    body: JSON.stringify({ event: { id: "evt-http-1", type: "change_column_value", pulseId: "missing" } })
  });
  assert.equal(okHook.status, 200);

  const accA = await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "http-a",
    accountName: "Sentinel A",
    assignedUserId: REP_A,
    sourceState: "active"
  });
  const accB = await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "http-b",
    accountName: "Sentinel B",
    assignedUserId: REP_B,
    sourceState: "active"
  });
  const unknownId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const authA = { headers: { Authorization: "Bearer a" } };
  const authB = { headers: { Authorization: "Bearer b" } };
  const authAdmin = { headers: { Authorization: "Bearer admin" } };
  assert.equal((await fetch(`${base}/api/sales-ops/accounts/${accA.id}`, authA)).status, 200);
  assert.equal((await fetch(`${base}/api/sales-ops/accounts/${accB.id}`, authA)).status, 404);
  assert.equal((await fetch(`${base}/api/sales-ops/accounts/${unknownId}`, authA)).status, 404);
  for (const suffix of ["subitems", "updates", "files", "docs", "activity"]) {
    assert.equal((await fetch(`${base}/api/sales-ops/accounts/${accA.id}/${suffix}`, authA)).status, 200);
    assert.equal((await fetch(`${base}/api/sales-ops/accounts/${accB.id}/${suffix}`, authA)).status, 404);
    assert.equal((await fetch(`${base}/api/sales-ops/accounts/${accA.id}/${suffix}`, authB)).status, 404);
    assert.equal((await fetch(`${base}/api/sales-ops/accounts/${accB.id}/${suffix}`, authAdmin)).status, 200);
  }
  const ownDetail = await (await fetch(`${base}/api/sales-ops/accounts/${accA.id}`, authA)).json();
  assert.equal(Object.prototype.hasOwnProperty.call(ownDetail.account || {}, "sourceSnapshot"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(ownDetail.account || {}, "rawColumns"), false);
  assert.equal((await fetch(`${base}/api/sales-ops/accounts/${accB.id}`, authAdmin)).status, 200);

  const perfA = await fetch(`${base}/api/sales-ops/me/performance`, authA);
  assert.equal(perfA.status, 200);
  const perfBody = await perfA.json();
  assert.equal(perfBody.ok, true);
  assert.equal(perfBody.currentMonth.actualSf, null);
  assert.equal(perfBody.actualSfDefinition.status, "IDENTITY_APPROVAL_REQUIRED");
  assert.equal((await fetch(`${base}/api/sales-ops/me/performance/months`, authA)).status, 200);
  assert.equal((await fetch(`${base}/api/sales-ops/me/performance/accounts`, authA)).status, 200);
  assert.equal((await fetch(`${base}/api/sales-ops/team/${REP_A}/performance`, authB)).status, 404);
  assert.equal((await fetch(`${base}/api/sales-ops/team/${REP_A}/performance`, authA)).status, 200);
  assert.equal((await fetch(`${base}/api/sales-ops/team/performance`, authB)).status, 404);
  assert.equal((await fetch(`${base}/api/sales-ops/team/performance`, authAdmin)).status, 200);
  assert.equal((await fetch(`${base}/api/sales-ops/admin/identity-audit`, authA)).status, 404);
  const audit = await fetch(`${base}/api/sales-ops/admin/identity-audit`, authAdmin);
  assert.equal(audit.status, 200);
  const auditBody = await audit.json();
  assert.equal(Object.prototype.hasOwnProperty.call(auditBody, "account_name"), false);
  assert.ok(typeof auditBody.salesOpsAccountsTotal === "number");
  assert.equal((await fetch(`${base}/api/sales-ops/admin/identity-reviews`, authA)).status, 404);
  assert.equal((await fetch(`${base}/api/sales-ops/admin/compensation`, authA)).status, 404);
  const reviewsDenied = await fetch(`${base}/api/sales-ops/admin/identity-reviews/rebuild`, {
    method: "POST",
    headers: { Authorization: "Bearer a", "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(reviewsDenied.status, 404);
  const rebuilt = await fetch(`${base}/api/sales-ops/admin/identity-reviews/rebuild`, {
    method: "POST",
    headers: { Authorization: "Bearer admin", "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(rebuilt.status, 200);
  const rebuiltBody = await rebuilt.json();
  assert.equal(rebuiltBody.linkingMethod, "exact_external_id_only");
  const listed = await fetch(`${base}/api/sales-ops/admin/identity-reviews`, authAdmin);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.ok(Array.isArray(listedBody.reviews));
  assert.equal(JSON.stringify(listedBody).includes("QB-ROOT"), false);
  const bulkDenied = await fetch(`${base}/api/sales-ops/admin/identity-reviews/bulk-preview`, {
    method: "POST",
    headers: { Authorization: "Bearer a", "content-type": "application/json" },
    body: JSON.stringify({ reviewIds: ["x"] })
  });
  assert.equal(bulkDenied.status, 404);
  const bulkPreview = await fetch(`${base}/api/sales-ops/admin/identity-reviews/bulk-preview`, {
    method: "POST",
    headers: { Authorization: "Bearer admin", "content-type": "application/json" },
    body: JSON.stringify({ reviewIds: [] })
  });
  assert.equal(bulkPreview.status, 200);
  const people = await fetch(`${base}/api/sales-ops/admin/people`, authAdmin);
  assert.equal(people.status, 200);
  const comp = await fetch(`${base}/api/sales-ops/admin/compensation`, authAdmin);
  assert.equal(comp.status, 200);
  const compBody = await comp.json();
  assert.equal(compBody.finallyApproved, false);

  await new Promise((r) => server.close(r));
  console.log("salesOpsHttp.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
