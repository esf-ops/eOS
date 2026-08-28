/**
 * Sales Ops plan admin: drafts, templates, review, publish, revisions.
 * Monday is never the plan authority.
 */

import { randomUUID } from "node:crypto";
import {
  PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY,
  PROTOTYPE_CEDAR_VALLEY_METRIC_TARGETS,
  PROTOTYPE_CEDAR_VALLEY_RAMP,
  firstNameFromFullName,
  isOrgAdminRole
} from "./salesOpsConstants.js";
import {
  asOfDateString,
  assertTransition,
  isMateriallyEditable,
  planCoversDate,
  planCoversPeriod,
  REP_VISIBLE_STATUSES,
  snapshotPeriodTargets,
  SalesOpsError
} from "./salesOpsPlanLifecycle.mjs";

const NOT_FOUND = () => new SalesOpsError("Not found", 404, "not_found");

function defaultInsights() {
  return {
    installed: {
      eyebrow: "01 / Result",
      title: "Credited installed square feet",
      lead: "Square feet count when the work is installed and credited under the plan’s rules."
    }
  };
}

export function canPublishPlans(role) {
  return isOrgAdminRole(role);
}

export function defaultPrototypeCopy() {
  return {
    introduction: "Prototype Cedar Valley operating plan (reference only).",
    expectations: "Customize territory, targets, and copy before review.",
    successDefinition: "Installed square feet credited under the signed rules.",
    coaching: "This blueprint is a starting template, not an approved production plan."
  };
}

export async function ensurePrototypeTemplate(store, { organizationId, createdBy }) {
  const existing = await store.getTemplateByKey(organizationId, PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY);
  if (existing) return existing;
  const tpl = await store.insertTemplate({
    organizationId,
    templateKey: PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY,
    templateName: "Prototype Cedar Valley sales plan (2026–2028)",
    active: true,
    isPrototype: true,
    defaultDurationMonths: 28,
    northStarMetric: "installed_sqft_per_month",
    northStarTarget: 2500,
    northStarTargetDate: "2028-12-31",
    territoryName: "Cedar Valley / 380 Corridor",
    commissionEnabled: false,
    createdBy
  });
  await store.replaceTemplatePeriodTargets(
    organizationId,
    tpl.id,
    PROTOTYPE_CEDAR_VALLEY_RAMP.map((r) => ({ ...r }))
  );
  await store.replaceTemplateMetricTargets(organizationId, tpl.id, [...PROTOTYPE_CEDAR_VALLEY_METRIC_TARGETS]);
  await store.upsertTemplateCopy(organizationId, tpl.id, "insights", defaultInsights());
  await store.upsertTemplateCopy(organizationId, tpl.id, "planCopy", defaultPrototypeCopy());
  return tpl;
}

async function copyContents(store, organizationId, fromPlanId, toPlanId) {
  const [periods, metrics, copies] = await Promise.all([
    store.listPeriodTargets(organizationId, fromPlanId),
    store.listMetricTargets(organizationId, fromPlanId),
    store.listPlanCopy(organizationId, fromPlanId)
  ]);
  if (periods.length) {
    await store.replacePeriodTargets(
      organizationId,
      toPlanId,
      periods.map((r) => ({
        period: r.period,
        label: r.label,
        year: r.year,
        installedTarget: r.installedTarget,
        rollingThreeMonthTarget: r.rollingThreeMonthTarget,
        qualifiedPipelineTarget: r.qualifiedPipelineTarget
      }))
    );
  }
  if (metrics.length) {
    await store.replaceMetricTargets(
      organizationId,
      toPlanId,
      metrics.map((m) => ({
        metricKey: m.metricKey,
        label: m.label,
        unit: m.unit,
        cadence: m.cadence,
        targetValue: m.targetValue,
        warningThreshold: m.warningThreshold,
        sourceAuthority: m.sourceAuthority,
        displayOrder: m.displayOrder,
        active: m.active
      }))
    );
  }
  for (const c of copies) {
    await store.upsertPlanCopy(organizationId, toPlanId, c.copyKey, c.payload);
  }
}

