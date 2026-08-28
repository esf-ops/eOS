/**
 * Supabase-backed Sales Ops store.
 * Domain objects use camelCase; columns use snake_case.
 * Brain uses the service-role client. RLS is defense-in-depth, not a substitute
 * for route authorization.
 */

import { SALES_OPS_MONDAY_EXTERNAL_SYSTEM, mondayExternalId } from "./salesOpsConstants.js";

const ACCOUNT_LIST_SELECT = [
  "id",
  "organization_id",
  "monday_board_id",
  "monday_item_id",
  "account_directory_account_id",
  "account_name",
  "monday_url",
  "monday_group",
  "group_id",
  "monday_assigned_user_id",
  "assigned_user_id",
  "status",
  "last_contact",
  "next_contact",
  "market",
  "branch",
  "source_state",
  "synced_at",
  "archived"
].join(", ");

function throwDb(error, fallback) {
  const err = new Error(fallback);
  err.cause = error;
  throw err;
}

function mapPlan(row) {
  if (!row) return null;
  const status = row.status || (row.active ? "active" : "draft");
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    planFamilyId: row.plan_family_id,
    versionNumber: Number(row.version_number ?? 1),
    version: Number(row.version_number ?? 1),
    status,
    active: status === "active",
    planName: row.plan_name,
    territoryName: row.territory_name ?? null,
    managerUserId: row.manager_user_id ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    effectiveStartDate: row.effective_start_date,
    effectiveEndDate: row.effective_end_date ?? null,
    northStarMetric: row.north_star_metric,
    northStarTarget: Number(row.north_star_target ?? 0),
    northStarTargetDate: row.north_star_target_date ?? null,
    stretchTarget: row.stretch_target == null ? null : Number(row.stretch_target),
    blueprintKey: row.blueprint_key ?? null,
    templateId: row.template_id ?? null,
    isPrototype: Boolean(row.is_prototype),
    headline: row.headline ?? null,
    subtitle: row.subtitle ?? null,
    commissionEnabled: Boolean(row.commission_enabled),
    commissionRules: row.commission_rules ?? {},
    accountExpectations: row.account_expectations ?? {},
    rhythms: row.rhythms ?? {},
    features: row.features ?? {},
    supersedesPlanId: row.supersedes_plan_id ?? null,
    supersededByPlanId: row.superseded_by_plan_id ?? null,
    submittedBy: row.submitted_by ?? null,
    submittedAt: row.submitted_at ?? null,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    publishedBy: row.published_by ?? null,
    publishedAt: row.published_at ?? null,
    archivedBy: row.archived_by ?? null,
    archivedAt: row.archived_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPeriod(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    period: row.period,
    label: row.label,
    year: row.year,
    installedTarget: Number(row.installed_target ?? 0),
    rollingThreeMonthTarget: Number(row.rolling_three_month_target ?? 0),
    qualifiedPipelineTarget: Number(row.qualified_pipeline_target ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMetric(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    metricKey: row.metric_key,
    label: row.label,
    unit: row.unit,
    cadence: row.cadence,
    targetValue: Number(row.target_value ?? 0),
    warningThreshold: row.warning_threshold == null ? null : Number(row.warning_threshold),
    sourceAuthority: row.source_authority,
    displayOrder: Number(row.display_order ?? 100),
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCopy(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    copyKey: row.copy_key,
    payload: row.payload ?? {},
    updatedAt: row.updated_at
  };
}

function mapScorecard(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    userId: row.user_id,
    period: row.period,
    installed: Number(row.installed ?? 0),
    pipeline: Number(row.pipeline ?? 0),
    quoted: Number(row.quoted ?? 0),
    awarded: Number(row.awarded ?? 0),
    touches: Number(row.touches ?? 0),
    meetings: Number(row.meetings ?? 0),
    opportunities: Number(row.opportunities ?? 0),
    followUp: Number(row.follow_up ?? 0),
    repeatShare: Number(row.repeat_share ?? 0),
    note: row.note ?? "",
    sources: row.sources ?? {},
    targetSnapshot: row.target_snapshot ?? {},
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMondayConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    enabled: Boolean(row.enabled),
    readEnabled: row.read_enabled !== false,
    writeEnabled: Boolean(row.write_enabled),
    accountMasterBoardId: row.account_master_board_id ?? null,
    subitemBoardId: row.subitem_board_id ?? null,
    columnMap: row.column_map ?? {},
    boardSchema: row.board_schema ?? {},
    webhookIds: row.webhook_ids ?? [],
    lastFullSyncAt: row.last_full_sync_at ?? null,
    lastFullReconcileAt: row.last_full_reconcile_at ?? null,
    lastWebhookAt: row.last_webhook_at ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    lastError: row.last_error ?? null,
    schemaInspectedAt: row.schema_inspected_at ?? null,
    membershipHash: row.membership_hash ?? null,
    updatedAt: row.updated_at
  };
}

function mapRepMapping(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    mondayUserId: String(row.monday_user_id),
    salespersonLabel: row.salesperson_label ?? null,
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    mondayBoardId: row.monday_board_id,
    mondayItemId: String(row.monday_item_id),
    accountDirectoryAccountId: row.account_directory_account_id ?? null,
    accountName: row.account_name,
    mondayUrl: row.monday_url ?? null,
    mondayGroup: row.monday_group ?? null,
    groupId: row.group_id ?? null,
    mondayAssignedUserId: row.monday_assigned_user_id ?? null,
    assignedUserId: row.assigned_user_id ?? null,
    status: row.status ?? null,
    lastContact: row.last_contact ?? null,
    nextContact: row.next_contact ?? null,
    market: row.market ?? null,
    branch: row.branch ?? null,
    accountType: row.account_type ?? null,
    sampleProgram: row.sample_program ?? null,
    currentPrimarySupplier: row.current_primary_supplier ?? null,
    primaryPainPoint: row.primary_pain_point ?? null,
    esfSolution: row.esf_solution ?? null,
    nextStrategicMilestone: row.next_strategic_milestone ?? null,
    targetSqFtPerMonth: row.target_sqft_per_month == null ? null : Number(row.target_sqft_per_month),
    keyContact: row.key_contact ?? null,
    estKitchensPerMonth: row.est_kitchens_per_month == null ? null : Number(row.est_kitchens_per_month),
    description: row.description ?? null,
    mondayCreatedAt: row.monday_created_at ?? null,
    mondayUpdatedAt: row.monday_updated_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    sourceState: row.source_state || (row.archived ? "archived" : "active"),
    syncedAt: row.synced_at ?? null,
    archived: Boolean(row.archived),
    lastEliteosMutationHash: row.last_eliteos_mutation_hash ?? null,
    lastEliteosMutationAt: row.last_eliteos_mutation_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapIntel(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    recommendedTier: row.recommended_tier ?? null,
    strategicPlay: row.strategic_play ?? null,
    recommendedMonthlyTarget: row.recommended_monthly_target == null ? null : Number(row.recommended_monthly_target),
    nextActions: row.next_actions ?? [],
    performance: row.performance ?? null,
    identityMatch: row.identity_match ?? null,
    snapshotAt: row.snapshot_at,
    source: row.source,
    updatedAt: row.updated_at
  };
}

function mapActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id ?? null,
    userId: row.user_id ?? null,
    eventType: row.event_type,
    source: row.source,
    externalId: row.external_id ?? null,
    occurredAt: row.occurred_at,
    status: row.status ?? null,
    summary: row.summary ?? null,
    payload: row.payload ?? {},
    createdAt: row.created_at
  };
}

function mapSyncLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    direction: row.direction,
    entity: row.entity,
    mondayItemId: row.monday_item_id ?? null,
    mondayUpdateId: row.monday_update_id ?? null,
    operation: row.operation,
    outcome: row.outcome,
    error: row.error ?? null,
    actorUserId: row.actor_user_id ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  };
}

function mapManager(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    managerUserId: row.manager_user_id,
    reportUserId: row.report_user_id,
    canViewCommission: Boolean(row.can_view_commission),
    canMutateAccounts: Boolean(row.can_mutate_accounts),
    active: row.active !== false,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCommission(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    planId: row.plan_id ?? null,
    snapshotKey: row.snapshot_key,
    payload: row.payload ?? {},
    updatedAt: row.updated_at
  };
}

function accountWrite(row) {
  return {
    organization_id: row.organizationId,
    monday_board_id: row.mondayBoardId,
    monday_item_id: String(row.mondayItemId),
    account_directory_account_id: row.accountDirectoryAccountId ?? null,
    account_name: row.accountName,
    monday_url: row.mondayUrl ?? null,
    monday_group: row.mondayGroup ?? null,
    group_id: row.groupId ?? null,
    monday_assigned_user_id: row.mondayAssignedUserId ?? null,
    assigned_user_id: row.assignedUserId ?? null,
    status: row.status ?? null,
    last_contact: row.lastContact ?? null,
    next_contact: row.nextContact ?? null,
    market: row.market ?? null,
    branch: row.branch ?? null,
    account_type: row.accountType ?? null,
    sample_program: row.sampleProgram ?? null,
    current_primary_supplier: row.currentPrimarySupplier ?? null,
    primary_pain_point: row.primaryPainPoint ?? null,
    esf_solution: row.esfSolution ?? null,
    next_strategic_milestone: row.nextStrategicMilestone ?? null,
    target_sqft_per_month: row.targetSqFtPerMonth ?? null,
    key_contact: row.keyContact ?? null,
    est_kitchens_per_month: row.estKitchensPerMonth ?? null,
    description: row.description ?? null,
    monday_created_at: row.mondayCreatedAt ?? null,
    monday_updated_at: row.mondayUpdatedAt ?? null,
    last_seen_at: row.lastSeenAt ?? null,
    source_state: row.sourceState || (row.archived ? "archived" : "active"),
    synced_at: row.syncedAt ?? null,
    archived: Boolean(row.archived),
    last_eliteos_mutation_hash: row.lastEliteosMutationHash ?? null,
    last_eliteos_mutation_at: row.lastEliteosMutationAt ?? null
  };
}

/**
 * @param {() => import("@supabase/supabase-js").SupabaseClient} getSupabase
 */
