import { randomUUID } from "node:crypto";

function nowIso() {
  return new Date().toISOString();
}

function clone(v) {
  return structuredClone(v);
}

/**
 * In-memory Sales Ops store for tests and local foundation (no production writes).
 */
export function createSalesOpsMemoryStore() {
  const plans = new Map();
  const periodTargets = new Map();
  const metricTargets = new Map();
  const planCopy = new Map();
  const scorecards = new Map();
  const mondayConfig = new Map();
  const repMappings = new Map();
  const accounts = new Map();
  const intelligence = new Map();
  const activities = new Map();
  const syncLog = [];
  const webhookEvents = new Map();
  const managerAssignments = new Map();
  const commissionSnapshots = new Map();
  const planEvents = [];
  const acknowledgements = new Map();
  const templates = new Map();
  const templatePeriodTargets = new Map();
  const templateMetricTargets = new Map();
  const templateCopy = new Map();
  const users = new Map();
  const mondayItems = new Map();
  const mondayColumnValues = new Map();
  const mondayUpdates = new Map();
  const mondayAssets = new Map();
  const mondayDocs = new Map();
  const mondayPeople = new Map();
  const mondayGroups = new Map();
  const mondaySyncState = new Map();
  const mondayAdLinks = new Map();
  const externalLinks = new Map();
  const attributionFacts = new Map();
  const metrics = {
    eavSelectChunks: 0,
    accountUpsertChunks: 0,
    columnUpsertChunks: 0,
    itemUpsertChunks: 0
  };

  function orgEq(row, organizationId) {
    return row && row.organizationId === organizationId ? row : null;
  }

  function putAccount(row) {
    const existing = [...accounts.values()].find(
      (a) =>
        a.organizationId === row.organizationId &&
        a.mondayBoardId === row.mondayBoardId &&
        a.mondayItemId === String(row.mondayItemId)
    );
    const rec = {
      id: existing?.id || row.id || randomUUID(),
      archived: false,
      ...existing,
      ...row,
      mondayItemId: String(row.mondayItemId),
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    accounts.set(rec.id, rec);
    return clone(rec);
  }

  function putMondayItem(row) {
    const key = `${row.organizationId}:${row.mondayBoardId}:${row.mondayItemId}`;
    const existing = mondayItems.get(key);
    const rec = {
      id: existing?.id || row.id || randomUUID(),
      ...existing,
      ...row,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    mondayItems.set(key, rec);
    return clone(rec);
  }

  function putMondayColumn(row) {
    const key = `${row.organizationId}:${row.mondayBoardId}:${row.mondayItemId}:${row.columnId}`;
    const existing = mondayColumnValues.get(key);
    const rec = {
      id: existing?.id || randomUUID(),
      ...existing,
      ...row,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    mondayColumnValues.set(key, rec);
    return clone(rec);
  }

  return {
    kind: "memory",
    metrics,

    seedUser(user) {
      users.set(user.id, clone(user));
      return clone(user);
    },
    getUser(userId) {
      return clone(users.get(userId) || null);
    },

    async insertPlan(row) {
      const id = row.id || randomUUID();
      const status = row.status || "draft";
      if (status === "active") {
        for (const p of plans.values()) {
          if (p.organizationId === row.organizationId && p.userId === row.userId && p.status === "active") {
            p.status = "superseded";
            p.supersededByPlanId = id;
            p.updatedAt = nowIso();
          }
        }
      }
      const rec = {
        id,
        organizationId: row.organizationId,
        userId: row.userId,
        planFamilyId: row.planFamilyId || randomUUID(),
        versionNumber: Number(row.versionNumber ?? row.version ?? 1),
        status,
        planName: row.planName,
        territoryName: row.territoryName ?? null,
        managerUserId: row.managerUserId ?? null,
        startDate: row.startDate,
        endDate: row.endDate,
        effectiveStartDate: row.effectiveStartDate || row.startDate,
        effectiveEndDate: row.effectiveEndDate ?? row.endDate ?? null,
        northStarMetric: row.northStarMetric ?? "installed_sqft_per_month",
        northStarTarget: Number(row.northStarTarget ?? 0),
        northStarTargetDate: row.northStarTargetDate ?? null,
        stretchTarget: row.stretchTarget ?? null,
        blueprintKey: row.blueprintKey ?? null,
        templateId: row.templateId ?? null,
        isPrototype: Boolean(row.isPrototype),
        headline: row.headline ?? null,
        subtitle: row.subtitle ?? null,
        commissionEnabled: Boolean(row.commissionEnabled),
        commissionRules: row.commissionRules ?? {},
        accountExpectations: row.accountExpectations ?? {},
        rhythms: row.rhythms ?? {},
        features: row.features ?? {},
        supersedesPlanId: row.supersedesPlanId ?? null,
        supersededByPlanId: row.supersededByPlanId ?? null,
        submittedBy: row.submittedBy ?? null,
        submittedAt: row.submittedAt ?? null,
        approvedBy: row.approvedBy ?? null,
        approvedAt: row.approvedAt ?? null,
        publishedBy: row.publishedBy ?? null,
        publishedAt: row.publishedAt ?? null,
        archivedBy: row.archivedBy ?? null,
        archivedAt: row.archivedAt ?? null,
        createdBy: row.createdBy ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      rec.active = rec.status === "active";
      rec.version = rec.versionNumber;
      plans.set(id, rec);
      return clone(rec);
    },
    async getActivePlan(organizationId, userId) {
      for (const p of plans.values()) {
        if (p.organizationId === organizationId && p.userId === userId && p.status === "active") return clone(p);
      }
      return null;
    },
    async listPlansForUser(organizationId, userId) {
      return [...plans.values()]
        .filter((p) => p.organizationId === organizationId && p.userId === userId)
        .sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))
        .map(clone);
    },
    async getPlanById(organizationId, planId) {
      return clone(orgEq(plans.get(planId), organizationId));
    },
    async listPlansForOrg(organizationId) {
      return [...plans.values()].filter((p) => p.organizationId === organizationId).map(clone);
    },
    async updatePlan(organizationId, planId, patch) {
      const rec = orgEq(plans.get(planId), organizationId);
      if (!rec) return null;
      Object.assign(rec, patch, { updatedAt: nowIso() });
      rec.active = rec.status === "active";
      rec.version = rec.versionNumber;
      return clone(rec);
    },

    async replacePeriodTargets(organizationId, planId, rows) {
      for (const [id, r] of [...periodTargets.entries()]) {
        if (r.planId === planId) periodTargets.delete(id);
      }
      const out = [];
      for (const row of rows) {
        const rec = { id: randomUUID(), organizationId, planId, ...row, createdAt: nowIso(), updatedAt: nowIso() };
        periodTargets.set(rec.id, rec);
        out.push(clone(rec));
      }
      return out;
    },
    async listPeriodTargets(organizationId, planId) {
      return [...periodTargets.values()]
        .filter((r) => r.organizationId === organizationId && r.planId === planId)
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(clone);
    },

    async replaceMetricTargets(organizationId, planId, rows) {
      for (const [id, r] of [...metricTargets.entries()]) {
        if (r.planId === planId) metricTargets.delete(id);
      }
      const out = [];
      for (const row of rows) {
        const rec = { id: randomUUID(), organizationId, planId, active: row.active !== false, ...row, createdAt: nowIso(), updatedAt: nowIso() };
        metricTargets.set(rec.id, rec);
        out.push(clone(rec));
      }
      return out;
    },
    async listMetricTargets(organizationId, planId) {
      return [...metricTargets.values()]
        .filter((r) => r.organizationId === organizationId && r.planId === planId && r.active !== false)
        .sort((a, b) => (a.displayOrder ?? 100) - (b.displayOrder ?? 100))
        .map(clone);
    },

    async upsertPlanCopy(organizationId, planId, copyKey, payload) {
      const key = `${planId}:${copyKey}`;
      const rec = { id: randomUUID(), organizationId, planId, copyKey, payload, updatedAt: nowIso() };
      planCopy.set(key, rec);
      return clone(rec);
    },
    async getPlanCopy(organizationId, planId, copyKey) {
      const rec = planCopy.get(`${planId}:${copyKey}`);
      if (!rec || rec.organizationId !== organizationId) return null;
      return clone(rec);
    },
    async listPlanCopy(organizationId, planId) {
      return [...planCopy.values()]
        .filter((r) => r.organizationId === organizationId && r.planId === planId)
        .map(clone);
    },

    async upsertScorecard(row) {
      const key = `${row.organizationId}:${row.userId}:${row.period}`;
      const existing = [...scorecards.values()].find(
        (s) => s.organizationId === row.organizationId && s.userId === row.userId && s.period === row.period
      );
      const rec = {
        id: existing?.id || randomUUID(),
        ...row,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso()
      };
      scorecards.set(rec.id, rec);
      void key;
      return clone(rec);
    },
    async listScorecards(organizationId, userId) {
      return [...scorecards.values()]
        .filter((s) => s.organizationId === organizationId && s.userId === userId)
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(clone);
    },
    async getScorecardById(organizationId, scorecardId) {
      return clone(orgEq(scorecards.get(scorecardId), organizationId));
    },

    async upsertMondayConfig(row) {
      const rec = {
        ...(mondayConfig.get(row.organizationId) || {}),
        ...row,
        updatedAt: nowIso()
      };
      mondayConfig.set(row.organizationId, rec);
      return clone(rec);
    },
    async getMondayConfig(organizationId) {
      return clone(mondayConfig.get(organizationId) || null);
    },
    async getOrganizationIdByBoardId(boardId) {
      const id = String(boardId ?? "").trim();
      if (!id) return null;
      for (const rec of mondayConfig.values()) {
        if (String(rec.accountMasterBoardId || "") === id) return rec.organizationId;
        if (String(rec.subitemBoardId || "") === id) return rec.organizationId;
      }
      return null;
    },

    async upsertRepMapping(row) {
      const rec = {
        id: row.id || randomUUID(),
        organizationId: row.organizationId,
        userId: row.userId,
        mondayUserId: String(row.mondayUserId),
        salespersonLabel: row.salespersonLabel ?? null,
        active: row.active !== false,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      for (const [id, r] of [...repMappings.entries()]) {
        if (r.organizationId === rec.organizationId && r.userId === rec.userId && r.active) {
          r.active = false;
        }
        if (r.organizationId === rec.organizationId && r.mondayUserId === rec.mondayUserId && r.active) {
          r.active = false;
        }
        void id;
      }
      repMappings.set(rec.id, rec);
      return clone(rec);
    },
    async getRepMappingByMondayUser(organizationId, mondayUserId) {
      const id = String(mondayUserId ?? "");
      for (const r of repMappings.values()) {
        if (r.organizationId === organizationId && r.mondayUserId === id && r.active) return clone(r);
      }
      return null;
    },
    async getRepMappingByUser(organizationId, userId) {
      for (const r of repMappings.values()) {
        if (r.organizationId === organizationId && r.userId === userId && r.active) return clone(r);
      }
      return null;
    },
    async listRepMappings(organizationId) {
      return [...repMappings.values()]
        .filter((r) => r.organizationId === organizationId && r.active)
        .map(clone);
    },
    async listActiveOrganizationUsers(organizationId) {
      return [...users.values()]
        .filter((u) => String(u.organizationId || u.organization_id) === String(organizationId))
        .filter((u) => u.isActive !== false && u.is_active !== false)
        .map((u) => ({
          id: u.id,
          email: u.email || null,
          isActive: true,
          organizationId
        }));
    },

    async upsertAccount(row) {
      return putAccount(row);
    },
    async upsertAccountsBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(putAccount(row));
      metrics.accountUpsertChunks += 1;
      return out;
    },
    async getAccount(organizationId, accountId) {
      return clone(orgEq(accounts.get(accountId), organizationId));
    },
    async getAccountByMondayItem(organizationId, mondayItemId) {
      const id = String(mondayItemId ?? "");
      for (const a of accounts.values()) {
        if (a.organizationId === organizationId && a.mondayItemId === id) return clone(a);
      }
      return null;
    },
    async listAccountsForUser(organizationId, userId) {
      return [...accounts.values()]
        .filter((a) => {
          if (a.organizationId !== organizationId || a.assignedUserId !== userId) return false;
          if (a.archived) return false;
          const state = a.sourceState || "active";
          return state === "active";
        })
        .sort((a, b) => String(a.accountName).localeCompare(String(b.accountName)))
        .map(clone);
    },
    async listAccountsPage(organizationId, { assignedUserIds = null, limit = 50, cursor = null, sourceState = "active" } = {}) {
      let rows = [...accounts.values()].filter((a) => {
        if (a.organizationId !== organizationId) return false;
        const state = a.sourceState || (a.archived ? "archived" : "active");
        if (sourceState && state !== sourceState) return false;
        if (sourceState === "active" && a.archived) return false;
        if (assignedUserIds) {
          if (!a.assignedUserId || !assignedUserIds.includes(a.assignedUserId)) return false;
        }
        return true;
      });
      rows.sort((a, b) => {
        const n = String(a.accountName).localeCompare(String(b.accountName));
        return n !== 0 ? n : String(a.id).localeCompare(String(b.id));
      });
      if (cursor?.n != null && cursor?.i) {
        rows = rows.filter((a) => {
          const cmp = String(a.accountName).localeCompare(String(cursor.n));
          return cmp > 0 || (cmp === 0 && String(a.id) > String(cursor.i));
        });
      }
      const slice = rows.slice(0, Number(limit) + 1);
      const hasMore = slice.length > Number(limit);
      const page = hasMore ? slice.slice(0, Number(limit)) : slice;
      return { rows: page.map(clone), hasMore };
    },
    async listAccountsForOrg(organizationId) {
      return [...accounts.values()]
        .filter((a) => a.organizationId === organizationId && !a.archived && (a.sourceState || "active") === "active")
        .map(clone);
    },
    async markAccountArchived(organizationId, mondayItemId) {
      const rec = [...accounts.values()].find(
        (a) => a.organizationId === organizationId && a.mondayItemId === String(mondayItemId)
      );
      if (!rec) return null;
      rec.archived = true;
      rec.sourceState = "archived";
      rec.assignedUserId = null;
      rec.updatedAt = nowIso();
      return clone(rec);
    },

    async upsertIntelligence(row) {
      const rec = {
        id: intelligence.get(row.accountId)?.id || randomUUID(),
        ...row,
        updatedAt: nowIso()
      };
      intelligence.set(row.accountId, rec);
      return clone(rec);
    },
    async getIntelligence(organizationId, accountId) {
      const rec = intelligence.get(accountId);
      if (!rec || rec.organizationId !== organizationId) return null;
      return clone(rec);
    },

    async insertActivity(row) {
      if (row.externalId) {
        for (const a of activities.values()) {
          if (a.organizationId === row.organizationId && a.source === row.source && a.externalId === row.externalId) {
            Object.assign(a, row, { updatedAt: nowIso() });
            return clone(a);
          }
        }
      }
      const rec = { id: randomUUID(), ...row, createdAt: nowIso() };
      activities.set(rec.id, rec);
      return clone(rec);
    },
    async listActivitiesForUser(organizationId, userId) {
      return [...activities.values()]
        .filter((a) => a.organizationId === organizationId && a.userId === userId)
        .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
        .map(clone);
    },
    async listActivitiesForAccount(organizationId, accountId) {
      return [...activities.values()]
        .filter((a) => a.organizationId === organizationId && a.accountId === accountId)
        .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
        .map(clone);
    },

    async insertSyncLog(row) {
      const rec = { id: randomUUID(), ...row, createdAt: nowIso() };
      syncLog.push(rec);
      return clone(rec);
    },
    async listSyncLog(organizationId, limit = 50) {
      return syncLog.filter((r) => r.organizationId === organizationId).slice(-limit).reverse().map(clone);
    },

    async recordWebhookEvent(organizationId, eventId, extra = {}) {
      const key = `${organizationId}:${eventId}`;
      if (webhookEvents.has(key)) return { duplicate: true, ...clone(webhookEvents.get(key)) };
      const rec = { organizationId, eventId, processedAt: nowIso(), ...extra };
      webhookEvents.set(key, rec);
      return { duplicate: false, ...clone(rec) };
    },

    async insertManagerAssignment(row) {
      const rec = {
        id: row.id || randomUUID(),
        organizationId: row.organizationId,
        managerUserId: row.managerUserId,
        reportUserId: row.reportUserId,
        canViewCommission: Boolean(row.canViewCommission),
        canMutateAccounts: Boolean(row.canMutateAccounts),
        active: row.active !== false,
        createdBy: row.createdBy ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      managerAssignments.set(rec.id, rec);
      return clone(rec);
    },
    async listReportsForManager(organizationId, managerUserId) {
      return [...managerAssignments.values()]
        .filter((a) => a.organizationId === organizationId && a.managerUserId === managerUserId && a.active)
        .map(clone);
    },
    async getManagerAssignment(organizationId, managerUserId, reportUserId) {
      for (const a of managerAssignments.values()) {
        if (
          a.organizationId === organizationId &&
          a.managerUserId === managerUserId &&
          a.reportUserId === reportUserId &&
          a.active
        )
          return clone(a);
      }
      return null;
    },

    async upsertCommissionSnapshot(row) {
      const key = `${row.organizationId}:${row.userId}:${row.snapshotKey}`;
      const rec = { id: randomUUID(), ...row, updatedAt: nowIso() };
      commissionSnapshots.set(key, rec);
      return clone(rec);
    },
    async getCommissionSnapshot(organizationId, userId, snapshotKey = "default") {
      return clone(commissionSnapshots.get(`${organizationId}:${userId}:${snapshotKey}`) || null);
    },

    async insertPlanEvent(row) {
      const rec = {
        id: randomUUID(),
        organizationId: row.organizationId,
        planId: row.planId,
        eventType: row.eventType,
        actorUserId: row.actorUserId ?? null,
        metadata: row.metadata ?? {},
        createdAt: nowIso()
      };
      planEvents.push(rec);
      return clone(rec);
    },
    async listPlanEvents(organizationId, planId) {
      return planEvents
        .filter((e) => e.organizationId === organizationId && e.planId === planId)
        .map(clone);
    },

    async upsertAcknowledgement(row) {
      const key = `${row.organizationId}:${row.planId}:${row.userId}`;
      const rec = {
        id: acknowledgements.get(key)?.id || randomUUID(),
        organizationId: row.organizationId,
        planId: row.planId,
        userId: row.userId,
        ackType: row.ackType || "published_plan",
        comment: row.comment ?? null,
        acknowledgedAt: nowIso()
      };
      acknowledgements.set(key, rec);
      return clone(rec);
    },
    async getAcknowledgement(organizationId, planId, userId) {
      return clone(acknowledgements.get(`${organizationId}:${planId}:${userId}`) || null);
    },

    async insertTemplate(row) {
      const rec = {
        id: row.id || randomUUID(),
        organizationId: row.organizationId,
        templateKey: row.templateKey ?? null,
        templateName: row.templateName,
        active: row.active !== false,
        isPrototype: Boolean(row.isPrototype),
        defaultDurationMonths: row.defaultDurationMonths ?? null,
        northStarMetric: row.northStarMetric ?? "installed_sqft_per_month",
        northStarTarget: Number(row.northStarTarget ?? 0),
        northStarTargetDate: row.northStarTargetDate ?? null,
        stretchTarget: row.stretchTarget ?? null,
        territoryName: row.territoryName ?? null,
        commissionEnabled: Boolean(row.commissionEnabled),
        commissionRules: row.commissionRules ?? {},
        accountExpectations: row.accountExpectations ?? {},
        rhythms: row.rhythms ?? {},
        features: row.features ?? {},
        createdBy: row.createdBy ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      templates.set(rec.id, rec);
      return clone(rec);
    },
    async getTemplate(organizationId, templateId) {
      return clone(orgEq(templates.get(templateId), organizationId));
    },
    async getTemplateByKey(organizationId, templateKey) {
      for (const t of templates.values()) {
        if (t.organizationId === organizationId && t.templateKey === templateKey) return clone(t);
      }
      return null;
    },
    async listTemplates(organizationId) {
      return [...templates.values()].filter((t) => t.organizationId === organizationId).map(clone);
    },
    async updateTemplate(organizationId, templateId, patch) {
      const rec = orgEq(templates.get(templateId), organizationId);
      if (!rec) return null;
      Object.assign(rec, patch, { updatedAt: nowIso() });
      return clone(rec);
    },
    async replaceTemplatePeriodTargets(organizationId, templateId, rows) {
      for (const [id, r] of [...templatePeriodTargets.entries()]) {
        if (r.templateId === templateId) templatePeriodTargets.delete(id);
      }
      const out = [];
      for (const row of rows || []) {
        const rec = { id: randomUUID(), organizationId, templateId, ...row, createdAt: nowIso(), updatedAt: nowIso() };
        templatePeriodTargets.set(rec.id, rec);
        out.push(clone(rec));
      }
      return out;
    },
    async listTemplatePeriodTargets(organizationId, templateId) {
      return [...templatePeriodTargets.values()]
        .filter((r) => r.organizationId === organizationId && r.templateId === templateId)
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(clone);
    },
    async replaceTemplateMetricTargets(organizationId, templateId, rows) {
      for (const [id, r] of [...templateMetricTargets.entries()]) {
        if (r.templateId === templateId) templateMetricTargets.delete(id);
      }
      const out = [];
      for (const row of rows || []) {
        const rec = { id: randomUUID(), organizationId, templateId, active: row.active !== false, ...row, createdAt: nowIso(), updatedAt: nowIso() };
        templateMetricTargets.set(rec.id, rec);
        out.push(clone(rec));
      }
      return out;
    },
    async listTemplateMetricTargets(organizationId, templateId) {
      return [...templateMetricTargets.values()]
        .filter((r) => r.organizationId === organizationId && r.templateId === templateId)
        .sort((a, b) => (a.displayOrder ?? 100) - (b.displayOrder ?? 100))
        .map(clone);
    },
    async upsertTemplateCopy(organizationId, templateId, copyKey, payload) {
      const key = `${templateId}:${copyKey}`;
      const rec = { id: randomUUID(), organizationId, templateId, copyKey, payload, updatedAt: nowIso() };
      templateCopy.set(key, rec);
      return clone(rec);
    },
    async listTemplateCopy(organizationId, templateId) {
      return [...templateCopy.values()]
        .filter((r) => r.organizationId === organizationId && r.templateId === templateId)
        .map(clone);
    },

    seedMondayAccountDirectoryLink(organizationId, boardId, itemId, accountId) {
      mondayAdLinks.set(`${organizationId}:${boardId}:${itemId}`, { accountId, organizationId, boardId, itemId });
    },
    async getMondayAccountDirectoryLink(organizationId, boardId, itemId) {
      return clone(mondayAdLinks.get(`${organizationId}:${boardId}:${itemId}`) || null);
    },
    async listMondayAccountDirectoryLinks(organizationId, boardId = null) {
      const out = [];
      for (const rec of mondayAdLinks.values()) {
        if (rec.organizationId !== organizationId) continue;
        if (boardId && String(rec.boardId) !== String(boardId)) continue;
        out.push({ mondayItemId: String(rec.itemId), accountId: rec.accountId, boardId: rec.boardId });
      }
      return out;
    },

    async getMondayItem(organizationId, boardId, mondayItemId) {
      return clone(mondayItems.get(`${organizationId}:${boardId}:${mondayItemId}`) || null);
    },
    async upsertMondayItem(row) {
      return putMondayItem(row);
    },
    async upsertMondayItemsBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(putMondayItem(row));
      metrics.itemUpsertChunks += 1;
      return out;
    },
    async listMondayItems(organizationId, { boardId = null, parentMondayItemId = null, itemKind = null } = {}) {
      return [...mondayItems.values()]
        .filter((r) => {
          if (r.organizationId !== organizationId) return false;
          if (boardId && String(r.mondayBoardId) !== String(boardId)) return false;
          if (parentMondayItemId && String(r.parentMondayItemId || "") !== String(parentMondayItemId)) return false;
          if (itemKind && r.itemKind !== itemKind) return false;
          return true;
        })
        .map(clone);
    },
    async upsertMondayColumnValue(row) {
      return putMondayColumn(row);
    },
    async upsertMondayColumnValuesBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(putMondayColumn(row));
      metrics.columnUpsertChunks += 1;
      return out;
    },
    async listMondayColumnValues(organizationId, boardId, mondayItemId) {
      return [...mondayColumnValues.values()]
        .filter(
          (r) =>
            r.organizationId === organizationId &&
            String(r.mondayBoardId) === String(boardId) &&
            String(r.mondayItemId) === String(mondayItemId)
        )
        .map(clone);
    },
    async listMondayColumnValuesForItems(organizationId, mondayItemIds, { chunkSize = 100 } = {}) {
      const ids = [...new Set((mondayItemIds || []).map(String))];
      const out = [];
      const n = Math.max(1, Number(chunkSize) || 100);
      for (let i = 0; i < ids.length; i += n) {
        metrics.eavSelectChunks += 1;
        const set = new Set(ids.slice(i, i + n));
        for (const r of mondayColumnValues.values()) {
          if (r.organizationId === organizationId && set.has(String(r.mondayItemId))) out.push(clone(r));
        }
      }
      return out;
    },
    async upsertMondayUpdate(row) {
      const key = `${row.organizationId}:${row.mondayUpdateId}`;
      const existing = mondayUpdates.get(key);
      const rec = {
        id: existing?.id || randomUUID(),
        ...existing,
        ...row,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso()
      };
      mondayUpdates.set(key, rec);
      return clone(rec);
    },
    async upsertMondayUpdatesBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(await this.upsertMondayUpdate(row));
      return out;
    },
    async listMondayUpdatesPage(organizationId, mondayItemId, { limit = 50, offset = 0 } = {}) {
      const rows = [...mondayUpdates.values()]
        .filter((r) => r.organizationId === organizationId && String(r.mondayItemId) === String(mondayItemId))
        .sort((a, b) => String(b.mondayCreatedAt || "").localeCompare(String(a.mondayCreatedAt || "")));
      return { rows: rows.slice(offset, offset + limit).map(clone), hasMore: rows.length > offset + limit, total: rows.length };
    },
    async upsertMondayAsset(row) {
      const key = `${row.organizationId}:${row.mondayAssetId}`;
      const existing = mondayAssets.get(key);
      const rec = {
        id: existing?.id || randomUUID(),
        ...existing,
        ...row,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso()
      };
      mondayAssets.set(key, rec);
      return clone(rec);
    },
    async upsertMondayAssetsBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(await this.upsertMondayAsset(row));
      return out;
    },
    async listMondayAssetsPage(organizationId, mondayItemId, { limit = 50, offset = 0 } = {}) {
      const rows = [...mondayAssets.values()].filter(
        (r) => r.organizationId === organizationId && String(r.mondayItemId || "") === String(mondayItemId)
      );
      return { rows: rows.slice(offset, offset + limit).map(clone), hasMore: rows.length > offset + limit };
    },
    async getMondayAsset(organizationId, assetId) {
      for (const r of mondayAssets.values()) {
        if (r.organizationId === organizationId && (r.id === assetId || String(r.mondayAssetId) === String(assetId))) {
          return clone(r);
        }
      }
      return null;
    },
    async upsertMondayDoc(row) {
      const key = `${row.organizationId}:${row.mondayDocId}:${row.mondayItemId}`;
      const existing = mondayDocs.get(key);
      const rec = {
        id: existing?.id || randomUUID(),
        ...existing,
        ...row,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso()
      };
      mondayDocs.set(key, rec);
      return clone(rec);
    },
    async upsertMondayDocsBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(await this.upsertMondayDoc(row));
      return out;
    },
    async listMondayDocs(organizationId, { mondayItemId = null, limit = 50, offset = 0 } = {}) {
      const rows = [...mondayDocs.values()].filter((r) => {
        if (r.organizationId !== organizationId) return false;
        if (mondayItemId && String(r.mondayItemId) !== String(mondayItemId)) return false;
        return true;
      });
      return { rows: rows.slice(offset, offset + limit).map(clone), hasMore: rows.length > offset + limit };
    },
    async getMondayDoc(organizationId, docRowId) {
      for (const r of mondayDocs.values()) {
        if (r.organizationId === organizationId && (r.id === docRowId || String(r.mondayDocId) === String(docRowId))) {
          return clone(r);
        }
      }
      return null;
    },
    async upsertMondayUser(row) {
      const key = `${row.organizationId}:${row.mondayUserId}`;
      const existing = mondayPeople.get(key);
      const rec = {
        id: existing?.id || randomUUID(),
        ...existing,
        ...row,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso()
      };
      mondayPeople.set(key, rec);
      return clone(rec);
    },
    async upsertMondayUsersBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(await this.upsertMondayUser(row));
      return out;
    },
    async listMondayUsers(organizationId) {
      return [...mondayPeople.values()].filter((r) => r.organizationId === organizationId).map(clone);
    },
    async upsertMondayGroup(row) {
      const key = `${row.organizationId}:${row.mondayBoardId}:${row.mondayGroupId}`;
      const existing = mondayGroups.get(key);
      const rec = { id: existing?.id || randomUUID(), ...existing, ...row, updatedAt: nowIso() };
      mondayGroups.set(key, rec);
      return clone(rec);
    },
    async upsertMondayGroupsBatch(rows) {
      const out = [];
      for (const row of rows || []) out.push(await this.upsertMondayGroup(row));
      return out;
    },
    async listDistinctMondayAssignedUserIds(organizationId) {
      const ids = new Set();
      for (const a of accounts.values()) {
        if (a.organizationId !== organizationId) continue;
        if (a.mondayAssignedUserId) ids.add(String(a.mondayAssignedUserId));
      }
      return [...ids];
    },
    async upsertMondaySyncState(row) {
      const key = `${row.organizationId}:${row.mondayBoardId}:${row.syncMode || "full"}`;
      const existing = mondaySyncState.get(key);
      const rec = { id: existing?.id || randomUUID(), ...existing, ...row, syncMode: row.syncMode || "full", updatedAt: nowIso() };
      mondaySyncState.set(key, rec);
      return clone(rec);
    },
    async getMondaySyncState(organizationId, boardId, syncMode = "full") {
      return clone(mondaySyncState.get(`${organizationId}:${boardId}:${syncMode}`) || null);
    },
    async markUnseenMondaySourcesUnavailable(organizationId, boardId, censusStartedAt) {
      const cutoff = String(censusStartedAt);
      let marked = 0;
      for (const rec of mondayItems.values()) {
        if (rec.organizationId !== organizationId) continue;
        if ((rec.sourceState || "active") !== "active") continue;
        if (String(rec.lastSeenAt || "") >= cutoff) continue;
        rec.sourceState = "unavailable";
        rec.updatedAt = nowIso();
        marked += 1;
      }
      for (const rec of accounts.values()) {
        if (rec.organizationId !== organizationId) continue;
        if (boardId && String(rec.mondayBoardId) !== String(boardId)) continue;
        if ((rec.sourceState || "active") !== "active") continue;
        if (String(rec.lastSeenAt || "") >= cutoff) continue;
        rec.sourceState = "unavailable";
        rec.archived = true;
        rec.updatedAt = nowIso();
      }
      return { marked };
    },
    async countMondayMirrorStats(organizationId) {
      const items = [...mondayItems.values()].filter((r) => r.organizationId === organizationId);
      const acc = [...accounts.values()].filter((r) => r.organizationId === organizationId && (r.sourceState || "active") === "active" && !r.archived);
      const mappedIds = new Set(
        [...repMappings.values()]
          .filter((r) => r.organizationId === organizationId && r.active)
          .map((r) => String(r.mondayUserId))
      );
      const people = [...mondayPeople.values()].filter((r) => r.organizationId === organizationId && r.kind === "person");
      return {
        mirrorItemCount: items.length,
        linkedAccountDirectoryCount: acc.filter((a) => a.accountDirectoryAccountId).length,
        unlinkedCount: acc.filter((a) => !a.accountDirectoryAccountId).length,
        unmappedMondayPeopleCount: people.filter((p) => !mappedIds.has(String(p.mondayUserId))).length
      };
    },

    async listAccountIdentityRows(organizationId) {
      return [...accounts.values()]
        .filter((a) => a.organizationId === organizationId && !a.archived && (a.sourceState || "active") === "active")
        .map((a) => ({
          id: a.id,
          mondayBoardId: a.mondayBoardId,
          mondayItemId: a.mondayItemId,
          accountDirectoryAccountId: a.accountDirectoryAccountId ?? null,
          assignedUserId: a.assignedUserId ?? null
        }));
    },

    seedExternalLink(organizationId, externalSystem, externalId, accountId) {
      const key = `${organizationId}:${externalSystem}:${externalId}`;
      externalLinks.set(key, {
        organizationId,
        externalSystem,
        externalId: String(externalId),
        accountId,
        isActive: true
      });
    },
    async listActiveExternalLinks(organizationId, externalSystem) {
      const system = String(externalSystem);
      if (system === "monday") {
        return [...mondayAdLinks.values()]
          .filter((r) => r.organizationId === organizationId)
          .map((r) => ({
            accountId: r.accountId,
            externalId: `${r.boardId}:${r.itemId}`,
            mondayItemId: String(r.itemId),
            boardId: r.boardId
          }));
      }
      return [...externalLinks.values()]
        .filter((r) => r.organizationId === organizationId && r.externalSystem === system && r.isActive !== false)
        .map((r) => ({ accountId: r.accountId, externalId: r.externalId }));
    },

    async listPeriodTargetsForPlanIds(organizationId, planIds) {
      const ids = new Set((planIds || []).map(String));
      return [...periodTargets.values()]
        .filter((r) => r.organizationId === organizationId && ids.has(String(r.planId)))
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(clone);
    },

    async insertAttributionFact(row) {
      const rec = {
        id: row.id || randomUUID(),
        organizationId: row.organizationId,
        salespersonUserId: row.salespersonUserId,
        accountDirectoryAccountId: row.accountDirectoryAccountId,
        salesOpsAccountId: row.salesOpsAccountId ?? null,
        morawareAccountId: row.morawareAccountId ?? null,
        morawareJobId: row.morawareJobId ?? null,
        qualifyingEvent: row.qualifyingEvent,
        qualifyingDate: row.qualifyingDate,
        performanceMonth: row.performanceMonth,
        creditedSf: Number(row.creditedSf),
        attributionBasis: row.attributionBasis || "explicit_fact",
        sourceObservedAt: row.sourceObservedAt ?? nowIso(),
        reversalOfId: row.reversalOfId ?? null,
        status: row.status || "credited",
        createdAt: nowIso()
      };
      attributionFacts.set(rec.id, rec);
      return clone(rec);
    },
    async listAttributionFacts(organizationId, { userIds = null, periodFrom = null, periodTo = null } = {}) {
      const allow = userIds ? new Set(userIds.map(String)) : null;
      return [...attributionFacts.values()]
        .filter((r) => {
          if (r.organizationId !== organizationId) return false;
          if (allow && !allow.has(String(r.salespersonUserId))) return false;
          if (periodFrom && r.performanceMonth < periodFrom) return false;
          if (periodTo && r.performanceMonth > periodTo) return false;
          return true;
        })
        .map(clone);
    }
  };
}