async function applyTemplateContents(store, organizationId, templateId, planId) {
  const [periods, metrics, copies] = await Promise.all([
    store.listTemplatePeriodTargets(organizationId, templateId),
    store.listTemplateMetricTargets(organizationId, templateId),
    store.listTemplateCopy(organizationId, templateId)
  ]);
  if (periods.length) {
    await store.replacePeriodTargets(
      organizationId,
      planId,
      periods.map((r) => ({
        period: r.period,
        label: r.label,
        year: r.year,
        installedTarget: r.installedTarget,
        rollingThreeMonthTarget: r.rollingThreeMonthTarget,
        qualifiedPipelineTarget: r.qualifiedPipelineTarget
      }))
    );
  }
  if (metrics.length) {
    await store.replaceMetricTargets(
      organizationId,
      planId,
      metrics.map((m) => ({
        metricKey: m.metricKey,
        label: m.label,
        unit: m.unit,
        cadence: m.cadence,
        targetValue: m.targetValue,
        warningThreshold: m.warningThreshold,
        sourceAuthority: m.sourceAuthority,
        displayOrder: m.displayOrder,
        active: m.active !== false
      }))
    );
  }
  for (const c of copies) {
    await store.upsertPlanCopy(organizationId, planId, c.copyKey, c.payload);
  }
}

export async function loadPlanBundle(store, organizationId, planId) {
  const plan = await store.getPlanById(organizationId, planId);
  if (!plan) return null;
  const [periodTargets, metricTargets, copies, events, ack] = await Promise.all([
    store.listPeriodTargets(organizationId, plan.id),
    store.listMetricTargets(organizationId, plan.id),
    store.listPlanCopy(organizationId, plan.id),
    store.listPlanEvents(organizationId, plan.id),
    store.getAcknowledgement(organizationId, plan.id, plan.userId)
  ]);
  const copyMap = Object.fromEntries((copies || []).map((c) => [c.copyKey, c.payload]));
  return {
    plan,
    periodTargets,
    metricTargets,
    insights: copyMap.insights || defaultInsights(),
    planCopy: copyMap.planCopy || {},
    events,
    acknowledgement: ack
  };
}

export async function resolveEffectivePlan(store, organizationId, userId, asOf, { promote = true } = {}) {
  const asOfDay = asOfDateString(asOf);
  const all = await store.listPlansForUser(organizationId, userId);
  const covering = all.filter(
    (p) => (p.status === "active" || p.status === "approved") && planCoversDate(p, asOfDay)
  );
  let chosen = covering.find((p) => p.status === "active") || covering[0] || null;
  if (promote && chosen?.status === "approved") {
    chosen = await promoteApprovedIfDue(store, chosen, asOfDay);
  }
  if (!chosen) {
    const active = all.find((p) => p.status === "active");
    if (active && planCoversDate(active, asOfDay)) return active;
  }
  return chosen;
}

async function promoteApprovedIfDue(store, plan, asOfDay) {
  if (plan.status !== "approved") return plan;
  if (!planCoversDate(plan, asOfDay)) return plan;
  const start = String(plan.effectiveStartDate || plan.startDate).slice(0, 10);
  if (start > asOfDay) return plan;
  const currentActive = await store.getActivePlan(plan.organizationId, plan.userId);
  if (currentActive && currentActive.id !== plan.id) {
    await store.updatePlan(plan.organizationId, currentActive.id, {
      status: "superseded",
      supersededByPlanId: plan.id,
      effectiveEndDate: start
    });
    await store.insertPlanEvent({
      organizationId: plan.organizationId,
      planId: currentActive.id,
      eventType: "superseded",
      metadata: { supersededBy: plan.id }
    });
  }
  const updated = await store.updatePlan(plan.organizationId, plan.id, {
    status: "active",
    publishedAt: plan.publishedAt || new Date().toISOString()
  });
  await store.insertPlanEvent({
    organizationId: plan.organizationId,
    planId: plan.id,
    eventType: "activated",
    metadata: { asOf: asOfDay }
  });
  return updated;
}

export async function resolvePlanForPeriod(store, organizationId, userId, period) {
  const all = await store.listPlansForUser(organizationId, userId);
  const historical = all.filter((p) =>
    ["active", "approved", "superseded"].includes(p.status) && planCoversPeriod(p, period)
  );
  historical.sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber));
  return historical[0] || null;
}