export function createSalesOpsSupabaseStore(getSupabase) {
  if (typeof getSupabase !== "function") {
    throw new Error("createSalesOpsSupabaseStore: getSupabase required");
  }
  const db = () => getSupabase();

  return {
    kind: "supabase",

    seedUser() {
      return null;
    },
    getUser() {
      return null;
    },

    async insertPlan(row) {
      const status = row.status || "draft";
      if (status === "active") {
        const { error: deactErr } = await db()
          .from("sales_ops_plans")
          .update({ status: "superseded" })
          .eq("organization_id", row.organizationId)
          .eq("user_id", row.userId)
          .eq("status", "active");
        if (deactErr) throwDb(deactErr, "Could not supersede prior active sales plans.");
      }
      const { data, error } = await db()
        .from("sales_ops_plans")
        .insert({
          organization_id: row.organizationId,
          user_id: row.userId,
          plan_family_id: row.planFamilyId,
          version_number: Number(row.versionNumber ?? 1),
          status,
          plan_name: row.planName,
          territory_name: row.territoryName ?? null,
          manager_user_id: row.managerUserId ?? null,
          start_date: row.startDate,
          end_date: row.endDate,
          effective_start_date: row.effectiveStartDate || row.startDate,
          effective_end_date: row.effectiveEndDate ?? row.endDate ?? null,
          north_star_metric: row.northStarMetric ?? "installed_sqft_per_month",
          north_star_target: Number(row.northStarTarget ?? 0),
          north_star_target_date: row.northStarTargetDate ?? null,
          stretch_target: row.stretchTarget ?? null,
          blueprint_key: row.blueprintKey ?? null,
          template_id: row.templateId ?? null,
          is_prototype: Boolean(row.isPrototype),
          headline: row.headline ?? null,
          subtitle: row.subtitle ?? null,
          commission_enabled: Boolean(row.commissionEnabled),
          commission_rules: row.commissionRules ?? {},
          account_expectations: row.accountExpectations ?? {},
          rhythms: row.rhythms ?? {},
          features: row.features ?? {},
          supersedes_plan_id: row.supersedesPlanId ?? null,
          created_by: row.createdBy ?? null
        })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not create sales plan.");
      return mapPlan(data);
    },

    async getActivePlan(organizationId, userId) {
      const { data, error } = await db()
        .from("sales_ops_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (error) throwDb(error, "Could not load sales plan.");
      return mapPlan(data);
    },

    async listPlansForUser(organizationId, userId) {
      const { data, error } = await db()
        .from("sales_ops_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .order("version_number", { ascending: false });
      if (error) throwDb(error, "Could not list sales plans.");
      return (data || []).map(mapPlan);
    },

    async getPlanById(organizationId, planId) {
      const { data, error } = await db()
        .from("sales_ops_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", planId)
        .maybeSingle();
      if (error) throwDb(error, "Could not load sales plan.");
      return mapPlan(data);
    },

    async listPlansForOrg(organizationId) {
      const { data, error } = await db()
        .from("sales_ops_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false });
      if (error) throwDb(error, "Could not list sales plans.");
      return (data || []).map(mapPlan);
    },

    async updatePlan(organizationId, planId, patch) {
      const next = {};
      const map = [
        ["planName", "plan_name"],
        ["territoryName", "territory_name"],
        ["managerUserId", "manager_user_id"],
        ["startDate", "start_date"],
        ["endDate", "end_date"],
        ["effectiveStartDate", "effective_start_date"],
        ["effectiveEndDate", "effective_end_date"],
        ["northStarMetric", "north_star_metric"],
        ["northStarTarget", "north_star_target"],
        ["northStarTargetDate", "north_star_target_date"],
        ["stretchTarget", "stretch_target"],
        ["blueprintKey", "blueprint_key"],
        ["templateId", "template_id"],
        ["isPrototype", "is_prototype"],
        ["headline", "headline"],
        ["subtitle", "subtitle"],
        ["commissionEnabled", "commission_enabled"],
        ["commissionRules", "commission_rules"],
        ["accountExpectations", "account_expectations"],
        ["rhythms", "rhythms"],
        ["features", "features"],
        ["status", "status"],
        ["versionNumber", "version_number"],
        ["supersedesPlanId", "supersedes_plan_id"],
        ["supersededByPlanId", "superseded_by_plan_id"],
        ["submittedBy", "submitted_by"],
        ["submittedAt", "submitted_at"],
        ["approvedBy", "approved_by"],
        ["approvedAt", "approved_at"],
        ["publishedBy", "published_by"],
        ["publishedAt", "published_at"],
        ["archivedBy", "archived_by"],
        ["archivedAt", "archived_at"]
      ];
      for (const [camel, snake] of map) {
        if (patch[camel] !== undefined) next[snake] = patch[camel];
      }
      const { data, error } = await db()
        .from("sales_ops_plans")
        .update(next)
        .eq("organization_id", organizationId)
        .eq("id", planId)
        .select("*")
        .maybeSingle();
      if (error) throwDb(error, "Could not update sales plan.");
      return mapPlan(data);
    },

    async replacePeriodTargets(organizationId, planId, rows) {
      const { error: delErr } = await db()
        .from("sales_ops_plan_period_targets")
        .delete()
        .eq("organization_id", organizationId)
        .eq("plan_id", planId);
      if (delErr) throwDb(delErr, "Could not replace period targets.");
      if (!rows?.length) return [];
      const { data, error } = await db()
        .from("sales_ops_plan_period_targets")
        .insert(
          rows.map((row) => ({
            organization_id: organizationId,
            plan_id: planId,
            period: row.period,
            label: row.label,
            year: row.year,
            installed_target: Number(row.installedTarget ?? 0),
            rolling_three_month_target: Number(row.rollingThreeMonthTarget ?? 0),
            qualified_pipeline_target: Number(row.qualifiedPipelineTarget ?? 0)
          }))
        )
        .select("*");
      if (error) throwDb(error, "Could not save period targets.");
      return (data || []).map(mapPeriod);
    },

    async listPeriodTargets(organizationId, planId) {
      const { data, error } = await db()
        .from("sales_ops_plan_period_targets")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("plan_id", planId)
        .order("period", { ascending: true });
      if (error) throwDb(error, "Could not load period targets.");
      return (data || []).map(mapPeriod);
    },

    async replaceMetricTargets(organizationId, planId, rows) {
      const { error: delErr } = await db()
        .from("sales_ops_plan_metric_targets")
        .delete()
        .eq("organization_id", organizationId)
        .eq("plan_id", planId);
      if (delErr) throwDb(delErr, "Could not replace metric targets.");
      if (!rows?.length) return [];
      const { data, error } = await db()
        .from("sales_ops_plan_metric_targets")
        .insert(
          rows.map((row) => ({
            organization_id: organizationId,
            plan_id: planId,
            metric_key: row.metricKey,
            label: row.label,
            unit: row.unit || "count",
            cadence: row.cadence || "weekly",
            target_value: Number(row.targetValue ?? 0),
            warning_threshold: row.warningThreshold ?? null,
            source_authority: row.sourceAuthority || "plan",
            display_order: Number(row.displayOrder ?? 100),
            active: row.active !== false
          }))
        )
        .select("*");
      if (error) throwDb(error, "Could not save metric targets.");
      return (data || []).map(mapMetric);
    },

    async listMetricTargets(organizationId, planId) {
      const { data, error } = await db()
        .from("sales_ops_plan_metric_targets")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("plan_id", planId)
        .eq("active", true)
        .order("display_order", { ascending: true });
      if (error) throwDb(error, "Could not load metric targets.");
      return (data || []).map(mapMetric);
    },

    async upsertPlanCopy(organizationId, planId, copyKey, payload) {
      const { data, error } = await db()
        .from("sales_ops_plan_copy")
        .upsert(
          {
            organization_id: organizationId,
            plan_id: planId,
            copy_key: copyKey,
            payload: payload ?? {}
          },
          { onConflict: "plan_id,copy_key" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save plan copy.");
      return mapCopy(data);
    },

    async getPlanCopy(organizationId, planId, copyKey) {
      const { data, error } = await db()
        .from("sales_ops_plan_copy")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("plan_id", planId)
        .eq("copy_key", copyKey)
        .maybeSingle();
      if (error) throwDb(error, "Could not load plan copy.");
      return mapCopy(data);
    },

    async listPlanCopy(organizationId, planId) {
      const { data, error } = await db()
        .from("sales_ops_plan_copy")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("plan_id", planId);
      if (error) throwDb(error, "Could not list plan copy.");
      return (data || []).map(mapCopy);
    },

    async upsertScorecard(row) {
      const { data, error } = await db()
        .from("sales_ops_scorecards")
        .upsert(
          {
            organization_id: row.organizationId,
            plan_id: row.planId,
            user_id: row.userId,
            period: row.period,
            installed: Number(row.installed ?? 0),
            pipeline: Number(row.pipeline ?? 0),
            quoted: Number(row.quoted ?? 0),
            awarded: Number(row.awarded ?? 0),
            touches: Number(row.touches ?? 0),
            meetings: Number(row.meetings ?? 0),
            opportunities: Number(row.opportunities ?? 0),
            follow_up: Number(row.followUp ?? 0),
            repeat_share: Number(row.repeatShare ?? 0),
            note: row.note ?? "",
            sources: row.sources ?? {},
            target_snapshot: row.targetSnapshot ?? {},
            created_by: row.createdBy ?? null
          },
          { onConflict: "organization_id,user_id,period" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save scorecard.");
      return mapScorecard(data);
    },

    async listScorecards(organizationId, userId) {
      const { data, error } = await db()
        .from("sales_ops_scorecards")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .order("period", { ascending: true });
      if (error) throwDb(error, "Could not load scorecards.");
      return (data || []).map(mapScorecard);
    },

    async getScorecardById(organizationId, scorecardId) {
      const { data, error } = await db()
        .from("sales_ops_scorecards")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", scorecardId)
        .maybeSingle();
      if (error) throwDb(error, "Could not load scorecard.");
      return mapScorecard(data);
    },

    async upsertMondayConfig(row) {
      const existing = await this.getMondayConfig(row.organizationId);
      const payload = {
        organization_id: row.organizationId,
        enabled: row.enabled != null ? Boolean(row.enabled) : existing?.enabled ?? false,
        read_enabled: row.readEnabled != null ? Boolean(row.readEnabled) : existing?.readEnabled ?? true,
        write_enabled: row.writeEnabled != null ? Boolean(row.writeEnabled) : existing?.writeEnabled ?? false,
        account_master_board_id:
          row.accountMasterBoardId !== undefined ? row.accountMasterBoardId : existing?.accountMasterBoardId ?? null,
        subitem_board_id: row.subitemBoardId !== undefined ? row.subitemBoardId : existing?.subitemBoardId ?? null,
        column_map: row.columnMap != null ? row.columnMap : existing?.columnMap ?? {},
        board_schema: row.boardSchema != null ? row.boardSchema : existing?.boardSchema ?? {},
        webhook_ids: row.webhookIds != null ? row.webhookIds : existing?.webhookIds ?? [],
        last_full_sync_at: row.lastFullSyncAt !== undefined ? row.lastFullSyncAt : existing?.lastFullSyncAt ?? null,
        last_full_reconcile_at:
          row.lastFullReconcileAt !== undefined ? row.lastFullReconcileAt : existing?.lastFullReconcileAt ?? null,
        last_webhook_at: row.lastWebhookAt !== undefined ? row.lastWebhookAt : existing?.lastWebhookAt ?? null,
        last_success_at: row.lastSuccessAt !== undefined ? row.lastSuccessAt : existing?.lastSuccessAt ?? null,
        last_error: row.lastError !== undefined ? row.lastError : existing?.lastError ?? null,
        schema_inspected_at: row.schemaInspectedAt !== undefined ? row.schemaInspectedAt : existing?.schemaInspectedAt ?? null,
        membership_hash: row.membershipHash !== undefined ? row.membershipHash : existing?.membershipHash ?? null
      };
      const { data, error } = await db()
        .from("sales_ops_monday_config")
        .upsert(payload, { onConflict: "organization_id" })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday Sales Ops config.");
      return mapMondayConfig(data);
    },

    async getMondayConfig(organizationId) {
      const { data, error } = await db()
        .from("sales_ops_monday_config")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throwDb(error, "Could not load Monday Sales Ops config.");
      return mapMondayConfig(data);
    },

    async getOrganizationIdByBoardId(boardId) {
      const id = String(boardId ?? "").trim();
      if (!id) return null;
      const { data, error } = await db()
        .from("sales_ops_monday_config")
        .select("organization_id")
        .or(`account_master_board_id.eq.${id},subitem_board_id.eq.${id}`)
        .maybeSingle();
      if (error) {
        const fallback = await db()
          .from("sales_ops_monday_config")
          .select("organization_id")
          .eq("account_master_board_id", id)
          .maybeSingle();
        if (fallback.error) throwDb(fallback.error, "Could not resolve organization from Monday board.");
        return fallback.data?.organization_id ?? null;
      }
      return data?.organization_id ?? null;
    },

    async upsertRepMapping(row) {
      const { error: deactErr } = await db()
        .from("sales_ops_monday_rep_mappings")
        .update({ active: false })
        .eq("organization_id", row.organizationId)
        .eq("active", true)
        .or(`user_id.eq.${row.userId},monday_user_id.eq.${String(row.mondayUserId)}`);
      if (deactErr) throwDb(deactErr, "Could not deactivate prior Monday rep mappings.");
      const { data, error } = await db()
        .from("sales_ops_monday_rep_mappings")
        .insert({
          organization_id: row.organizationId,
          user_id: row.userId,
          monday_user_id: String(row.mondayUserId),
          salesperson_label: row.salespersonLabel ?? null,
          active: row.active !== false
        })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday rep mapping.");
      return mapRepMapping(data);
    },

    async getRepMappingByMondayUser(organizationId, mondayUserId) {
      const { data, error } = await db()
        .from("sales_ops_monday_rep_mappings")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("monday_user_id", String(mondayUserId ?? ""))
        .eq("active", true)
        .maybeSingle();
      if (error) throwDb(error, "Could not load Monday rep mapping.");
      return mapRepMapping(data);
    },

    async getRepMappingByUser(organizationId, userId) {
      const { data, error } = await db()
        .from("sales_ops_monday_rep_mappings")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (error) throwDb(error, "Could not load Monday rep mapping.");
      return mapRepMapping(data);
    },

    async upsertAccount(row) {
      const existing = await this.getAccountByMondayItem(row.organizationId, row.mondayItemId);
      const payload = accountWrite({ ...existing, ...row, archived: row.archived ?? existing?.archived ?? false });
      if (existing) {
        const { data, error } = await db()
          .from("sales_ops_accounts")
          .update(payload)
          .eq("id", existing.id)
          .eq("organization_id", row.organizationId)
          .select("*")
          .single();
        if (error) throwDb(error, "Could not update Sales Ops account.");
        return mapAccount(data);
      }
      const { data, error } = await db().from("sales_ops_accounts").insert(payload).select("*").single();
      if (error) throwDb(error, "Could not create Sales Ops account.");
      return mapAccount(data);
    },

    async getAccount(organizationId, accountId) {
      const { data, error } = await db()
        .from("sales_ops_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", accountId)
        .maybeSingle();
      if (error) throwDb(error, "Could not load Sales Ops account.");
      return mapAccount(data);
    },

    async getAccountByMondayItem(organizationId, mondayItemId) {
      const { data, error } = await db()
        .from("sales_ops_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("monday_item_id", String(mondayItemId ?? ""))
        .maybeSingle();
      if (error) throwDb(error, "Could not load Sales Ops account.");
      return mapAccount(data);
    },

    async listAccountsForUser(organizationId, userId) {
      const { data, error } = await db()
        .from("sales_ops_accounts")
        .select(ACCOUNT_LIST_SELECT)
        .eq("organization_id", organizationId)
        .eq("assigned_user_id", userId)
        .eq("archived", false)
        .eq("source_state", "active")
        .order("account_name", { ascending: true });
      if (error) {
        const fallback = await db()
          .from("sales_ops_accounts")
          .select(ACCOUNT_LIST_SELECT)
          .eq("organization_id", organizationId)
          .eq("assigned_user_id", userId)
          .eq("archived", false)
          .order("account_name", { ascending: true });
        if (fallback.error) throwDb(fallback.error, "Could not list Sales Ops accounts.");
        return (fallback.data || []).map(mapAccount);
      }
      return (data || []).map(mapAccount);
    },
    async listAccountsPage(organizationId, { assignedUserIds = null, limit = 50, cursor = null, sourceState = "active" } = {}) {
      let q = db()
        .from("sales_ops_accounts")
        .select(ACCOUNT_LIST_SELECT)
        .eq("organization_id", organizationId)
        .eq("archived", false)
        .eq("source_state", sourceState)
        .order("account_name", { ascending: true })
        .order("id", { ascending: true })
        .limit(Number(limit) + 1);
      if (assignedUserIds) {
        if (!assignedUserIds.length) return { rows: [], hasMore: false };
        q = q.in("assigned_user_id", assignedUserIds);
      }
      if (cursor?.n != null && cursor?.i) {
        const name = String(cursor.n).replace(/"/g, '\\"');
        q = q.or(`account_name.gt."${name}",and(account_name.eq."${name}",id.gt.${cursor.i})`);
      }
      const { data, error } = await q;
      if (error) throwDb(error, "Could not list Sales Ops accounts.");
      const rows = (data || []).map(mapAccount);
      const hasMore = rows.length > Number(limit);
      return { rows: hasMore ? rows.slice(0, Number(limit)) : rows, hasMore };
    },

    async listAccountsForOrg(organizationId) {
      const { data, error } = await db()
        .from("sales_ops_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("archived", false);
      if (error) throwDb(error, "Could not list Sales Ops accounts.");
      return (data || []).map(mapAccount);
    },

    async markAccountArchived(organizationId, mondayItemId) {
      const existing = await this.getAccountByMondayItem(organizationId, mondayItemId);
      if (!existing) return null;
      const { data, error } = await db()
        .from("sales_ops_accounts")
        .update({ archived: true, assigned_user_id: null, source_state: "archived" })
        .eq("id", existing.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
      if (error) throwDb(error, "Could not archive Sales Ops account.");
      return mapAccount(data);
    },

    async upsertIntelligence(row) {
      const { data, error } = await db()
        .from("sales_ops_account_intelligence")
        .upsert(
          {
            organization_id: row.organizationId,
            account_id: row.accountId,
            recommended_tier: row.recommendedTier ?? null,
            strategic_play: row.strategicPlay ?? null,
            recommended_monthly_target: row.recommendedMonthlyTarget ?? null,
            next_actions: row.nextActions ?? [],
            performance: row.performance ?? null,
            identity_match: row.identityMatch ?? null,
            snapshot_at: row.snapshotAt ?? new Date().toISOString(),
            source: row.source || "eliteos"
          },
          { onConflict: "account_id" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save account intelligence.");
      return mapIntel(data);
    },

    async getIntelligence(organizationId, accountId) {
      const { data, error } = await db()
        .from("sales_ops_account_intelligence")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throwDb(error, "Could not load account intelligence.");
      return mapIntel(data);
    },

    async insertActivity(row) {
      if (row.externalId) {
        const { data: existing, error: findErr } = await db()
          .from("sales_ops_activity_events")
          .select("*")
          .eq("organization_id", row.organizationId)
          .eq("source", row.source)
          .eq("external_id", row.externalId)
          .maybeSingle();
        if (findErr) throwDb(findErr, "Could not load activity.");
        if (existing) {
          const { data, error } = await db()
            .from("sales_ops_activity_events")
            .update({
              account_id: row.accountId ?? existing.account_id,
              user_id: row.userId ?? existing.user_id,
              event_type: row.eventType || existing.event_type,
              occurred_at: row.occurredAt || existing.occurred_at,
              status: row.status ?? existing.status,
              summary: row.summary ?? existing.summary,
              payload: row.payload ?? existing.payload
            })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (error) throwDb(error, "Could not update activity.");
          return mapActivity(data);
        }
      }
      const { data, error } = await db()
        .from("sales_ops_activity_events")
        .insert({
          organization_id: row.organizationId,
          account_id: row.accountId ?? null,
          user_id: row.userId ?? null,
          event_type: row.eventType,
          source: row.source || "eliteos",
          external_id: row.externalId ?? null,
          occurred_at: row.occurredAt || new Date().toISOString(),
          status: row.status ?? null,
          summary: row.summary ?? null,
          payload: row.payload ?? {}
        })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save activity.");
      return mapActivity(data);
    },

    async listActivitiesForUser(organizationId, userId) {
      const { data, error } = await db()
        .from("sales_ops_activity_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) throwDb(error, "Could not list activities.");
      return (data || []).map(mapActivity);
    },

    async listActivitiesForAccount(organizationId, accountId) {
      const { data, error } = await db()
        .from("sales_ops_activity_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("account_id", accountId)
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) throwDb(error, "Could not list activities.");
      return (data || []).map(mapActivity);
    },

    async insertSyncLog(row) {
      const { data, error } = await db()
        .from("sales_ops_sync_log")
        .insert({
          organization_id: row.organizationId,
          direction: row.direction,
          entity: row.entity,
          monday_item_id: row.mondayItemId ?? null,
          monday_update_id: row.mondayUpdateId ?? null,
          operation: row.operation,
          outcome: row.outcome,
          error: row.error ?? null,
          actor_user_id: row.actorUserId ?? null,
          metadata: row.metadata ?? {}
        })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not write Sales Ops sync log.");
      return mapSyncLog(data);
    },

    async listSyncLog(organizationId, limit = 50) {
      const { data, error } = await db()
        .from("sales_ops_sync_log")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throwDb(error, "Could not list Sales Ops sync log.");
      return (data || []).map(mapSyncLog);
    },

    async recordWebhookEvent(organizationId, eventId, extra = {}) {
      const { data, error } = await db()
        .from("sales_ops_webhook_events")
        .insert({
          organization_id: organizationId,
          event_id: String(eventId),
          event_type: extra.eventType ?? null,
          monday_item_id: extra.mondayItemId ? String(extra.mondayItemId) : null
        })
        .select("*")
        .single();
      if (error) {
        if (String(error.code) === "23505") {
          return { duplicate: true, organizationId, eventId };
        }
        throwDb(error, "Could not record webhook event.");
      }
      return { duplicate: false, organizationId, eventId, processedAt: data?.processed_at };
    },

    async insertManagerAssignment(row) {
      const { data, error } = await db()
        .from("sales_ops_manager_assignments")
        .insert({
          organization_id: row.organizationId,
          manager_user_id: row.managerUserId,
          report_user_id: row.reportUserId,
          can_view_commission: Boolean(row.canViewCommission),
          can_mutate_accounts: Boolean(row.canMutateAccounts),
          active: row.active !== false,
          created_by: row.createdBy ?? null
        })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save manager assignment.");
      return mapManager(data);
    },

    async listReportsForManager(organizationId, managerUserId) {
      const { data, error } = await db()
        .from("sales_ops_manager_assignments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("manager_user_id", managerUserId)
        .eq("active", true);
      if (error) throwDb(error, "Could not list manager assignments.");
      return (data || []).map(mapManager);
    },

    async getManagerAssignment(organizationId, managerUserId, reportUserId) {
      const { data, error } = await db()
        .from("sales_ops_manager_assignments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("manager_user_id", managerUserId)
        .eq("report_user_id", reportUserId)
        .eq("active", true)
        .maybeSingle();
      if (error) throwDb(error, "Could not load manager assignment.");
      return mapManager(data);
    },

    async upsertCommissionSnapshot(row) {
      const { data, error } = await db()
        .from("sales_ops_commission_snapshots")
        .upsert(
          {
            organization_id: row.organizationId,
            user_id: row.userId,
            plan_id: row.planId ?? null,
            snapshot_key: row.snapshotKey || "default",
            payload: row.payload ?? {}
          },
          { onConflict: "organization_id,user_id,snapshot_key" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save commission snapshot.");
      return mapCommission(data);
    },

    async getCommissionSnapshot(organizationId, userId, snapshotKey = "default") {
      const { data, error } = await db()
        .from("sales_ops_commission_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("snapshot_key", snapshotKey)
        .maybeSingle();
      if (error) throwDb(error, "Could not load commission snapshot.");
      return mapCommission(data);
    },

    async insertPlanEvent(row) {
      const { data, error } = await db()
        .from("sales_ops_plan_events")
        .insert({
          organization_id: row.organizationId,
          plan_id: row.planId,
          event_type: row.eventType,
          actor_user_id: row.actorUserId ?? null,
          metadata: row.metadata ?? {}
        })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not write plan event.");
      return {
        id: data.id,
        organizationId: data.organization_id,
        planId: data.plan_id,
        eventType: data.event_type,
        actorUserId: data.actor_user_id,
        metadata: data.metadata ?? {},
        createdAt: data.created_at
      };
    },

    async listPlanEvents(organizationId, planId) {
      const { data, error } = await db()
        .from("sales_ops_plan_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });
      if (error) throwDb(error, "Could not list plan events.");
      return (data || []).map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        planId: row.plan_id,
        eventType: row.event_type,
        actorUserId: row.actor_user_id,
        metadata: row.metadata ?? {},
        createdAt: row.created_at
      }));
    },

    async upsertAcknowledgement(row) {
      const { data, error } = await db()
        .from("sales_ops_plan_acknowledgements")
        .upsert(
          {
            organization_id: row.organizationId,
            plan_id: row.planId,
            user_id: row.userId,
            ack_type: row.ackType || "published_plan",
            comment: row.comment ?? null
          },
          { onConflict: "organization_id,plan_id,user_id" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save plan acknowledgment.");
      return {
        id: data.id,
        organizationId: data.organization_id,
        planId: data.plan_id,
        userId: data.user_id,
        ackType: data.ack_type,
        comment: data.comment,
        acknowledgedAt: data.acknowledged_at
      };
    },

    async getAcknowledgement(organizationId, planId, userId) {
      const { data, error } = await db()
        .from("sales_ops_plan_acknowledgements")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("plan_id", planId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throwDb(error, "Could not load plan acknowledgment.");
      if (!data) return null;
      return {
        id: data.id,
        organizationId: data.organization_id,
        planId: data.plan_id,
        userId: data.user_id,
        ackType: data.ack_type,
        comment: data.comment,
        acknowledgedAt: data.acknowledged_at
      };
    },

    async insertTemplate(row) {
      const { data, error } = await db()
        .from("sales_ops_plan_templates")
        .insert({
          organization_id: row.organizationId,
          template_key: row.templateKey ?? null,
          template_name: row.templateName,
          active: row.active !== false,
          is_prototype: Boolean(row.isPrototype),
          default_duration_months: row.defaultDurationMonths ?? null,
          north_star_metric: row.northStarMetric ?? "installed_sqft_per_month",
          north_star_target: Number(row.northStarTarget ?? 0),
          north_star_target_date: row.northStarTargetDate ?? null,
          stretch_target: row.stretchTarget ?? null,
          territory_name: row.territoryName ?? null,
          commission_enabled: Boolean(row.commissionEnabled),
          commission_rules: row.commissionRules ?? {},
          account_expectations: row.accountExpectations ?? {},
          rhythms: row.rhythms ?? {},
          features: row.features ?? {},
          created_by: row.createdBy ?? null
        })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not create plan template.");
      return mapTemplate(data);
    },

    async getTemplate(organizationId, templateId) {
      const { data, error } = await db()
        .from("sales_ops_plan_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", templateId)
        .maybeSingle();
      if (error) throwDb(error, "Could not load plan template.");
      return mapTemplate(data);
    },

    async getTemplateByKey(organizationId, templateKey) {
      const { data, error } = await db()
        .from("sales_ops_plan_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("template_key", templateKey)
        .maybeSingle();
      if (error) throwDb(error, "Could not load plan template.");
      return mapTemplate(data);
    },

    async listTemplates(organizationId) {
      const { data, error } = await db()
        .from("sales_ops_plan_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("template_name", { ascending: true });
      if (error) throwDb(error, "Could not list plan templates.");
      return (data || []).map(mapTemplate);
    },

    async updateTemplate(organizationId, templateId, patch) {
      const next = {};
      if (patch.templateName != null) next.template_name = patch.templateName;
      if (patch.active != null) next.active = patch.active;
      if (patch.northStarTarget != null) next.north_star_target = patch.northStarTarget;
      if (patch.commissionEnabled != null) next.commission_enabled = Boolean(patch.commissionEnabled);
      if (patch.commissionRules != null) next.commission_rules = patch.commissionRules;
      if (patch.accountExpectations != null) next.account_expectations = patch.accountExpectations;
      if (patch.rhythms != null) next.rhythms = patch.rhythms;
      if (patch.features != null) next.features = patch.features;
      const { data, error } = await db()
        .from("sales_ops_plan_templates")
        .update(next)
        .eq("organization_id", organizationId)
        .eq("id", templateId)
        .select("*")
        .maybeSingle();
      if (error) throwDb(error, "Could not update plan template.");
      return mapTemplate(data);
    },

    async replaceTemplatePeriodTargets(organizationId, templateId, rows) {
      const { error: delErr } = await db()
        .from("sales_ops_plan_template_period_targets")
        .delete()
        .eq("template_id", templateId);
      if (delErr) throwDb(delErr, "Could not replace template period targets.");
      if (!rows?.length) return [];
      const { data, error } = await db()
        .from("sales_ops_plan_template_period_targets")
        .insert(
          rows.map((row) => ({
            organization_id: organizationId,
            template_id: templateId,
            period: row.period,
            label: row.label,
            year: row.year,
            installed_target: Number(row.installedTarget ?? 0),
            rolling_three_month_target: Number(row.rollingThreeMonthTarget ?? 0),
            qualified_pipeline_target: Number(row.qualifiedPipelineTarget ?? 0)
          }))
        )
        .select("*");
      if (error) throwDb(error, "Could not save template period targets.");
      return (data || []).map(mapPeriod);
    },

    async listTemplatePeriodTargets(organizationId, templateId) {
      const { data, error } = await db()
        .from("sales_ops_plan_template_period_targets")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("template_id", templateId)
        .order("period", { ascending: true });
      if (error) throwDb(error, "Could not load template period targets.");
      return (data || []).map((row) => ({
        ...mapPeriod({ ...row, plan_id: row.template_id }),
        templateId: row.template_id
      }));
    },

    async replaceTemplateMetricTargets(organizationId, templateId, rows) {
      const { error: delErr } = await db()
        .from("sales_ops_plan_template_metric_targets")
        .delete()
        .eq("template_id", templateId);
      if (delErr) throwDb(delErr, "Could not replace template metric targets.");
      if (!rows?.length) return [];
      const { data, error } = await db()
        .from("sales_ops_plan_template_metric_targets")
        .insert(
          rows.map((row) => ({
            organization_id: organizationId,
            template_id: templateId,
            metric_key: row.metricKey,
            label: row.label,
            unit: row.unit || "count",
            cadence: row.cadence || "weekly",
            target_value: Number(row.targetValue ?? 0),
            warning_threshold: row.warningThreshold ?? null,
            source_authority: row.sourceAuthority || "plan",
            display_order: Number(row.displayOrder ?? 100),
            active: row.active !== false
          }))
        )
        .select("*");
      if (error) throwDb(error, "Could not save template metric targets.");
      return (data || []).map(mapMetric);
    },

    async listTemplateMetricTargets(organizationId, templateId) {
      const { data, error } = await db()
        .from("sales_ops_plan_template_metric_targets")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("template_id", templateId);
      if (error) throwDb(error, "Could not load template metric targets.");
      return (data || []).map(mapMetric);
    },

    async upsertTemplateCopy(organizationId, templateId, copyKey, payload) {
      const { data, error } = await db()
        .from("sales_ops_plan_template_copy")
        .upsert(
          {
            organization_id: organizationId,
            template_id: templateId,
            copy_key: copyKey,
            payload: payload ?? {}
          },
          { onConflict: "template_id,copy_key" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save template copy.");
      return mapCopy({ ...data, plan_id: data.template_id });
    },

    async listTemplateCopy(organizationId, templateId) {
      const { data, error } = await db()
        .from("sales_ops_plan_template_copy")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("template_id", templateId);
      if (error) throwDb(error, "Could not list template copy.");
      return (data || []).map((row) => mapCopy({ ...row, plan_id: row.template_id }));
    },

    async getMondayAccountDirectoryLink(organizationId, boardId, itemId) {
      const { data, error } = await db()
        .from("account_directory_external_links")
        .select("account_id")
        .eq("organization_id", organizationId)
        .eq("external_system", SALES_OPS_MONDAY_EXTERNAL_SYSTEM)
        .eq("external_id", mondayExternalId(boardId, itemId))
        .eq("is_active", true)
        .maybeSingle();
      if (error) return null;
      return data?.account_id ? { accountId: data.account_id } : null;
    },

    async getMondayItem(organizationId, boardId, mondayItemId) {
      const { data, error } = await db()
        .from("sales_ops_monday_items")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("monday_board_id", String(boardId))
        .eq("monday_item_id", String(mondayItemId))
        .maybeSingle();
      if (error) throwDb(error, "Could not load Monday item mirror.");
      return mapMondayItem(data);
    },
    async upsertMondayItem(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_items")
        .upsert(mondayItemWrite(row), { onConflict: "organization_id,monday_board_id,monday_item_id" })
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday item mirror.");
      return mapMondayItem(data);
    },
    async listMondayItems(organizationId, { boardId = null, parentMondayItemId = null, itemKind = null } = {}) {
      let q = db().from("sales_ops_monday_items").select("*").eq("organization_id", organizationId);
      if (boardId) q = q.eq("monday_board_id", String(boardId));
      if (parentMondayItemId) q = q.eq("parent_monday_item_id", String(parentMondayItemId));
      if (itemKind) q = q.eq("item_kind", itemKind);
      const { data, error } = await q;
      if (error) throwDb(error, "Could not list Monday item mirror.");
      return (data || []).map(mapMondayItem);
    },
    async upsertMondayColumnValue(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_column_values")
        .upsert(
          {
            organization_id: row.organizationId,
            monday_board_id: String(row.mondayBoardId),
            monday_item_id: String(row.mondayItemId),
            column_id: String(row.columnId),
            column_title: row.columnTitle ?? null,
            column_type: row.columnType ?? null,
            display_text: row.displayText ?? null,
            value: row.value === undefined ? null : row.value,
            monday_updated_at: row.mondayUpdatedAt ?? null
          },
          { onConflict: "organization_id,monday_board_id,monday_item_id,column_id" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday column value.");
      return mapMondayColumn(data);
    },
    async listMondayColumnValues(organizationId, boardId, mondayItemId) {
      const { data, error } = await db()
        .from("sales_ops_monday_column_values")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("monday_board_id", String(boardId))
        .eq("monday_item_id", String(mondayItemId));
      if (error) throwDb(error, "Could not list Monday column values.");
      return (data || []).map(mapMondayColumn);
    },
    async upsertMondayUpdate(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_updates")
        .upsert(
          {
            organization_id: row.organizationId,
            monday_board_id: String(row.mondayBoardId),
            monday_item_id: String(row.mondayItemId),
            monday_update_id: String(row.mondayUpdateId),
            parent_monday_update_id: row.parentMondayUpdateId ?? null,
            creator_monday_id: row.creatorMondayId ?? null,
            creator_name: row.creatorName ?? null,
            body_text: row.bodyText ?? null,
            body_html: row.bodyHtml ?? null,
            monday_created_at: row.mondayCreatedAt ?? null,
            monday_updated_at: row.mondayUpdatedAt ?? null,
            source_metadata: row.sourceMetadata ?? {}
          },
          { onConflict: "organization_id,monday_update_id" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday update.");
      return mapMondayUpdate(data);
    },
    async listMondayUpdatesPage(organizationId, mondayItemId, { limit = 50, offset = 0 } = {}) {
      const { data, error, count } = await db()
        .from("sales_ops_monday_updates")
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("monday_item_id", String(mondayItemId))
        .order("monday_created_at", { ascending: false })
        .range(offset, offset + Number(limit) - 1);
      if (error) throwDb(error, "Could not list Monday updates.");
      const rows = (data || []).map(mapMondayUpdate);
      return { rows, hasMore: (count || 0) > offset + rows.length, total: count || 0 };
    },
    async upsertMondayAsset(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_assets")
        .upsert(
          {
            organization_id: row.organizationId,
            monday_board_id: String(row.mondayBoardId),
            monday_item_id: row.mondayItemId ? String(row.mondayItemId) : null,
            monday_update_id: row.mondayUpdateId ? String(row.mondayUpdateId) : null,
            monday_asset_id: String(row.mondayAssetId),
            column_id: row.columnId ?? null,
            filename: row.filename ?? null,
            file_extension: row.fileExtension ?? null,
            file_size: row.fileSize ?? null,
            mime_type: row.mimeType ?? null,
            associated_kind: row.associatedKind || "item",
            monday_created_at: row.mondayCreatedAt ?? null,
            source_metadata: row.sourceMetadata ?? {}
          },
          { onConflict: "organization_id,monday_asset_id" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday asset metadata.");
      return mapMondayAsset(data);
    },
    async listMondayAssetsPage(organizationId, mondayItemId, { limit = 50, offset = 0 } = {}) {
      const { data, error } = await db()
        .from("sales_ops_monday_assets")
        .select("id, organization_id, monday_board_id, monday_item_id, monday_update_id, monday_asset_id, column_id, filename, file_extension, file_size, mime_type, associated_kind, monday_created_at")
        .eq("organization_id", organizationId)
        .eq("monday_item_id", String(mondayItemId))
        .order("filename", { ascending: true })
        .range(offset, offset + Number(limit));
      if (error) throwDb(error, "Could not list Monday assets.");
      const rows = (data || []).map(mapMondayAsset);
      const hasMore = rows.length > Number(limit);
      return { rows: hasMore ? rows.slice(0, Number(limit)) : rows, hasMore };
    },
    async getMondayAsset(organizationId, assetId) {
      const { data, error } = await db()
        .from("sales_ops_monday_assets")
        .select("id, organization_id, monday_board_id, monday_item_id, monday_update_id, monday_asset_id, column_id, filename, file_extension, file_size, mime_type, associated_kind, monday_created_at")
        .eq("organization_id", organizationId)
        .or(`id.eq.${assetId},monday_asset_id.eq.${assetId}`)
        .maybeSingle();
      if (error) throwDb(error, "Could not load Monday asset metadata.");
      return mapMondayAsset(data);
    },
    async upsertMondayDoc(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_docs")
        .upsert(
          {
            organization_id: row.organizationId,
            monday_board_id: String(row.mondayBoardId),
            monday_item_id: String(row.mondayItemId),
            column_id: row.columnId ?? null,
            monday_doc_id: String(row.mondayDocId),
            title: row.title ?? null,
            source_url: row.sourceUrl ?? null,
            accessibility: row.accessibility || "unknown",
            blocks: row.blocks ?? [],
            source_metadata: row.sourceMetadata ?? {}
          },
          { onConflict: "organization_id,monday_doc_id,monday_item_id" }
        )
        .select("id, organization_id, monday_board_id, monday_item_id, column_id, monday_doc_id, title, source_url, accessibility")
        .single();
      if (error) throwDb(error, "Could not save Monday doc metadata.");
      return mapMondayDoc(data);
    },
    async listMondayDocs(organizationId, { mondayItemId = null, limit = 50, offset = 0 } = {}) {
      let q = db()
        .from("sales_ops_monday_docs")
        .select("id, organization_id, monday_board_id, monday_item_id, column_id, monday_doc_id, title, source_url, accessibility")
        .eq("organization_id", organizationId)
        .range(offset, offset + Number(limit));
      if (mondayItemId) q = q.eq("monday_item_id", String(mondayItemId));
      const { data, error } = await q;
      if (error) throwDb(error, "Could not list Monday docs.");
      const rows = (data || []).map(mapMondayDoc);
      const hasMore = rows.length > Number(limit);
      return { rows: hasMore ? rows.slice(0, Number(limit)) : rows, hasMore };
    },
    async getMondayDoc(organizationId, docRowId) {
      const { data, error } = await db()
        .from("sales_ops_monday_docs")
        .select("id, organization_id, monday_board_id, monday_item_id, column_id, monday_doc_id, title, source_url, accessibility")
        .eq("organization_id", organizationId)
        .or(`id.eq.${docRowId},monday_doc_id.eq.${docRowId}`)
        .maybeSingle();
      if (error) throwDb(error, "Could not load Monday doc metadata.");
      return mapMondayDoc(data);
    },
    async upsertMondayUser(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_users")
        .upsert(
          {
            organization_id: row.organizationId,
            monday_user_id: String(row.mondayUserId),
            kind: row.kind || "person",
            display_name: row.displayName ?? null,
            email: row.email ?? null,
            source_metadata: row.sourceMetadata ?? {},
            last_seen_at: row.lastSeenAt ?? null
          },
          { onConflict: "organization_id,monday_user_id" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday user cache.");
      return mapMondayUser(data);
    },
    async listMondayUsers(organizationId) {
      const { data, error } = await db().from("sales_ops_monday_users").select("*").eq("organization_id", organizationId);
      if (error) throwDb(error, "Could not list Monday users.");
      return (data || []).map(mapMondayUser);
    },
    async upsertMondayGroup(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_groups")
        .upsert(
          {
            organization_id: row.organizationId,
            monday_board_id: String(row.mondayBoardId),
            monday_group_id: String(row.mondayGroupId),
            title: row.title ?? null,
            position: row.position ?? null,
            archived: Boolean(row.archived)
          },
          { onConflict: "organization_id,monday_board_id,monday_group_id" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday group.");
      return data;
    },
    async upsertMondaySyncState(row) {
      const { data, error } = await db()
        .from("sales_ops_monday_sync_state")
        .upsert(
          {
            organization_id: row.organizationId,
            monday_board_id: String(row.mondayBoardId),
            sync_mode: row.syncMode || "full",
            last_successful_reconcile_at: row.lastSuccessfulReconcileAt ?? null,
            last_complete_census_at: row.lastCompleteCensusAt ?? null,
            last_cursor: row.lastCursor ?? null,
            membership_hash: row.membershipHash ?? null,
            last_error: row.lastError ?? null,
            metadata: row.metadata ?? {}
          },
          { onConflict: "organization_id,monday_board_id,sync_mode" }
        )
        .select("*")
        .single();
      if (error) throwDb(error, "Could not save Monday sync state.");
      return data;
    },
    async markUnseenMondaySourcesUnavailable(organizationId, boardId, censusStartedAt) {
      await db()
        .from("sales_ops_monday_items")
        .update({ source_state: "unavailable" })
        .eq("organization_id", organizationId)
        .eq("source_state", "active")
        .lt("last_seen_at", censusStartedAt);
      await db()
        .from("sales_ops_accounts")
        .update({ source_state: "unavailable", archived: true })
        .eq("organization_id", organizationId)
        .eq("monday_board_id", String(boardId))
        .eq("source_state", "active")
        .lt("last_seen_at", censusStartedAt);
      return { marked: true };
    },
    async countMondayMirrorStats(organizationId) {
      const items = await db()
        .from("sales_ops_monday_items")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      const linked = await db()
        .from("sales_ops_accounts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("archived", false)
        .eq("source_state", "active")
        .not("account_directory_account_id", "is", null);
      const unlinked = await db()
        .from("sales_ops_accounts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("archived", false)
        .eq("source_state", "active")
        .is("account_directory_account_id", null);
      const people = await db()
        .from("sales_ops_monday_users")
        .select("monday_user_id")
        .eq("organization_id", organizationId)
        .eq("kind", "person");
      const mappings = await db()
        .from("sales_ops_monday_rep_mappings")
        .select("monday_user_id")
        .eq("organization_id", organizationId)
        .eq("active", true);
      const mapped = new Set((mappings.data || []).map((r) => String(r.monday_user_id)));
      const unmappedMondayPeopleCount = (people.data || []).filter((p) => !mapped.has(String(p.monday_user_id))).length;
      return {
        mirrorItemCount: items.count || 0,
        linkedAccountDirectoryCount: linked.count || 0,
        unlinkedCount: unlinked.count || 0,
        unmappedMondayPeopleCount
      };
    }
  };
}

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    templateKey: row.template_key ?? null,
    templateName: row.template_name,
    active: row.active !== false,
    isPrototype: Boolean(row.is_prototype),
    defaultDurationMonths: row.default_duration_months ?? null,
    northStarMetric: row.north_star_metric,
    northStarTarget: Number(row.north_star_target ?? 0),
    northStarTargetDate: row.north_star_target_date ?? null,
    stretchTarget: row.stretch_target == null ? null : Number(row.stretch_target),
    territoryName: row.territory_name ?? null,
    commissionEnabled: Boolean(row.commission_enabled),
    commissionRules: row.commission_rules ?? {},
    accountExpectations: row.account_expectations ?? {},
    rhythms: row.rhythms ?? {},
    features: row.features ?? {},
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mondayItemWrite(row) {
  return {
    organization_id: row.organizationId,
    monday_board_id: String(row.mondayBoardId),
    monday_item_id: String(row.mondayItemId),
    parent_monday_item_id: row.parentMondayItemId ?? null,
    item_kind: row.itemKind || "item",
    item_name: row.itemName ?? "",
    group_id: row.groupId ?? null,
    group_title: row.groupTitle ?? null,
    monday_url: row.mondayUrl ?? null,
    description: row.description ?? null,
    monday_created_at: row.mondayCreatedAt ?? null,
    monday_updated_at: row.mondayUpdatedAt ?? null,
    source_state: row.sourceState || "active",
    last_seen_at: row.lastSeenAt ?? null,
    source_snapshot: row.sourceSnapshot ?? {}
  };
}

function mapMondayItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    mondayBoardId: row.monday_board_id,
    mondayItemId: String(row.monday_item_id),
    parentMondayItemId: row.parent_monday_item_id ?? null,
    itemKind: row.item_kind,
    itemName: row.item_name,
    groupId: row.group_id ?? null,
    groupTitle: row.group_title ?? null,
    mondayUrl: row.monday_url ?? null,
    description: row.description ?? null,
    mondayCreatedAt: row.monday_created_at ?? null,
    mondayUpdatedAt: row.monday_updated_at ?? null,
    sourceState: row.source_state,
    lastSeenAt: row.last_seen_at ?? null
  };
}

function mapMondayColumn(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    mondayBoardId: row.monday_board_id,
    mondayItemId: String(row.monday_item_id),
    columnId: row.column_id,
    columnTitle: row.column_title ?? null,
    columnType: row.column_type ?? null,
    displayText: row.display_text ?? null,
    value: row.value,
    mondayUpdatedAt: row.monday_updated_at ?? null
  };
}

function mapMondayUpdate(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    mondayBoardId: row.monday_board_id,
    mondayItemId: String(row.monday_item_id),
    mondayUpdateId: String(row.monday_update_id),
    parentMondayUpdateId: row.parent_monday_update_id ?? null,
    creatorMondayId: row.creator_monday_id ?? null,
    creatorName: row.creator_name ?? null,
    bodyText: row.body_text ?? null,
    bodyHtml: row.body_html ?? null,
    mondayCreatedAt: row.monday_created_at ?? null
  };
}

function mapMondayAsset(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    mondayBoardId: row.monday_board_id,
    mondayItemId: row.monday_item_id ?? null,
    mondayUpdateId: row.monday_update_id ?? null,
    mondayAssetId: String(row.monday_asset_id),
    columnId: row.column_id ?? null,
    filename: row.filename ?? null,
    fileExtension: row.file_extension ?? null,
    fileSize: row.file_size ?? null,
    mimeType: row.mime_type ?? null,
    associatedKind: row.associated_kind,
    mondayCreatedAt: row.monday_created_at ?? null
  };
}

function mapMondayDoc(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    mondayBoardId: row.monday_board_id,
    mondayItemId: String(row.monday_item_id),
    columnId: row.column_id ?? null,
    mondayDocId: String(row.monday_doc_id),
    title: row.title ?? null,
    sourceUrl: row.source_url ?? null,
    accessibility: row.accessibility || "unknown"
  };
}

function mapMondayUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    mondayUserId: String(row.monday_user_id),
    kind: row.kind,
    displayName: row.display_name ?? null,
    email: row.email ?? null,
    lastSeenAt: row.last_seen_at ?? null
  };
}
