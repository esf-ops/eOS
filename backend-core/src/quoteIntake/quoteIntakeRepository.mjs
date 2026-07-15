/**
 * Quote Intake — Phase 6P.1 in-memory repository.
 * Organization-scoped. No Supabase. No Graph. No Storage.
 *
 * Dedupe keys (per org):
 *   - internetMessageId (when present)
 *   - contentHash (when present)
 */

import { randomUUID } from "node:crypto";
import {
  AUDIT_ACTOR_TYPE,
  AUTOMATION_PATH,
  AUTOMATION_REASON_CODE,
  QUOTE_INTAKE_CASE_STATUS,
  TAKEOFF_INITIATION_MODE,
  TAKEOFF_LINK_RELATIONSHIP_STATUS,
  isQuoteIntakeCaseStatus
} from "./quoteIntakeTypes.mjs";

/**
 * @typedef {Object} QuoteIntakeAttachmentMeta
 * @property {string} id
 * @property {string} sha256
 * @property {string} [mimeType]
 * @property {number} [sizeBytes]
 * @property {string} [safeFilename]
 */

/**
 * @typedef {Object} QuoteIntakeSourceMessageMeta
 * @property {string} [internetMessageId]
 * @property {string} [contentHash]
 * @property {string} [graphMessageIdHash]
 * @property {string} [fromAddressHash]
 */

/**
 * @typedef {Object} QuoteIntakeCase
 * @property {string} id
 * @property {string} organizationId
 * @property {string} status
 * @property {QuoteIntakeSourceMessageMeta} sourceMessage
 * @property {QuoteIntakeAttachmentMeta[]} attachments
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} createdByUserId
 */

/**
 * @typedef {Object} QuoteIntakeAutomationDecision
 * @property {string} id
 * @property {string} organizationId
 * @property {string} intakeCaseId
 * @property {string} path
 * @property {string[]} reasonCodes
 * @property {boolean} wouldStartTakeoff
 * @property {string} createdAt
 * @property {string} actorType
 * @property {string|null} actorUserId
 * @property {string} [note]
 */

/**
 * @typedef {Object} QuoteIntakeTakeoffLink
 * @property {string} id
 * @property {string} organizationId
 * @property {string} intakeCaseId
 * @property {string|null} takeoffJobId
 * @property {string} [sourceAttachmentId]
 * @property {string} [attachmentSha256]
 * @property {string} relationshipStatus
 * @property {string} initiationMode
 * @property {string|null} automationDecisionId
 * @property {string} idempotencyKey
 * @property {string} createdAt
 * @property {string} actorType
 * @property {string|null} createdBy
 */

/**
 * @typedef {Object} QuoteIntakeAuditEvent
 * @property {string} id
 * @property {string} organizationId
 * @property {string} intakeCaseId
 * @property {string} eventType
 * @property {string} createdAt
 * @property {string} actorType
 * @property {string|null} actorUserId
 * @property {Record<string, unknown>} [metadata]
 */

function nowIso() {
  return new Date().toISOString();
}

function normOrg(organizationId) {
  const id = String(organizationId ?? "").trim();
  if (!id) {
    const err = new Error("organizationId is required");
    err.code = "organization_required";
    err.statusCode = 400;
    throw err;
  }
  return id;
}

function normSha(sha) {
  return String(sha ?? "")
    .trim()
    .toLowerCase();
}

/**
 * In-memory Quote Intake repository (process-local).
 */
export class InMemoryQuoteIntakeRepository {
  constructor() {
    /** @type {Map<string, QuoteIntakeCase>} */
    this.cases = new Map();
    /** @type {Map<string, QuoteIntakeAutomationDecision>} */
    this.decisions = new Map();
    /** @type {Map<string, QuoteIntakeTakeoffLink>} */
    this.links = new Map();
    /** @type {Map<string, QuoteIntakeAuditEvent[]>} */
    this.auditByCase = new Map();
    /** @type {Map<string, string>} org|imd → caseId */
    this.dedupeByInternetMessageId = new Map();
    /** @type {Map<string, string>} org|hash → caseId */
    this.dedupeByContentHash = new Map();
  }

