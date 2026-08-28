import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PROTOTYPE_CEDAR_VALLEY_RAMP, SALES_OPS_HEAD_SLUG } from "./salesOpsConstants.js";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService, SalesOpsError } from "./salesOpsService.mjs";
import { resolveSalesOpsStore } from "./salesOpsApi.js";
import { createSalesOpsMondayClient } from "./salesOpsMonday.mjs";
import { signHs256Jwt, verifyHs256Jwt } from "./salesOpsJwt.mjs";
import { EOS_HEAD_SLUGS } from "../auth/eosGovernanceConstants.js";
import { HEAD_LAUNCHER_CATALOG } from "../me/launcherHeads.js";
import { resolveHeadDeploymentUrl } from "../me/headDeploymentUrls.js";

const ORG_A = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const ORG_B = "00000000-0000-4000-8000-bbbbbbbbbbbb";
const REP_A = "00000000-0000-4000-8000-0000000000aa";
const REP_B = "00000000-0000-4000-8000-0000000000bb";
const MGR = "00000000-0000-4000-8000-0000000000cc";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const OTHER_ORG_REP = "00000000-0000-4000-8000-0000000000ee";

function user(id, role, org, extras = {}) {
  return {
    id,
    email: extras.email || `${id.slice(-4)}@example.test`,
    full_name: extras.fullName || "Sentinel User",
    role,
    organization_id: org,
    isActive: extras.isActive !== false
  };
}

function mondayHarness() {
  const writes = [];
  const items = new Map();
  return {
    writes,
    items,
    client: createSalesOpsMondayClient({
      token: "sentinel-token",
      signingSecret: "sentinel-signing-secret",
      inspectBoard: async () => ({
        id: "board-1",
        columns: [
          { id: "status", title: "Status", type: "status" },
          { id: "next", title: "Next Contact", type: "date" },
          { id: "milestone", title: "Next Strategic Milestone", type: "text" },
          { id: "owner", title: "Sales Executive", type: "people" }
        ]
      }),
      listBoardItems: async () => [...items.values()],
      getItem: async (id) => items.get(String(id)) || null,
      listItemUpdates: async (id) => items.get(String(id))?.updates || [],
      getDoc: async () => ({ accessibility: "unsupported" }),
      changeColumnValues: async (boardId, itemId, columnValues) => {
        writes.push({ type: "change", boardId, itemId, columnValues });
        const item = items.get(String(itemId));
        if (item) {
          item.column_values = item.column_values || [];
          for (const [colId, val] of Object.entries(columnValues)) {
            const existing = item.column_values.find((c) => c.id === colId);
            const text = val && typeof val === "object" ? val.date || val.label || JSON.stringify(val) : String(val ?? "");
            if (existing) existing.text = text;
            else item.column_values.push({ id: colId, text, type: "text", value: JSON.stringify(val) });
          }
        }
        return { id: itemId };
      },
      createUpdate: async (itemId, body) => {
        writes.push({ type: "note", itemId, body });
        return { id: `upd-${writes.length}`, body, created_at: new Date().toISOString() };
      }
    })
  };
}

function peopleCol(mondayUserId) {
  return {
    id: "owner",
    text: "Rep",
    type: "people",
    value: JSON.stringify({ personsAndTeams: [{ id: Number(mondayUserId) || mondayUserId, kind: "person" }] })
  };
}

