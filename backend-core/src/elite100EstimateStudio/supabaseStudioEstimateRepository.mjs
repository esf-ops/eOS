/**
 * Supabase-backed Elite 100 Studio estimate repository.
 * Fail-closed when the table is missing or the client errors.
 */
import { randomUUID } from "node:crypto";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  applyStudioEstimatePatch,
  buildStudioEstimateRow,
  dbRowToStudioEstimate,
  normOrg,
  studioEstimateToDbInsert,
  studioEstimateToDbUpdate
} from "./studioEstimateRow.mjs";

const TABLE = "studio_estimates";

function persistenceError(message, cause) {
  const err = new Error(message);
  err.statusCode = 503;
  err.code = "studio_estimate_persistence_unavailable";
  err.cause = cause;
  return err;
}

function isUniqueViolation(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate") || msg.includes("unique");
}

function isMissingTable(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("could not find the table") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

export class SupabaseStudioEstimateRepository {
  /**
   * @param {{ db: import("@supabase/supabase-js").SupabaseClient, assertReady?: boolean }} opts
   */
  constructor(opts) {
    if (!opts?.db) {
      throw persistenceError("Supabase client required for studio estimate persistence");
    }
    this.db = opts.db;
    this._ready = null;
  }

  async assertReady() {
    if (this._ready === true) return;
    const { error } = await this.db.from(TABLE).select("id").limit(1);
    if (error) {
      if (isMissingTable(error)) {
        throw persistenceError(
          "studio_estimates table is unavailable — apply eliteos_studio_estimates_v1.sql",
          error
        );
      }
      throw persistenceError("Studio estimate persistence check failed", error);
    }
    this._ready = true;
  }

  async getActiveByIntakeCase(organizationId, intakeCaseId) {
    await this.assertReady();
    const org = normOrg(organizationId);
    const caseId = String(intakeCaseId ?? "").trim();
    const { data, error } = await this.db
      .from(TABLE)
      .select("*")
      .eq("organization_id", org)
      .eq("intake_case_id", caseId)
      .neq("status", STUDIO_ESTIMATE_STATUSES.SUPERSEDED)
      .order("revision", { ascending: false })
      .limit(1);
    if (error) {
      if (isMissingTable(error)) {
        this._ready = false;
        throw persistenceError(
          "studio_estimates table is unavailable — apply eliteos_studio_estimates_v1.sql",
          error
        );
      }
      throw persistenceError("Failed to load active studio estimate", error);
    }
    return data?.[0] ? dbRowToStudioEstimate(data[0]) : null;
  }

  async getById(organizationId, estimateId) {
    await this.assertReady();
    const org = normOrg(organizationId);
    const id = String(estimateId ?? "").trim();
    const { data, error } = await this.db
      .from(TABLE)
      .select("*")
      .eq("organization_id", org)
      .eq("id", id)
      .limit(1);
    if (error) {
      throw persistenceError("Failed to load studio estimate", error);
    }
    return data?.[0] ? dbRowToStudioEstimate(data[0]) : null;
  }

  async listByIntakeCase(organizationId, intakeCaseId) {
    await this.assertReady();
    const org = normOrg(organizationId);
    const caseId = String(intakeCaseId ?? "").trim();
    const { data, error } = await this.db
      .from(TABLE)
      .select("*")
      .eq("organization_id", org)
      .eq("intake_case_id", caseId)
      .order("revision", { ascending: false });
    if (error) throw persistenceError("Failed to list studio estimates", error);
    return (data || []).map(dbRowToStudioEstimate);
  }

  async create(input) {
    await this.assertReady();
    const organizationId = normOrg(input.organizationId);
    const intakeCaseId = String(input.intakeCaseId ?? "").trim();
    if (!organizationId || !intakeCaseId) {
      const err = new Error("organizationId and intakeCaseId required");
      err.statusCode = 400;
      err.code = "invalid_estimate";
      throw err;
    }

    const existing = await this.getActiveByIntakeCase(organizationId, intakeCaseId);
    if (existing && existing.status !== STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
      return existing;
    }

    const row = buildStudioEstimateRow({
      id: input.id || randomUUID(),
      organizationId,
      intakeCaseId,
      takeoffJobId: input.takeoffJobId,
      sourceTakeoffResultId: input.sourceTakeoffResultId,
      status: input.status,
      revision: input.revision ?? 1,
      scope: input.scope,
      calculationSnapshot: input.calculationSnapshot ?? null,
      approval: input.approval ?? null,
      staleReason: input.staleReason ?? null,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId
    });

    const { data, error } = await this.db
      .from(TABLE)
      .insert(studioEstimateToDbInsert(row))
      .select("*")
      .limit(1);

    if (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.getActiveByIntakeCase(organizationId, intakeCaseId);
        if (raced) return raced;
      }
      if (isMissingTable(error)) {
        this._ready = false;
        throw persistenceError(
          "studio_estimates table is unavailable — apply eliteos_studio_estimates_v1.sql",
          error
        );
      }
      throw persistenceError("Failed to create studio estimate", error);
    }
    return dbRowToStudioEstimate(data[0]);
  }

  async update(organizationId, estimateId, patch, actorUserId = null) {
    await this.assertReady();
    const current = await this.getById(organizationId, estimateId);
    if (!current) {
      const err = new Error("Estimate not found");
      err.statusCode = 404;
      err.code = "estimate_not_found";
      throw err;
    }
    const next = applyStudioEstimatePatch(current, patch, actorUserId);
    const { data, error } = await this.db
      .from(TABLE)
      .update(studioEstimateToDbUpdate(next))
      .eq("organization_id", normOrg(organizationId))
      .eq("id", current.id)
      .select("*")
      .limit(1);
    if (error) {
      throw persistenceError("Failed to update studio estimate", error);
    }
    if (!data?.[0]) {
      const err = new Error("Estimate not found");
      err.statusCode = 404;
      err.code = "estimate_not_found";
      throw err;
    }
    return dbRowToStudioEstimate(data[0]);
  }

  async createRevisionFrom(organizationId, estimateId, input, actorUserId = null) {
    const current = await this.getById(organizationId, estimateId);
    if (!current) {
      const err = new Error("Estimate not found");
      err.statusCode = 404;
      err.code = "estimate_not_found";
      throw err;
    }
    // Preserve approved calculation/approval on superseded row.
    await this.update(
      organizationId,
      current.id,
      { status: STUDIO_ESTIMATE_STATUSES.SUPERSEDED },
      actorUserId
    );
    return this.create({
      organizationId,
      intakeCaseId: current.intakeCaseId,
      takeoffJobId: input.takeoffJobId ?? current.takeoffJobId,
      sourceTakeoffResultId: input.sourceTakeoffResultId ?? current.sourceTakeoffResultId,
      status: input.status || STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      revision: Number(current.revision || 1) + 1,
      scope: input.scope ?? current.scope,
      accountDirectoryAccountId:
        "accountDirectoryAccountId" in input
          ? input.accountDirectoryAccountId
          : current.accountDirectoryAccountId,
      accountDirectoryContactId:
        "accountDirectoryContactId" in input
          ? input.accountDirectoryContactId
          : current.accountDirectoryContactId,
      accountDirectoryLocationId:
        "accountDirectoryLocationId" in input
          ? input.accountDirectoryLocationId
          : current.accountDirectoryLocationId,
      customerIdentitySnapshot:
        "customerIdentitySnapshot" in input
          ? input.customerIdentitySnapshot
          : current.customerIdentitySnapshot,
      staleReason: input.staleReason ?? null,
      createdByUserId: actorUserId || current.createdByUserId
    });
  }

  async supersedeActive(organizationId, intakeCaseId, actorUserId = null) {
    const current = await this.getActiveByIntakeCase(organizationId, intakeCaseId);
    if (!current) return null;
    return this.update(
      organizationId,
      current.id,
      { status: STUDIO_ESTIMATE_STATUSES.SUPERSEDED },
      actorUserId
    );
  }
}
