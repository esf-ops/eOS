/**
 * DE.2D — Studio configuration envelope operations (server-authoritative).
 */

import { calculateElite100ConfigDelta, ELITE100_CONFIG_DELTA_ENGINE_ID } from "./elite100ConfigDeltaEngine.mjs";
import {
  buildTrustedConfigurationContext,
  rejectClientAuthoritativeEconomics,
  serverApprovedOptionCatalog
} from "./configurationTrustedContext.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import { validateEnvelopeStructure } from "./configurationValidation.mjs";

function fail(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

function percentToBps(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw fail("invalid_markup", "Markup percent must be 0–100");
  }
  return Math.round(n * 100);
}

/**
 * @param {{
 *   organizationId: string,
 *   actorUserId: string|null,
 *   deRepository: any,
 *   configurationRepository: any,
 *   pricingPolicyRepository?: any
 * }} deps
 */
export function createConfigurationStudioService(deps) {
  const { deRepository, configurationRepository, pricingPolicyRepository } = deps;

  async function ensurePolicyFixtures(organizationId) {
    if (
      pricingPolicyRepository &&
      typeof pricingPolicyRepository.seedConfirmedElite100Fixtures === "function"
    ) {
      const dump = pricingPolicyRepository._dump?.() || {};
      const has = (dump.policyVersions || []).some((p) => p.organization_id === organizationId);
      if (!has) pricingPolicyRepository.seedConfirmedElite100Fixtures(organizationId);
    }
  }

  return {
    async getPublicationContext(organizationId, publicationId, { pricingBasis = "direct" } = {}) {
      await ensurePolicyFixtures(organizationId);
      // Seed publications into config repo maps if memory dual-wired
      if (typeof configurationRepository.seedPublication === "function") {
        const pub = await deRepository.getPublication(organizationId, publicationId);
        const snap = await deRepository.getSnapshotByPublicationId(organizationId, publicationId);
        if (pub) configurationRepository.seedPublication(pub);
        if (snap) configurationRepository.seedSnapshot(snap);
      }
      const ctx = await buildTrustedConfigurationContext({
        organizationId,
        publicationId,
        deRepository,
        pricingPolicyRepository,
        pricingBasis
      });
      const envelopes = await configurationRepository.listEnvelopesForPublication(
        organizationId,
        publicationId
      );
      const active = await configurationRepository.getActiveEnvelope(organizationId, publicationId);
      return {
        context: {
          ...ctx,
          // Strip internal option prices from staff context response's nested catalogInternal? Keep for staff.
        },
        envelopes: envelopes.map((e) => ({
          id: e.id,
          status: e.status,
          envelopeVersion: e.envelope_version,
          rowVersion: e.row_version,
          activatedAt: e.activated_at,
          updatedAt: e.updated_at,
          clonedFromEnvelopeId: e.cloned_from_envelope_id
        })),
        activeEnvelopeId: active?.id || null
      };
    },

    async createDraft(organizationId, actorUserId, publicationId, body = {}) {
      rejectClientAuthoritativeEconomics(body);
      await ensurePolicyFixtures(organizationId);
      const ctx = await buildTrustedConfigurationContext({
        organizationId,
        publicationId,
        deRepository,
        pricingPolicyRepository
      });
      if (!ctx.canConfigure) {
        throw fail("configuration_blocked", ctx.blockers.map((b) => b.message).join("; "), 422);
      }
      if (typeof configurationRepository.seedPublication === "function") {
        const pub = await deRepository.getPublication(organizationId, publicationId);
        const snap = await deRepository.getSnapshotByPublicationId(organizationId, publicationId);
        if (pub) configurationRepository.seedPublication(pub);
        if (snap) configurationRepository.seedSnapshot(snap);
      }
      const draft = await configurationRepository.createDraftEnvelope({
        organizationId,
        publicationId,
        actorUserId,
        body: {}
      });
      // Seed default material group
      const matGroup = await configurationRepository.upsertDraftGroup(organizationId, draft.id, {
        groupKey: "material_by_room",
        displayLabel: "Material by room",
        required: true,
        selectionMode: "single",
        mutuallyExclusive: true
      });
      for (const room of ctx.rooms) {
        const code = room.baselineMaterialGroup || "group_b";
        await configurationRepository.upsertDraftOption(organizationId, draft.id, {
          groupId: matGroup.id,
          optionKey: `material:${room.roomKey}:${code}`,
          displayLabel: `${room.displayName} — ${room.baselineMaterialLabel || code}`,
          description: `Default material for ${room.displayName}`,
          includedInBaseline: true,
          defaultQty: 1,
          minQty: 0,
          maxQty: 1,
          requiredSelection: true,
          customerPriceTreatment: "delta",
          pricingMode: "replacement",
          sellPrice: 0,
          compatibilityJson: {
            roomKey: room.roomKey,
            materialGroup: code,
            role: "material_selection"
          }
        });
      }
      return await configurationRepository.getEnvelopeGraph(organizationId, draft.id);
    },

    async getEnvelope(organizationId, envelopeId) {
      return configurationRepository.getEnvelopeGraph(organizationId, envelopeId);
    },

    async listEnvelopes(organizationId, publicationId) {
      return configurationRepository.listEnvelopesForPublication(organizationId, publicationId);
    },

    async patchDraft(organizationId, envelopeId, body, actorUserId) {
      rejectClientAuthoritativeEconomics(body);
      const expectedRowVersion = body.expectedRowVersion ?? body.rowVersion;
      const { expectedRowVersion: _e, rowVersion: _r, confirm: _c, ...rest } = body;
      return configurationRepository.updateDraftEnvelope(organizationId, envelopeId, rest, {
        expectedRowVersion,
        actorUserId
      });
    },

    async putGroups(organizationId, envelopeId, body) {
      rejectClientAuthoritativeEconomics(body);
      const groups = Array.isArray(body.groups) ? body.groups : [];
      const out = [];
      for (const g of groups) {
        rejectClientAuthoritativeEconomics(g);
        out.push(await configurationRepository.upsertDraftGroup(organizationId, envelopeId, g));
      }
      return { groups: out };
    },

    async putOptions(organizationId, envelopeId, body) {
      rejectClientAuthoritativeEconomics(body);
      const options = Array.isArray(body.options) ? body.options : [];
      const catalog = new Map(serverApprovedOptionCatalog().map((o) => [o.optionKey, o]));
      const out = [];
      for (const raw of options) {
        rejectClientAuthoritativeEconomics(raw);
        const optionKey = String(raw.optionKey || raw.option_key || "");
        // Material selections use material:room:group keys — allowed
        const isMaterial = optionKey.startsWith("material:");
        const cat = catalog.get(optionKey);
        if (!isMaterial && !cat) {
          throw fail("unknown_option", `Option not in server-approved catalog: ${optionKey}`, 400);
        }
        if (cat && (cat.availabilityState === "unavailable" || cat.availabilityState === "review_required")) {
          if (Number(raw.defaultQty ?? raw.quantity ?? 0) > 0) {
            throw fail(
              "unresolved_product",
              `Option ${optionKey} is ${cat.availabilityState}: ${cat.unresolvedReason || ""}`,
              422
            );
          }
        }
        const sellPrice = isMaterial
          ? 0
          : cat?.sellPrice != null
            ? cat.sellPrice
            : null;
        if (!isMaterial && sellPrice == null && cat?.availabilityState === "active") {
          throw fail("missing_option_price", `No server price for ${optionKey}`, 422);
        }
        out.push(
          await configurationRepository.upsertDraftOption(organizationId, envelopeId, {
            ...raw,
            optionKey,
            sellPrice: sellPrice ?? 0,
            availabilityState: cat?.availabilityState || raw.availabilityState || "active",
            customerPriceTreatment:
              cat?.customerPriceTreatment || raw.customerPriceTreatment || "absolute",
            pricingMode: cat?.pricingMode || raw.pricingMode || "fixed",
            minQty: cat?.minQty ?? raw.minQty ?? 0,
            maxQty: cat?.maxQty ?? raw.maxQty ?? null
          })
        );
      }
      return { options: out };
    },

    async validate(organizationId, envelopeId) {
      const graph = await configurationRepository.getEnvelopeGraph(organizationId, envelopeId);
      if (!graph) throw fail("not_found", "Envelope not found", 404);
      const structural = validateEnvelopeStructure({
        groups: graph.groups,
        options: graph.options
      });
      const blockers = [...(structural.errors || [])];
      const ctx = await buildTrustedConfigurationContext({
        organizationId,
        publicationId: graph.envelope.publication_id,
        deRepository,
        pricingPolicyRepository
      });
      blockers.push(...ctx.blockers.map((b) => ({ code: b.code, message: b.message })));
      for (const opt of graph.options) {
        if (
          (opt.availability_state === "unavailable" || opt.availability_state === "review_required") &&
          Number(opt.default_qty) > 0
        ) {
          blockers.push({
            code: "unresolved_product",
            message: `Default selects unresolved option ${opt.option_key}`
          });
        }
      }
      return {
        ok: blockers.length === 0,
        blockers,
        envelopeId,
        status: graph.envelope.status,
        rowVersion: graph.envelope.row_version
      };
    },

    /**
     * Staff DE.2C preview — does not activate. Optional persist when selectionId provided.
     */
    async preview(organizationId, envelopeId, body = {}, actorUserId = null) {
      rejectClientAuthoritativeEconomics(body);
      const graph = await configurationRepository.getEnvelopeGraph(organizationId, envelopeId);
      if (!graph) throw fail("not_found", "Envelope not found", 404);

      const ctx = await buildTrustedConfigurationContext({
        organizationId,
        publicationId: graph.envelope.publication_id,
        deRepository,
        pricingPolicyRepository,
        pricingBasis: body.pricingBasis === "wholesale" ? "wholesale" : "direct"
      });
      if (!ctx.canConfigure) {
        throw fail("configuration_blocked", ctx.blockers.map((b) => b.message).join("; "), 422);
      }

      // Room material selections from envelope options or body.roomSelections (group codes only)
      const roomSelections = body.roomSelections && typeof body.roomSelections === "object"
        ? body.roomSelections
        : {};
      rejectClientAuthoritativeEconomics(roomSelections);

      const rooms = ctx.rooms.map((r) => {
        let selected = roomSelections[r.roomKey];
        if (!selected) {
          const opt = graph.options.find(
            (o) =>
              o.compatibility_json?.roomKey === r.roomKey ||
              String(o.option_key).startsWith(`material:${r.roomKey}:`)
          );
          selected =
            opt?.compatibility_json?.materialGroup ||
            String(opt?.option_key || "").split(":")[2] ||
            r.baselineMaterialGroup;
        }
        return {
          roomKey: r.roomKey,
          displayName: r.displayName,
          chargeableCounterSf: r.chargeableCounterSf,
          selectedMaterialGroup: selected,
          baselineMaterialGroup: r.baselineMaterialGroup
        };
      });

      let markupBps = 0;
      let markupEvidence = null;
      if (body.requestedMarkupPercent != null || body.requestedMarkupBps != null) {
        markupBps =
          body.requestedMarkupBps != null
            ? Math.round(Number(body.requestedMarkupBps))
            : percentToBps(body.requestedMarkupPercent);
        const reason = String(body.markupReason || "").trim();
        if (markupBps > 0 && !reason) {
          throw fail("markup_reason_required", "Nonzero markup requires a reason", 400);
        }
        if (markupBps > 0) {
          markupEvidence = {
            authorizedByUserId: actorUserId,
            reason,
            evidence: {
              pilotInternal: true,
              source: "studio_preview",
              notGenerallyApprovedProduction: true
            }
          };
          if (pricingPolicyRepository?.appendEstimatorOverride) {
            await pricingPolicyRepository.appendEstimatorOverride({
              organization_id: organizationId,
              envelope_id: envelopeId,
              publication_id: graph.envelope.publication_id,
              override_scope: "estimate",
              target_key: "material_markup_bps",
              override_value: markupBps,
              value_basis: "percent",
              reason_internal: reason,
              created_by_user_id: actorUserId,
              caps_policy_json: { pilotOnly: true },
              evidence_json: markupEvidence.evidence
            });
          }
        }
      }

      // Options from body.optionQuantities (keys only) — server resolves prices
      const optionQuantities =
        body.optionQuantities && typeof body.optionQuantities === "object"
          ? body.optionQuantities
          : {};
      const catalog = new Map(serverApprovedOptionCatalog().map((o) => [o.optionKey, o]));
      const options = [];
      for (const [key, qtyRaw] of Object.entries(optionQuantities)) {
        const cat = catalog.get(key);
        if (!cat) throw fail("unknown_option", `Unknown option ${key}`, 400);
        if (cat.availabilityState !== "active") {
          throw fail("unresolved_product", `Option ${key} is ${cat.availabilityState}`, 422);
        }
        options.push({
          optionKey: key,
          displayLabel: cat.displayLabel,
          quantity: Number(qtyRaw) || 0,
          sellPrice: cat.sellPrice,
          pricingMode: cat.pricingMode,
          customerPriceTreatment: cat.customerPriceTreatment,
          minQty: cat.minQty,
          maxQty: cat.maxQty,
          availabilityState: cat.availabilityState
        });
      }

      const baselineExact = ctx.baselineDisplayTotal; // display frozen; exact may equal for fixtures
      const result = calculateElite100ConfigDelta({
        organizationId,
        publication: {
          id: ctx.publication.id,
          snapshotId: ctx.publication.snapshotId,
          status: "active",
          quoteFamilyRootId: ctx.publication.quoteFamilyRootId
        },
        envelope: {
          id: graph.envelope.id,
          version: graph.envelope.envelope_version,
          status: graph.envelope.status === "active" ? "active" : "active",
          publicationId: ctx.publication.id
        },
        pricingPolicyFingerprint: ctx.pricingPolicyFingerprint,
        catalogFingerprint: ctx.catalogFingerprint,
        engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
        pricingBasis: ctx.pricingBasis,
        partnerAccountId: ctx.partnerAccountId,
        accountMemberships: ctx.accountMemberships,
        materialRateOverrides: ctx.materialRateOverrides,
        estimateAdjustments: ctx.estimateAdjustments,
        rooms,
        frozenBaseRates: ctx.frozenBaseRates,
        authorizedMaterialMarkup: {
          bps: markupBps,
          ...(markupEvidence || {})
        },
        materialTaxPolicy: { bps: 200 },
        options,
        baseline: {
          exactTotal: baselineExact,
          displayTotal: ctx.baselineDisplayTotal,
          rooms: ctx.rooms.map((r) => ({
            roomKey: r.roomKey,
            materialGroup: r.baselineMaterialGroup
          }))
        },
        pricingValidThrough: ctx.pricingValidThrough,
        materialProgram: "elite_100",
        actor: { type: "user", userId: actorUserId }
      });

      assertPublicConfigurationHasNoForbiddenContent(result.public);

      return {
        customerSafePreview: result.public,
        internalPreview: {
          baselineExactTotal: result.totals.baselineExactTotal,
          baselineDisplayTotal: result.totals.baselineDisplayTotal,
          configuredExactTotal: result.totals.configuredExactTotal,
          configuredDisplayTotal: result.totals.configuredDisplayTotal,
          exactDelta: result.totals.exactDelta,
          displayDelta: result.totals.displayDelta,
          materialSell: result.totals.materialSell,
          materialUseTax: result.totals.materialUseTax,
          spahnAdjustment: result.totals.spahnAdjustment,
          preAdjustmentSubtotal: result.totals.preAdjustmentSubtotal,
          accountMappingNotice: ctx.accountMappingNotice,
          partnerAccountMapped: Boolean(ctx.partnerAccountId),
          markupBps,
          engineVersion: result.engineVersion,
          pricingPolicyFingerprint: ctx.pricingPolicyFingerprint,
          catalogFingerprint: ctx.catalogFingerprint,
          rooms: result.internal.rooms.map((r) => ({
            roomKey: r.roomKey,
            selectedMaterialGroup: r.selectedMaterialGroup,
            finalRateCents: r.resolution.finalRateCents,
            source: r.resolution.source,
            materialSellCents: r.materialSellCents,
            materialUseTaxCents: r.materialUseTaxCents
          })),
          warnings: result.internal.warnings,
          moneyModel: result.internal.moneyModel
        }
      };
    },

    async activate(organizationId, envelopeId, body, actorUserId) {
      rejectClientAuthoritativeEconomics(body);
      if (!body?.confirm) {
        throw fail("confirm_required", "Activation requires confirm: true", 400);
      }
      if (!body?.acknowledgeFreeze) {
        throw fail(
          "acknowledge_required",
          "Activation requires acknowledgeFreeze: true",
          400
        );
      }
      const validation = await this.validate(organizationId, envelopeId);
      if (!validation.ok) {
        throw fail("validation_failed", "Envelope failed validation", 422);
      }
      const ctx = await buildTrustedConfigurationContext({
        organizationId,
        publicationId: (await configurationRepository.getEnvelope(organizationId, envelopeId))
          .publication_id,
        deRepository,
        pricingPolicyRepository
      });
      return configurationRepository.activateEnvelope(organizationId, envelopeId, {
        actorUserId,
        pricingPolicyFingerprint: ctx.pricingPolicyFingerprint,
        catalogFingerprint: ctx.catalogFingerprint,
        expectedRowVersion: body.expectedRowVersion ?? null
      });
    },

    async clone(organizationId, envelopeId, actorUserId) {
      return configurationRepository.cloneEnvelopeToDraft(organizationId, envelopeId, {
        actorUserId
      });
    },

    async listEvents(organizationId, envelopeId) {
      return configurationRepository.listEvents(organizationId, envelopeId);
    }
  };
}
