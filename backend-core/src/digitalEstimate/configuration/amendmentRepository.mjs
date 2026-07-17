/**
 * DE.2F — Review request + amendment memory repository (+ Supabase RPC hooks).
 * Never writes quote_headers. Never stores raw tokens.
 */

import { randomUUID } from "node:crypto";
import { AMENDMENT_STATUS, REVIEW_STATUS } from "./amendmentConfig.mjs";
import { sha256CanonicalJson } from "../digitalEstimateToken.mjs";

function err(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

function createAsyncMutex() {
  let chain = Promise.resolve();
  return {
    runExclusive(fn) {
      const run = chain.then(() => fn());
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}

/**
 * @param {{
 *   deRepository?: any,
 *   configurationRepository?: any
 * }} [opts]
 */
export function createInMemoryAmendmentRepository(opts = {}) {
  /** @type {Map<string, Record<string, unknown>>} */
  const reviewRequests = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const amendments = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  const familyLocks = new Map();
  const deRepository = opts.deRepository || null;
  const configurationRepository = opts.configurationRepository || null;

  function lockKey(organizationId, key) {
    const k = `${organizationId}:${key}`;
    if (!familyLocks.has(k)) familyLocks.set(k, createAsyncMutex());
    return familyLocks.get(k);
  }

  function cloneAll() {
    return {
      reviewRequests: new Map([...reviewRequests.entries()].map(([k, v]) => [k, structuredClone(v)])),
      amendments: new Map([...amendments.entries()].map(([k, v]) => [k, structuredClone(v)])),
      events: structuredClone(events),
      deDump: deRepository?._dump ? structuredClone(deRepository._dump()) : null,
      cfgDump: configurationRepository?._dump ? structuredClone(configurationRepository._dump()) : null
    };
  }

  function restoreAll(snap) {
    reviewRequests.clear();
    for (const [k, v] of snap.reviewRequests) reviewRequests.set(k, v);
    amendments.clear();
    for (const [k, v] of snap.amendments) amendments.set(k, v);
    events.length = 0;
    events.push(...snap.events);
    if (snap.deDump && typeof deRepository?._restore === "function") {
      deRepository._restore(snap.deDump);
    }
    if (snap.cfgDump && typeof configurationRepository?._restore === "function") {
      configurationRepository._restore(snap.cfgDump);
    }
  }

  async function appendEvent(row) {
    const full = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      metadata: {},
      ...row
    };
    events.push(full);
    return structuredClone(full);
  }

  return {
    mode: "memory",

    async createReviewRequest(trusted) {
      const {
        organizationId,
        publicationId,
        publicationSnapshotId = null,
        envelopeId,
        envelopeVersion,
        sessionId,
        selectionId,
        calculationId,
        selectionHash,
        calculationInputFingerprint,
        clientIdempotencyKey,
        customerNote = null,
        requestSnapshotJson,
        baselineDisplayTotal = null,
        configuredDisplayTotal = null,
        displayDelta = null,
        pricingValidThrough = null
      } = trusted;

      const existing = [...reviewRequests.values()].find(
        (r) =>
          r.session_id === sessionId &&
          r.client_idempotency_key === clientIdempotencyKey &&
          r.organization_id === organizationId
      );
      if (existing) return { reused: true, request: structuredClone(existing) };

      // Identical open request (same fingerprint) — return existing
      const requestFingerprint = sha256CanonicalJson({
        selectionHash,
        calculationInputFingerprint,
        publicationId,
        envelopeId
      });
      const openDup = [...reviewRequests.values()].find(
        (r) =>
          r.organization_id === organizationId &&
          r.session_id === sessionId &&
          r.request_fingerprint === requestFingerprint &&
          [REVIEW_STATUS.REQUESTED, REVIEW_STATUS.REVIEWING, REVIEW_STATUS.CLARIFICATION, REVIEW_STATUS.AMENDMENT_PREPARED].includes(
            r.status
          )
      );
      if (openDup) return { reused: true, request: structuredClone(openDup) };

      const id = randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        organization_id: organizationId,
        publication_id: publicationId,
        publication_snapshot_id: publicationSnapshotId,
        envelope_id: envelopeId,
        envelope_version: envelopeVersion,
        session_id: sessionId,
        selection_id: selectionId,
        calculation_id: calculationId,
        selection_hash: selectionHash,
        calculation_input_fingerprint: calculationInputFingerprint,
        request_fingerprint: requestFingerprint,
        client_idempotency_key: clientIdempotencyKey,
        status: REVIEW_STATUS.REQUESTED,
        customer_note: customerNote,
        request_snapshot_json: structuredClone(requestSnapshotJson),
        baseline_display_total: baselineDisplayTotal,
        configured_display_total: configuredDisplayTotal,
        display_delta: displayDelta,
        pricing_valid_through: pricingValidThrough,
        closed_at: null,
        closed_reason: null,
        created_at: now,
        updated_at: now
      };
      reviewRequests.set(id, row);
      await appendEvent({
        organization_id: organizationId,
        review_request_id: id,
        publication_id: publicationId,
        event_type: "review_requested",
        actor_type: "public",
        metadata: { selectionHash }
      });
      return { reused: false, request: structuredClone(row) };
    },

    async getReviewRequest(organizationId, requestId) {
      const row = reviewRequests.get(String(requestId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },

    async getCurrentReviewRequestForSession(organizationId, sessionId) {
      const rows = [...reviewRequests.values()]
        .filter((r) => r.organization_id === organizationId && r.session_id === sessionId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return rows[0] ? structuredClone(rows[0]) : null;
    },

    async listReviewRequests(organizationId, { status = null, limit = 50 } = {}) {
      return [...reviewRequests.values()]
        .filter((r) => {
          if (r.organization_id !== organizationId) return false;
          if (status && r.status !== status) return false;
          return true;
        })
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit)
        .map((r) => structuredClone(r));
    },

    async updateReviewRequestStatus(organizationId, requestId, status, patch = {}) {
      const row = reviewRequests.get(String(requestId));
      if (!row || row.organization_id !== organizationId) throw err("not_found", "Review request not found", 404);
      // Immutability: only status/closure/updated_at
      row.status = status;
      row.updated_at = new Date().toISOString();
      if (patch.closed_reason != null) row.closed_reason = patch.closed_reason;
      if (patch.closed_at != null) row.closed_at = patch.closed_at;
      if (patch.clarification_message_customer != null) {
        // clarification lives on amendment; ignore freeze
      }
      return structuredClone(row);
    },

    async createAmendmentDraft(trusted) {
      const {
        organizationId,
        reviewRequestId,
        actorUserId,
        draftSelectionsJson = {},
        sourceSelectionFingerprint = null
      } = trusted;
      const req = reviewRequests.get(String(reviewRequestId));
      if (!req || req.organization_id !== organizationId) {
        throw err("not_found", "Review request not found", 404);
      }
      const versions = [...amendments.values()].filter(
        (a) => a.organization_id === organizationId && a.review_request_id === reviewRequestId
      );
      const nextVersion = versions.reduce((m, a) => Math.max(m, Number(a.amendment_version) || 0), 0) + 1;
      const id = randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        organization_id: organizationId,
        review_request_id: reviewRequestId,
        source_publication_id: req.publication_id,
        source_publication_snapshot_id: req.publication_snapshot_id,
        source_calculation_id: req.calculation_id,
        parent_amendment_id: null,
        amendment_version: nextVersion,
        status: AMENDMENT_STATUS.DRAFT,
        row_version: 1,
        draft_selections_json: structuredClone(draftSelectionsJson),
        customer_safe_explanation: null,
        internal_notes_json: [],
        clarification_message_customer: null,
        pricing_policy_fingerprint: null,
        catalog_fingerprint: null,
        engine_version: null,
        source_selection_fingerprint: sourceSelectionFingerprint || req.selection_hash,
        final_calculation_fingerprint: null,
        amendment_calculation_json: null,
        customer_snapshot_json: null,
        internal_evidence_json: null,
        baseline_display_total: req.baseline_display_total,
        configured_display_total: req.configured_display_total,
        display_delta: req.display_delta,
        pricing_valid_through: req.pricing_valid_through,
        replacement_publication_id: null,
        created_by_user_id: actorUserId ?? null,
        published_by_user_id: null,
        published_at: null,
        created_at: now,
        updated_at: now
      };
      amendments.set(id, row);
      req.status = REVIEW_STATUS.REVIEWING;
      req.updated_at = now;
      await appendEvent({
        organization_id: organizationId,
        review_request_id: reviewRequestId,
        amendment_id: id,
        event_type: "amendment_draft_created",
        actor_type: "user",
        actor_user_id: actorUserId ?? null
      });
      await appendEvent({
        organization_id: organizationId,
        review_request_id: reviewRequestId,
        amendment_id: id,
        event_type: "review_started",
        actor_type: "user",
        actor_user_id: actorUserId ?? null
      });
      return structuredClone(row);
    },

    async getAmendment(organizationId, amendmentId) {
      const row = amendments.get(String(amendmentId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },

    async listAmendmentsForRequest(organizationId, reviewRequestId) {
      return [...amendments.values()]
        .filter(
          (a) =>
            a.organization_id === organizationId && a.review_request_id === reviewRequestId
        )
        .sort((a, b) => Number(b.amendment_version) - Number(a.amendment_version))
        .map((a) => structuredClone(a));
    },

    async appendEvent(row) {
      return appendEvent(row);
    },

    async recordReplacementLinkCopied(organizationId, publicationId, actorUserId) {
      const amd = [...amendments.values()].find(
        (a) =>
          a.organization_id === organizationId && a.replacement_publication_id === publicationId
      );
      if (!amd) return { ok: true, found: false };
      await appendEvent({
        organization_id: organizationId,
        review_request_id: amd.review_request_id,
        amendment_id: amd.id,
        publication_id: publicationId,
        event_type: "replacement_link_copied",
        actor_type: "user",
        actor_user_id: actorUserId ?? null,
        metadata: {}
      });
      return { ok: true, found: true };
    },

    async updateAmendmentDraft(organizationId, amendmentId, patch, { expectedRowVersion, actorUserId } = {}) {
      const row = amendments.get(String(amendmentId));
      if (!row || row.organization_id !== organizationId) throw err("not_found", "Amendment not found", 404);
      if (![AMENDMENT_STATUS.DRAFT, AMENDMENT_STATUS.READY, AMENDMENT_STATUS.VALIDATING].includes(row.status)) {
        throw err("immutable", "Published amendments cannot be edited", 403);
      }
      if (expectedRowVersion != null && Number(row.row_version) !== Number(expectedRowVersion)) {
        throw err("row_version_conflict", "Amendment row_version conflict", 409);
      }
      const allowed = [
        "draft_selections_json",
        "customer_safe_explanation",
        "internal_notes_json",
        "clarification_message_customer",
        "amendment_calculation_json",
        "customer_snapshot_json",
        "internal_evidence_json",
        "pricing_policy_fingerprint",
        "catalog_fingerprint",
        "engine_version",
        "final_calculation_fingerprint",
        "baseline_display_total",
        "configured_display_total",
        "display_delta",
        "pricing_valid_through",
        "status",
        "replacement_publication_id",
        "published_at",
        "published_by_user_id"
      ];
      for (const k of allowed) {
        if (patch[k] !== undefined) row[k] = patch[k];
      }
      // Reject locked measurement spoofs
      if (patch.chargeableCounterSf != null || patch.lockedMeasurement != null) {
        throw err("forbidden_caller_authority", "Locked measurements cannot be edited", 400);
      }
      row.row_version = Number(row.row_version) + 1;
      row.updated_at = new Date().toISOString();
      await appendEvent({
        organization_id: organizationId,
        review_request_id: row.review_request_id,
        amendment_id: amendmentId,
        event_type: "amendment_updated",
        actor_type: "user",
        actor_user_id: actorUserId ?? null
      });
      return structuredClone(row);
    },

    async setClarificationRequired(organizationId, reviewRequestId, message, actorUserId) {
      const req = reviewRequests.get(String(reviewRequestId));
      if (!req || req.organization_id !== organizationId) throw err("not_found", "Review request not found", 404);
      req.status = REVIEW_STATUS.CLARIFICATION;
      req.updated_at = new Date().toISOString();
      await appendEvent({
        organization_id: organizationId,
        review_request_id: reviewRequestId,
        event_type: "clarification_required",
        actor_type: "user",
        actor_user_id: actorUserId ?? null,
        metadata: { hasMessage: Boolean(message) }
      });
      return structuredClone(req);
    },

    async closeReviewRequest(organizationId, reviewRequestId, reason, actorUserId) {
      const req = reviewRequests.get(String(reviewRequestId));
      if (!req || req.organization_id !== organizationId) throw err("not_found", "Review request not found", 404);
      req.status = REVIEW_STATUS.CLOSED;
      req.closed_at = new Date().toISOString();
      req.closed_reason = reason || "closed";
      req.updated_at = req.closed_at;
      await appendEvent({
        organization_id: organizationId,
        review_request_id: reviewRequestId,
        event_type: "review_closed",
        actor_type: "user",
        actor_user_id: actorUserId ?? null,
        metadata: { reason: req.closed_reason }
      });
      return structuredClone(req);
    },

    /**
     * Atomic amendment publish + replacement publication.
     * Requires deRepository.publishAtomic + configurationRepository session revoke.
     */
    async publishAmendmentAtomic({
      organizationId,
      amendmentId,
      actorUserId,
      tokenHash,
      customerSnapshotJson,
      pricingEvidenceJson,
      customerSnapshotHash,
      pricingEvidenceHash,
      sourceQuoteFingerprint,
      accessExpiresAt,
      pricingValidThrough,
      termsDisclosureVersion,
      calculationEngineVersion,
      expectedRowVersion = null,
      idempotencyKey = null
    }) {
      const amd = amendments.get(String(amendmentId));
      if (!amd || amd.organization_id !== organizationId) {
        throw err("not_found", "Amendment not found", 404);
      }
      return lockKey(organizationId, `amend:${amd.source_publication_id}`).runExclusive(async () => {
        const checkpoint = cloneAll();
        try {
          const current = amendments.get(String(amendmentId));
          if (!current) throw err("not_found", "Amendment not found", 404);
          if (current.status === AMENDMENT_STATUS.PUBLISHED && current.replacement_publication_id) {
            return {
              reused: true,
              amendment: structuredClone(current),
              publicationId: current.replacement_publication_id,
              rawToken: null
            };
          }
          if (expectedRowVersion != null && Number(current.row_version) !== Number(expectedRowVersion)) {
            throw err("row_version_conflict", "Amendment row_version conflict", 409);
          }
          if (!deRepository?.publishAtomic) {
            throw err("atomic_publish_unavailable", "Publication repository missing atomic publish", 500);
          }

          const srcPub = await deRepository.getPublication(organizationId, current.source_publication_id);
          if (!srcPub) throw err("not_found", "Source publication not found", 404);

          // Inject source type into pricing evidence without quote_headers write
          const evidence = {
            ...pricingEvidenceJson,
            sourceType: "digital_estimate_amendment",
            amendmentId,
            reviewRequestId: current.review_request_id,
            priorPublicationId: current.source_publication_id
          };

          const atomic = await deRepository.publishAtomic({
            organizationId,
            sourceQuoteId: srcPub.source_quote_id,
            quoteFamilyRootId: srcPub.quote_family_root_id,
            quoteNumber: srcPub.quote_number,
            revisionNumber: srcPub.revision_number,
            revisionLabel: srcPub.revision_label,
            quoteSource: srcPub.quote_source,
            publishedByUserId: actorUserId,
            accessExpiresAt,
            pricingValidThrough,
            termsDisclosureVersion,
            calculationEngineVersion,
            sourceQuoteFingerprint,
            customerSnapshotHash,
            pricingEvidenceHash,
            customerSnapshotJson,
            pricingEvidenceJson: evidence,
            tokenHash,
            publishedAt: new Date().toISOString(),
            publishedEventMetadata: {
              sourceType: "digital_estimate_amendment",
              amendmentId,
              reviewRequestId: current.review_request_id,
              idempotencyKey
            }
          });

          const pubId = atomic.publication?.id;
          if (!pubId) {
            throw err("atomic_publish_unavailable", "Publication missing after atomic publish", 500);
          }

          if (typeof configurationRepository?.revokeSessionsForPublication === "function") {
            await configurationRepository.revokeSessionsForPublication(
              organizationId,
              current.source_publication_id
            );
          }

          current.status = AMENDMENT_STATUS.PUBLISHED;
          current.customer_snapshot_json = customerSnapshotJson;
          current.internal_evidence_json = evidence;
          current.published_by_user_id = actorUserId;
          current.published_at = new Date().toISOString();
          current.replacement_publication_id = pubId;
          current.row_version = Number(current.row_version) + 1;
          current.updated_at = current.published_at;

          const req = reviewRequests.get(String(current.review_request_id));
          if (req) {
            req.status = REVIEW_STATUS.PUBLISHED;
            req.closed_at = current.published_at;
            req.closed_reason = "amendment_published";
            req.updated_at = current.published_at;
          }

          await appendEvent({
            organization_id: organizationId,
            review_request_id: current.review_request_id,
            amendment_id: amendmentId,
            publication_id: pubId,
            event_type: "amendment_published",
            actor_type: "user",
            actor_user_id: actorUserId,
            metadata: { publicationId: pubId }
          });
          await appendEvent({
            organization_id: organizationId,
            review_request_id: current.review_request_id,
            amendment_id: amendmentId,
            publication_id: current.source_publication_id,
            event_type: "prior_publication_superseded",
            actor_type: "system",
            actor_user_id: actorUserId
          });

          // Raw token never stored — caller holds it for one-time HTTP response only.
          return {
            reused: false,
            amendment: structuredClone(current),
            publication: structuredClone(atomic.publication),
            publicationId: pubId,
            supersededCount: atomic.supersededCount ?? 0
          };
        } catch (e) {
          restoreAll(checkpoint);
          throw e;
        }
      });
    },

    listEvents(organizationId, { reviewRequestId = null, amendmentId = null } = {}) {
      return events
        .filter((e) => {
          if (e.organization_id !== organizationId) return false;
          if (reviewRequestId && e.review_request_id !== reviewRequestId) return false;
          if (amendmentId && e.amendment_id !== amendmentId) return false;
          return true;
        })
        .map((e) => structuredClone(e));
    },

    _dump() {
      return {
        reviewRequests: [...reviewRequests.values()],
        amendments: [...amendments.values()],
        events: [...events]
      };
    }
  };
}

export function createSupabaseAmendmentRepository({ db }) {
  if (!db) {
    const e = new Error("Supabase amendment repository requires db");
    e.code = "supabase_misconfigured";
    throw e;
  }
  return {
    mode: "supabase",
    async getReviewRequest(organizationId, requestId) {
      const { data, error } = await db
        .from("digital_estimate_configuration_review_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", requestId)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async listReviewRequests(organizationId, { status = null, limit = 50 } = {}) {
      let q = db
        .from("digital_estimate_configuration_review_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async publishAmendmentAtomic(args) {
      const { data, error } = await db.rpc("digital_estimate_publish_amendment_atomic", {
        p_organization_id: args.organizationId,
        p_amendment_id: args.amendmentId,
        p_actor_user_id: args.actorUserId ?? null,
        p_token_hash: args.tokenHash,
        p_customer_snapshot_json: args.customerSnapshotJson,
        p_pricing_evidence_json: args.pricingEvidenceJson,
        p_customer_snapshot_hash: args.customerSnapshotHash,
        p_pricing_evidence_hash: args.pricingEvidenceHash,
        p_source_quote_fingerprint: args.sourceQuoteFingerprint,
        p_access_expires_at: args.accessExpiresAt,
        p_pricing_valid_through: args.pricingValidThrough,
        p_terms_disclosure_version: args.termsDisclosureVersion,
        p_calculation_engine_version: args.calculationEngineVersion,
        p_idempotency_key: args.idempotencyKey ?? null,
        p_expected_row_version: args.expectedRowVersion ?? null
      });
      if (error) throw error;
      return {
        reused: Boolean(data?.reused),
        amendment: { id: args.amendmentId, replacement_publication_id: data?.publication_id },
        publicationId: data?.publication_id,
        rawToken: null // caller must generate token separately before RPC with matching hash
      };
    }
  };
}