  clear() {
    this.cases.clear();
    this.decisions.clear();
    this.links.clear();
    this.auditByCase.clear();
    this.dedupeByInternetMessageId.clear();
    this.dedupeByContentHash.clear();
  }

  /**
   * @param {{
   *   organizationId: string,
   *   createdByUserId?: string|null,
   *   status?: string,
   *   sourceMessage?: QuoteIntakeSourceMessageMeta,
   *   attachments?: Array<{ sha256: string, mimeType?: string, sizeBytes?: number, safeFilename?: string }>
   * }} input
   */
  createCase(input) {
    const organizationId = normOrg(input.organizationId);
    const sourceMessage = {
      internetMessageId: String(input.sourceMessage?.internetMessageId ?? "").trim() || undefined,
      contentHash: String(input.sourceMessage?.contentHash ?? "").trim() || undefined,
      graphMessageIdHash: String(input.sourceMessage?.graphMessageIdHash ?? "").trim() || undefined,
      fromAddressHash: String(input.sourceMessage?.fromAddressHash ?? "").trim() || undefined
    };

    if (sourceMessage.internetMessageId) {
      const key = `${organizationId}|${sourceMessage.internetMessageId}`;
      const existingId = this.dedupeByInternetMessageId.get(key);
      if (existingId) {
        const err = new Error("Duplicate internetMessageId for organization");
        err.code = "duplicate_message";
        err.statusCode = 409;
        err.existingCaseId = existingId;
        throw err;
      }
    }
    if (sourceMessage.contentHash) {
      const key = `${organizationId}|${sourceMessage.contentHash}`;
      const existingId = this.dedupeByContentHash.get(key);
      if (existingId) {
        const err = new Error("Duplicate contentHash for organization");
        err.code = "duplicate_message";
        err.statusCode = 409;
        err.existingCaseId = existingId;
        throw err;
      }
    }

    const status = input.status && isQuoteIntakeCaseStatus(input.status)
      ? input.status
      : QUOTE_INTAKE_CASE_STATUS.RECEIVED;

    const attachments = (input.attachments ?? []).map((a) => {
      const sha256 = normSha(a.sha256);
      if (!/^[a-f0-9]{64}$/.test(sha256)) {
        const err = new Error("attachment.sha256 must be 64-char hex");
        err.code = "invalid_attachment";
        err.statusCode = 400;
        throw err;
      }
      return {
        id: randomUUID(),
        sha256,
        mimeType: a.mimeType ? String(a.mimeType).slice(0, 128) : undefined,
        sizeBytes: Number.isFinite(Number(a.sizeBytes)) ? Number(a.sizeBytes) : undefined,
        safeFilename: a.safeFilename ? String(a.safeFilename).slice(0, 200) : undefined
      };
    });

    const ts = nowIso();
    /** @type {QuoteIntakeCase} */
    const row = {
      id: randomUUID(),
      organizationId,
      status,
      sourceMessage,
      attachments,
      createdAt: ts,
      updatedAt: ts,
      createdByUserId: input.createdByUserId ? String(input.createdByUserId) : null
    };

    this.cases.set(row.id, row);
    if (sourceMessage.internetMessageId) {
      this.dedupeByInternetMessageId.set(`${organizationId}|${sourceMessage.internetMessageId}`, row.id);
    }
    if (sourceMessage.contentHash) {
      this.dedupeByContentHash.set(`${organizationId}|${sourceMessage.contentHash}`, row.id);
    }

    this.#appendAudit({
      organizationId,
      intakeCaseId: row.id,
      eventType: "case_created",
      actorType: input.createdByUserId ? AUDIT_ACTOR_TYPE.USER : AUDIT_ACTOR_TYPE.SYSTEM,
      actorUserId: input.createdByUserId ? String(input.createdByUserId) : null,
      metadata: {
        status: row.status,
        attachmentCount: attachments.length,
        hasInternetMessageId: Boolean(sourceMessage.internetMessageId),
        hasContentHash: Boolean(sourceMessage.contentHash)
      }
    });

    return structuredClone(row);
  }

  /**
   * @param {string} organizationId
   * @param {{ limit?: number }} [query]
   */
  listCases(organizationId, query = {}) {
    const org = normOrg(organizationId);
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const rows = [...this.cases.values()]
      .filter((c) => c.organizationId === org)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map((c) => structuredClone(c));
    return rows;
  }

  /**
   * @param {string} organizationId
   * @param {string} caseId
   */
  getCase(organizationId, caseId) {
    const org = normOrg(organizationId);
    const row = this.cases.get(String(caseId ?? "").trim());
    if (!row || row.organizationId !== org) return null;
    return structuredClone(row);
  }

  /**
   * @param {{
   *   organizationId: string,
   *   intakeCaseId: string,
   *   path: string,
   *   reasonCodes?: string[],
   *   wouldStartTakeoff?: boolean,
   *   actorType?: string,
   *   actorUserId?: string|null,
   *   note?: string
   * }} input
   */
  recordAutomationDecision(input) {
    const organizationId = normOrg(input.organizationId);
    const intakeCaseId = String(input.intakeCaseId ?? "").trim();
    const existing = this.getCase(organizationId, intakeCaseId);
    if (!existing) {
      const err = new Error("Case not found");
      err.code = "case_not_found";
      err.statusCode = 404;
      throw err;
    }

    const path = String(input.path ?? "").trim();
    if (path !== AUTOMATION_PATH.TRUSTED_AUTOMATIC_TAKEOFF && path !== AUTOMATION_PATH.MANUAL_REVIEW) {
      const err = new Error("Invalid automation path");
      err.code = "invalid_automation_path";
      err.statusCode = 400;
      throw err;
    }

    // 6P.1: never claim takeoff started — Path A can be recorded as "would" only.
    const wouldStartTakeoff = path === AUTOMATION_PATH.TRUSTED_AUTOMATIC_TAKEOFF
      ? Boolean(input.wouldStartTakeoff)
      : false;

    const reasonCodes = (input.reasonCodes?.length
      ? input.reasonCodes
      : [AUTOMATION_REASON_CODE.STUB_RECORDED]
    ).map((c) => String(c));

    /** @type {QuoteIntakeAutomationDecision} */
    const decision = {
      id: randomUUID(),
      organizationId,
      intakeCaseId,
      path,
      reasonCodes,
      wouldStartTakeoff,
      createdAt: nowIso(),
      actorType: input.actorType === AUDIT_ACTOR_TYPE.SYSTEM ? AUDIT_ACTOR_TYPE.SYSTEM : AUDIT_ACTOR_TYPE.USER,
      actorUserId: input.actorUserId ? String(input.actorUserId) : null,
      note: input.note ? String(input.note).slice(0, 500) : undefined
    };

    this.decisions.set(decision.id, decision);

    // Path A recording in 6P.1 does not create takeoff jobs — status stays ready or manual.
    const nextStatus =
      path === AUTOMATION_PATH.MANUAL_REVIEW
        ? QUOTE_INTAKE_CASE_STATUS.MANUAL_REVIEW
        : QUOTE_INTAKE_CASE_STATUS.READY_FOR_TAKEOFF;

    const live = this.cases.get(intakeCaseId);
    if (live) {
      live.status = nextStatus;
      live.updatedAt = nowIso();
    }

    this.#appendAudit({
      organizationId,
      intakeCaseId,
      eventType: "automation_decision_recorded",
      actorType: decision.actorType,
      actorUserId: decision.actorUserId,
      metadata: {
        decisionId: decision.id,
        path: decision.path,
        wouldStartTakeoff: decision.wouldStartTakeoff,
        reasonCodeCount: reasonCodes.length
      }
    });

    return structuredClone(decision);
  }

  /**
   * Structure-only takeoff link (no live job). takeoffJobId may be null.
   * Enforces idempotency key uniqueness per organization.
   * @param {{
   *   organizationId: string,
   *   intakeCaseId: string,
   *   takeoffJobId?: string|null,
   *   sourceAttachmentId?: string,
   *   attachmentSha256?: string,
   *   relationshipStatus?: string,
   *   initiationMode?: string,
   *   automationDecisionId?: string|null,
   *   idempotencyKey: string,
   *   actorType?: string,
   *   createdBy?: string|null
   * }} input
   */
  createTakeoffLink(input) {
    const organizationId = normOrg(input.organizationId);
    const intakeCaseId = String(input.intakeCaseId ?? "").trim();
    if (!this.getCase(organizationId, intakeCaseId)) {
      const err = new Error("Case not found");
      err.code = "case_not_found";
      err.statusCode = 404;
      throw err;
    }

    const idempotencyKey = String(input.idempotencyKey ?? "").trim();
    if (!idempotencyKey) {
      const err = new Error("idempotencyKey is required");
      err.code = "idempotency_required";
      err.statusCode = 400;
      throw err;
    }

    for (const link of this.links.values()) {
      if (link.organizationId === organizationId && link.idempotencyKey === idempotencyKey) {
        return structuredClone(link);
      }
    }

    /** @type {QuoteIntakeTakeoffLink} */
    const link = {
      id: randomUUID(),
      organizationId,
      intakeCaseId,
      takeoffJobId: input.takeoffJobId ? String(input.takeoffJobId) : null,
      sourceAttachmentId: input.sourceAttachmentId ? String(input.sourceAttachmentId) : undefined,
      attachmentSha256: input.attachmentSha256 ? normSha(input.attachmentSha256) : undefined,
      relationshipStatus:
        input.relationshipStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.REQUESTED,
      initiationMode: input.initiationMode || TAKEOFF_INITIATION_MODE.MANUAL,
      automationDecisionId: input.automationDecisionId ? String(input.automationDecisionId) : null,
      idempotencyKey,
      createdAt: nowIso(),
      actorType: input.actorType === AUDIT_ACTOR_TYPE.SYSTEM ? AUDIT_ACTOR_TYPE.SYSTEM : AUDIT_ACTOR_TYPE.USER,
      createdBy: input.createdBy ? String(input.createdBy) : null
    };

    this.links.set(link.id, link);
    this.#appendAudit({
      organizationId,
      intakeCaseId,
      eventType: "takeoff_link_recorded",
      actorType: link.actorType,
      actorUserId: link.createdBy,
      metadata: {
        linkId: link.id,
        hasTakeoffJobId: Boolean(link.takeoffJobId),
        initiationMode: link.initiationMode,
        relationshipStatus: link.relationshipStatus
      }
    });
    return structuredClone(link);
  }

  /**
   * @param {string} organizationId
   * @param {string} intakeCaseId
   */
  listTakeoffLinks(organizationId, intakeCaseId) {
    const org = normOrg(organizationId);
    const id = String(intakeCaseId ?? "").trim();
    if (!this.getCase(org, id)) return [];
    return [...this.links.values()]
      .filter((l) => l.organizationId === org && l.intakeCaseId === id)
      .map((l) => structuredClone(l));
  }

  /**
   * @param {string} organizationId
   * @param {string} intakeCaseId
   * @param {{ limit?: number }} [query]
   */
  listAuditEvents(organizationId, intakeCaseId, query = {}) {
    const org = normOrg(organizationId);
    const id = String(intakeCaseId ?? "").trim();
    if (!this.getCase(org, id)) return null;
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
    const events = this.auditByCase.get(id) ?? [];
    return events.slice(-limit).map((e) => structuredClone(e));
  }

  /**
   * @param {Omit<QuoteIntakeAuditEvent, "id"|"createdAt"> & { id?: string, createdAt?: string }} event
   */
  #appendAudit(event) {
    const row = {
      id: event.id || randomUUID(),
      organizationId: event.organizationId,
      intakeCaseId: event.intakeCaseId,
      eventType: event.eventType,
      createdAt: event.createdAt || nowIso(),
      actorType: event.actorType,
      actorUserId: event.actorUserId ?? null,
      metadata: event.metadata ? { ...event.metadata } : undefined
    };
    const list = this.auditByCase.get(row.intakeCaseId) ?? [];
    list.push(row);
    this.auditByCase.set(row.intakeCaseId, list);
  }
}

/** Shared default instance for the Node process when routes do not inject a repo. */
export const sharedInMemoryQuoteIntakeRepository = new InMemoryQuoteIntakeRepository();