async function seedWorld() {
  const store = createSalesOpsMemoryStore();
  const monday = mondayHarness();
  const svc = createSalesOpsService({ store, monday: monday.client, audit: async () => {} });

  await store.upsertMondayConfig({
    organizationId: ORG_A,
    enabled: true,
    accountMasterBoardId: "board-1",
    columnMap: {
      status: { columnId: "status", title: "Status", type: "status" },
      nextContact: { columnId: "next", title: "Next Contact", type: "date" },
      nextStrategicMilestone: { columnId: "milestone", title: "Next Strategic Milestone", type: "text" },
      salesExecutive: { columnId: "owner", title: "Sales Executive", type: "people" }
    }
  });
  await store.upsertRepMapping({ organizationId: ORG_A, userId: REP_A, mondayUserId: "1001" });
  await store.upsertRepMapping({ organizationId: ORG_A, userId: REP_B, mondayUserId: "1002" });

  for (const seed of [
    { organizationId: ORG_A, userId: REP_A, extras: { fullName: "Alex Sentinel", email: "alex@example.test" } },
    { organizationId: ORG_A, userId: REP_B, extras: { fullName: "Blake Sentinel", email: "blake@example.test" } },
    { organizationId: ORG_B, userId: OTHER_ORG_REP, extras: { fullName: "Other Org", email: "other@example.test" } }
  ]) {
    const plan = await svc.seedPrototypeDraft({
      organizationId: seed.organizationId,
      userId: seed.userId,
      createdBy: ADMIN,
      extras: seed.extras
    });
    await svc.publishSeededPlan(
      { userId: ADMIN, role: "admin", organizationId: seed.organizationId },
      plan.id,
      { effectiveStartDate: "2026-01-01" }
    );
  }

  monday.items.set("item-a", {
    id: "item-a",
    name: "Sentinel Account Alpha",
    url: "https://monday.example.test/pulses/item-a",
    updated_at: new Date().toISOString(),
    group: { title: "West" },
    column_values: [peopleCol("1001"), { id: "status", text: "Active", type: "status", value: "{}" }],
    updates: []
  });
  monday.items.set("item-b", {
    id: "item-b",
    name: "Sentinel Account Bravo",
    url: "https://monday.example.test/pulses/item-b",
    updated_at: new Date().toISOString(),
    group: { title: "East" },
    column_values: [peopleCol("1002"), { id: "status", text: "Lead", type: "status", value: "{}" }],
    updates: []
  });

  await svc.syncMonday(user(ADMIN, "admin", ORG_A));
  return { store, monday, svc };
}

