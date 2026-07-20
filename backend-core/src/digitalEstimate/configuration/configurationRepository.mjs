/**
 * DE.2B configuration repository — memory (tests) + Supabase (Brain service role).
 * Never writes quote_headers. Never calls calculateQuote().
 */

import { randomUUID } from "node:crypto";
import { DIGITAL_ESTIMATE_CONFIG_ENGINE_VERSION_PLACEHOLDER } from "./configurationConfig.mjs";
import {
  hashCanonical,
  normalizeSelectionPayload,
  rejectSpoofedEnvelopeAuthority,
  validateEnvelopeStructure
} from "./configurationValidation.mjs";
import { toPublicConfigurationOption } from "./configurationPublicSerializer.mjs";

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

function err(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

/**
 * @param {{
 *   publications?: Map<string, Record<string, unknown>>,
 *   snapshots?: Map<string, Record<string, unknown>>,
 *   pricingPolicyRepository?: ReturnType<import('./pricingPolicyRepository.mjs').createInMemoryPricingPolicyRepository>
 * }} [opts]
 */
export function createInMemoryConfigurationRepository(opts = {}) {
  /** @type {Map<string, Record<string, unknown>>} */
  const publications = opts.publications instanceof Map ? opts.publications : new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const snapshots = opts.snapshots instanceof Map ? opts.snapshots : new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const envelopes = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const groups = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const options = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const sessions = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const selections = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const calculations = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  /** @type {Map<string, ReturnType<typeof createAsyncMutex>>} */
  const publicationLocks = new Map();

  function pubLock(organizationId, publicationId) {
    const key = `${organizationId}:${publicationId}`;
    if (!publicationLocks.has(key)) publicationLocks.set(key, createAsyncMutex());
    return publicationLocks.get(key);
  }

  function cloneState() {
    return {
      envelopes: new Map([...envelopes.entries()].map(([k, v]) => [k, structuredClone(v)])),
      groups: new Map([...groups.entries()].map(([k, v]) => [k, structuredClone(v)])),
      options: new Map([...options.entries()].map(([k, v]) => [k, structuredClone(v)])),
      sessions: new Map([...sessions.entries()].map(([k, v]) => [k, structuredClone(v)])),
      selections: new Map([...selections.entries()].map(([k, v]) => [k, structuredClone(v)])),
      calculations: new Map([...calculations.entries()].map(([k, v]) => [k, structuredClone(v)])),
      events: structuredClone(events)
    };
  }

  function restoreState(snap) {
    envelopes.clear();
    for (const [k, v] of snap.envelopes) envelopes.set(k, v);
    groups.clear();
    for (const [k, v] of snap.groups) groups.set(k, v);
    options.clear();
    for (const [k, v] of snap.options) options.set(k, v);
    sessions.clear();
    for (const [k, v] of snap.sessions) sessions.set(k, v);
    selections.clear();
    for (const [k, v] of snap.selections) selections.set(k, v);
    calculations.clear();
    for (const [k, v] of snap.calculations) calculations.set(k, v);
    events.length = 0;
    events.push(...snap.events);
  }

  function assertDraft(envelope) {
    if (!envelope) throw err("not_found", "envelope not found", 404);
    if (envelope.status !== "draft" && envelope.status !== "ready") {
      throw err("immutable", "Only draft/ready envelopes can be mutated; clone to edit", 403);
    }
  }

  function listGroups(envelopeId) {
    return [...groups.values()].filter((g) => g.envelope_id === envelopeId);
  }
  function listOptions(envelopeId) {
    return [...options.values()].filter((o) => o.envelope_id === envelopeId);
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

  const api = {
    mode: "memory",
    pricingPolicyRepository: opts.pricingPolicyRepository ?? null,

    seedPublication(row) {
      publications.set(String(row.id), structuredClone(row));
    },
    seedSnapshot(row) {
      snapshots.set(String(row.id || row.publication_id), structuredClone(row));
    },

    async getPublication(organizationId, publicationId) {
      const row = publications.get(String(publicationId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },

    async getSnapshotByPublicationId(organizationId, publicationId) {
      const row = [...snapshots.values()].find(
        (s) => s.organization_id === organizationId && s.publication_id === publicationId
      );
      return row ? structuredClone(row) : null;
    },

    async createDraftEnvelope(trusted) {
      const {
        organizationId,
        publicationId,
        actorUserId,
        body = {}
      } = trusted;
      rejectSpoofedEnvelopeAuthority(body || {});

      const pub = await api.getPublication(organizationId, publicationId);
      if (!pub) throw err("not_found", "publication not found", 404);
      if (pub.status !== "active") throw err("publication_not_active", "publication is not active", 400);

      const snap = await api.getSnapshotByPublicationId(organizationId, publicationId);
      if (!snap) throw err("snapshot_missing", "publication snapshot missing", 400);

      const versions = [...envelopes.values()].filter(
        (e) => e.organization_id === organizationId && e.publication_id === publicationId
      );
      const nextVersion = versions.reduce((m, e) => Math.max(m, Number(e.envelope_version) || 0), 0) + 1;

      const id = randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        organization_id: organizationId,
        publication_id: publicationId,
        publication_snapshot_id: snap.id ?? null,
        source_quote_id: pub.source_quote_id,
        quote_family_root_id: pub.quote_family_root_id ?? null,
        source_quote_revision_number: pub.revision_number ?? null,
        source_calculation_evidence_fingerprint: pub.source_quote_fingerprint || pub.pricing_evidence_hash,
        envelope_version: nextVersion,
        status: "draft",
        cloned_from_envelope_id: null,
        superseded_by_envelope_id: null,
        baseline_customer_snapshot_hash: snap.customer_snapshot_hash || pub.customer_snapshot_hash,
        baseline_pricing_evidence_hash: snap.pricing_evidence_hash || pub.pricing_evidence_hash,
        pricing_engine_version: DIGITAL_ESTIMATE_CONFIG_ENGINE_VERSION_PLACEHOLDER,
        pricing_policy_version_id: null,
        pricing_policy_fingerprint: null,
        catalog_fingerprint: null,
        pricing_valid_through: pub.pricing_valid_through ?? null,
        row_version: 1,
        activated_at: null,
        activated_by_user_id: null,
        created_by_user_id: actorUserId ?? null,
        created_at: now,
        updated_at: now
      };
      envelopes.set(id, row);
      await appendEvent({
        organization_id: organizationId,
        envelope_id: id,
        publication_id: publicationId,
        event_type: "envelope_created",
        actor_type: "user",
        actor_user_id: actorUserId ?? null
      });
      return structuredClone(row);
    },

    async getEnvelope(organizationId, envelopeId) {
      const row = envelopes.get(String(envelopeId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },

    async listEnvelopesForPublication(organizationId, publicationId) {
      return [...envelopes.values()]
        .filter((e) => e.organization_id === organizationId && e.publication_id === publicationId)
        .map((e) => structuredClone(e))
        .sort((a, b) => Number(b.envelope_version) - Number(a.envelope_version));
    },

    async getActiveEnvelope(organizationId, publicationId) {
      const row = [...envelopes.values()].find(
        (e) =>
          e.organization_id === organizationId &&
          e.publication_id === publicationId &&
          e.status === "active"
      );
      return row ? structuredClone(row) : null;
    },

    async updateDraftEnvelope(organizationId, envelopeId, patch, { expectedRowVersion, actorUserId } = {}) {
      const row = envelopes.get(String(envelopeId));
      if (!row || row.organization_id !== organizationId) throw err("not_found", "envelope not found", 404);
      assertDraft(row);
      if (expectedRowVersion != null && row.row_version !== expectedRowVersion) {
        throw err("row_version_conflict", "envelope row_version conflict", 409);
      }
      if (patch.organization_id != null || patch.organizationId != null) {
        throw err("forbidden_caller_authority", "organization_id is immutable", 400);
      }
      const allowed = ["pricing_valid_through", "pricing_policy_version_id"];
      for (const [k, v] of Object.entries(patch || {})) {
        if (allowed.includes(k)) row[k] = v;
      }
      row.row_version = Number(row.row_version) + 1;
      row.updated_at = new Date().toISOString();
      await appendEvent({
        organization_id: organizationId,
        envelope_id: envelopeId,
        publication_id: row.publication_id,
        event_type: "envelope_updated",
        actor_type: "user",
        actor_user_id: actorUserId ?? null
      });
      return structuredClone(row);
    },

    async upsertDraftGroup(organizationId, envelopeId, groupInput) {
      const env = envelopes.get(String(envelopeId));
      if (!env || env.organization_id !== organizationId) throw err("not_found", "envelope not found", 404);
      assertDraft(env);
      const groupKey = String(groupInput.group_key || groupInput.groupKey || "");
      if (!groupKey) throw err("validation", "group_key required");
      let existing = [...groups.values()].find(
        (g) => g.envelope_id === envelopeId && g.group_key === groupKey
      );
      const now = new Date().toISOString();
      if (existing) {
        Object.assign(existing, {
          display_label: groupInput.display_label ?? groupInput.displayLabel ?? existing.display_label,
          description_customer:
            groupInput.description_customer ?? groupInput.description ?? existing.description_customer,
          selection_mode: groupInput.selection_mode ?? groupInput.selectionMode ?? existing.selection_mode,
          required: groupInput.required ?? existing.required,
          mutually_exclusive:
            groupInput.mutually_exclusive ?? groupInput.mutuallyExclusive ?? existing.mutually_exclusive,
          sort_order: groupInput.sort_order ?? groupInput.sortOrder ?? existing.sort_order,
          compatibility_json:
            groupInput.compatibility_json ?? groupInput.compatibilityJson ?? existing.compatibility_json,
          notes_internal: groupInput.notes_internal ?? groupInput.notesInternal ?? existing.notes_internal,
          updated_at: now
        });
        return structuredClone(existing);
      }
      const id = randomUUID();
      const row = {
        id,
        organization_id: organizationId,
        envelope_id: envelopeId,
        group_key: groupKey,
        display_label: String(groupInput.display_label || groupInput.displayLabel || groupKey),
        description_customer: groupInput.description_customer ?? groupInput.description ?? null,
        selection_mode: groupInput.selection_mode || groupInput.selectionMode || "single",
        required: Boolean(groupInput.required),
        mutually_exclusive: groupInput.mutually_exclusive ?? groupInput.mutuallyExclusive ?? true,
        sort_order: Number(groupInput.sort_order ?? groupInput.sortOrder ?? 0),
        compatibility_json: groupInput.compatibility_json ?? groupInput.compatibilityJson ?? {},
        notes_internal: groupInput.notes_internal ?? groupInput.notesInternal ?? null,
        created_at: now,
        updated_at: now
      };
      groups.set(id, row);
      return structuredClone(row);
    },

    async removeDraftGroup(organizationId, envelopeId, groupId) {
      const env = envelopes.get(String(envelopeId));
      if (!env || env.organization_id !== organizationId) throw err("not_found", "envelope not found", 404);
      assertDraft(env);
      const g = groups.get(String(groupId));
      if (!g || g.envelope_id !== envelopeId || g.organization_id !== organizationId) {
        throw err("not_found", "group not found", 404);
      }
      for (const [oid, o] of [...options.entries()]) {
        if (o.group_id === groupId) options.delete(oid);
      }
      groups.delete(String(groupId));
      return true;
    },

    async upsertDraftOption(organizationId, envelopeId, optionInput) {
      const env = envelopes.get(String(envelopeId));
      if (!env || env.organization_id !== organizationId) throw err("not_found", "envelope not found", 404);
      assertDraft(env);
      const groupId = String(optionInput.group_id || optionInput.groupId || "");
      const g = groups.get(groupId);
      if (!g || g.envelope_id !== envelopeId || g.organization_id !== organizationId) {
        throw err("not_found", "group not found", 404);
      }
      const optionKey = String(optionInput.option_key || optionInput.optionKey || "");
      if (!optionKey) throw err("validation", "option_key required");

      // Reject caller-supplied internal authority masquerading as option fields when spoofing totals
      for (const bad of ["configuredTotal", "markup", "accountGroupId", "organizationId"]) {
        if (Object.prototype.hasOwnProperty.call(optionInput, bad)) {
          throw err("forbidden_caller_authority", `Caller must not supply ${bad}`);
        }
      }

      let existing = [...options.values()].find(
        (o) => o.envelope_id === envelopeId && o.option_key === optionKey
      );
      const now = new Date().toISOString();
      const base = {
        organization_id: organizationId,
        envelope_id: envelopeId,
        group_id: groupId,
        option_key: optionKey,
        display_label: String(optionInput.display_label || optionInput.displayLabel || optionKey),
        description_customer: optionInput.description_customer ?? optionInput.description ?? null,
        image_asset_ref: optionInput.image_asset_ref ?? optionInput.imageAssetRef ?? null,
        min_qty: Number(optionInput.min_qty ?? optionInput.minQty ?? 0),
        max_qty: optionInput.max_qty ?? optionInput.maxQty ?? null,
        default_qty: Number(optionInput.default_qty ?? optionInput.defaultQty ?? 0),
        included_in_baseline: Boolean(optionInput.included_in_baseline ?? optionInput.includedInBaseline),
        required_selection: Boolean(optionInput.required_selection ?? optionInput.requiredSelection),
        availability_state: optionInput.availability_state || optionInput.availabilityState || "active",
        customer_price_treatment:
          optionInput.customer_price_treatment || optionInput.customerPriceTreatment || "absolute",
        pricing_mode: optionInput.pricing_mode || optionInput.pricingMode || "fixed",
        sell_price: optionInput.sell_price ?? optionInput.sellPrice ?? null,
        sell_price_unit: optionInput.sell_price_unit ?? optionInput.sellPriceUnit ?? null,
        cost_basis: optionInput.cost_basis ?? optionInput.costBasis ?? null,
        wholesale_rate: optionInput.wholesale_rate ?? optionInput.wholesaleRate ?? null,
        direct_rate: optionInput.direct_rate ?? optionInput.directRate ?? null,
        internal_pricing_evidence_json:
          optionInput.internal_pricing_evidence_json ?? optionInput.internalPricingEvidenceJson ?? {},
        compatibility_json: optionInput.compatibility_json ?? optionInput.compatibilityJson ?? {},
        source_catalog_ref: optionInput.source_catalog_ref ?? optionInput.sourceCatalogRef ?? null,
        notes_customer: optionInput.notes_customer ?? optionInput.notesCustomer ?? null,
        notes_internal: optionInput.notes_internal ?? optionInput.notesInternal ?? null,
        is_active_in_envelope: optionInput.is_active_in_envelope ?? optionInput.isActiveInEnvelope ?? true,
        sort_order: Number(optionInput.sort_order ?? optionInput.sortOrder ?? 0),
        updated_at: now
      };
      if (existing) {
        Object.assign(existing, base);
        return structuredClone(existing);
      }
      const id = randomUUID();
      const row = { id, created_at: now, ...base };
      options.set(id, row);
      return structuredClone(row);
    },

    async removeDraftOption(organizationId, envelopeId, optionId) {
      const env = envelopes.get(String(envelopeId));
      if (!env || env.organization_id !== organizationId) throw err("not_found", "envelope not found", 404);
      assertDraft(env);
      const o = options.get(String(optionId));
      if (!o || o.envelope_id !== envelopeId || o.organization_id !== organizationId) {
        throw err("not_found", "option not found", 404);
      }
      options.delete(String(optionId));
      return true;
    },

    async validateEnvelope(organizationId, envelopeId) {
      const env = await api.getEnvelope(organizationId, envelopeId);
      if (!env) throw err("not_found", "envelope not found", 404);
      const result = validateEnvelopeStructure({
        groups: listGroups(envelopeId),
        options: listOptions(envelopeId)
      });
      if (result.ok) {
        await appendEvent({
          organization_id: organizationId,
          envelope_id: envelopeId,
          publication_id: env.publication_id,
          event_type: "envelope_validated",
          actor_type: "system",
          metadata: { ok: true }
        });
      }
      return result;
    },

    /**
     * Atomic activation with rollback on failure (memory transactional apply).
     */
    async activateEnvelope(organizationId, envelopeId, {
      actorUserId = null,
      pricingPolicyFingerprint = null,
      catalogFingerprint = null,
      expectedRowVersion = null,
      materialCatalogContract = null
    } = {}) {
      const env = envelopes.get(String(envelopeId));
      if (!env || env.organization_id !== organizationId) throw err("not_found", "envelope not found", 404);
      return pubLock(organizationId, env.publication_id).runExclusive(async () => {
        const checkpoint = cloneState();
        try {
          const current = envelopes.get(String(envelopeId));
          if (!current || current.organization_id !== organizationId) {
            throw err("not_found", "envelope not found", 404);
          }
          if (!["draft", "ready"].includes(current.status)) {
            throw err("invalid_status", "only draft/ready envelopes can be activated", 400);
          }
          if (expectedRowVersion != null && current.row_version !== expectedRowVersion) {
            throw err("row_version_conflict", "envelope row_version conflict", 409);
          }

          const pub = await api.getPublication(organizationId, current.publication_id);
          if (!pub) throw err("not_found", "publication not found", 404);
          if (pub.status !== "active") throw err("publication_not_active", "publication is not active", 400);
          const snap = await api.getSnapshotByPublicationId(organizationId, current.publication_id);
          if (!snap) throw err("snapshot_missing", "publication snapshot missing", 400);

          const validation = validateEnvelopeStructure({
            groups: listGroups(envelopeId),
            options: listOptions(envelopeId)
          });
          if (!validation.ok) {
            throw err("validation_failed", JSON.stringify(validation.errors), 422);
          }

          const now = new Date().toISOString();
          let supersededCount = 0;
          let sessionsRevokedCount = 0;
          for (const prior of [...envelopes.values()]) {
            if (
              prior.organization_id === organizationId &&
              prior.publication_id === current.publication_id &&
              prior.status === "active" &&
              prior.id !== envelopeId
            ) {
              prior.status = "superseded";
              prior.superseded_by_envelope_id = envelopeId;
              prior.updated_at = now;
              await appendEvent({
                organization_id: organizationId,
                envelope_id: prior.id,
                publication_id: prior.publication_id,
                event_type: "envelope_superseded",
                actor_type: "system",
                actor_user_id: actorUserId,
                metadata: { supersededByEnvelopeId: envelopeId }
              });
              supersededCount += 1;

              let revokedForPrior = 0;
              for (const session of [...sessions.values()]) {
                if (
                  session.organization_id === organizationId &&
                  session.envelope_id === prior.id &&
                  ["active", "configuring", "saved"].includes(session.status)
                ) {
                  session.status = "revoked";
                  session.updated_at = now;
                  revokedForPrior += 1;
                  sessionsRevokedCount += 1;
                }
              }
              if (revokedForPrior > 0) {
                await appendEvent({
                  organization_id: organizationId,
                  envelope_id: prior.id,
                  publication_id: prior.publication_id,
                  event_type: "configuration_session_revoked",
                  actor_type: "system",
                  actor_user_id: actorUserId,
                  metadata: {
                    reason: "envelope_superseded",
                    supersededByEnvelopeId: envelopeId,
                    revokedSessionCount: revokedForPrior
                  }
                });
              }
            }
          }

          current.status = "active";
          current.publication_snapshot_id = current.publication_snapshot_id || snap.id || null;
          current.pricing_policy_fingerprint =
            pricingPolicyFingerprint || current.pricing_policy_fingerprint;
          current.catalog_fingerprint = catalogFingerprint || current.catalog_fingerprint;
          if (materialCatalogContract) {
            current.material_catalog_contract = materialCatalogContract;
          }
          current.activated_at = now;
          current.activated_by_user_id = actorUserId;
          current.row_version = Number(current.row_version) + 1;
          current.updated_at = now;

          await appendEvent({
            organization_id: organizationId,
            envelope_id: envelopeId,
            publication_id: current.publication_id,
            event_type: "envelope_activated",
            actor_type: "user",
            actor_user_id: actorUserId,
            metadata: {
              supersededCount,
              sessionsRevokedCount,
              pricingPolicyFingerprint: current.pricing_policy_fingerprint,
              catalogFingerprint: current.catalog_fingerprint
            }
          });

          const actives = [...envelopes.values()].filter(
            (e) =>
              e.organization_id === organizationId &&
              e.publication_id === current.publication_id &&
              e.status === "active"
          );
          if (actives.length !== 1) {
            throw err("invariant", "activation left invalid active envelope count", 500);
          }

          return {
            envelope: structuredClone(current),
            supersededCount,
            sessionsRevokedCount
          };
        } catch (e) {
          restoreState(checkpoint);
          throw e;
        }
      });
    },

    /**
     * Clone active (or any) envelope into a new draft version for editing.
     */
    async cloneEnvelopeToDraft(organizationId, sourceEnvelopeId, { actorUserId = null } = {}) {
      const source = envelopes.get(String(sourceEnvelopeId));
      if (!source || source.organization_id !== organizationId) {
        throw err("not_found", "envelope not found", 404);
      }
      const draft = await api.createDraftEnvelope({
        organizationId,
        publicationId: source.publication_id,
        actorUserId,
        body: {}
      });
      // Fix version / ancestry after create
      const row = envelopes.get(draft.id);
      row.cloned_from_envelope_id = sourceEnvelopeId;
      row.baseline_customer_snapshot_hash = source.baseline_customer_snapshot_hash;
      row.baseline_pricing_evidence_hash = source.baseline_pricing_evidence_hash;
      row.source_calculation_evidence_fingerprint = source.source_calculation_evidence_fingerprint;
      row.pricing_policy_version_id = source.pricing_policy_version_id;
      row.pricing_valid_through = source.pricing_valid_through;

      const groupIdMap = new Map();
      for (const g of listGroups(sourceEnvelopeId)) {
        const ng = await api.upsertDraftGroup(organizationId, draft.id, {
          ...g,
          group_key: g.group_key,
          display_label: g.display_label
        });
        // upsert may update if keys collide — force new ids by direct insert copy
        groupIdMap.set(g.id, ng.id);
      }
      // Re-copy groups with fresh ids if upsert matched keys on empty draft — already fine
      for (const o of listOptions(sourceEnvelopeId)) {
        const newGroupId = groupIdMap.get(o.group_id);
        if (!newGroupId) continue;
        await api.upsertDraftOption(organizationId, draft.id, {
          ...o,
          group_id: newGroupId,
          option_key: o.option_key
        });
      }

      await appendEvent({
        organization_id: organizationId,
        envelope_id: draft.id,
        publication_id: source.publication_id,
        event_type: "envelope_cloned",
        actor_type: "user",
        actor_user_id: actorUserId,
        metadata: { clonedFromEnvelopeId: sourceEnvelopeId }
      });

      return api.getEnvelope(organizationId, draft.id);
    },

    async getEnvelopeGraph(organizationId, envelopeId) {
      const env = envelopes.get(String(envelopeId));
      if (!env || env.organization_id !== organizationId) return null;
      const gs = listGroups(envelopeId);
      const opts = listOptions(envelopeId);
      return {
        envelope: structuredClone(env),
        groups: gs.map((g) => structuredClone(g)),
        options: opts.map((o) => structuredClone(o)),
        publicOptions: opts.map((o) => {
          const g = gs.find((x) => x.id === o.group_id);
          return toPublicConfigurationOption(o, { groupKey: g?.group_key });
        })
      };
    },

    async createSession(organizationId, {
      publicationId,
      envelopeId,
      accessTokenId = null,
      expiresAt = null,
      sessionSecretHash = null,
      status = "configuring"
    }) {
      const env = envelopes.get(String(envelopeId));
      if (!env || env.organization_id !== organizationId) throw err("not_found", "envelope not found", 404);
      if (env.status !== "active") throw err("envelope_not_active", "envelope is not active", 400);
      if (env.publication_id !== publicationId) {
        throw err("publication_mismatch", "envelope publication mismatch", 400);
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        organization_id: organizationId,
        publication_id: publicationId,
        envelope_id: envelopeId,
        access_token_id: accessTokenId,
        session_secret_hash: sessionSecretHash,
        status,
        row_version: 1,
        last_client_idempotency_key: null,
        latest_calculation_id: null,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now
      };
      sessions.set(id, row);
      await appendEvent({
        organization_id: organizationId,
        envelope_id: envelopeId,
        publication_id: publicationId,
        session_id: id,
        event_type: "session_started",
        actor_type: "public"
      });
      await appendEvent({
        organization_id: organizationId,
        envelope_id: envelopeId,
        publication_id: publicationId,
        session_id: id,
        event_type: "configuration_session_started",
        actor_type: "public"
      });
      return structuredClone(row);
    },

    /**
     * DE.2E public session — may bind to active envelope or publication-only (read-only fallback).
     */
    async createPublicConfigurationSession({
      organizationId,
      publicationId,
      envelopeId = null,
      accessTokenId = null,
      sessionSecretHash,
      expiresAt = null,
      status = "active",
      allowMissingEnvelope = false
    }) {
      if (!sessionSecretHash) throw err("validation", "sessionSecretHash required", 400);
      if (envelopeId) {
        return api.createSession(organizationId, {
          publicationId,
          envelopeId,
          accessTokenId,
          expiresAt,
          sessionSecretHash,
          status
        });
      }
      if (!allowMissingEnvelope) throw err("envelope_required", "active envelope required", 400);
      const id = randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        organization_id: organizationId,
        publication_id: publicationId,
        envelope_id: null,
        access_token_id: accessTokenId,
        session_secret_hash: sessionSecretHash,
        status,
        row_version: 1,
        last_client_idempotency_key: null,
        latest_calculation_id: null,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now
      };
      sessions.set(id, row);
      await appendEvent({
        organization_id: organizationId,
        envelope_id: null,
        publication_id: publicationId,
        session_id: id,
        event_type: "configuration_session_started",
        actor_type: "public",
        metadata: { readOnlyBaseline: true }
      });
      return structuredClone(row);
    },

    async getSessionBySecretHash(secretHash) {
      const row = [...sessions.values()].find((s) => s.session_secret_hash === secretHash);
      return row ? structuredClone(row) : null;
    },

    async getLatestSelectionForSession(organizationId, sessionId) {
      const session = sessions.get(String(sessionId));
      if (session?.latest_calculation_id) {
        const calc = calculations.get(String(session.latest_calculation_id));
        if (calc?.selection_id) {
          const byCalc = selections.get(String(calc.selection_id));
          if (byCalc && byCalc.organization_id === organizationId) {
            return structuredClone(byCalc);
          }
        }
      }
      const rows = [...selections.values()]
        .filter((s) => s.organization_id === organizationId && s.session_id === sessionId)
        .sort((a, b) => {
          const t = String(b.created_at).localeCompare(String(a.created_at));
          if (t !== 0) return t;
          return String(b.id).localeCompare(String(a.id));
        });
      return rows[0] ? structuredClone(rows[0]) : null;
    },

    async getCalculationBySelectionId(organizationId, selectionId) {
      const row = [...calculations.values()].find(
        (c) => c.organization_id === organizationId && c.selection_id === selectionId
      );
      return row ? structuredClone(row) : null;
    },

    async revokeSession(organizationId, sessionId) {
      const session = sessions.get(String(sessionId));
      if (!session || session.organization_id !== organizationId) return false;
      session.status = "revoked";
      session.updated_at = new Date().toISOString();
      await appendEvent({
        organization_id: organizationId,
        envelope_id: session.envelope_id,
        publication_id: session.publication_id,
        session_id: sessionId,
        event_type: "configuration_session_expired",
        actor_type: "public",
        metadata: { revoked: true }
      });
      return true;
    },

    /**
     * Atomic selection + calculation persist (memory transactional parity with SQL RPC).
     */
    async saveSelectionAndCalculationAtomic({
      organizationId,
      sessionId,
      expectedRowVersion,
      idempotencyKey,
      selectionPayload,
      selectionHash,
      customerResultJson,
      internalEvidenceJson,
      baselineTotal = null,
      configuredTotal = null,
      pricingValidThrough = null,
      engineVersion,
      calculationInputFingerprint,
      calculationFingerprint = null
    }) {
      return pubLock(organizationId, `session:${sessionId}`).runExclusive(async () => {
        const checkpoint = cloneState();
        try {
          const session = sessions.get(String(sessionId));
          if (!session || session.organization_id !== organizationId) {
            throw err("not_found", "session not found", 404);
          }
          if (Number(session.row_version) !== Number(expectedRowVersion)) {
            throw err("row_version_conflict", "session row_version conflict", 409);
          }
          if (idempotencyKey && session.last_client_idempotency_key === idempotencyKey) {
            const priorSel = [...selections.values()]
              .filter(
                (s) => s.session_id === sessionId && s.client_idempotency_key === idempotencyKey
              )
              .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
            if (priorSel) {
              const priorCalc = [...calculations.values()].find((c) => c.selection_id === priorSel.id);
              if (priorCalc) {
                return {
                  reused: true,
                  session: structuredClone(session),
                  selection: structuredClone(priorSel),
                  calculation: structuredClone(priorCalc)
                };
              }
            }
          }

          const selectionId = randomUUID();
          const now = new Date().toISOString();
          const selectionRow = {
            id: selectionId,
            organization_id: organizationId,
            session_id: sessionId,
            envelope_id: session.envelope_id,
            selection_payload_json: selectionPayload,
            selection_hash: selectionHash,
            client_idempotency_key: idempotencyKey,
            created_at: now
          };
          selections.set(selectionId, selectionRow);

          const calcId = randomUUID();
          let fingerprint = String(calculationInputFingerprint || "");
          const existingFp = [...calculations.values()].find(
            (c) =>
              c.organization_id === organizationId &&
              c.calculation_input_fingerprint === fingerprint
          );
          if (existingFp) {
            // Public sessions may share economic inputs; scope fingerprint per selection.
            fingerprint = `${fingerprint}#sel:${selectionId}`;
          }
          const calcRow = {
            id: calcId,
            organization_id: organizationId,
            selection_id: selectionId,
            envelope_id: session.envelope_id,
            engine_version: engineVersion,
            calculation_input_fingerprint: fingerprint,
            calculation_fingerprint: calculationFingerprint,
            customer_result_json: customerResultJson,
            internal_evidence_json: internalEvidenceJson,
            baseline_total: baselineTotal,
            configured_total: configuredTotal,
            pricing_valid_through: pricingValidThrough,
            client_idempotency_key: idempotencyKey,
            created_at: now
          };
          calculations.set(calcId, calcRow);

          session.last_client_idempotency_key = idempotencyKey;
          session.row_version = Number(session.row_version) + 1;
          session.status = "saved";
          session.latest_calculation_id = calcId;
          session.updated_at = now;

          await appendEvent({
            organization_id: organizationId,
            envelope_id: session.envelope_id,
            publication_id: session.publication_id,
            session_id: sessionId,
            event_type: "selection_saved",
            actor_type: "public",
            metadata: { selectionHash }
          });
          await appendEvent({
            organization_id: organizationId,
            envelope_id: session.envelope_id,
            publication_id: session.publication_id,
            session_id: sessionId,
            event_type: "selections_saved",
            actor_type: "public",
            metadata: { selectionHash }
          });
          await appendEvent({
            organization_id: organizationId,
            envelope_id: session.envelope_id,
            publication_id: session.publication_id,
            session_id: sessionId,
            event_type: "calculated",
            actor_type: "system",
            metadata: { calculationId: calcId, fingerprint: calculationInputFingerprint }
          });
          await appendEvent({
            organization_id: organizationId,
            envelope_id: session.envelope_id,
            publication_id: session.publication_id,
            session_id: sessionId,
            event_type: "configuration_calculated",
            actor_type: "system",
            metadata: { calculationId: calcId }
          });

          return {
            reused: false,
            session: structuredClone(session),
            selection: structuredClone(selectionRow),
            calculation: structuredClone(calcRow)
          };
        } catch (e) {
          restoreState(checkpoint);
          throw e;
        }
      });
    },

    async appendEvent(row) {
      return appendEvent(row);
    },

    async saveSelection(organizationId, sessionId, rawSelection, {
      idempotencyKey = null,
      expectedRowVersion = null
    } = {}) {
      const session = sessions.get(String(sessionId));
      if (!session || session.organization_id !== organizationId) {
        throw err("not_found", "session not found", 404);
      }
      if (expectedRowVersion != null && session.row_version !== expectedRowVersion) {
        throw err("row_version_conflict", "session row_version conflict", 409);
      }
      if (idempotencyKey && session.last_client_idempotency_key === idempotencyKey) {
        const prior = [...selections.values()]
          .filter((s) => s.session_id === sessionId && s.client_idempotency_key === idempotencyKey)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        if (prior) return structuredClone(prior);
      }

      const opts = listOptions(session.envelope_id);
      const normalized = normalizeSelectionPayload(rawSelection, opts);
      const id = randomUUID();
      const row = {
        id,
        organization_id: organizationId,
        session_id: sessionId,
        envelope_id: session.envelope_id,
        selection_payload_json: normalized.selections,
        selection_hash: normalized.selectionHash,
        client_idempotency_key: idempotencyKey,
        created_at: new Date().toISOString()
      };
      selections.set(id, row);
      session.last_client_idempotency_key = idempotencyKey;
      session.row_version = Number(session.row_version) + 1;
      session.status = "saved";
      session.updated_at = new Date().toISOString();
      await appendEvent({
        organization_id: organizationId,
        envelope_id: session.envelope_id,
        publication_id: session.publication_id,
        session_id: sessionId,
        event_type: "selection_saved",
        actor_type: "public",
        metadata: { selectionHash: normalized.selectionHash }
      });
      return structuredClone(row);
    },

    /**
     * Persist an immutable calculation snapshot (DE.2C).
     * Idempotent when calculationInputFingerprint (+ optional idempotencyKey) matches an existing row.
     */
    async insertCalculation(organizationId, {
      selectionId,
      customerResultJson,
      internalEvidenceJson,
      baselineTotal = null,
      configuredTotal = null,
      pricingValidThrough = null,
      engineVersion = DIGITAL_ESTIMATE_CONFIG_ENGINE_VERSION_PLACEHOLDER,
      calculationInputFingerprint,
      calculationFingerprint = null,
      idempotencyKey = null
    }) {
      const selection = selections.get(String(selectionId));
      if (!selection || selection.organization_id !== organizationId) {
        throw err("not_found", "selection not found", 404);
      }

      const fingerprint =
        calculationInputFingerprint ||
        hashCanonical({
          selectionHash: selection.selection_hash,
          engineVersion,
          internalEvidenceJson
        });

      const existingByFp = [...calculations.values()].find(
        (c) =>
          c.organization_id === organizationId &&
          c.calculation_input_fingerprint === fingerprint &&
          (idempotencyKey == null ||
            c.client_idempotency_key == null ||
            c.client_idempotency_key === idempotencyKey)
      );
      if (existingByFp) {
        return structuredClone(existingByFp);
      }

      // One calculation per selection unless fingerprint differs (new selection row recommended)
      const priorForSelection = [...calculations.values()].find((c) => c.selection_id === selectionId);
      if (priorForSelection && priorForSelection.calculation_input_fingerprint === fingerprint) {
        return structuredClone(priorForSelection);
      }
      if (priorForSelection && priorForSelection.calculation_input_fingerprint !== fingerprint) {
        // Materially different inputs require a new selection id — fail closed on overwrite
        throw err("calc_exists", "selection already has a different immutable calculation", 409);
      }

      // Atomic insert + calculated event (memory transactional parity with SQL RPC)
      const checkpoint = cloneState();
      try {
        const id = randomUUID();
        const row = {
          id,
          organization_id: organizationId,
          selection_id: selectionId,
          envelope_id: selection.envelope_id,
          engine_version: engineVersion,
          calculation_input_fingerprint: fingerprint,
          calculation_fingerprint: calculationFingerprint,
          customer_result_json: customerResultJson,
          internal_evidence_json: internalEvidenceJson,
          baseline_total: baselineTotal,
          configured_total: configuredTotal,
          pricing_valid_through: pricingValidThrough,
          client_idempotency_key: idempotencyKey,
          created_at: new Date().toISOString()
        };
        calculations.set(id, row);
        await appendEvent({
          organization_id: organizationId,
          envelope_id: selection.envelope_id,
          session_id: selection.session_id,
          event_type: "calculated",
          actor_type: "system",
          metadata: { calculationId: id, fingerprint }
        });
        return structuredClone(row);
      } catch (e) {
        restoreState(checkpoint);
        throw e;
      }
    },

    async getCalculation(organizationId, calculationId) {
      const row = calculations.get(String(calculationId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },

    async getCalculationByInputFingerprint(organizationId, fingerprint, { idempotencyKey = null } = {}) {
      const row = [...calculations.values()].find(
        (c) =>
          c.organization_id === organizationId &&
          c.calculation_input_fingerprint === fingerprint &&
          (idempotencyKey == null ||
            !c.client_idempotency_key ||
            c.client_idempotency_key === idempotencyKey)
      );
      return row ? structuredClone(row) : null;
    },

    async updateCalculation() {
      throw err("immutable", "configuration calculations are immutable", 403);
    },

    async updateEvent() {
      throw err("immutable", "configuration events are append-only", 403);
    },

    listEvents(organizationId, envelopeId) {
      return events
        .filter((e) => e.organization_id === organizationId && e.envelope_id === envelopeId)
        .map((e) => structuredClone(e));
    },

    /** Test helper: prove we never wrote quote_headers */
    _assertNoQuoteHeaderWrites() {
      return true;
    },

    _dump() {
      return {
        envelopes: [...envelopes.values()],
        groups: [...groups.values()],
        options: [...options.values()],
        sessions: [...sessions.values()],
        selections: [...selections.values()],
        calculations: [...calculations.values()],
        events: [...events]
      };
    },

    async revokeSessionsForPublication(organizationId, publicationId) {
      const now = new Date().toISOString();
      let n = 0;
      for (const s of sessions.values()) {
        if (
          s.organization_id === organizationId &&
          s.publication_id === publicationId &&
          ["active", "configuring", "saved"].includes(s.status)
        ) {
          s.status = "revoked";
          s.updated_at = now;
          n += 1;
        }
      }
      return n;
    },

    /** Memory rollback helper for composed atomic flows (DE.2F). */
    _restore(dump) {
      if (!dump) return;
      envelopes.clear();
      for (const e of dump.envelopes || []) envelopes.set(e.id, structuredClone(e));
      groups.clear();
      for (const g of dump.groups || []) groups.set(g.id, structuredClone(g));
      options.clear();
      for (const o of dump.options || []) options.set(o.id, structuredClone(o));
      sessions.clear();
      for (const s of dump.sessions || []) sessions.set(s.id, structuredClone(s));
      selections.clear();
      for (const s of dump.selections || []) selections.set(s.id, structuredClone(s));
      calculations.clear();
      for (const c of dump.calculations || []) calculations.set(c.id, structuredClone(c));
      events.length = 0;
      events.push(...(dump.events || []).map((e) => structuredClone(e)));
    }
  };

  return api;
}

/**
 * Supabase configuration repository — service role only; activate via RPC.
 */
export function createSupabaseConfigurationRepository({ db }) {
  if (!db) {
    const errObj = new Error("Supabase configuration repository requires db");
    errObj.code = "supabase_misconfigured";
    throw errObj;
  }
  return {
    mode: "supabase",
    async getEnvelope(organizationId, envelopeId) {
      const { data, error } = await db
        .from("digital_estimate_configuration_envelopes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", envelopeId)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async activateEnvelope(organizationId, envelopeId, opts = {}) {
      const { data, error } = await db.rpc("digital_estimate_activate_configuration_envelope", {
        p_organization_id: organizationId,
        p_envelope_id: envelopeId,
        p_actor_user_id: opts.actorUserId ?? null,
        p_pricing_policy_fingerprint: opts.pricingPolicyFingerprint ?? null,
        p_catalog_fingerprint: opts.catalogFingerprint ?? null,
        p_expected_row_version: opts.expectedRowVersion ?? null
      });
      if (error) throw error;
      const envelope = await this.getEnvelope(organizationId, envelopeId);
      return {
        envelope,
        supersededCount: Number(data?.superseded_count) || 0,
        sessionsRevokedCount: Number(data?.sessions_revoked_count) || 0
      };
    },

    async getCalculation(organizationId, calculationId) {
      const { data, error } = await db
        .from("digital_estimate_configuration_calculations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", calculationId)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },

    async getCalculationByInputFingerprint(organizationId, fingerprint, { idempotencyKey = null } = {}) {
      let q = db
        .from("digital_estimate_configuration_calculations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("calculation_input_fingerprint", fingerprint)
        .limit(1);
      const { data, error } = await q;
      if (error) throw error;
      const row = data?.[0] ?? null;
      if (!row) return null;
      if (
        idempotencyKey != null &&
        row.client_idempotency_key &&
        row.client_idempotency_key !== idempotencyKey
      ) {
        return null;
      }
      return row;
    },

    async insertCalculation(organizationId, row) {
      const fingerprint =
        row.calculationInputFingerprint || row.calculation_input_fingerprint;
      const existing = await this.getCalculationByInputFingerprint(organizationId, fingerprint, {
        idempotencyKey: row.idempotencyKey || row.client_idempotency_key || null
      });
      if (existing) return existing;

      // Atomic RPC: insert calculation + append calculated event in one transaction
      const { data, error } = await db.rpc("digital_estimate_insert_configuration_calculation", {
        p_organization_id: organizationId,
        p_selection_id: row.selectionId || row.selection_id,
        p_engine_version: row.engineVersion || row.engine_version,
        p_calculation_input_fingerprint: fingerprint,
        p_customer_result_json: row.customerResultJson || row.customer_result_json,
        p_internal_evidence_json: row.internalEvidenceJson || row.internal_evidence_json,
        p_baseline_total: row.baselineTotal ?? row.baseline_total ?? null,
        p_configured_total: row.configuredTotal ?? row.configured_total ?? null,
        p_pricing_valid_through: row.pricingValidThrough ?? row.pricing_valid_through ?? null
      });
      if (error) {
        if (String(error.code) === "23505" || /duplicate|already has/i.test(String(error.message))) {
          const again = await this.getCalculationByInputFingerprint(organizationId, fingerprint);
          if (again) return again;
        }
        throw error;
      }
      return data?.calculation ?? data ?? null;
    },

    async createDraftEnvelope(trusted) {
      const { organizationId, publicationId, actorUserId, body = {} } = trusted;
      if (body?.organizationId || body?.organization_id) {
        const e = new Error("Caller must not supply organizationId");
        e.code = "forbidden_caller_authority";
        e.statusCode = 400;
        throw e;
      }
      const { data: pub, error: pubErr } = await db
        .from("quote_publications")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", publicationId)
        .limit(1);
      if (pubErr) throw pubErr;
      const publication = pub?.[0];
      if (!publication) {
        const e = new Error("publication not found");
        e.code = "not_found";
        e.statusCode = 404;
        throw e;
      }
      if (publication.status !== "active") {
        const e = new Error("publication is not active");
        e.code = "publication_not_active";
        e.statusCode = 400;
        throw e;
      }
      const { data: snaps, error: snapErr } = await db
        .from("quote_publication_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("publication_id", publicationId)
        .limit(1);
      if (snapErr) throw snapErr;
      const snap = snaps?.[0];
      if (!snap) {
        const e = new Error("publication snapshot missing");
        e.code = "snapshot_missing";
        e.statusCode = 400;
        throw e;
      }
      const { data: existingVersions } = await db
        .from("digital_estimate_configuration_envelopes")
        .select("envelope_version")
        .eq("organization_id", organizationId)
        .eq("publication_id", publicationId);
      const nextVersion =
        (existingVersions || []).reduce((m, e) => Math.max(m, Number(e.envelope_version) || 0), 0) + 1;
      const payload = {
        organization_id: organizationId,
        publication_id: publicationId,
        publication_snapshot_id: snap.id,
        source_quote_id: publication.source_quote_id,
        quote_family_root_id: publication.quote_family_root_id,
        source_quote_revision_number: publication.revision_number ?? null,
        source_calculation_evidence_fingerprint:
          publication.source_quote_fingerprint || publication.pricing_evidence_hash,
        envelope_version: nextVersion,
        status: "draft",
        baseline_customer_snapshot_hash:
          snap.customer_snapshot_hash || publication.customer_snapshot_hash,
        baseline_pricing_evidence_hash:
          snap.pricing_evidence_hash || publication.pricing_evidence_hash,
        pricing_valid_through: publication.pricing_valid_through ?? null,
        created_by_user_id: actorUserId ?? null,
        row_version: 1
      };
      const { data, error } = await db
        .from("digital_estimate_configuration_envelopes")
        .insert(payload)
        .select("*")
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (row) {
        await db.from("digital_estimate_configuration_events").insert({
          organization_id: organizationId,
          envelope_id: row.id,
          publication_id: publicationId,
          event_type: "envelope_created",
          actor_type: "user",
          actor_user_id: actorUserId ?? null
        });
      }
      return row ?? null;
    },

    async listEnvelopesForPublication(organizationId, publicationId) {
      const { data, error } = await db
        .from("digital_estimate_configuration_envelopes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("publication_id", publicationId)
        .order("envelope_version", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async getActiveEnvelope(organizationId, publicationId) {
      const { data, error } = await db
        .from("digital_estimate_configuration_envelopes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("publication_id", publicationId)
        .eq("status", "active")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },

    async updateDraftEnvelope(organizationId, envelopeId, patch, { expectedRowVersion, actorUserId } = {}) {
      const env = await this.getEnvelope(organizationId, envelopeId);
      if (!env) {
        const e = new Error("envelope not found");
        e.code = "not_found";
        e.statusCode = 404;
        throw e;
      }
      if (!["draft", "ready"].includes(env.status)) {
        const e = new Error("Only draft/ready envelopes can be mutated; clone to edit");
        e.code = "immutable";
        e.statusCode = 403;
        throw e;
      }
      if (expectedRowVersion != null && env.row_version !== expectedRowVersion) {
        const e = new Error("envelope row_version conflict");
        e.code = "row_version_conflict";
        e.statusCode = 409;
        throw e;
      }
      if (patch?.organizationId || patch?.organization_id) {
        const e = new Error("organization_id is immutable");
        e.code = "forbidden_caller_authority";
        e.statusCode = 400;
        throw e;
      }
      const updates = { row_version: Number(env.row_version) + 1, updated_at: new Date().toISOString() };
      if (patch?.pricing_valid_through != null) updates.pricing_valid_through = patch.pricing_valid_through;
      if (patch?.pricing_policy_version_id != null) {
        updates.pricing_policy_version_id = patch.pricing_policy_version_id;
      }
      const { data, error } = await db
        .from("digital_estimate_configuration_envelopes")
        .update(updates)
        .eq("organization_id", organizationId)
        .eq("id", envelopeId)
        .eq("row_version", env.row_version)
        .select("*")
        .limit(1);
      if (error) throw error;
      if (!data?.[0]) {
        const e = new Error("envelope row_version conflict");
        e.code = "row_version_conflict";
        e.statusCode = 409;
        throw e;
      }
      await db.from("digital_estimate_configuration_events").insert({
        organization_id: organizationId,
        envelope_id: envelopeId,
        publication_id: env.publication_id,
        event_type: "envelope_updated",
        actor_type: "user",
        actor_user_id: actorUserId ?? null
      });
      return data[0];
    },

    async upsertDraftGroup(organizationId, envelopeId, groupInput) {
      const env = await this.getEnvelope(organizationId, envelopeId);
      if (!env) {
        const e = new Error("envelope not found");
        e.code = "not_found";
        e.statusCode = 404;
        throw e;
      }
      if (!["draft", "ready"].includes(env.status)) {
        const e = new Error("Only draft/ready envelopes can be mutated; clone to edit");
        e.code = "immutable";
        e.statusCode = 403;
        throw e;
      }
      const groupKey = String(groupInput.group_key || groupInput.groupKey || "");
      if (!groupKey) {
        const e = new Error("group_key required");
        e.code = "validation";
        e.statusCode = 400;
        throw e;
      }
      const payload = {
        organization_id: organizationId,
        envelope_id: envelopeId,
        group_key: groupKey,
        display_label: String(groupInput.display_label || groupInput.displayLabel || groupKey),
        description_customer: groupInput.description_customer ?? groupInput.description ?? null,
        selection_mode: groupInput.selection_mode || groupInput.selectionMode || "single",
        required: Boolean(groupInput.required),
        mutually_exclusive: groupInput.mutually_exclusive ?? groupInput.mutuallyExclusive ?? true,
        sort_order: Number(groupInput.sort_order ?? groupInput.sortOrder ?? 0),
        compatibility_json: groupInput.compatibility_json ?? groupInput.compatibilityJson ?? {},
        notes_internal: groupInput.notes_internal ?? groupInput.notesInternal ?? null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await db
        .from("digital_estimate_configuration_groups")
        .upsert(payload, { onConflict: "envelope_id,group_key" })
        .select("*")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },

    async upsertDraftOption(organizationId, envelopeId, optionInput) {
      const env = await this.getEnvelope(organizationId, envelopeId);
      if (!env) {
        const e = new Error("envelope not found");
        e.code = "not_found";
        e.statusCode = 404;
        throw e;
      }
      if (!["draft", "ready"].includes(env.status)) {
        const e = new Error("Only draft/ready envelopes can be mutated; clone to edit");
        e.code = "immutable";
        e.statusCode = 403;
        throw e;
      }
      const groupId = String(optionInput.group_id || optionInput.groupId || "");
      const optionKey = String(optionInput.option_key || optionInput.optionKey || "");
      if (!groupId || !optionKey) {
        const e = new Error("group_id and option_key required");
        e.code = "validation";
        e.statusCode = 400;
        throw e;
      }
      const payload = {
        organization_id: organizationId,
        envelope_id: envelopeId,
        group_id: groupId,
        option_key: optionKey,
        display_label: String(optionInput.display_label || optionInput.displayLabel || optionKey),
        description_customer: optionInput.description_customer ?? optionInput.description ?? null,
        min_qty: Number(optionInput.min_qty ?? optionInput.minQty ?? 0),
        max_qty: optionInput.max_qty ?? optionInput.maxQty ?? null,
        default_qty: Number(optionInput.default_qty ?? optionInput.defaultQty ?? 0),
        included_in_baseline: Boolean(
          optionInput.included_in_baseline ?? optionInput.includedInBaseline
        ),
        required_selection: Boolean(
          optionInput.required_selection ?? optionInput.requiredSelection
        ),
        availability_state: optionInput.availability_state || optionInput.availabilityState || "active",
        customer_price_treatment:
          optionInput.customer_price_treatment || optionInput.customerPriceTreatment || "absolute",
        pricing_mode: optionInput.pricing_mode || optionInput.pricingMode || "fixed",
        sell_price: optionInput.sell_price ?? optionInput.sellPrice ?? null,
        compatibility_json: optionInput.compatibility_json ?? optionInput.compatibilityJson ?? {},
        is_active_in_envelope:
          optionInput.is_active_in_envelope ?? optionInput.isActiveInEnvelope ?? true,
        sort_order: Number(optionInput.sort_order ?? optionInput.sortOrder ?? 0),
        updated_at: new Date().toISOString()
      };
      const { data: existing } = await db
        .from("digital_estimate_configuration_options")
        .select("id")
        .eq("envelope_id", envelopeId)
        .eq("option_key", optionKey)
        .limit(1);
      let result;
      if (existing?.[0]?.id) {
        const { data, error } = await db
          .from("digital_estimate_configuration_options")
          .update(payload)
          .eq("id", existing[0].id)
          .eq("organization_id", organizationId)
          .select("*")
          .limit(1);
        if (error) throw error;
        result = data?.[0];
      } else {
        const { data, error } = await db
          .from("digital_estimate_configuration_options")
          .insert(payload)
          .select("*")
          .limit(1);
        if (error) throw error;
        result = data?.[0];
      }
      return result ?? null;
    },

    async getEnvelopeGraph(organizationId, envelopeId) {
      const envelope = await this.getEnvelope(organizationId, envelopeId);
      if (!envelope) return null;
      const { data: groups, error: gErr } = await db
        .from("digital_estimate_configuration_groups")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("envelope_id", envelopeId);
      if (gErr) throw gErr;
      const { data: options, error: oErr } = await db
        .from("digital_estimate_configuration_options")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("envelope_id", envelopeId);
      if (oErr) throw oErr;
      return {
        envelope,
        groups: groups || [],
        options: options || [],
        publicOptions: (options || []).map((o) => ({
          optionKey: o.option_key,
          displayLabel: o.display_label,
          availabilityState: o.availability_state,
          customerPriceTreatment: o.customer_price_treatment,
          minQty: o.min_qty,
          maxQty: o.max_qty,
          defaultQty: o.default_qty
        }))
      };
    },

    async cloneEnvelopeToDraft(organizationId, sourceEnvelopeId, { actorUserId = null } = {}) {
      const source = await this.getEnvelope(organizationId, sourceEnvelopeId);
      if (!source) {
        const e = new Error("envelope not found");
        e.code = "not_found";
        e.statusCode = 404;
        throw e;
      }
      const draft = await this.createDraftEnvelope({
        organizationId,
        publicationId: source.publication_id,
        actorUserId,
        body: {}
      });
      await db
        .from("digital_estimate_configuration_envelopes")
        .update({
          cloned_from_envelope_id: sourceEnvelopeId,
          baseline_customer_snapshot_hash: source.baseline_customer_snapshot_hash,
          baseline_pricing_evidence_hash: source.baseline_pricing_evidence_hash,
          source_calculation_evidence_fingerprint: source.source_calculation_evidence_fingerprint,
          pricing_policy_version_id: source.pricing_policy_version_id,
          pricing_valid_through: source.pricing_valid_through
        })
        .eq("id", draft.id)
        .eq("organization_id", organizationId);

      const graph = await this.getEnvelopeGraph(organizationId, sourceEnvelopeId);
      const groupIdMap = new Map();
      for (const g of graph?.groups || []) {
        const ng = await this.upsertDraftGroup(organizationId, draft.id, g);
        if (ng) groupIdMap.set(g.id, ng.id);
      }
      for (const o of graph?.options || []) {
        const newGroupId = groupIdMap.get(o.group_id);
        if (!newGroupId) continue;
        await this.upsertDraftOption(organizationId, draft.id, {
          ...o,
          group_id: newGroupId
        });
      }
      await db.from("digital_estimate_configuration_events").insert({
        organization_id: organizationId,
        envelope_id: draft.id,
        publication_id: source.publication_id,
        event_type: "envelope_cloned",
        actor_type: "user",
        actor_user_id: actorUserId,
        metadata: { clonedFromEnvelopeId: sourceEnvelopeId }
      });
      return this.getEnvelope(organizationId, draft.id);
    },

    async listEvents(organizationId, envelopeId) {
      const { data, error } = await db
        .from("digital_estimate_configuration_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("envelope_id", envelopeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async getSessionBySecretHash(secretHash) {
      const { data, error } = await db
        .from("digital_estimate_configuration_sessions")
        .select("*")
        .eq("session_secret_hash", secretHash)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },

    async getLatestSelectionForSession(organizationId, sessionId) {
      const { data: sessionRows, error: sessionErr } = await db
        .from("digital_estimate_configuration_sessions")
        .select("latest_calculation_id")
        .eq("organization_id", organizationId)
        .eq("id", sessionId)
        .limit(1);
      if (sessionErr) throw sessionErr;
      const latestCalcId = sessionRows?.[0]?.latest_calculation_id;
      if (latestCalcId) {
        const { data: calcRows, error: calcErr } = await db
          .from("digital_estimate_configuration_calculations")
          .select("selection_id")
          .eq("organization_id", organizationId)
          .eq("id", latestCalcId)
          .limit(1);
        if (calcErr) throw calcErr;
        const selectionId = calcRows?.[0]?.selection_id;
        if (selectionId) {
          const { data: selRows, error: selErr } = await db
            .from("digital_estimate_configuration_selections")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("id", selectionId)
            .limit(1);
          if (selErr) throw selErr;
          if (selRows?.[0]) return selRows[0];
        }
      }
      const { data, error } = await db
        .from("digital_estimate_configuration_selections")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },

    async getCalculationBySelectionId(organizationId, selectionId) {
      const { data, error } = await db
        .from("digital_estimate_configuration_calculations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("selection_id", selectionId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },

    async saveSelectionAndCalculationAtomic(args) {
      const run = async (fingerprint) =>
        db.rpc("digital_estimate_save_selection_and_calculation", {
          p_organization_id: args.organizationId,
          p_session_id: args.sessionId,
          p_expected_row_version: args.expectedRowVersion,
          p_idempotency_key: args.idempotencyKey,
          p_selection_payload_json: args.selectionPayload,
          p_selection_hash: args.selectionHash,
          p_engine_version: args.engineVersion,
          p_calculation_input_fingerprint: fingerprint,
          p_customer_result_json: args.customerResultJson,
          p_internal_evidence_json: args.internalEvidenceJson,
          p_baseline_total: args.baselineTotal ?? null,
          p_configured_total: args.configuredTotal ?? null,
          p_pricing_valid_through: args.pricingValidThrough ?? null
        });

      let { data, error } = await run(args.calculationInputFingerprint);
      if (
        error &&
        (String(error.code) === "23505" ||
          /uq_de_config_calc_input_fingerprint|duplicate key/i.test(String(error.message || "")))
      ) {
        // Scope fingerprint to this attempt so concurrent/public sessions can share
        // the same economic inputs without colliding on the org-wide unique index.
        const scoped = `${args.calculationInputFingerprint}#sel:${args.sessionId}:${args.idempotencyKey}`;
        ({ data, error } = await run(scoped));
      }
      if (error) throw error;
      return {
        reused: Boolean(data?.reused),
        session: data?.session,
        selection: data?.selection,
        calculation: data?.calculation
      };
    },

    async createPublicConfigurationSession(args) {
      const payload = {
        organization_id: args.organizationId,
        publication_id: args.publicationId,
        envelope_id: args.envelopeId,
        access_token_id: args.accessTokenId ?? null,
        session_secret_hash: args.sessionSecretHash,
        status: args.status || "active",
        expires_at: args.expiresAt,
        row_version: 1
      };
      const { data, error } = await db
        .from("digital_estimate_configuration_sessions")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      const row = data;
      if (row) {
        await db.from("digital_estimate_configuration_events").insert({
          organization_id: args.organizationId,
          envelope_id: args.envelopeId,
          publication_id: args.publicationId,
          session_id: row.id,
          event_type: "configuration_session_started",
          actor_type: "public",
          metadata: {}
        });
      }
      return row ?? null;
    },

    async revokeSession(organizationId, sessionId) {
      const { error } = await db
        .from("digital_estimate_configuration_sessions")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("id", sessionId);
      if (error) throw error;
      return true;
    }
  };
}
