/**
 * SupabaseQuoteIntakeRepository — Phase 6P.2 central persistence.
 *
 * Contract-compatible with InMemoryQuoteIntakeRepository.
 * Every method requires trusted organizationId (never from untrusted payload alone).
 * Service-role clients bypass RLS; org filters are still applied on every query.
 *
 * No Graph, Storage uploads, Takeoff jobs, Gemini, or IE import.
 */

import {
  AUDIT_ACTOR_TYPE,
  AUTOMATION_PATH,
  AUTOMATION_REASON_CODE,
  QUOTE_INTAKE_CASE_STATUS,
  TAKEOFF_INITIATION_MODE,
  TAKEOFF_LINK_RELATIONSHIP_STATUS,
  isQuoteIntakeCaseStatus
} from "./quoteIntakeTypes.mjs";
import { sanitizeQuoteIntakeAuditMetadata } from "./quoteIntakeAuditSanitize.mjs";

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

function isUniqueViolation(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint");
}

function toRepoError(error, op) {
  if (error?.statusCode && error?.code) return error;
  const e = new Error("Quote Intake persistence operation failed");
  e.code = isUniqueViolation(error) ? "duplicate_message" : "quote_intake_persistence_error";
  e.statusCode = isUniqueViolation(error) ? 409 : 503;
  e.op = op;
  if (error?.code) e.pgCode = String(error.code);
  return e;
}

function mapCaseRow(row, attachments = []) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status,
    sourceMessage: {
      internetMessageId: row.internet_message_id || undefined,
      contentHash: row.content_hash || undefined,
      graphMessageIdHash: row.graph_message_id_hash || undefined,
      fromAddressHash: row.from_address_hash || undefined
    },
    attachments: attachments.map((a) => ({
      id: a.id,
      sha256: a.sha256,
      mimeType: a.mime_type || undefined,
      sizeBytes: a.size_bytes == null ? undefined : Number(a.size_bytes),
      safeFilename: a.safe_filename || undefined
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id ?? null
  };
}

function mapDecisionRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    intakeCaseId: row.intake_case_id,
    path: row.path,
    reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes.map(String) : [],
    wouldStartTakeoff: Boolean(row.would_start_takeoff),
    createdAt: row.created_at,
    actorType: row.actor_type,
    actorUserId: row.actor_user_id ?? null,
    note: row.reason_summary || undefined
  };
}

function mapLinkRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    intakeCaseId: row.intake_case_id,
    takeoffJobId: row.takeoff_job_id ?? null,
    sourceAttachmentId: row.intake_attachment_id || undefined,
    attachmentSha256: row.attachment_sha256 || undefined,
    relationshipStatus: row.relationship_status,
    initiationMode: row.initiation_mode,
    automationDecisionId: row.automation_decision_id ?? null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    actorType: row.actor_type,
    createdBy: row.created_by_user_id ?? null
  };
}

function mapAuditRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    intakeCaseId: row.intake_case_id,
    eventType: row.event_type,
    createdAt: row.created_at,
    actorType: row.actor_type,
    actorUserId: row.actor_user_id ?? null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  };
}

export class SupabaseQuoteIntakeRepository {
  /**
   * @param {{ getSupabase?: () => any, client?: any }} deps
   */
  constructor(deps) {
    if (deps?.client) {
      this._client = deps.client;
      this._getSupabase = null;
    } else if (typeof deps?.getSupabase === "function") {
      this._getSupabase = deps.getSupabase;
      this._client = null;
    } else {
      throw new Error("SupabaseQuoteIntakeRepository requires getSupabase or client");
    }
  }

  db() {
    if (this._client) return this._client;
    const c = this._getSupabase();
    if (!c?.from) {
      const err = new Error("Quote Intake Supabase client unavailable");
      err.code = "quote_intake_persistence_misconfigured";
      err.statusCode = 503;
      throw err;
    }
    return c;
  }

  /**
   * Append-only — throw if callers attempt mutation APIs.
   */
  updateAuditEvent() {
    const err = new Error("quote_intake_audit_events are append-only");
    err.code = "audit_immutable";
    err.statusCode = 405;
    throw err;
  }

  deleteAuditEvent() {
    const err = new Error("quote_intake_audit_events are append-only");
    err.code = "audit_immutable";
    err.statusCode = 405;
    throw err;
  }