export function createPlanAdmin({ store, audit, now }) {
  const recordAudit = typeof audit === "function" ? audit : async () => {};
  const clock = () => (typeof now === "function" ? now() : new Date());

  async function assertCanAuthor(actor, targetUserId) {
    if (isOrgAdminRole(actor.role)) return { mode: "admin" };
    const assignment = await store.getManagerAssignment(actor.organizationId, actor.userId, targetUserId);
    if (!assignment) throw NOT_FOUND();
    return { mode: "manager" };
  }

  async function requirePlanForAuthor(actor, planId, { mutate = false } = {}) {
    const plan = await store.getPlanById(actor.organizationId, planId);
    if (!plan) throw NOT_FOUND();
    await assertCanAuthor(actor, plan.userId);
    if (mutate && !isMateriallyEditable(plan.status)) {
      throw new SalesOpsError("Published plans are immutable. Create a revision.", 409, "immutable_plan");
    }
    return plan;
  }

  async function emit(plan, eventType, actor, metadata = {}) {
    await store.insertPlanEvent({
      organizationId: plan.organizationId,
      planId: plan.id,
      eventType,
      actorUserId: actor?.userId ?? null,
      metadata
    });
    await recordAudit({
      actionType: `sales_ops_plan_${eventType}`,
      entityType: "sales_ops_plan",
      entityId: plan.id,
      metadata: { ...metadata, status: plan.status, userId: plan.userId }
    });
  }

  return {
    async listAdminPlans(actor, filters = {}) {
      let rows = await store.listPlansForOrg(actor.organizationId);
      if (!isOrgAdminRole(actor.role)) {
        const reports = await store.listReportsForManager(actor.organizationId, actor.userId);
        if (!reports.length) throw NOT_FOUND();
        const ids = new Set(reports.map((r) => r.reportUserId));
        rows = rows.filter((p) => ids.has(p.userId));
      }
      if (filters.userId) rows = rows.filter((p) => p.userId === filters.userId);
      if (filters.status) rows = rows.filter((p) => p.status === filters.status);
      if (filters.managerUserId) rows = rows.filter((p) => p.managerUserId === filters.managerUserId);
      if (filters.year) {
        rows = rows.filter((p) => String(p.effectiveStartDate || p.startDate).startsWith(String(filters.year)));
      }
      return rows;
    },

    async getAdminPlan(actor, planId) {
      const plan = await requirePlanForAuthor(actor, planId);
      return loadPlanBundle(store, actor.organizationId, plan.id);
    },

    async previewPlan(actor, planId) {
      const bundle = await this.getAdminPlan(actor, planId);
      return {
        preview: true,
        banner: "Preview Mode — not the salesperson’s active plan",
        plan: bundle.plan,
        periodTargets: bundle.periodTargets,
        metricTargets: bundle.metricTargets,
        insights: bundle.insights,
        planCopy: bundle.planCopy
      };
    },

    async createDraft(actor, payload = {}) {
      const targetUserId = String(payload.userId ?? "").trim();
      if (!targetUserId) throw new SalesOpsError("userId is required.", 400, "user_required");
      await assertCanAuthor(actor, targetUserId);
      const first = firstNameFromFullName(payload.fullName, payload.email);
      let template = null;
      if (payload.templateId) {
        template = await store.getTemplate(actor.organizationId, payload.templateId);
        if (!template) throw NOT_FOUND();
      } else if (payload.blueprintKey === PROTOTYPE_CEDAR_VALLEY_BLUEPRINT_KEY || payload.usePrototype) {
        template = await ensurePrototypeTemplate(store, {
          organizationId: actor.organizationId,
          createdBy: actor.userId
        });
      }
      const familyId = payload.planFamilyId || randomUUID();
      const startDate =
        payload.startDate || (template?.isPrototype ? "2026-09-01" : asOfDateString(clock()));
      const endDate = payload.endDate || template?.northStarTargetDate || "2028-12-31";
      const plan = await store.insertPlan({
        organizationId: actor.organizationId,
        userId: targetUserId,
        planFamilyId: familyId,
        versionNumber: 1,
        status: "draft",
        planName: payload.planName || template?.templateName || "Sales plan",
        territoryName: payload.territoryName || template?.territoryName || null,
        managerUserId: payload.managerUserId || (isOrgAdminRole(actor.role) ? null : actor.userId),
        startDate,
        endDate,
        effectiveStartDate: payload.effectiveStartDate || startDate,
        effectiveEndDate: payload.effectiveEndDate || endDate,
        northStarMetric: payload.northStarMetric || template?.northStarMetric || "installed_sqft_per_month",
        northStarTarget: payload.northStarTarget ?? template?.northStarTarget ?? 0,
        northStarTargetDate: payload.northStarTargetDate || template?.northStarTargetDate || endDate,
        stretchTarget: payload.stretchTarget ?? template?.stretchTarget ?? null,
        blueprintKey: template?.templateKey || payload.blueprintKey || null,
        templateId: template?.id ?? null,
        isPrototype: Boolean(template?.isPrototype),
        headline: payload.headline || `${first}'s path to ${Number(payload.northStarTarget ?? template?.northStarTarget ?? 0).toLocaleString("en-US")} sq ft`,
        subtitle: payload.subtitle || template?.features?.subtitle || "A measurable operating system for the assigned territory.",
        commissionEnabled: Boolean(payload.commissionEnabled ?? template?.commissionEnabled),
        commissionRules: payload.commissionRules || template?.commissionRules || {},
        accountExpectations: payload.accountExpectations || template?.accountExpectations || {},
        rhythms: payload.rhythms || template?.rhythms || {},
        features: payload.features || template?.features || {},
        createdBy: actor.userId
      });
      if (template) {
        await applyTemplateContents(store, actor.organizationId, template.id, plan.id);
      } else if (Array.isArray(payload.periodTargets) && payload.periodTargets.length) {
        await store.replacePeriodTargets(actor.organizationId, plan.id, payload.periodTargets);
      }
      if (Array.isArray(payload.metricTargets) && payload.metricTargets.length) {
        await store.replaceMetricTargets(actor.organizationId, plan.id, payload.metricTargets);
      }
      await emit(plan, "created", actor, {
        templateId: template?.id ?? null,
        assignedUserId: targetUserId,
        prototype: Boolean(template?.isPrototype)
      });
      return loadPlanBundle(store, actor.organizationId, plan.id);
    },

    async updateDraft(actor, planId, payload = {}) {
      const plan = await requirePlanForAuthor(actor, planId, { mutate: true });
      if (payload.status) {
        throw new SalesOpsError("Lifecycle status cannot be set through PATCH.", 400, "status_locked");
      }
      const patch = {};
      const fields = [
        "planName",
        "territoryName",
        "managerUserId",
        "startDate",
        "endDate",
        "effectiveStartDate",
        "effectiveEndDate",
        "northStarMetric",
        "northStarTarget",
        "northStarTargetDate",
        "stretchTarget",
        "headline",
        "subtitle",
        "commissionEnabled",
        "commissionRules",
        "accountExpectations",
        "rhythms",
        "features"
      ];
      for (const f of fields) {
        if (payload[f] !== undefined) patch[f] = payload[f];
      }
      const updated = Object.keys(patch).length
        ? await store.updatePlan(actor.organizationId, plan.id, patch)
        : plan;
      if (Array.isArray(payload.periodTargets)) {
        await store.replacePeriodTargets(actor.organizationId, plan.id, payload.periodTargets);
      }
      if (Array.isArray(payload.metricTargets)) {
        await store.replaceMetricTargets(actor.organizationId, plan.id, payload.metricTargets);
      }
      if (payload.planCopy) {
        await store.upsertPlanCopy(actor.organizationId, plan.id, "planCopy", payload.planCopy);
      }
      if (payload.insights) {
        await store.upsertPlanCopy(actor.organizationId, plan.id, "insights", payload.insights);
      }
      await emit(updated, "draft_edited", actor, {
        fields: Object.keys(patch).concat(
          payload.periodTargets ? ["periodTargets"] : [],
          payload.metricTargets ? ["metricTargets"] : []
        )
      });
      return loadPlanBundle(store, actor.organizationId, plan.id);
    },

    async submitReview(actor, planId) {
      const plan = await requirePlanForAuthor(actor, planId);
      try {
        assertTransition(plan.status, "in_review");
      } catch {
        throw new SalesOpsError("Invalid plan lifecycle transition.", 409, "invalid_transition");
      }
      const updated = await store.updatePlan(actor.organizationId, plan.id, {
        status: "in_review",
        submittedBy: actor.userId,
        submittedAt: new Date().toISOString()
      });
      await emit(updated, "submitted_for_review", actor);
      return loadPlanBundle(store, actor.organizationId, plan.id);
    },

    async approvePlan(actor, planId) {
      if (!canPublishPlans(actor.role)) {
        throw new SalesOpsError("Not found", 404, "not_found");
      }
      const plan = await store.getPlanById(actor.organizationId, planId);
      if (!plan) throw NOT_FOUND();
      try {
        assertTransition(plan.status, "approved");
      } catch {
        throw new SalesOpsError("Invalid plan lifecycle transition.", 409, "invalid_transition");
      }
      const updated = await store.updatePlan(actor.organizationId, plan.id, {
        status: "approved",
        approvedBy: actor.userId,
        approvedAt: new Date().toISOString()
      });
      await emit(updated, "approved", actor);
      return loadPlanBundle(store, actor.organizationId, plan.id);
    },

    async publishPlan(actor, planId, payload = {}) {
      if (!canPublishPlans(actor.role)) {
        throw new SalesOpsError("Not found", 404, "not_found");
      }
      const plan = await store.getPlanById(actor.organizationId, planId);
      if (!plan) throw NOT_FOUND();
      if (plan.status !== "approved") {
        throw new SalesOpsError("Invalid plan lifecycle transition.", 409, "invalid_transition");
      }
      const asOf = asOfDateString(clock());
      const start = payload.effectiveStartDate || plan.effectiveStartDate || plan.startDate;
      const end = payload.effectiveEndDate || plan.effectiveEndDate || plan.endDate;
      const shouldActivate = String(start).slice(0, 10) <= asOf;
      if (shouldActivate) {
        const current = await store.getActivePlan(actor.organizationId, plan.userId);
        if (current && current.id !== plan.id) {
          await store.updatePlan(actor.organizationId, current.id, {
            status: "superseded",
            supersededByPlanId: plan.id,
            effectiveEndDate: start
          });
          await emit(current, "superseded", actor, { supersededBy: plan.id });
        }
      }
      const updated = await store.updatePlan(actor.organizationId, plan.id, {
        status: shouldActivate ? "active" : "approved",
        effectiveStartDate: start,
        effectiveEndDate: end,
        publishedBy: actor.userId,
        publishedAt: new Date().toISOString()
      });
      await emit(updated, shouldActivate ? "published" : "scheduled", actor, { effectiveStartDate: start });
      return loadPlanBundle(store, actor.organizationId, plan.id);
    },

    async revisePlan(actor, planId) {
      const source = await requirePlanForAuthor(actor, planId);
      if (!["approved", "active", "superseded"].includes(source.status)) {
        throw new SalesOpsError("Only published versions can be revised.", 409, "not_revisable");
      }
      const family = await store.listPlansForUser(actor.organizationId, source.userId);
      const sameFamily = family.filter((p) => p.planFamilyId === source.planFamilyId);
      const nextVersion = Math.max(...sameFamily.map((p) => Number(p.versionNumber || 1))) + 1;
      const draft = await store.insertPlan({
        ...source,
        id: undefined,
        status: "draft",
        versionNumber: nextVersion,
        planFamilyId: source.planFamilyId,
        supersedesPlanId: source.id,
        isPrototype: Boolean(source.isPrototype),
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        publishedBy: null,
        publishedAt: null,
        archivedBy: null,
        archivedAt: null,
        supersededByPlanId: null,
        createdBy: actor.userId
      });
      await copyContents(store, actor.organizationId, source.id, draft.id);
      await emit(draft, "revision_created", actor, {
        sourcePlanId: source.id,
        versionNumber: nextVersion
      });
      return loadPlanBundle(store, actor.organizationId, draft.id);
    },

    async archivePlan(actor, planId) {
      const plan = await requirePlanForAuthor(actor, planId);
      try {
        assertTransition(plan.status, "archived");
      } catch {
        throw new SalesOpsError("Invalid plan lifecycle transition.", 409, "invalid_transition");
      }
      const updated = await store.updatePlan(actor.organizationId, plan.id, {
        status: "archived",
        archivedBy: actor.userId,
        archivedAt: new Date().toISOString()
      });
      await emit(updated, "archived", actor);
      return loadPlanBundle(store, actor.organizationId, plan.id);
    },

    async listTemplates(actor) {
      if (!isOrgAdminRole(actor.role)) {
        const reports = await store.listReportsForManager(actor.organizationId, actor.userId);
        if (!reports.length) throw NOT_FOUND();
      }
      await ensurePrototypeTemplate(store, { organizationId: actor.organizationId, createdBy: actor.userId });
      return store.listTemplates(actor.organizationId);
    },

    async updateTemplate(actor, templateId, payload) {
      if (!isOrgAdminRole(actor.role)) throw NOT_FOUND();
      const tpl = await store.getTemplate(actor.organizationId, templateId);
      if (!tpl) throw NOT_FOUND();
      const updated = await store.updateTemplate(actor.organizationId, templateId, payload);
      if (Array.isArray(payload.periodTargets)) {
        await store.replaceTemplatePeriodTargets(actor.organizationId, templateId, payload.periodTargets);
      }
      await recordAudit({
        actionType: "sales_ops_template_edit",
        entityType: "sales_ops_plan_template",
        entityId: templateId
      });
      return updated;
    }
  };
}

export { defaultInsights, copyContents, snapshotPeriodTargets, REP_VISIBLE_STATUSES };
