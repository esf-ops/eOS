/**
 * ProductionTakeoffAdapter — Phase 6P.1 contract + fake only.
 *
 * Does NOT import or invoke:
 *   - takeoff workspace / extraction / AI providers
 *   - Internal Estimate import helpers
 *   - Storage / Graph
 *
 * Live invocation is deferred to Phase 6P.6.
 */

export const PRODUCTION_TAKEOFF_ADAPTER_NAME = "ProductionTakeoffAdapter";

/**
 * @typedef {Object} ProductionTakeoffCreateRequest
 * @property {string} organizationId
 * @property {string} intakeCaseId
 * @property {string} intakeAttachmentId
 * @property {string} [quoteFileId]
 * @property {{ type: "system"|"user", userId?: string, automationDecisionId: string }} actor
 * @property {"automatic"|"manual"} initiationMode
 * @property {string} idempotencyKey
 */

/**
 * @typedef {{ ok: true, takeoffJobId: string } | { ok: false, reason: string, code?: string }} ProductionTakeoffCreateResult
 */

/**
 * @typedef {Object} ProductionTakeoffAdapter
 * @property {string} name
 * @property {(req: ProductionTakeoffCreateRequest) => Promise<ProductionTakeoffCreateResult>} createFromIntake
 * @property {(takeoffJobId: string, organizationId: string) => Promise<{ status: string }|null>} getJobStatus
 * @property {(takeoffJobId: string, organizationId: string) => Promise<object|null>} getLatestResult
 * @property {(intakeCaseId: string) => Promise<object[]>} listLinkedJobs
 */

/**
 * Fake adapter for 6P.1 — records intents; never starts the production pipeline.
 * Explicitly refuses createFromIntake so accidental calls cannot create jobs.
 */
export class FakeProductionTakeoffAdapter {
  constructor() {
    this.name = PRODUCTION_TAKEOFF_ADAPTER_NAME;
    /** @type {ProductionTakeoffCreateRequest[]} */
    this.createAttempts = [];
  }

  /**
   * @param {ProductionTakeoffCreateRequest} req
   * @returns {Promise<ProductionTakeoffCreateResult>}
   */
  async createFromIntake(req) {
    this.createAttempts.push({ ...req });
    return {
      ok: false,
      reason: "takeoff_invocation_disabled_in_6p1",
      code: "takeoff_invocation_disabled"
    };
  }

  async getJobStatus() {
    return null;
  }

  async getLatestResult() {
    return null;
  }

  async listLinkedJobs() {
    return [];
  }

  /** Intentionally absent as a supported adapter operation — IE import is prohibited. */
  importToInternalEstimate() {
    const err = new Error("IE import must never be called from Quote Intake");
    err.code = "ie_import_prohibited";
    throw err;
  }
}

/**
 * @returns {FakeProductionTakeoffAdapter}
 */
export function createFakeProductionTakeoffAdapter() {
  return new FakeProductionTakeoffAdapter();
}