  async #loadAttachments(organizationId, caseId) {
    const { data, error } = await this.db()
      .from("quote_intake_attachments")
      .select("id,sha256,mime_type,size_bytes,safe_filename,intake_case_id,organization_id")
      .eq("organization_id", organizationId)
      .eq("intake_case_id", caseId);
    if (error) throw toRepoError(error, "loadAttachments");
    return data ?? [];
  }

  async #appendAudit(event) {
    const metadata = sanitizeQuoteIntakeAuditMetadata(event.metadata ?? {});
    const { error } = await this.db()
      .from("quote_intake_audit_events")
      .insert({
        organization_id: event.organizationId,
        intake_case_id: event.intakeCaseId,
        event_type: event.eventType,
        actor_type: event.actorType,
        actor_user_id: event.actorUserId ?? null,
        metadata
      });
    if (error) throw toRepoError(error, "appendAudit");
  }

  async #findExistingByDedupe(organizationId, sourceMessage) {
    // Primary: internetMessageId when present (authoritative).
    if (sourceMessage.internetMessageId) {
      const { data, error } = await this.db()
        .from("quote_intake_cases")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("internet_message_id", sourceMessage.internetMessageId)
        .maybeSingle();
      if (error) throw toRepoError(error, "dedupeLookupMessageId");
      if (data) return data;
      // Do not fall through to content-hash merge when Message-ID is present.
      return null;
    }
    // Fallback: content_hash only among cases that also lack a Message-ID.
    if (sourceMessage.contentHash) {
      const { data, error } = await this.db()
        .from("quote_intake_cases")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("content_hash", sourceMessage.contentHash);
      if (error) throw toRepoError(error, "dedupeLookupContentHash");
      const match = (data ?? []).find((row) => !String(row.internet_message_id ?? "").trim());
      if (match) return match;
    }
    return null;
  }

  /**
   * @param {{
   *   organizationId: string,
   *   createdByUserId?: string|null,
   *   status?: string,
   *   sourceMessage?: object,
   *   attachments?: Array<{ sha256: string, mimeType?: string, sizeBytes?: number, safeFilename?: string }>
   * }} input
   */
  async createCase(input) {
    const organizationId = normOrg(input.organizationId);
    const sourceMessage = {
      internetMessageId: String(input.sourceMessage?.internetMessageId ?? "").trim() || null,
      contentHash: String(input.sourceMessage?.contentHash ?? "").trim() || null,
      graphMessageIdHash: String(input.sourceMessage?.graphMessageIdHash ?? "").trim() || null,
      fromAddressHash: String(input.sourceMessage?.fromAddressHash ?? "").trim() || null
    };

    const existing = await this.#findExistingByDedupe(organizationId, {
      internetMessageId: sourceMessage.internetMessageId || undefined,
      contentHash: sourceMessage.contentHash || undefined
    });
    if (existing) {
      const err = new Error("Duplicate message for organization");
      err.code = "duplicate_message";
      err.statusCode = 409;
      err.existingCaseId = existing.id;
      throw err;
    }

    const status =
      input.status && isQuoteIntakeCaseStatus(input.status)
        ? input.status
        : QUOTE_INTAKE_CASE_STATUS.RECEIVED;

    /** @type {Map<string, object>} */
    const attachmentBySha = new Map();
    for (const a of input.attachments ?? []) {
      const sha256 = normSha(a.sha256);
      if (!/^[a-f0-9]{64}$/.test(sha256)) {
        const err = new Error("attachment.sha256 must be 64-char hex");
        err.code = "invalid_attachment";
        err.statusCode = 400;
        throw err;
      }
      if (!attachmentBySha.has(sha256)) {
        attachmentBySha.set(sha256, {
          sha256,
          mime_type: a.mimeType ? String(a.mimeType).slice(0, 128) : null,
          size_bytes: Number.isFinite(Number(a.sizeBytes)) ? Number(a.sizeBytes) : null,
          safe_filename: a.safeFilename ? String(a.safeFilename).slice(0, 200) : null
        });
      }
    }

    const insertRow = {
      organization_id: organizationId,
      status,
      source_type: "api",
      internet_message_id: sourceMessage.internetMessageId,
      content_hash: sourceMessage.contentHash,
      graph_message_id_hash: sourceMessage.graphMessageIdHash,
      from_address_hash: sourceMessage.fromAddressHash,
      created_by_user_id: input.createdByUserId ? String(input.createdByUserId) : null
    };

    const { data: caseRow, error: caseError } = await this.db()
      .from("quote_intake_cases")
      .insert(insertRow)
      .select("*")
      .single();

    if (caseError) {
      if (isUniqueViolation(caseError)) {
        const raced = await this.#findExistingByDedupe(organizationId, {
          internetMessageId: sourceMessage.internetMessageId || undefined,
          contentHash: sourceMessage.contentHash || undefined
        });
        const err = new Error("Duplicate message for organization");
        err.code = "duplicate_message";
        err.statusCode = 409;
        err.existingCaseId = raced?.id ?? null;
        throw err;
      }
      throw toRepoError(caseError, "createCase");
    }

    const attachmentRows = [...attachmentBySha.values()].map((a) => ({
      organization_id: organizationId,
      intake_case_id: caseRow.id,
      ...a
    }));

    if (attachmentRows.length) {
      const { error: attError } = await this.db()
        .from("quote_intake_attachments")
        .insert(attachmentRows);
      if (attError) throw toRepoError(attError, "createCase.attachments");
    }

    await this.#appendAudit({
      organizationId,
      intakeCaseId: caseRow.id,
      eventType: "case_created",
      actorType: input.createdByUserId ? AUDIT_ACTOR_TYPE.USER : AUDIT_ACTOR_TYPE.SYSTEM,
      actorUserId: input.createdByUserId ? String(input.createdByUserId) : null,
      metadata: {
        status,
        attachmentCount: attachmentRows.length,
        hasInternetMessageId: Boolean(sourceMessage.internetMessageId),
        hasContentHash: Boolean(sourceMessage.contentHash)
      }
    });

    const attachments = await this.#loadAttachments(organizationId, caseRow.id);
    return mapCaseRow(caseRow, attachments);
  }

  async listCases(organizationId, query = {}) {
    const org = normOrg(organizationId);
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const { data, error } = await this.db()
      .from("quote_intake_cases")
      .select("*")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw toRepoError(error, "listCases");

    const rows = [];
    for (const row of data ?? []) {
      const attachments = await this.#loadAttachments(org, row.id);
      rows.push(mapCaseRow(row, attachments));
    }
    return rows;
  }

  async getCase(organizationId, caseId) {
    const org = normOrg(organizationId);
    const id = String(caseId ?? "").trim();
    const { data, error } = await this.db()
      .from("quote_intake_cases")
      .select("*")
      .eq("organization_id", org)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toRepoError(error, "getCase");
    if (!data) return null;
    const attachments = await this.#loadAttachments(org, id);
    return mapCaseRow(data, attachments);
  }

  async recordAutomationDecision(input) {
    const organizationId = normOrg(input.organizationId);
    const intakeCaseId = String(input.intakeCaseId ?? "").trim();
    const existing = await this.getCase(organizationId, intakeCaseId);
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

    const wouldStartTakeoff =
      path === AUTOMATION_PATH.TRUSTED_AUTOMATIC_TAKEOFF ? Boolean(input.wouldStartTakeoff) : false;
    const reasonCodes = (input.reasonCodes?.length
      ? input.reasonCodes
      : [AUTOMATION_REASON_CODE.STUB_RECORDED]
    ).map((c) => String(c));

    const eligible = path === AUTOMATION_PATH.TRUSTED_AUTOMATIC_TAKEOFF;
    const actorType =
      input.actorType === AUDIT_ACTOR_TYPE.SYSTEM ? AUDIT_ACTOR_TYPE.SYSTEM : AUDIT_ACTOR_TYPE.USER;

    const { data: decision, error } = await this.db()
      .from("quote_intake_automation_decisions")
      .insert({
        organization_id: organizationId,
        intake_case_id: intakeCaseId,
        path,
        reason_codes: reasonCodes,
        decision_version: "6p2_v1",
        eligible,
        would_start_takeoff: wouldStartTakeoff,
        reason_summary: input.note ? String(input.note).slice(0, 500) : null,
        actor_type: actorType,
        actor_user_id: input.actorUserId ? String(input.actorUserId) : null
      })
      .select("*")
      .single();
    if (error) throw toRepoError(error, "recordAutomationDecision");

    const nextStatus =
      path === AUTOMATION_PATH.MANUAL_REVIEW
        ? QUOTE_INTAKE_CASE_STATUS.MANUAL_REVIEW
        : QUOTE_INTAKE_CASE_STATUS.READY_FOR_TAKEOFF;

    const { error: updError } = await this.db()
      .from("quote_intake_cases")
      .update({
        status: nextStatus,
        updated_by_user_id: input.actorUserId ? String(input.actorUserId) : null
      })
      .eq("organization_id", organizationId)
      .eq("id", intakeCaseId);
    if (updError) throw toRepoError(updError, "recordAutomationDecision.updateCase");

    await this.#appendAudit({
      organizationId,
      intakeCaseId,
      eventType: "automation_decision_recorded",
      actorType,
      actorUserId: input.actorUserId ? String(input.actorUserId) : null,
      metadata: {
        decisionId: decision.id,
        path,
        wouldStartTakeoff,
        reasonCodeCount: reasonCodes.length
      }
    });

    return mapDecisionRow(decision);
  }

  async createTakeoffLink(input) {
    const organizationId = normOrg(input.organizationId);
    const intakeCaseId = String(input.intakeCaseId ?? "").trim();
    if (!(await this.getCase(organizationId, intakeCaseId))) {
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

    const { data: existing, error: findError } = await this.db()
      .from("quote_intake_takeoff_links")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (findError) throw toRepoError(findError, "createTakeoffLink.lookup");
    if (existing) return mapLinkRow(existing);

    const actorType =
      input.actorType === AUDIT_ACTOR_TYPE.SYSTEM ? AUDIT_ACTOR_TYPE.SYSTEM : AUDIT_ACTOR_TYPE.USER;

    const insertRow = {
      organization_id: organizationId,
      intake_case_id: intakeCaseId,
      takeoff_job_id: input.takeoffJobId ? String(input.takeoffJobId) : null,
      intake_attachment_id: input.sourceAttachmentId ? String(input.sourceAttachmentId) : null,
      attachment_sha256: input.attachmentSha256 ? normSha(input.attachmentSha256) : null,
      relationship_status: input.relationshipStatus || TAKEOFF_LINK_RELATIONSHIP_STATUS.REQUESTED,
      initiation_mode: input.initiationMode || TAKEOFF_INITIATION_MODE.MANUAL,
      automation_decision_id: input.automationDecisionId ? String(input.automationDecisionId) : null,
      idempotency_key: idempotencyKey,
      actor_type: actorType,
      created_by_user_id: input.createdBy ? String(input.createdBy) : null
    };

    const { data: link, error } = await this.db()
      .from("quote_intake_takeoff_links")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const { data: raced } = await this.db()
          .from("quote_intake_takeoff_links")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (raced) return mapLinkRow(raced);
      }
      throw toRepoError(error, "createTakeoffLink");
    }

    await this.#appendAudit({
      organizationId,
      intakeCaseId,
      eventType: "takeoff_link_recorded",
      actorType,
      actorUserId: input.createdBy ? String(input.createdBy) : null,
      metadata: {
        linkId: link.id,
        hasTakeoffJobId: Boolean(link.takeoff_job_id),
        initiationMode: link.initiation_mode,
        relationshipStatus: link.relationship_status
      }
    });

    return mapLinkRow(link);
  }

  async listTakeoffLinks(organizationId, intakeCaseId) {
    const org = normOrg(organizationId);
    const id = String(intakeCaseId ?? "").trim();
    if (!(await this.getCase(org, id))) return [];
    const { data, error } = await this.db()
      .from("quote_intake_takeoff_links")
      .select("*")
      .eq("organization_id", org)
      .eq("intake_case_id", id);
    if (error) throw toRepoError(error, "listTakeoffLinks");
    return (data ?? []).map(mapLinkRow);
  }

  async listAuditEvents(organizationId, intakeCaseId, query = {}) {
    const org = normOrg(organizationId);
    const id = String(intakeCaseId ?? "").trim();
    if (!(await this.getCase(org, id))) return null;
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
    const { data, error } = await this.db()
      .from("quote_intake_audit_events")
      .select("*")
      .eq("organization_id", org)
      .eq("intake_case_id", id)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw toRepoError(error, "listAuditEvents");
    return (data ?? []).map(mapAuditRow);
  }
}
