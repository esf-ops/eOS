/**
 * Sales Ops Brain service — authorization + plan/account/Monday operations.
 * Identity is always the authenticated user. Browser-supplied user/plan/org IDs are ignored.
 */

import { createHash } from "node:crypto";
import {
  PATCHABLE_ACCOUNT_FIELDS,
  PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY,
  SCORECARD_FIELDS,
  firstNameFromFullName,
  isOrgAdminRole
} from "./salesOpsConstants.js";
import { SalesOpsError } from "./salesOpsPlanLifecycle.mjs";
import { blankScorecard, computeProgress } from "./salesOpsProgress.mjs";
import {
  canPublishPlans,
  createPlanAdmin,
  loadPlanBundle,
  resolveEffectivePlan,
  resolvePlanForPeriod,
  snapshotPeriodTargets,
  REP_VISIBLE_STATUSES
} from "./salesOpsPlanAdmin.mjs";
import {
  SalesOpsMondayError,
  buildMondayColumnPayload,
  resolveColumnMapFromBoard
} from "./salesOpsMonday.mjs";
import {
  assertNoForbiddenDto,
  decodeListCursor,
  decodeOffsetCursor,
  encodeListCursor,
  encodeOffsetCursor,
  isMondayReadEnabled,
  isMondayWriteEnabled,
  parseHeavyLimit,
  parseListLimit,
  toAccountDetailDto,
  toAccountListDto,
  toAssetDto,
  toDocDto,
  toSubitemDto,
  toUpdateDto
} from "./salesOpsMondayMirror.mjs";
import { ingestIncrementalItem, runFullMondayReconcile } from "./salesOpsMondayReconcile.mjs";
import { reprojectAccountsFromMirror } from "./salesOpsMondayBatch.mjs";
import { createReconcileProgress, reconcileStatusFromSyncState } from "./salesOpsMondayProgress.mjs";
import { previewExactPersonMappings } from "./salesOpsMondayPersonMap.mjs";
import { assembleTeamPerformance, assembleUserPerformance, loadIdentityAudit } from "./salesOpsPerformanceQuery.mjs";
import {
  approveIdentityReview,
  dtoIdentityReview,
  rebuildIdentityReviews,
  rejectIdentityReview
} from "./salesOpsIdentityReviewService.mjs";
import {
  COMMISSION_REPORT_STATUSES,
  COMPENSATION_BASES,
  dtoCompensationProposal,
  isCommissionReportLocked
} from "./salesOpsCompensation.mjs";

export { SalesOpsError };

const NOT_FOUND = () => new SalesOpsError("Not found", 404, "not_found");

function actorFromUser(user) {
  return {
    userId: String(user?.id ?? "").trim(),
    email: String(user?.email ?? "").trim(),
    fullName: String(user?.full_name ?? user?.fullName ?? "").trim(),
    role: String(user?.role ?? "").trim(),
    organizationId: String(user?.organization_id ?? user?.organizationId ?? "").trim(),
    isActive: user?.isActive !== false && user?.is_active !== false
  };
}

function assertActor(actor) {
  if (!actor?.userId) throw new SalesOpsError("Unauthorized", 401, "unauthorized");
  if (!actor.isActive) throw new SalesOpsError("You do not have access to this head.", 403, "inactive");
  if (!actor.organizationId) throw new SalesOpsError("Organization context is required.", 403, "no_org");
}

function mutationHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