async function runPlanLifecycleTests() {
  const audits = [];
  const store = createSalesOpsMemoryStore();
  let now = new Date("2026-06-15T12:00:00Z");
  const svc = createSalesOpsService({
    store,
    monday: mondayHarness().client,
    audit: async (row) => {
      audits.push(row);
    },
    now: () => now
  });
  const alex = user(REP_A, "sales", ORG_A, { fullName: "Alex Sentinel", email: "alex@example.test" });
  const blake = user(REP_B, "sales", ORG_A, { fullName: "Blake Sentinel" });
  const manager = user(MGR, "sales", ORG_A, { fullName: "Casey Manager" });
  const admin = user(ADMIN, "admin", ORG_A);
  const otherOrg = user(OTHER_ORG_REP, "sales", ORG_B);

  await store.insertManagerAssignment({
    organizationId: ORG_A,
    managerUserId: MGR,
    reportUserId: REP_A
  });

  // 23. Prototype Cedar Valley blueprint is not automatically active/assigned
  const proto = await svc.seedPrototypeDraft({
    organizationId: ORG_A,
    userId: REP_A,
    createdBy: ADMIN,
    extras: { fullName: "Alex Sentinel", email: "alex@example.test" }
  });
  assert.equal(proto.status, "draft");
  assert.equal(proto.isPrototype, true);
  assert.equal(proto.blueprintKey, "prototype_cedar_valley_sales_plan_2026_2028");
  assert.equal(proto.active, false);
  await assert.rejects(() => svc.getMyPlan(alex), (e) => e.code === "no_plan");

  // 1. Draft plan is not returned by /me/plan
  const meDraft = await svc.getMe(alex);
  assert.equal(meDraft.plan, null);

  // 7. Admin can create draft plan (blank)
  const blank = await svc.createPlanForUser(admin, {
    userId: REP_B,
    planName: "Blank draft",
    startDate: "2026-01-01",
    endDate: "2026-12-31"
  });
  assert.equal(blank.plan.status, "draft");
  assert.equal(blank.plan.userId, REP_B);
  assert.equal(blank.plan.versionNumber, 1);

  // 2. Rep cannot edit plan target definitions
  await assert.rejects(
    () => svc.updateAdminPlan(alex, proto.id, { northStarTarget: 9999 }),
    (e) => e.status === 404
  );
  await assert.rejects(
    () => svc.updateAdminPlan(alex, proto.id, { periodTargets: [{ period: "2026-09", installedTarget: 1 }] }),
    (e) => e.status === 404
  );

  // 3. Rep cannot approve/publish
  await assert.rejects(() => svc.approveAdminPlan(alex, proto.id), (e) => e.status === 404);
  await assert.rejects(() => svc.publishAdminPlan(alex, proto.id, {}), (e) => e.status === 404);

  // 4. Manager can edit only assigned direct-report drafts
  const mgrEdit = await svc.updateAdminPlan(manager, proto.id, { planName: "Manager draft for Alex" });
  assert.equal(mgrEdit.plan.planName, "Manager draft for Alex");

  // 5. Manager cannot edit unrelated rep plan
  await assert.rejects(() => svc.updateAdminPlan(manager, blank.plan.id, { planName: "nope" }), (e) => e.status === 404);

  // 8. Admin can submit draft for review
  const submitted = await svc.submitAdminPlan(admin, proto.id);
  assert.equal(submitted.plan.status, "in_review");

  // 6. Default manager cannot publish if v1 policy reserves publish for admin/executive
  await assert.rejects(() => svc.approveAdminPlan(manager, proto.id), (e) => e.status === 404);
  await assert.rejects(() => svc.publishAdminPlan(manager, proto.id, {}), (e) => e.status === 404);

  // 9. Invalid lifecycle transition is rejected
  await assert.rejects(() => svc.publishAdminPlan(admin, proto.id, {}), (e) => e.code === "invalid_transition");
  await assert.rejects(() => svc.submitAdminPlan(admin, proto.id), (e) => e.code === "invalid_transition");

  const approved = await svc.approveAdminPlan(admin, proto.id);
  assert.equal(approved.plan.status, "approved");

  // Generic PATCH cannot set status
  await assert.rejects(
    () => svc.updateAdminPlan(admin, proto.id, { status: "active" }),
    (e) => e.code === "status_locked" || e.code === "immutable_plan"
  );

  // 16. Future approved plan does not become active early (clock is 2026-06-15; prototype start is 2026-09-01)
  const scheduled = await svc.publishAdminPlan(admin, proto.id, { effectiveStartDate: "2026-09-01" });
  assert.equal(scheduled.plan.status, "approved");
  await assert.rejects(() => svc.getMyPlan(alex), (e) => e.code === "no_plan");
  const meUpcoming = await svc.getMe(alex);
  assert.equal(meUpcoming.plan, null);
  assert.equal(meUpcoming.upcomingPlan?.id, proto.id);

  // 10. Approved/published plan cannot be materially edited in place
  await assert.rejects(
    () => svc.updateAdminPlan(admin, proto.id, { northStarTarget: 1 }),
    (e) => e.code === "immutable_plan"
  );

  now = new Date("2026-09-15T12:00:00Z");
  const activated = await svc.getMyPlan(alex);
  assert.equal(activated.plan.id, proto.id);
  assert.equal(activated.plan.status, "active");

  const score = await svc.putMyScorecard(alex, "2026-09", { installed: 120 });
  assert.equal(score.planId, proto.id);
  assert.equal(Number(score.targetSnapshot.installedTarget), 500);
  assert.equal(Number(score.targetSnapshot.planVersion), 1);

  // 11 / 12. Create Revision clones an immutable published version into a new draft version
  const revision = await svc.reviseAdminPlan(admin, proto.id);
  assert.equal(revision.plan.status, "draft");
  assert.equal(revision.plan.versionNumber, 2);
  assert.equal(revision.plan.planFamilyId, proto.planFamilyId);
  assert.equal(revision.plan.supersedesPlanId, proto.id);
  const v1Targets = Number(activated.periodTargets.find((r) => r.period === "2026-09").installedTarget);
  assert.equal(v1Targets, 500);

  const revisedTargets = revision.periodTargets.map((r) =>
    r.period === "2026-09" ? { ...r, installedTarget: 999 } : r
  );
  await svc.updateAdminPlan(admin, revision.plan.id, { periodTargets: revisedTargets, northStarTarget: 2600 });

  // 15. New revision does not retroactively change prior targets
  const historical = await svc.getAdminPlan(admin, proto.id);
  assert.equal(Number(historical.periodTargets.find((r) => r.period === "2026-09").installedTarget), 500);
  const stillScore = (await svc.getMyScorecards(alex)).find((c) => c.period === "2026-09");
  assert.equal(Number(stillScore.targetSnapshot.installedTarget), 500);
  assert.equal(stillScore.planId, proto.id);

  await svc.submitAdminPlan(admin, revision.plan.id);
  await svc.approveAdminPlan(admin, revision.plan.id);
  now = new Date("2026-10-01T12:00:00Z");
  const publishedRev = await svc.publishAdminPlan(admin, revision.plan.id, { effectiveStartDate: "2026-10-01" });
  assert.equal(publishedRev.plan.status, "active");
  assert.equal(publishedRev.plan.versionNumber, 2);

  // 17. Effective revision supersedes previous version correctly
  const old = await svc.getAdminPlan(admin, proto.id);
  assert.equal(old.plan.status, "superseded");
  assert.equal(old.plan.supersededByPlanId, revision.plan.id);

  // 13. Old version remains queryable
  assert.equal(old.plan.id, proto.id);
  assert.equal(Number(old.periodTargets.find((r) => r.period === "2026-09").installedTarget), 500);

  // 14. Historical scorecard remains linked to historical plan version
  const afterRevScore = (await svc.getMyScorecards(alex)).find((c) => c.period === "2026-09");
  assert.equal(afterRevScore.planId, proto.id);
  assert.equal(Number(afterRevScore.targetSnapshot.installedTarget), 500);
  const progress = await svc.getMyProgress(alex);
  const histRamp = progress.progress;
  assert.ok(histRamp);
  const septCard = progress.scorecards.find((c) => c.period === "2026-09");
  assert.equal(Number(septCard.targetSnapshot.installedTarget), 500);

  // 18. Rep sees only own active plan
  const live = await svc.getMyPlan(alex);
  assert.equal(live.plan.id, revision.plan.id);
  assert.equal(Number(live.periodTargets.find((r) => r.period === "2026-09").installedTarget), 999);

  // 19. Rep can see own historical published versions
  const history = await svc.getMyPlanHistory(alex);
  assert.equal(history.some((p) => p.id === proto.id && p.status === "superseded"), true);
  assert.equal(history.some((p) => p.id === revision.plan.id && p.status === "active"), true);
  assert.equal(history.some((p) => p.status === "draft"), false);

  // 20. Rep cannot see another rep’s historical plans
  const blakeHistory = await svc.getMyPlanHistory(blake);
  assert.equal(blakeHistory.some((p) => p.userId === REP_A), false);
  await assert.rejects(() => svc.getAdminPlan(alex, proto.id), (e) => e.status === 404);

  // 21 / 22. Template cloning produces an independent draft; later template edits do not change it
  const templates = await svc.listPlanTemplates(admin);
  const tpl = templates.find((t) => t.templateKey === "prototype_cedar_valley_sales_plan_2026_2028");
  assert.ok(tpl);
  const cloned = await svc.createPlanForUser(admin, {
    userId: REP_B,
    templateId: tpl.id,
    planName: "Cloned from prototype"
  });
  assert.equal(cloned.plan.status, "draft");
  assert.equal(cloned.plan.templateId, tpl.id);
  const originalSept = Number(cloned.periodTargets.find((r) => r.period === "2026-09").installedTarget);
  await svc.updatePlanTemplate(admin, tpl.id, {
    templateName: "Edited prototype template",
    periodTargets: cloned.periodTargets.map((r) =>
      r.period === "2026-09" ? { ...r, installedTarget: 50 } : r
    )
  });
  const clonedAgain = await svc.getAdminPlan(admin, cloned.plan.id);
  assert.equal(Number(clonedAgain.periodTargets.find((r) => r.period === "2026-09").installedTarget), originalSept);
  assert.equal(clonedAgain.plan.planName, "Cloned from prototype");

  // 24. Acknowledgment is limited to authenticated plan owner
  const ack = await svc.acknowledgeMyPlan(alex, revision.plan.id);
  assert.ok(ack.acknowledgedAt);
  await assert.rejects(() => svc.acknowledgeMyPlan(blake, revision.plan.id), (e) => e.status === 404);
  await assert.rejects(() => svc.acknowledgeMyPlan(alex, cloned.plan.id), (e) => e.status === 404);

  // 25. Preview-as-rep does not impersonate/bypass authorization
  const preview = await svc.previewAdminPlan(admin, cloned.plan.id);
  assert.equal(preview.preview, true);
  assert.match(preview.banner, /Preview Mode/);
  assert.equal(Object.prototype.hasOwnProperty.call(preview, "accounts"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(preview, "commission"), false);
  await assert.rejects(() => svc.previewAdminPlan(alex, cloned.plan.id), (e) => e.status === 404);
  const adminAccounts = await svc.getMyAccounts(admin);
  assert.equal(adminAccounts.accounts.length, 0);

  // 26. Cross-org plan admin remains blocked
  await assert.rejects(
    () => svc.createPlanForUser(otherOrg, { userId: OTHER_ORG_REP, planName: "Other org draft" }),
    (e) => e.status === 404
  );
  const otherAdmin = user(ADMIN, "admin", ORG_B);
  const orgBDraft = await svc.createPlanForUser(otherAdmin, { userId: OTHER_ORG_REP, planName: "Org B draft" });
  await assert.rejects(() => svc.getAdminPlan(admin, orgBDraft.plan.id), (e) => e.status === 404);
  await assert.rejects(() => svc.listAdminPlans(alex), (e) => e.status === 404);

  // 27. Plan lifecycle actions generate audit records
  const types = audits.map((a) => a.actionType);
  assert.ok(types.includes("sales_ops_plan_created"));
  assert.ok(types.includes("sales_ops_plan_submitted_for_review"));
  assert.ok(types.includes("sales_ops_plan_approved"));
  assert.ok(types.includes("sales_ops_plan_published") || types.includes("sales_ops_plan_scheduled"));
  assert.ok(types.includes("sales_ops_plan_revision_created"));
  assert.ok(types.includes("sales_ops_plan_acknowledged"));
}

async function main() {
  assert.ok(EOS_HEAD_SLUGS.includes(SALES_OPS_HEAD_SLUG));
  assert.ok(HEAD_LAUNCHER_CATALOG.some((h) => h.slug === SALES_OPS_HEAD_SLUG));
  process.env.HEAD_URL_SALES_OPS = "https://sales-ops.eliteosfab.com";
  assert.equal(resolveHeadDeploymentUrl("sales_ops"), "https://sales-ops.eliteosfab.com");
  const prevStore = process.env.SALES_OPS_STORE;
  process.env.SALES_OPS_STORE = "memory";
  assert.equal(resolveSalesOpsStore(() => ({})).kind, "memory");
  process.env.SALES_OPS_STORE = "supabase";
  assert.equal(resolveSalesOpsStore(() => ({})).kind, "supabase");
  if (prevStore == null) delete process.env.SALES_OPS_STORE;
  else process.env.SALES_OPS_STORE = prevStore;

  const apiSrc = readFileSync(fileURLToPath(new URL("./salesOpsApi.js", import.meta.url)), "utf8");
  assert.ok(apiSrc.includes("requireAuth()"));
  assert.ok(apiSrc.includes("requireHeadAccess"));
  assert.ok(!apiSrc.includes("api.monday.com"));
  const feHint = readFileSync(fileURLToPath(new URL("../../../app-sales-ops/src/lib/api.ts", import.meta.url)), "utf8");
  assert.ok(!/MONDAY_API_TOKEN|SERVICE_ROLE|SIGNING_SECRET/.test(feHint));

  const { store, monday, svc } = await seedWorld();
  const alex = user(REP_A, "sales", ORG_A, { fullName: "Alex Sentinel", email: "alex@example.test" });
  const blake = user(REP_B, "sales", ORG_A, { fullName: "Blake Sentinel" });
  const manager = user(MGR, "sales", ORG_A, { fullName: "Casey Manager" });
  const admin = user(ADMIN, "admin", ORG_A);
  const otherOrg = user(OTHER_ORG_REP, "sales", ORG_B);

  // 1. Rep A can retrieve Rep A plan
  const planA = await svc.getMyPlan(alex);
  assert.equal(planA.plan.userId, REP_A);
  assert.equal(planA.plan.blueprintKey, "prototype_cedar_valley_sales_plan_2026_2028");
  assert.equal(planA.plan.status, "active");
  assert.match(planA.plan.headline, /Alex's path to/);

  // 12. Prototype ramp values are reproduced from the reference blueprint (not an approved production plan)
  assert.equal(planA.periodTargets.length, PROTOTYPE_CEDAR_VALLEY_RAMP.length);
  assert.equal(planA.periodTargets[0].period, "2026-09");
  assert.equal(Number(planA.periodTargets[0].installedTarget), 500);
  assert.equal(Number(planA.periodTargets[0].rollingThreeMonthTarget), 1800);
  assert.equal(Number(planA.periodTargets[0].qualifiedPipelineTarget), 5400);
  const dec2028 = planA.periodTargets.find((r) => r.period === "2028-12");
  assert.equal(Number(dec2028.installedTarget), 2500);
  assert.equal(Number(dec2028.rollingThreeMonthTarget), 7500);
  assert.equal(Number(dec2028.qualifiedPipelineTarget), 22500);

  // 2. Rep A cannot retrieve Rep B plan (no generic users/:id for reps)
  await assert.rejects(() => svc.getTeamMemberPlan(alex, REP_B), (e) => e instanceof SalesOpsError && e.status === 404);

  // 3. Rep A cannot retrieve Rep B scorecards
  await svc.putMyScorecard(blake, "2026-09", { installed: 999, pipeline: 1000 });
  const aCards = await svc.getMyScorecards(alex);
  assert.equal(aCards.some((c) => Number(c.installed) === 999), false);
  const bCards = await svc.getMyScorecards(blake);
  assert.equal(bCards.length, 1);

  // 13. localStorage is not scorecard authority (Brain persist)
  const saved = await svc.putMyScorecard(alex, "2026-09", { installed: 120, pipeline: 5400, quoted: 400, awarded: 150 });
  assert.equal(Number(saved.installed), 120);
  assert.equal(saved.sources.installed, "manual");
  const progress = await svc.getMyProgress(alex);
  assert.equal(progress.scorecards.some((c) => c.period === "2026-09"), true);

  // 4 / 14. Rep A cannot retrieve Rep B accounts; static JSON is not authority
  const accountsA = await svc.getMyAccounts(alex);
  assert.equal(accountsA.accounts.length, 1);
  assert.equal(accountsA.accounts[0].accountName, "Sentinel Account Alpha");
  assert.equal(accountsA.accounts.some((a) => a.accountName.includes("Sentinel Account Bravo")), false);
  assert.equal(Object.prototype.hasOwnProperty.call(accountsA.accounts[0], "rawColumns"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(accountsA.accounts[0], "sourceSnapshot"), false);
  const accountsB = await svc.getMyAccounts(blake);
  assert.equal(accountsB.accounts.length, 1);
  assert.equal(accountsB.accounts[0].accountName, "Sentinel Account Bravo");

  // 6. Guessing another plan/account UUID does not bypass authorization
  await assert.rejects(() => svc.getAccountWorkspace(alex, accountsB.accounts[0].id), (e) => e.status === 404);
  await assert.rejects(() => svc.getAccountWorkspace(alex, "00000000-0000-4000-8000-ffffffffffff"), (e) => e.status === 404);
  await assert.rejects(() => svc.getMyPlan({ ...alex, organization_id: ORG_B }), (e) => e.status === 404 || e.code === "no_plan");

  // 5 / 18. Rep A cannot mutate Rep B Monday-backed account; failed writes are not success
  await assert.rejects(() => svc.patchAccount(alex, accountsB.accounts[0].id, { status: "Active" }), (e) => e.status === 404);
  const patched = await svc.patchAccount(alex, accountsA.accounts[0].id, { nextContact: "2026-09-15" });
  assert.equal(patched.nextContact, "2026-09-15");
  assert.equal(monday.writes.some((w) => w.type === "change" && w.itemId === "item-a"), true);

  const failingMonday = mondayHarness();
  failingMonday.client.changeColumnValues = async () => {
    throw new Error("monday down");
  };
  const failSvc = createSalesOpsService({ store, monday: failingMonday.client, audit: async () => {} });
  await assert.rejects(
    () => failSvc.patchAccount(alex, accountsA.accounts[0].id, { status: "Won" }),
    (e) => e instanceof SalesOpsError && e.status === 502 && e.code === "monday_write_failed"
  );

  // 19. Notes map to intended Monday item
  const note = await svc.addNote(alex, accountsA.accounts[0].id, "Followed up on sample tower.");
  assert.ok(note.mondayUpdateId);
  assert.equal(monday.writes.some((w) => w.type === "note" && w.itemId === "item-a"), true);
  await assert.rejects(() => svc.addNote(alex, accountsB.accounts[0].id, "nope"), (e) => e.status === 404);

  // 7. Manager can access only explicitly assigned direct reports
  await assert.rejects(() => svc.getTeamMemberPlan(manager, REP_A), (e) => e.status === 404);
  await store.insertManagerAssignment({
    organizationId: ORG_A,
    managerUserId: MGR,
    reportUserId: REP_A,
    canMutateAccounts: true
  });
  const team = await svc.getTeam(manager);
  assert.equal(team.reports.some((r) => r.userId === REP_A), true);
  assert.equal(team.reports.some((r) => r.userId === REP_B), false);
  const mgrView = await svc.getTeamMemberPlan(manager, REP_A);
  assert.equal(mgrView.plan.userId, REP_A);
  await assert.rejects(() => svc.getTeamMemberPlan(manager, REP_B), (e) => e.status === 404);

  // 8. Cross-organization access is blocked
  await assert.rejects(() => svc.getTeamMemberPlan(admin, OTHER_ORG_REP), (e) => e.status === 404);
  const otherPlan = await svc.getMyPlan(otherOrg);
  assert.equal(otherPlan.plan.organizationId, ORG_B);
  await assert.rejects(() => svc.getAccountWorkspace(otherOrg, accountsA.accounts[0].id), (e) => e.status === 404);

  // 9. Inactive users receive no Sales Ops access
  await assert.rejects(
    () => svc.getMe(user(REP_A, "sales", ORG_A, { isActive: false })),
    (e) => e.status === 403
  );

  // 10. Users without sales_ops head access are blocked at middleware (source contract)
  assert.ok(apiSrc.includes('requireHeadAccess(SALES_OPS_HEAD_SLUG'));

  // 11. Monday token/secrets absent from frontend output (checked above + constants)
  const constantsSrc = readFileSync(fileURLToPath(new URL("./salesOpsConstants.js", import.meta.url)), "utf8");
  assert.ok(!constantsSrc.includes("MONDAY_API_TOKEN"));

  // 15. Monday ownership change A → B removes A visibility and grants B
  monday.items.set("item-a", {
    ...monday.items.get("item-a"),
    column_values: [peopleCol("1002"), { id: "status", text: "Active", type: "status", value: "{}" }]
  });
  await svc.syncMonday(admin);
  const afterA = await svc.getMyAccounts(alex);
  const afterB = await svc.getMyAccounts(blake);
  assert.equal(afterA.accounts.some((a) => a.mondayItemId === "item-a"), false);
  assert.equal(afterB.accounts.some((a) => a.mondayItemId === "item-a"), true);

  // 16. Webhook processing is idempotent
  const hook1 = await svc.processWebhook({
    organizationId: ORG_A,
    eventId: "evt-1",
    eventType: "change_column_value",
    itemId: "item-b"
  });
  const hook2 = await svc.processWebhook({
    organizationId: ORG_A,
    eventId: "evt-1",
    eventType: "change_column_value",
    itemId: "item-b"
  });
  assert.equal(hook1.duplicate, false);
  assert.equal(hook2.duplicate, true);

  // 17. eliteOS-originated Monday changes do not create sync loops (webhook updates mirror only)
  const beforeWrites = monday.writes.length;
  monday.items.set("item-b", {
    ...monday.items.get("item-b"),
    updates: [{ id: "u1", text_body: "hello", created_at: new Date().toISOString(), creator: { name: "Alex" } }]
  });
  const echo = await svc.processWebhook({
    organizationId: ORG_A,
    eventId: "evt-echo",
    eventType: "change_column_value",
    itemId: "item-a"
  });
  assert.ok(echo.ok);
  assert.equal(monday.writes.filter((w) => w.type === "change").length, monday.writes.filter((w) => w.type === "change").length);
  assert.equal(monday.writes.length, beforeWrites);

  // JWT challenge helpers
  const jwt = signHs256Jwt({ exp: Math.floor(Date.now() / 1000) + 60, aud: "https://example.test" }, "sentinel-signing-secret");
  assert.equal(verifyHs256Jwt(jwt, "sentinel-signing-secret").ok, true);
  assert.equal(verifyHs256Jwt(jwt, "wrong").ok, false);

  // Commission isolation
  await store.updatePlan(ORG_A, planA.plan.id, { commissionEnabled: true });
  await store.upsertCommissionSnapshot({
    organizationId: ORG_A,
    userId: REP_A,
    snapshotKey: "default",
    payload: { estimated: 12, accounts: [{ accountId: "sentinel-1", accountName: "Sentinel Account Alpha" }] }
  });
  const commA = await svc.getMyCommission(alex);
  const commB = await svc.getMyCommission(blake);
  assert.equal(commA.enabled, true);
  assert.equal(commB.enabled, false);
  assert.equal(JSON.stringify(commB.snapshot || {}), "{}");

  // Unmapped Monday owner is hidden from both reps
  monday.items.set("item-unmapped", {
    id: "item-unmapped",
    name: "Unmapped House",
    column_values: [peopleCol("9999")],
    updates: []
  });
  await svc.syncMonday(admin);
  const stillA = await svc.getMyAccounts(alex);
  assert.equal(stillA.accounts.some((a) => a.mondayItemId === "item-unmapped"), false);

  await runPlanLifecycleTests();

  console.log("salesOps.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
