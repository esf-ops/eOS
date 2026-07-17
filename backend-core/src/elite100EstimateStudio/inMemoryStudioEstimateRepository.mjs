/**
 * In-memory Elite 100 Studio estimate repository (tests / explicit memory mode only).
 */
import { randomUUID } from "node:crypto";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  applyStudioEstimatePatch,
  buildStudioEstimateRow,
  normOrg
} from "./studioEstimateRow.mjs";

export class InMemoryStudioEstimateRepository {
  constructor() {
    /** @type {Map<string, object>} */
    this.byId = new Map();
    /** @type {Map<string, string>} org|caseId → active estimate id */
    this.activeByCase = new Map();
  }

  caseKey(organizationId, intakeCaseId) {
    return `${normOrg(organizationId)}|${String(intakeCaseId).trim()}`;
  }

  async getActiveByIntakeCase(organizationId, intakeCaseId) {
    const id = this.activeByCase.get(this.caseKey(organizationId, intakeCaseId));
    if (!id) return null;
    const row = this.byId.get(id);
    return row ? structuredClone(row) : null;
  }

  async getById(organizationId, estimateId) {
    const row = this.byId.get(String(estimateId ?? "").trim());
    if (!row) return null;
    if (row.organizationId !== normOrg(organizationId)) return null;
    return structuredClone(row);
  }

  async listByIntakeCase(organizationId, intakeCaseId) {
    const org = normOrg(organizationId);
    const caseId = String(intakeCaseId ?? "").trim();
    return [...this.byId.values()]
      .filter((r) => r.organizationId === org && r.intakeCaseId === caseId)
      .sort((a, b) => Number(b.revision) - Number(a.revision))
      .map((r) => structuredClone(r));
  }

  async create(input) {
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
      return structuredClone(existing);
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
    this.byId.set(row.id, row);
    this.activeByCase.set(this.caseKey(organizationId, intakeCaseId), row.id);
    return structuredClone(row);
  }

  async update(organizationId, estimateId, patch, actorUserId = null) {
    const row = this.byId.get(String(estimateId ?? "").trim());
    if (!row || row.organizationId !== normOrg(organizationId)) {
      const err = new Error("Estimate not found");
      err.statusCode = 404;
      err.code = "estimate_not_found";
      throw err;
    }
    const next = applyStudioEstimatePatch(row, patch, actorUserId);
    this.byId.set(row.id, next);
    if (next.status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
      const key = this.caseKey(organizationId, next.intakeCaseId);
      if (this.activeByCase.get(key) === next.id) this.activeByCase.delete(key);
    } else {
      this.activeByCase.set(this.caseKey(organizationId, next.intakeCaseId), next.id);
    }
    return structuredClone(next);
  }

  /**
   * Supersede approved/active row (preserving its calculation + approval) and open a new revision.
   */
  async createRevisionFrom(organizationId, estimateId, input, actorUserId = null) {
    const current = await this.getById(organizationId, estimateId);
    if (!current) {
      const err = new Error("Estimate not found");
      err.statusCode = 404;
      err.code = "estimate_not_found";
      throw err;
    }
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

export const sharedInMemoryStudioEstimateRepository = new InMemoryStudioEstimateRepository();