export function createSalesOpsService({ store, monday, audit, now } = {}) {
  if (!store) throw new Error("createSalesOpsService: store required");
  const mondayClient = monday || null;
  const recordAudit = typeof audit === "function" ? audit : async () => {};
  const planAdmin = createPlanAdmin({ store, audit: recordAudit, now });

  async function canAccessUser(actor, targetUserId, { forCommission = false, forMutate = false } = {}) {
    assertActor(actor);
    const target = String(targetUserId ?? "").trim();
    if (!target) throw NOT_FOUND();
    if (target === actor.userId) {
      return { mode: "self", canViewCommission: true, canMutateAccounts: true };
    }
    if (isOrgAdminRole(actor.role)) {
      return { mode: "admin", canViewCommission: true, canMutateAccounts: true };
    }
    const assignment = await store.getManagerAssignment(actor.organizationId, actor.userId, target);
    if (!assignment) throw NOT_FOUND();
    if (forCommission && !assignment.canViewCommission) throw NOT_FOUND();
    if (forMutate && !assignment.canMutateAccounts) {
      throw new SalesOpsError("Not found", 404, "not_found");
    }
    return {
      mode: "manager",
      canViewCommission: Boolean(assignment.canViewCommission),
      canMutateAccounts: Boolean(assignment.canMutateAccounts)
    };
  }

  async function requireOwnedAccount(actor, accountId, { mutate = false } = {}) {
    assertActor(actor);
    const account = await store.getAccount(actor.organizationId, accountId);
    if (!account || account.archived) throw NOT_FOUND();
    const state = account.sourceState || "active";
    if (state !== "active") throw NOT_FOUND();
    if (account.assignedUserId === actor.userId) return { account, mode: "self" };
    if (isOrgAdminRole(actor.role)) return { account, mode: "admin" };
    if (account.assignedUserId) {
      const assignment = await store.getManagerAssignment(actor.organizationId, actor.userId, account.assignedUserId);
      if (assignment) {
        if (mutate && !assignment.canMutateAccounts) throw NOT_FOUND();
        return { account, mode: "manager" };
      }
    }
    throw NOT_FOUND();
  }

  async function seedPrototypeDraft({ organizationId, userId, createdBy, extras = {} }) {
    const actor = {
      userId: createdBy,
      role: extras.actorRole || "admin",
      organizationId
    };
    const bundle = await planAdmin.createDraft(actor, {
      userId,
      usePrototype: true,
      blueprintKey: PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY,
      planName: extras.planName,
      territoryName: extras.territoryName,
      fullName: extras.fullName,
      email: extras.email,
      headline: extras.headline,
      commissionEnabled: extras.commissionEnabled,
      features: extras.features,
      startDate: extras.startDate,
      endDate: extras.endDate,
      effectiveStartDate: extras.effectiveStartDate,
      effectiveEndDate: extras.effectiveEndDate
    });
    return bundle.plan;
  }

  async function publishSeededPlan(actor, planId, extras = {}) {
    await planAdmin.submitReview(actor, planId);
    await planAdmin.approvePlan(actor, planId);
    return planAdmin.publishPlan(actor, planId, extras);
  }

  async function loadEffectiveBundle(organizationId, userId, asOf) {
    const when = asOf ?? (typeof now === "function" ? now() : new Date());
    const plan = await resolveEffectivePlan(store, organizationId, userId, when);
    if (!plan) return null;
    return loadPlanBundle(store, organizationId, plan.id);
  }

  async function dtoMe(actor) {
    assertActor(actor);
    const bundle = await loadEffectiveBundle(actor.organizationId, actor.userId);
    const mondayCfg = await store.getMondayConfig(actor.organizationId);
    const mapping = await store.getRepMappingByUser(actor.organizationId, actor.userId);
    const reports = isOrgAdminRole(actor.role)
      ? []
      : await store.listReportsForManager(actor.organizationId, actor.userId);
    const first = firstNameFromFullName(actor.fullName, actor.email);
    const plan = bundle?.plan || null;
    const ack = plan ? await store.getAcknowledgement(actor.organizationId, plan.id, actor.userId) : null;
    const allPlans = await store.listPlansForUser(actor.organizationId, actor.userId);
    const upcoming = allPlans.find((p) => p.status === "approved" && p.id !== plan?.id) || null;
    return {
      user: {
        id: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
        firstName: first,
        role: actor.role
      },
      organizationId: actor.organizationId,
      access: {
        isOrgAdmin: isOrgAdminRole(actor.role),
        isManager: reports.length > 0,
        canAdministerPlans: isOrgAdminRole(actor.role) || reports.length > 0,
        canPublishPlans: canPublishPlans(actor.role)
      },
      plan: plan
        ? {
            id: plan.id,
            planFamilyId: plan.planFamilyId,
            versionNumber: plan.versionNumber,
            status: plan.status,
            planName: plan.planName,
            territoryName: plan.territoryName,
            startDate: plan.startDate,
            endDate: plan.endDate,
            effectiveStartDate: plan.effectiveStartDate,
            effectiveEndDate: plan.effectiveEndDate,
            northStarMetric: plan.northStarMetric,
            northStarTarget: plan.northStarTarget,
            northStarTargetDate: plan.northStarTargetDate,
            headline: plan.headline || `${first}'s path to ${Number(plan.northStarTarget).toLocaleString("en-US")} sq ft`,
            subtitle: plan.subtitle,
            blueprintKey: plan.blueprintKey,
            isPrototype: Boolean(plan.isPrototype),
            commissionEnabled: Boolean(plan.commissionEnabled),
            features: plan.features || {},
            acknowledgedAt: ack?.acknowledgedAt ?? null
          }
        : null,
      upcomingPlan: upcoming
        ? { id: upcoming.id, planName: upcoming.planName, effectiveStartDate: upcoming.effectiveStartDate, status: upcoming.status }
        : null,
      integration: {
        mondayConfigured: Boolean(mondayCfg?.accountMasterBoardId),
        mondayEnabled: Boolean(mondayCfg?.enabled),
        mondayReadEnabled: isMondayReadEnabled(mondayCfg),
        mondayWriteEnabled: isMondayWriteEnabled(mondayCfg),
        lastFullSyncAt: mondayCfg?.lastFullSyncAt ?? null,
        lastFullReconcileAt: mondayCfg?.lastFullReconcileAt ?? null,
        lastWebhookAt: mondayCfg?.lastWebhookAt ?? null,
        lastSuccessAt: mondayCfg?.lastSuccessAt ?? null,
        lastError: mondayCfg?.lastError ?? null,
        stale: mondayCfg?.lastSuccessAt
          ? Date.now() - new Date(mondayCfg.lastSuccessAt).getTime() > 36 * 60 * 60 * 1000
          : !mondayCfg?.lastSuccessAt,
        repMapped: Boolean(mapping)
      }
    };
  }

  function assertWritesEnabled(cfg) {
    if (!isMondayWriteEnabled(cfg)) {
      throw new SalesOpsError("Monday writes are disabled for this organization.", 409, "monday_writes_disabled");
    }
  }

  async function assignedScopeUserIds(actor) {
    if (isOrgAdminRole(actor.role)) return null;
    const reports = await store.listReportsForManager(actor.organizationId, actor.userId);
    return [actor.userId, ...reports.map((r) => r.reportUserId)];
  }

  async function loadGovernedColumns(organizationId, account) {
    if (typeof store.listMondayColumnValues !== "function") return [];
    return store.listMondayColumnValues(organizationId, account.mondayBoardId, account.mondayItemId);
  }

  return {
    actorFromUser,
    seedPrototypeDraft,
    seedCedarValleyPlan: seedPrototypeDraft,
    publishSeededPlan,
    planAdmin,

    async getMe(user) {
      return dtoMe(actorFromUser(user));
    },

    async getMyPlan(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      const bundle = await loadEffectiveBundle(actor.organizationId, actor.userId);
      if (!bundle) throw new SalesOpsError("No active sales plan is assigned.", 404, "no_plan");
      return bundle;
    },

    async getMyPerformance(user, { period = null, includeAccounts = false } = {}) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return assembleUserPerformance(store, {
        organizationId: actor.organizationId,
        userId: actor.userId,
        now: typeof now === "function" ? now() : now,
        period,
        includeAccounts
      });
    },

    async getScopedPerformance(user, targetUserId, { period = null, includeAccounts = false } = {}) {
      const actor = actorFromUser(user);
      await canAccessUser(actor, targetUserId);
      return assembleUserPerformance(store, {
        organizationId: actor.organizationId,
        userId: String(targetUserId),
        now: typeof now === "function" ? now() : now,
        period,
        includeAccounts
      });
    },

    async getTeamPerformance(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      let userIds;
      let plans = null;
      let mappings = [];
      if (isOrgAdminRole(actor.role)) {
        const [orgPlans, mapRows] = await Promise.all([
          store.listPlansForOrg(actor.organizationId),
          typeof store.listRepMappings === "function" ? store.listRepMappings(actor.organizationId) : []
        ]);
        plans = orgPlans;
        mappings = mapRows || [];
        userIds = [...new Set([...orgPlans.map((p) => p.userId), ...mappings.map((m) => m.userId)].filter(Boolean))];
      } else {
        const [reports, mapRows] = await Promise.all([
          store.listReportsForManager(actor.organizationId, actor.userId),
          typeof store.listRepMappings === "function" ? store.listRepMappings(actor.organizationId) : []
        ]);
        if (!reports.length) throw NOT_FOUND();
        mappings = mapRows || [];
        userIds = [actor.userId, ...reports.map((r) => r.reportUserId)];
      }
      const assembled = await assembleTeamPerformance(store, {
        organizationId: actor.organizationId,
        userIds,
        plans,
        now: typeof now === "function" ? now() : now
      });
      const labelByUser = new Map(mappings.map((m) => [String(m.userId), m.salespersonLabel || null]));
      return {
        ...assembled,
        rows: (assembled.rows || []).map((row) => ({
          ...row,
          displayName: labelByUser.get(String(row.userId)) || null
        }))
      };
    },

    async getIdentityAudit(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw NOT_FOUND();
      return loadIdentityAudit(store, actor.organizationId);
    },

    async rebuildIdentityReviews(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw NOT_FOUND();
      return rebuildIdentityReviews(store, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        autoCommit: true
      });
    },

    async listIdentityReviews(user, { status = null } = {}) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw NOT_FOUND();
      const [rows, accounts] = await Promise.all([
        store.listIdentityReviews(actor.organizationId, { status }),
        store.listAccountIdentityRows(actor.organizationId)
      ]);
      const byId = new Map(accounts.map((a) => [a.id, a]));
      return rows.map((row) => dtoIdentityReview(row, byId.get(row.salesOpsAccountId)));
    },

    async approveIdentityReview(user, reviewId, payload = {}) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw NOT_FOUND();
      const review = await store.getIdentityReview(actor.organizationId, String(reviewId));
      if (!review) throw NOT_FOUND();
      let updated;
      try {
        updated = await approveIdentityReview(store, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          review,
          accountDirectoryAccountId: payload.accountDirectoryAccountId,
          reason: payload.reason || "human_approved_shown_candidate"
        });
      } catch (e) {
        if (e instanceof SalesOpsError) throw e;
        if (e.code === "monday_link_conflict") {
          throw new SalesOpsError(e.message || "Monday item is already linked.", 409, "monday_link_conflict");
        }
        throw e;
      }
      const account = (await store.listAccountIdentityRows(actor.organizationId)).find(
        (a) => a.id === updated.salesOpsAccountId
      );
      return dtoIdentityReview(updated, account);
    },

    async rejectIdentityReview(user, reviewId, payload = {}) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw NOT_FOUND();
      const review = await store.getIdentityReview(actor.organizationId, String(reviewId));
      if (!review) throw NOT_FOUND();
      const updated = await rejectIdentityReview(store, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        review,
        reason: payload.reason || "rejected"
      });
      return dtoIdentityReview(updated);
    },

    async getCompensationConfig(user, { admin = false } = {}) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (admin && !isOrgAdminRole(actor.role)) throw NOT_FOUND();
      const [proposals, reports, commissionable] = await Promise.all([
        typeof store.listCompensationProposals === "function" ? store.listCompensationProposals(actor.organizationId) : [],
        typeof store.listCommissionReports === "function" ? store.listCommissionReports(actor.organizationId, admin ? null : actor.userId) : [],
        typeof store.listCommissionableAccounts === "function"
          ? store.listCommissionableAccounts(actor.organizationId, admin ? null : actor.userId)
          : []
      ]);
      const visibleProposals = (proposals || [])
        .filter((row) => admin || !row.userId || String(row.userId) === String(actor.userId))
        .map(dtoCompensationProposal);
      return {
        finallyApproved: visibleProposals.some((p) => p.finallyApproved),
        bases: COMPENSATION_BASES,
        workflow: COMMISSION_REPORT_STATUSES,
        proposals: visibleProposals,
        reports: (reports || []).map((row) => ({
          id: row.id,
          userId: row.userId,
          period: row.period,
          status: row.status,
          eligibleSf: row.eligibleSf == null ? null : Number(row.eligibleSf),
          amount: row.amount == null ? null : Number(row.amount),
          locked: isCommissionReportLocked(row.status)
        })),
        commissionableAccountCount: (commissionable || []).filter((r) => r.eligible !== false).length,
        note: "Proposal compensation values are not payable until finally approved. Locked or paid reports never silently recalculate."
      };
    },

    async listAdminPeople(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) {
        const reports = await store.listReportsForManager(actor.organizationId, actor.userId);
        if (!reports.length) throw NOT_FOUND();
      }
      const mappings = typeof store.listRepMappings === "function" ? await store.listRepMappings(actor.organizationId) : [];
      return mappings.map((m) => ({
        userId: m.userId,
        mondayUserId: m.mondayUserId,
        salespersonLabel: m.salespersonLabel || null
      }));
    },

    async generateAdminRamp(user, planId, payload) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.generateRamp(actor, planId, payload || {});
    },

    async getMyPlanHistory(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      const rows = await store.listPlansForUser(actor.organizationId, actor.userId);
      return rows.filter((p) => REP_VISIBLE_STATUSES.includes(p.status));
    },

    async acknowledgeMyPlan(user, planId) {
      const actor = actorFromUser(user);
      assertActor(actor);
      const plan = await store.getPlanById(actor.organizationId, String(planId));
      if (!plan || plan.userId !== actor.userId) throw NOT_FOUND();
      if (!["active", "approved"].includes(plan.status) || !plan.publishedAt) throw NOT_FOUND();
      const ack = await store.upsertAcknowledgement({
        organizationId: actor.organizationId,
        planId: plan.id,
        userId: actor.userId
      });
      await recordAudit({
        actionType: "sales_ops_plan_acknowledged",
        entityType: "sales_ops_plan",
        entityId: plan.id
      });
      return ack;
    },

    async getMyProgress(user) {
      const actor = actorFromUser(user);
      const bundle = await loadEffectiveBundle(actor.organizationId, actor.userId);
      if (!bundle) throw new SalesOpsError("No active sales plan is assigned.", 404, "no_plan");
      const scorecards = await store.listScorecards(actor.organizationId, actor.userId);
      const ramp = scorecards.map((c) => {
        const snap = c.targetSnapshot && c.targetSnapshot.installedTarget != null ? c.targetSnapshot : null;
        const fromPlan = bundle.periodTargets.find((r) => r.period === c.period);
        return snap
          ? { period: c.period, ...snap }
          : fromPlan || bundle.periodTargets[0];
      });
      return {
        plan: bundle.plan,
        periodTargets: bundle.periodTargets,
        metricTargets: bundle.metricTargets,
        scorecards,
        progress: computeProgress(ramp.length ? ramp : bundle.periodTargets, scorecards)
      };
    },

    async getMyScorecards(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return store.listScorecards(actor.organizationId, actor.userId);
    },

    async putMyScorecard(user, period, values) {
      const actor = actorFromUser(user);
      assertActor(actor);
      const p = String(period ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(p)) throw new SalesOpsError("Invalid period.", 400, "invalid_period");
      const existing = (await store.listScorecards(actor.organizationId, actor.userId)).find((c) => c.period === p);
      const version =
        existing?.planId
          ? await store.getPlanById(actor.organizationId, existing.planId)
          : await resolvePlanForPeriod(store, actor.organizationId, actor.userId, p);
      if (!version || version.status === "draft") {
        throw new SalesOpsError("No active sales plan is assigned.", 404, "no_plan");
      }
      const periodTargets = await store.listPeriodTargets(actor.organizationId, version.id);
      const snapshot = existing?.targetSnapshot?.installedTarget != null
        ? existing.targetSnapshot
        : { ...snapshotPeriodTargets(periodTargets, p), northStarTarget: version.northStarTarget, planVersion: version.versionNumber };
      const blank = blankScorecard(p);
      const next = { ...blank };
      for (const field of SCORECARD_FIELDS) {
        if (field === "period") continue;
        if (values && Object.prototype.hasOwnProperty.call(values, field)) {
          next[field] = field === "note" ? String(values[field] ?? "") : Number(values[field] ?? 0);
        }
      }
      const sources = { ...(values?.sources && typeof values.sources === "object" ? values.sources : {}) };
      for (const field of SCORECARD_FIELDS) {
        if (field === "period" || field === "note") continue;
        if (!sources[field]) sources[field] = "manual";
      }
      const saved = await store.upsertScorecard({
        organizationId: actor.organizationId,
        planId: existing?.planId || version.id,
        userId: actor.userId,
        period: p,
        installed: next.installed,
        pipeline: next.pipeline,
        quoted: next.quoted,
        awarded: next.awarded,
        touches: next.touches,
        meetings: next.meetings,
        opportunities: next.opportunities,
        followUp: next.followUp,
        repeatShare: next.repeatShare,
        note: next.note,
        sources,
        targetSnapshot: snapshot,
        createdBy: actor.userId
      });
      await recordAudit({
        actionType: "sales_ops_scorecard_update",
        entityType: "sales_ops_scorecard",
        entityId: saved.id,
        metadata: { period: p }
      });
      return saved;
    },

    async getMyAccounts(user, query = {}) {
      const actor = actorFromUser(user);
      assertActor(actor);
      const limit = parseListLimit(query.limit);
      const cursor = decodeListCursor(query.cursor);
      const assignedUserIds = await assignedScopeUserIds(actor);
      const page = typeof store.listAccountsPage === "function"
        ? await store.listAccountsPage(actor.organizationId, { assignedUserIds, limit, cursor })
        : { rows: await store.listAccountsForUser(actor.organizationId, actor.userId), hasMore: false };
      const accounts = page.rows.map(toAccountListDto);
      accounts.forEach((a) => assertNoForbiddenDto(a, "accountList"));
      const last = page.rows[page.rows.length - 1];
      return {
        accounts,
        nextCursor: page.hasMore && last ? encodeListCursor(last.accountName, last.id) : null,
        limit
      };
    },

    async getMyActivities(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return store.listActivitiesForUser(actor.organizationId, actor.userId);
    },

    async getMyCommission(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      const compensation = await this.getCompensationConfig(user, { admin: false });
      const plan = await store.getActivePlan(actor.organizationId, actor.userId);
      if (!plan?.commissionEnabled) {
        return { enabled: false, reason: "commission_not_enabled", compensation };
      }
      const snapshot = await store.getCommissionSnapshot(actor.organizationId, actor.userId, "default");
      return { enabled: true, snapshot, compensation };
    },

    async getAccountWorkspace(user, accountId) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId);
      const intel = await store.getIntelligence(actor.organizationId, account.id);
      const columns = await loadGovernedColumns(actor.organizationId, account);
      const dto = toAccountDetailDto(account, { columns, description: account.description ?? null });
      assertNoForbiddenDto(dto, "accountDetail");
      return { account: dto, intelligence: intel };
    },

    async getAccountSubitems(user, accountId, query = {}) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId);
      const limit = parseHeavyLimit(query.limit);
      const offset = decodeOffsetCursor(query.cursor);
      const items = await store.listMondayItems(actor.organizationId, {
        parentMondayItemId: String(account.mondayItemId),
        itemKind: "subitem"
      });
      const slice = items.slice(offset, offset + limit);
      const subitems = [];
      for (const item of slice) {
        const columns = await store.listMondayColumnValues(actor.organizationId, item.mondayBoardId, item.mondayItemId);
        subitems.push(toSubitemDto(item, columns));
      }
      subitems.forEach((s) => assertNoForbiddenDto(s, "subitem"));
      return {
        subitems,
        nextCursor: items.length > offset + limit ? encodeOffsetCursor(offset + limit) : null,
        limit
      };
    },

    async getAccountUpdates(user, accountId, query = {}) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId);
      const limit = parseHeavyLimit(query.limit);
      const offset = decodeOffsetCursor(query.cursor);
      const page = await store.listMondayUpdatesPage(actor.organizationId, account.mondayItemId, { limit, offset });
      const updates = page.rows.map(toUpdateDto);
      updates.forEach((u) => assertNoForbiddenDto(u, "update"));
      return {
        updates,
        nextCursor: page.hasMore ? encodeOffsetCursor(offset + limit) : null,
        limit
      };
    },

    async getAccountFiles(user, accountId, query = {}) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId);
      const limit = parseHeavyLimit(query.limit);
      const offset = decodeOffsetCursor(query.cursor);
      const page = await store.listMondayAssetsPage(actor.organizationId, account.mondayItemId, { limit, offset });
      const files = page.rows.map(toAssetDto);
      files.forEach((f) => assertNoForbiddenDto(f, "file"));
      return {
        files,
        nextCursor: page.hasMore ? encodeOffsetCursor(offset + limit) : null,
        limit
      };
    },

    async getAccountFile(user, accountId, assetId) {
      const actor = actorFromUser(user);
      await requireOwnedAccount(actor, accountId);
      const asset = await store.getMondayAsset(actor.organizationId, assetId);
      if (!asset) throw NOT_FOUND();
      throw new SalesOpsError("Authenticated Monday asset fetch is not enabled.", 409, "asset_fetch_not_enabled");
    },

    async getAccountDocs(user, accountId, query = {}) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId);
      const limit = parseHeavyLimit(query.limit);
      const offset = decodeOffsetCursor(query.cursor);
      const page = await store.listMondayDocs(actor.organizationId, {
        mondayItemId: account.mondayItemId,
        limit,
        offset
      });
      const docs = page.rows.map(toDocDto);
      docs.forEach((d) => assertNoForbiddenDto(d, "doc"));
      return {
        docs,
        nextCursor: page.hasMore ? encodeOffsetCursor(offset + limit) : null,
        limit
      };
    },

    async getAccountActivity(user, accountId, query = {}) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId);
      const limit = parseHeavyLimit(query.limit);
      const offset = decodeOffsetCursor(query.cursor);
      const rows = await store.listActivitiesForAccount(actor.organizationId, account.id);
      const slice = rows.slice(offset, offset + limit);
      return {
        activities: slice.map((a) => ({
          id: a.id,
          eventType: a.eventType,
          source: a.source,
          occurredAt: a.occurredAt,
          summary: a.summary,
          author: a.payload?.author ?? null
        })),
        nextCursor: rows.length > offset + limit ? encodeOffsetCursor(offset + limit) : null,
        limit
      };
    },

    async patchAccount(user, accountId, patch) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId, { mutate: true });
      const mondayCfg = await store.getMondayConfig(actor.organizationId);
      if (!mondayCfg?.accountMasterBoardId) {
        throw new SalesOpsError("Monday Sales Ops is not configured for this organization.", 409, "configuration_needed");
      }
      assertWritesEnabled(mondayCfg);
      const semantic = {};
      for (const field of PATCHABLE_ACCOUNT_FIELDS) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, field)) semantic[field] = patch[field];
      }
      if (!Object.keys(semantic).length) throw new SalesOpsError("No allowed fields to update.", 400, "no_fields");
      if (patch && Object.keys(patch).some((k) => k.toLowerCase().includes("column") && !PATCHABLE_ACCOUNT_FIELDS.includes(k))) {
        throw new SalesOpsError("Raw Monday column IDs are not accepted.", 400, "invalid_fields");
      }
      const { columnValues, skipped } = buildMondayColumnPayload(semantic, mondayCfg.columnMap || {});
      if (!Object.keys(columnValues).length) {
        throw new SalesOpsError("Mapped Monday columns are not configured for the requested fields.", 409, "configuration_needed");
      }
      if (!mondayClient) throw new SalesOpsError("Monday client is unavailable.", 503, "monday_unavailable");
      try {
        await mondayClient.changeColumnValues(account.mondayBoardId, account.mondayItemId, columnValues);
      } catch (e) {
        await store.insertSyncLog({
          organizationId: actor.organizationId,
          direction: "eliteos_to_monday",
          entity: "account",
          mondayItemId: account.mondayItemId,
          operation: "patch_fields",
          outcome: "error",
          error: String(e?.message || e),
          actorUserId: actor.userId
        });
        throw new SalesOpsError("Monday did not accept the account update.", 502, "monday_write_failed");
      }
      const hash = mutationHash({ item: account.mondayItemId, columnValues });
      const refreshed = await store.upsertAccount({
        ...account,
        ...semantic,
        lastEliteosMutationHash: hash,
        lastEliteosMutationAt: new Date().toISOString(),
        syncedAt: new Date().toISOString()
      });
      await store.insertSyncLog({
        organizationId: actor.organizationId,
        direction: "eliteos_to_monday",
        entity: "account",
        mondayItemId: account.mondayItemId,
        operation: "patch_fields",
        outcome: "success",
        actorUserId: actor.userId,
        metadata: { skipped }
      });
      await recordAudit({
        actionType: "sales_ops_monday_account_patch",
        entityType: "sales_ops_account",
        entityId: account.id,
        metadata: { fields: Object.keys(semantic) }
      });
      return refreshed;
    },

    async addNote(user, accountId, body) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId, { mutate: true });
      const mondayCfg = await store.getMondayConfig(actor.organizationId);
      assertWritesEnabled(mondayCfg);
      const text = String(body ?? "").trim();
      if (!text) throw new SalesOpsError("Note body is required.", 400, "note_required");
      if (!mondayClient) throw new SalesOpsError("Monday client is unavailable.", 503, "monday_unavailable");
      let created;
      try {
        created = await mondayClient.createUpdate(account.mondayItemId, text);
      } catch (e) {
        await store.insertSyncLog({
          organizationId: actor.organizationId,
          direction: "eliteos_to_monday",
          entity: "note",
          mondayItemId: account.mondayItemId,
          operation: "create_update",
          outcome: "error",
          error: String(e?.message || e),
          actorUserId: actor.userId
        });
        throw new SalesOpsError("Monday did not accept the note.", 502, "monday_write_failed");
      }
      const activity = await store.insertActivity({
        organizationId: actor.organizationId,
        accountId: account.id,
        userId: actor.userId,
        eventType: "note",
        source: "monday_update",
        externalId: created?.id ? String(created.id) : `eliteos-note-${Date.now()}`,
        occurredAt: created?.created_at || new Date().toISOString(),
        summary: text,
        payload: { author: actor.fullName || actor.email }
      });
      await store.insertSyncLog({
        organizationId: actor.organizationId,
        direction: "eliteos_to_monday",
        entity: "note",
        mondayItemId: account.mondayItemId,
        mondayUpdateId: created?.id ? String(created.id) : null,
        operation: "create_update",
        outcome: "success",
        actorUserId: actor.userId
      });
      await recordAudit({
        actionType: "sales_ops_note_create",
        entityType: "sales_ops_account",
        entityId: account.id,
        metadata: { mondayItemId: account.mondayItemId, mondayUpdateId: created?.id ?? null }
      });
      return { activity, mondayUpdateId: created?.id ?? null };
    },

    async upsertFollowUp(user, accountId, payload) {
      const actor = actorFromUser(user);
      const { account } = await requireOwnedAccount(actor, accountId, { mutate: true });
      const summary = String(payload?.summary ?? "").trim();
      const nextContact = String(payload?.nextContact ?? payload?.dueAt ?? "").trim();
      if (!summary) throw new SalesOpsError("Follow-up summary is required.", 400, "followup_required");
      const mondayCfg = await store.getMondayConfig(actor.organizationId);
      const hasNext = mondayCfg?.columnMap?.nextContact?.columnId;
      if (!hasNext) {
        return {
          configurationNeeded: true,
          message: "Follow-up dates require a mapped Next Contact column on the Account Master List. A dedicated Sales Activities board was not created."
        };
      }
      const updated = await this.patchAccount(user, accountId, {
        nextContact: nextContact || account.nextContact,
        nextStrategicMilestone: summary
      });
      await store.insertActivity({
        organizationId: actor.organizationId,
        accountId: account.id,
        userId: actor.userId,
        eventType: "follow_up",
        source: "eliteos",
        occurredAt: new Date().toISOString(),
        status: payload?.status || "open",
        summary,
        payload: { nextContact, convertedFromRecommendation: Boolean(payload?.fromRecommendation) }
      });
      await recordAudit({
        actionType: "sales_ops_followup_upsert",
        entityType: "sales_ops_account",
        entityId: account.id,
        metadata: { nextContact }
      });
      return { configurationNeeded: false, account: updated };
    },

    async getTeam(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (isOrgAdminRole(actor.role)) {
        const plans = await store.listPlansForOrg(actor.organizationId);
        return { mode: "admin", reports: plans.map((p) => ({ userId: p.userId, planId: p.id, planName: p.planName, active: p.active })) };
      }
      const assignments = await store.listReportsForManager(actor.organizationId, actor.userId);
      const reports = [];
      for (const a of assignments) {
        const plan = await store.getActivePlan(actor.organizationId, a.reportUserId);
        reports.push({
          userId: a.reportUserId,
          planId: plan?.id ?? null,
          planName: plan?.planName ?? null,
          canViewCommission: Boolean(a.canViewCommission),
          canMutateAccounts: Boolean(a.canMutateAccounts)
        });
      }
      return { mode: "manager", reports };
    },

    async getTeamMemberPlan(user, targetUserId) {
      const actor = actorFromUser(user);
      await canAccessUser(actor, targetUserId);
      const bundle = await loadEffectiveBundle(actor.organizationId, String(targetUserId));
      if (!bundle) throw NOT_FOUND();
      const scorecards = await store.listScorecards(actor.organizationId, String(targetUserId));
      const accounts = await store.listAccountsForUser(actor.organizationId, String(targetUserId));
      return {
        plan: bundle.plan,
        periodTargets: bundle.periodTargets,
        metricTargets: bundle.metricTargets,
        progress: computeProgress(bundle.periodTargets, scorecards),
        scorecards,
        accounts
      };
    },

    async createPlanForUser(user, payload) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.createDraft(actor, payload);
    },

    async listAdminPlans(user, filters) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.listAdminPlans(actor, filters);
    },
    async getAdminPlan(user, planId) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.getAdminPlan(actor, planId);
    },
    async previewAdminPlan(user, planId) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.previewPlan(actor, planId);
    },
    async updateAdminPlan(user, planId, payload) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.updateDraft(actor, planId, payload);
    },
    async submitAdminPlan(user, planId) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.submitReview(actor, planId);
    },
    async approveAdminPlan(user, planId) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.approvePlan(actor, planId);
    },
    async publishAdminPlan(user, planId, payload) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.publishPlan(actor, planId, payload);
    },
    async reviseAdminPlan(user, planId) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.revisePlan(actor, planId);
    },
    async archiveAdminPlan(user, planId) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.archivePlan(actor, planId);
    },
    async listPlanTemplates(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.listTemplates(actor);
    },
    async updatePlanTemplate(user, templateId, payload) {
      const actor = actorFromUser(user);
      assertActor(actor);
      return planAdmin.updateTemplate(actor, templateId, payload);
    },

    async assignManager(user, payload) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw new SalesOpsError("You do not have access to this head.", 403, "forbidden");
      const rec = await store.insertManagerAssignment({
        organizationId: actor.organizationId,
        managerUserId: String(payload.managerUserId),
        reportUserId: String(payload.reportUserId),
        canViewCommission: Boolean(payload.canViewCommission),
        canMutateAccounts: Boolean(payload.canMutateAccounts),
        createdBy: actor.userId
      });
      await recordAudit({
        actionType: "sales_ops_manager_assignment",
        entityType: "sales_ops_manager_assignment",
        entityId: rec.id,
        metadata: { managerUserId: rec.managerUserId, reportUserId: rec.reportUserId }
      });
      return rec;
    },

    async syncMonday(user, { mode = "full" } = {}) {
      const actor = user ? actorFromUser(user) : null;
      const organizationId = actor?.organizationId;
      if (!organizationId) throw new SalesOpsError("Organization context is required.", 403, "no_org");
      if (actor) {
        assertActor(actor);
        if (!isOrgAdminRole(actor.role)) throw new SalesOpsError("You do not have access to this head.", 403, "forbidden");
      }
      const cfg = await store.getMondayConfig(organizationId);
      if (!cfg?.accountMasterBoardId) {
        throw new SalesOpsError("Account Master List board is not configured.", 409, "configuration_needed");
      }
      if (!isMondayReadEnabled(cfg)) {
        throw new SalesOpsError("Monday read sync is disabled for this organization.", 409, "monday_read_disabled");
      }
      if (mode === "reproject") {
        return reprojectAccountsFromMirror(store, { organizationId, cfg });
      }
      if (!mondayClient) throw new SalesOpsError("Monday client is unavailable.", 503, "monday_unavailable");
      try {
        const board = await mondayClient.inspectBoard(cfg.accountMasterBoardId);
        const columnMap = resolveColumnMapFromBoard(board?.columns || [], cfg.columnMap || {});
        await store.upsertMondayConfig({ ...cfg, organizationId, columnMap });
        return await runFullMondayReconcile(store, mondayClient, {
          organizationId,
          cfg: { ...cfg, columnMap, organizationId },
          actorUserId: actor?.userId ?? null,
          markUnseen: true,
          parentBoard: board
        });
      } catch (e) {
        if (e instanceof SalesOpsError) throw e;
        throw new SalesOpsError("Monday sync failed.", 502, "monday_sync_failed");
      }
    },

    async reprojectAccounts(user, { mondayPersonIds = null } = {}) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw new SalesOpsError("You do not have access to this head.", 403, "forbidden");
      const cfg = await store.getMondayConfig(actor.organizationId);
      if (!cfg?.accountMasterBoardId) {
        throw new SalesOpsError("Account Master List board is not configured.", 409, "configuration_needed");
      }
      const boardId = String(cfg.accountMasterBoardId);
      const progress = createReconcileProgress({
        store,
        organizationId: actor.organizationId,
        mondayBoardId: boardId,
        syncMode: "reproject"
      });
      await progress.start();
      await progress.setStage("projection");
      try {
        const result = await reprojectAccountsFromMirror(store, {
          organizationId: actor.organizationId,
          cfg,
          mondayPersonIds,
          progress
        });
        const snapshot = await progress.complete({
          projectionProcessed: result.written,
          projectionTotal: result.parents
        });
        await store.insertSyncLog({
          organizationId: actor.organizationId,
          direction: "monday_to_eliteos",
          entity: "account",
          operation: "reproject",
          outcome: "success",
          actorUserId: actor.userId,
          metadata: { written: result.written, runId: progress.runId, elapsedMs: result.elapsedMs }
        });
        return { ...result, progress: snapshot, writeEnabled: isMondayWriteEnabled(cfg), readEnabled: isMondayReadEnabled(cfg) };
      } catch (e) {
        await progress.fail(e);
        throw e;
      }
    },

    async getReconcileStatus(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw new SalesOpsError("You do not have access to this head.", 403, "forbidden");
      const cfg = await store.getMondayConfig(actor.organizationId);
      const boardId = cfg?.accountMasterBoardId ? String(cfg.accountMasterBoardId) : "";
      const state =
        boardId && typeof store.getMondaySyncState === "function"
          ? (await store.getMondaySyncState(actor.organizationId, boardId, "full")) ||
            (await store.getMondaySyncState(actor.organizationId, boardId, "reproject"))
          : null;
      const reconcile = reconcileStatusFromSyncState(state);
      return {
        writeEnabled: isMondayWriteEnabled(cfg),
        readEnabled: isMondayReadEnabled(cfg),
        reconcile
      };
    },

    async previewMondayPersonMappings(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw new SalesOpsError("You do not have access to this head.", 403, "forbidden");
      const assigned =
        typeof store.listDistinctMondayAssignedUserIds === "function"
          ? await store.listDistinctMondayAssignedUserIds(actor.organizationId)
          : [];
      let mondayPeople = typeof store.listMondayUsers === "function" ? await store.listMondayUsers(actor.organizationId) : [];
      if (mondayClient?.listUsers) {
        const live = await mondayClient.listUsers();
        const byId = new Map(mondayPeople.map((p) => [String(p.mondayUserId), p]));
        for (const u of live || []) {
          const id = String(u.id);
          const prev = byId.get(id) || { mondayUserId: id, kind: "person" };
          byId.set(id, {
            ...prev,
            mondayUserId: id,
            kind: "person",
            displayName: u.name || prev.displayName || null,
            email: u.email || prev.email || null
          });
        }
        mondayPeople = [...byId.values()];
        if (typeof store.upsertMondayUsersBatch === "function") {
          await store.upsertMondayUsersBatch(
            mondayPeople.map((p) => ({
              organizationId: actor.organizationId,
              mondayUserId: p.mondayUserId,
              kind: p.kind || "person",
              displayName: p.displayName || null,
              email: p.email || null,
              lastSeenAt: new Date().toISOString()
            }))
          );
        }
      }
      const eliteOsUsers =
        typeof store.listActiveOrganizationUsers === "function"
          ? await store.listActiveOrganizationUsers(actor.organizationId)
          : [];
      const existingMappings =
        typeof store.listRepMappings === "function" ? await store.listRepMappings(actor.organizationId) : [];
      const preview = previewExactPersonMappings({
        mondayPeople,
        eliteOsUsers,
        existingMappings,
        assignedMondayPersonIds: assigned
      });
      return {
        people: preview.results.map((r) => ({
          mondayPersonId: r.mondayPersonId,
          eliteosUserId: r.eliteosUserId,
          status: r.status,
          matchBasis: r.matchBasis,
          applied: r.applied
        })),
        exactApplyableCount: preview.exactApplyable.length,
        unmatchedCount: preview.unmatched.length,
        ambiguousCount: preview.ambiguous.length
      };
    },

    async applyMondayPersonMappings(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) throw new SalesOpsError("You do not have access to this head.", 403, "forbidden");
      const preview = await this.previewMondayPersonMappings(user);
      const applyable = preview.people.filter((p) => p.status === "EXACT" && !p.applied && p.eliteosUserId);
      const applied = [];
      for (const row of applyable) {
        await store.upsertRepMapping({
          organizationId: actor.organizationId,
          userId: row.eliteosUserId,
          mondayUserId: row.mondayPersonId,
          salespersonLabel: null,
          active: true
        });
        applied.push({
          mondayPersonId: row.mondayPersonId,
          eliteosUserId: row.eliteosUserId,
          status: "EXACT",
          matchBasis: row.matchBasis,
          applied: true
        });
      }
      let reproject = null;
      if (applied.length) {
        reproject = await this.reprojectAccounts(user, {
          mondayPersonIds: applied.map((a) => a.mondayPersonId)
        });
      }
      return {
        applied,
        skippedAmbiguous: preview.people.filter((p) => p.status === "AMBIGUOUS"),
        skippedUnmatched: preview.people.filter((p) => p.status === "UNMATCHED"),
        reproject
      };
    },

    async processWebhook({ organizationId, eventId, eventType, itemId, pulseId }) {
      const org = String(organizationId || "").trim();
      if (!org) throw new SalesOpsError("organization required", 400, "no_org");
      const eid = String(eventId || `${eventType || "event"}:${itemId || pulseId || Date.now()}`);
      const recorded = await store.recordWebhookEvent(org, eid, { eventType, mondayItemId: itemId || pulseId });
      if (recorded.duplicate) return { ok: true, duplicate: true };
      const cfg = await store.getMondayConfig(org);
      if (!cfg?.accountMasterBoardId) return { ok: true, skipped: "unconfigured" };
      if (!isMondayReadEnabled(cfg)) return { ok: true, skipped: "read_disabled" };
      await store.upsertMondayConfig({ organizationId: org, lastWebhookAt: new Date().toISOString() });
      const mondayItemId = String(itemId || pulseId || "").trim();
      if (!mondayItemId) return { ok: true, skipped: "no_item" };
      if (String(eventType || "").toLowerCase().includes("delete") || String(eventType || "").toLowerCase().includes("archive")) {
        await store.markAccountArchived(org, mondayItemId);
        const item = await store.getMondayItem?.(org, cfg.accountMasterBoardId, mondayItemId);
        if (item && store.upsertMondayItem) {
          await store.upsertMondayItem({ ...item, sourceState: "archived" });
        }
        return { ok: true, archived: true };
      }
      if (!mondayClient) return { ok: true, skipped: "no_client" };
      try {
        const result = await ingestIncrementalItem(store, mondayClient, {
          organizationId: org,
          cfg,
          itemId: mondayItemId
        });
        if (result.missing) {
          await store.markAccountArchived(org, mondayItemId);
          return { ok: true, archived: true };
        }
      } catch (e) {
        await store.insertSyncLog({
          organizationId: org,
          direction: "monday_to_eliteos",
          entity: "account",
          mondayItemId,
          operation: "webhook_refresh",
          outcome: "error",
          error: String(e?.message || e).slice(0, 500)
        });
        throw e;
      }
      await store.upsertMondayConfig({ organizationId: org, lastSuccessAt: new Date().toISOString(), lastError: null });
      return { ok: true, duplicate: false };
    },

    async integrationHealth(user) {
      const actor = actorFromUser(user);
      assertActor(actor);
      if (!isOrgAdminRole(actor.role)) {
        const cfg = await store.getMondayConfig(actor.organizationId);
        return {
          mondayEnabled: Boolean(cfg?.enabled),
          mondayReadEnabled: isMondayReadEnabled(cfg),
          mondayWriteEnabled: isMondayWriteEnabled(cfg),
          lastSuccessAt: cfg?.lastSuccessAt ?? null,
          lastFullReconcileAt: cfg?.lastFullReconcileAt ?? null,
          stale: Boolean(cfg?.lastSuccessAt) ? Date.now() - new Date(cfg.lastSuccessAt).getTime() > 36 * 60 * 60 * 1000 : true
        };
      }
      const cfg = await store.getMondayConfig(actor.organizationId);
      const stats = typeof store.countMondayMirrorStats === "function"
        ? await store.countMondayMirrorStats(actor.organizationId)
        : {};
      const stale = Boolean(cfg?.lastSuccessAt)
        ? Date.now() - new Date(cfg.lastSuccessAt).getTime() > 36 * 60 * 60 * 1000
        : true;
      const boardId = cfg?.accountMasterBoardId ? String(cfg.accountMasterBoardId) : "";
      const syncState =
        boardId && typeof store.getMondaySyncState === "function"
          ? await store.getMondaySyncState(actor.organizationId, boardId, "full")
          : null;
      return {
        parentBoardId: cfg?.accountMasterBoardId ?? null,
        subitemBoardId: cfg?.subitemBoardId ?? null,
        readEnabled: isMondayReadEnabled(cfg),
        writeEnabled: isMondayWriteEnabled(cfg),
        lastFullReconcileAt: cfg?.lastFullReconcileAt ?? cfg?.lastFullSyncAt ?? null,
        lastIncrementalEventAt: cfg?.lastWebhookAt ?? null,
        lastSuccessAt: cfg?.lastSuccessAt ?? null,
        lastError: cfg?.lastError ? String(cfg.lastError).slice(0, 500) : null,
        schemaInspectedAt: cfg?.schemaInspectedAt ?? null,
        mirrorItemCount: stats.mirrorItemCount ?? 0,
        linkedAccountDirectoryCount: stats.linkedAccountDirectoryCount ?? 0,
        unlinkedCount: stats.unlinkedCount ?? 0,
        unmappedMondayPeopleCount: stats.unmappedMondayPeopleCount ?? 0,
        stale,
        reconcile: reconcileStatusFromSyncState(syncState)
      };
    }
  };
}

export { SalesOpsMondayError };
