/**
 * Elite 100 Studio estimate service — Takeoff gate, scope, calculate, approve.
 */
import { createHash } from "node:crypto";
import { getLatestTakeoffResult, getTakeoffWorkspace } from "../takeoff/takeoffWorkspaceService.mjs";
import {
  buildTakeoffImportPayload,
  takeoffImportPayloadToRoomDrafts
} from "../takeoff/takeoffImportPayload.mjs";
import {
  STUDIO_ESTIMATE_STATUSES,
  emptyStudioEstimateScope
} from "./studioEstimateTypes.mjs";
import {
  calculateStudioEstimate,
  collectUnresolvedItems,
  scopeFingerprint
} from "./studioEstimatePricing.mjs";
import { deriveRoomBacksplashFromImportRoom } from "./studioRoomBacksplash.mjs";
import { createStudioEstimateRepository } from "./studioEstimateRepository.mjs";
import { loadStudioPartnerAccount } from "./studioPartnerAccountSearch.mjs";

function rejectCallerAuthority(body) {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "organizationId",
    "orgId",
    "actorId",
    "actorUserId",
    "userId",
    "createdByUserId",
    "rate",
    "ratePerSf",
    "materialRate",
    "useTaxPercent",
    "useTaxAmount",
    "accountAdjustment",
    "wattsOverride",
    "spahnAdjustment",
    "exactInternalTotal",
    "customerDisplayTotal",
    "totals",
    "takeoffApproved"
  ];
  for (const key of forbidden) {
    if (body[key] != null && body[key] !== "") {
      const err = new Error("Caller-controlled pricing or identity fields are not accepted");
      err.statusCode = 400;
      err.code = "forbidden_caller_authority";
      throw err;
    }
  }
}

/**
 * @param {object} workspace
 */
function assertTakeoffApproved(workspace) {
  const reviewStatus = String(workspace?.reviewStatus ?? "").toLowerCase();
  if (reviewStatus !== "approved") {
    const err = new Error("Takeoff must be approved before estimate pricing");
    err.statusCode = 409;
    err.code = "needs_takeoff_approval";
    throw err;
  }
}

/**
 * Seed commercial scope rooms from approved Takeoff.
 * @param {object} importPayload
 */
export function seedScopeFromTakeoffPayload(importPayload, baseScope = null) {
  const drafts = takeoffImportPayloadToRoomDrafts(importPayload);
  const importRoomsByName = new Map(
    (importPayload?.rooms ?? []).map((r) => [String(r.name || ""), r])
  );
  const rooms = drafts.map((d) => {
    const pieces = [];
    for (const g of d.guidedShapeGroups ?? []) {
      for (const p of g.pieces ?? []) {
        const lengthIn = Number(p.lengthIn) || 0;
        const depthIn = Number(p.depthIn) || 0;
        const sqft = Math.round(((lengthIn * depthIn) / 144) * 100) / 100;
        pieces.push({
          id: p.id,
          name: p.name,
          pieceType: p.pieceType || g.shapeType || "counter",
          lengthIn,
          depthIn,
          sqft,
          included: true,
          notes: ""
        });
      }
    }
    const countertopSqft = pieces
      .filter((p) => !String(p.pieceType).toLowerCase().includes("backsplash"))
      .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
    const fromImport = deriveRoomBacksplashFromImportRoom(
      importRoomsByName.get(String(d.name || "")) || {
        name: d.name,
        pieces: pieces.map((p) => ({
          name: p.name,
          pieceType: p.pieceType,
          lengthIn: p.lengthIn,
          depthIn: p.depthIn,
          sqft: p.sqft
        }))
      }
    );
    return {
      id: d.id,
      name: d.name,
      roomType: d.roomType || "Kitchen",
      included: true,
      countertopSqft,
      ...fromImport,
      pieces,
      notes: ""
    };
  });

  return {
    ...emptyStudioEstimateScope(),
    ...(baseScope || {}),
    // New empty scope is Wholesale; preserved baseScope.pricingBasis wins when provided.
    rooms: rooms.length ? rooms : baseScope?.rooms || []
  };
}

/**
 * @param {{
 *   repository?: object,
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: Function,
 *   loadTakeoffWorkspace?: Function,
 *   loadLatestTakeoffResult?: Function,
 *   calculateStudioEstimateImpl?: Function
 * }} [deps]
 */
export function createStudioEstimateService(deps = {}) {
  const env = deps.env ?? process.env;
  const repoBundle = deps.repository
    ? { repository: deps.repository, mode: "injected" }
    : createStudioEstimateRepository({ env, getSupabase: deps.getSupabase, db: deps.db });
  const repository = repoBundle.repository;
  const repositoryMode = repoBundle.mode;

  const loadWorkspace =
    deps.loadTakeoffWorkspace ||
    (async ({ organizationId, takeoffJobId }) => {
      const supabase = deps.getSupabase?.();
      if (!supabase) {
        const err = new Error("Takeoff workspace unavailable");
        err.statusCode = 503;
        err.code = "takeoff_unavailable";
        throw err;
      }
      return getTakeoffWorkspace({ supabase, organizationId, takeoffJobId });
    });

  const loadLatestResult =
    deps.loadLatestTakeoffResult ||
    (async ({ organizationId, takeoffJobId }) => {
      const supabase = deps.getSupabase?.();
      if (!supabase) return null;
      return getLatestTakeoffResult({ supabase, organizationId, takeoffJobId });
    });

  const calculateImpl = deps.calculateStudioEstimateImpl || calculateStudioEstimate;
  const loadPartnerAccount =
    deps.loadPartnerAccount ||
    (async ({ organizationId, partnerAccountId }) => {
      const supabase = deps.getSupabase?.() || deps.db;
      if (!supabase || !partnerAccountId) return null;
      return loadStudioPartnerAccount({
        db: supabase,
        organizationId,
        partnerAccountId
      });
    });

  async function resolveTrustedPartnerOnScope(organizationId, scope) {
    const partnerAccountId = scope?.partnerAccountId
      ? String(scope.partnerAccountId).trim()
      : "";
    if (!partnerAccountId) {
      return { scope: { ...scope, partnerAccountId: null }, partnerAccount: null };
    }
    const hasDb = Boolean(deps.getSupabase?.() || deps.db);
    const partnerAccount = await loadPartnerAccount({ organizationId, partnerAccountId });
    if (!partnerAccount && hasDb) {
      const err = new Error("Selected partner account is not available in this organization");
      err.statusCode = 400;
      err.code = "partner_account_invalid";
      throw err;
    }
    // Browser may only submit id; server reloads account when DB is available.
    // Pricing rules never use displayName — only trusted ID allowlists.
    return {
      scope: {
        ...scope,
        partnerAccountId: partnerAccount?.partnerAccountId || partnerAccountId
      },
      partnerAccount
    };
  }

  function safeEstimateView(row) {
    if (!row) return null;
    return {
      id: row.id,
      intakeCaseId: row.intakeCaseId,
      takeoffJobId: row.takeoffJobId,
      sourceTakeoffResultId: row.sourceTakeoffResultId,
      status: row.status,
      revision: row.revision,
      scope: row.scope,
      calculation: row.calculationSnapshot
        ? {
            fingerprint: row.calculationSnapshot.fingerprint,
            calculatedAt: row.calculationSnapshot.calculatedAt,
            totals: row.calculationSnapshot.totals,
            material: row.calculationSnapshot.material,
            fabrication: row.calculationSnapshot.fabrication,
            account: row.calculationSnapshot.account,
            internalMarkup: row.calculationSnapshot.internalMarkup,
            warnings: row.calculationSnapshot.warnings,
            unresolvedItems: row.calculationSnapshot.unresolvedItems,
            pricingEngine: row.calculationSnapshot.pricingEngine,
            pricingVersion: row.calculationSnapshot.pricingVersion
          }
        : null,
      calculationFingerprint: row.calculationFingerprint || row.calculationSnapshot?.fingerprint || null,
      pricingEngine: row.pricingEngine || row.calculationSnapshot?.pricingEngine || null,
      pricingVersion: row.pricingVersion ?? row.calculationSnapshot?.pricingVersion ?? null,
      approval: row.approval,
      approvedAt: row.approvedAt || row.approval?.approvedAt || null,
      approvedByUserId: row.approvedByUserId || row.approval?.approvedByUserId || null,
      staleReason: row.staleReason,
      supersededAt: row.supersededAt || null,
      repositoryMode,
      persistenceWarning:
        repositoryMode === "memory"
          ? "Studio estimates are in-memory on this Brain instance and reset when the process restarts. Set ELITE100_STUDIO_ESTIMATE_REPOSITORY=supabase and apply eliteos_studio_estimates_v1.sql for durable storage."
          : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId
    };
  }

  async function revisePreservingApprovedSnapshot(row, organizationId, actorUserId, input) {
    if (typeof repository.createRevisionFrom === "function") {
      return repository.createRevisionFrom(organizationId, row.id, input, actorUserId);
    }
    // Fallback for older injected repos: invalidate in place (tests may use minimal stubs).
    return repository.update(
      organizationId,
      row.id,
      {
        status: input.status || STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
        scope: input.scope ?? row.scope,
        approval: null,
        calculationSnapshot: null,
        staleReason: input.staleReason ?? null,
        revisionBump: true,
        sourceTakeoffResultId: input.sourceTakeoffResultId ?? row.sourceTakeoffResultId,
        takeoffJobId: input.takeoffJobId ?? row.takeoffJobId
      },
      actorUserId
    );
  }

  async function ensureEstimate({ organizationId, intakeCaseId, takeoffJobId, actorUserId }) {
    let row = await repository.getActiveByIntakeCase(organizationId, intakeCaseId);
    if (!row) {
      row = await repository.create({
        organizationId,
        intakeCaseId,
        takeoffJobId,
        createdByUserId: actorUserId,
        status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
        scope: emptyStudioEstimateScope()
      });
    } else if (takeoffJobId && row.takeoffJobId !== takeoffJobId) {
      row = await repository.update(
        organizationId,
        row.id,
        { takeoffJobId, status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL },
        actorUserId
      );
    }
    return row;
  }

  async function refreshTakeoffGate(row, organizationId, actorUserId) {
    if (!row.takeoffJobId) {
      return repository.update(
        organizationId,
        row.id,
        { status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL },
        actorUserId
      );
    }
    const workspace = await loadWorkspace({
      organizationId,
      takeoffJobId: row.takeoffJobId
    });
    const reviewStatus = String(workspace?.reviewStatus ?? "").toLowerCase();
    const latest = await loadLatestResult({
      organizationId,
      takeoffJobId: row.takeoffJobId
    }).catch(() => null);
    const resultId = workspace?.latestResult?.id || latest?.id || null;

    if (reviewStatus !== "approved") {
      return repository.update(
        organizationId,
        row.id,
        {
          status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
          sourceTakeoffResultId: resultId,
          staleReason:
            row.status === STUDIO_ESTIMATE_STATUSES.APPROVED
              ? "Takeoff is no longer approved"
              : row.staleReason
        },
        actorUserId
      );
    }

    // Takeoff approved — seed scope once when empty.
    let scope = row.scope || emptyStudioEstimateScope();
    const needsSeed = !Array.isArray(scope.rooms) || scope.rooms.length === 0;
    if (needsSeed && latest?.normalizedTakeoffJson) {
      try {
        const payload = buildTakeoffImportPayload({
          takeoffJobId: row.takeoffJobId,
          takeoffResultId: resultId,
          takeoffResult: latest.normalizedTakeoffJson,
          reviewState: latest.reviewState || null,
          computed: latest.computedMeasurementsJson || null,
          validation: latest.validationDiagnosticsJson || null,
          requireApproved: true,
          reviewStatus: "approved",
          approvedAt: workspace.approvedAt || null,
          approvedBy: workspace.approvedByUserId || null
        });
        scope = seedScopeFromTakeoffPayload(payload, scope);
      } catch {
        // Fallback: seed from raw takeoff rooms without full approval-gate payload.
        try {
          const rooms = [];
          for (const room of latest.normalizedTakeoffJson.rooms ?? []) {
            const pieces = [];
            for (const area of room.areas ?? []) {
              for (const run of area.runs ?? []) {
                const lengthIn = Number(run.lengthIn) || 0;
                const depthIn = Number(run.depthIn) || 0;
                if (lengthIn <= 0 || depthIn <= 0) continue;
                pieces.push({
                  id: run.id || `run-${pieces.length}`,
                  name: run.label || "Piece",
                  pieceType: "counter",
                  lengthIn,
                  depthIn,
                  sqft: Math.round(((lengthIn * depthIn) / 144) * 100) / 100,
                  included: true,
                  notes: ""
                });
              }
            }
            rooms.push({
              id: room.id || `room-${rooms.length}`,
              name: room.name || `Room ${rooms.length + 1}`,
              roomType: room.roomType || "Kitchen",
              included: true,
              countertopSqft: pieces.reduce((s, p) => s + p.sqft, 0),
              ...deriveRoomBacksplashFromImportRoom({
                name: room.name,
                pieces: (room.areas ?? []).flatMap((area) => {
                  const linear = Number(area.backsplashLinearIn) || 0;
                  const h = Number(area.backsplashHeightIn ?? area.backsplashHeight ?? 0);
                  if (linear <= 0) return [];
                  const heightIn = h > 0 ? h : 4;
                  const sqft = Math.round(((linear * heightIn) / 144) * 100) / 100;
                  return [
                    {
                      name: `${area.label || "Area"} splash`,
                      pieceType: "backsplash",
                      lengthIn: linear,
                      depthIn: heightIn,
                      sqft,
                      backsplash: {
                        type:
                          heightIn >= 48
                            ? "full_height"
                            : heightIn > 4.5
                              ? "high"
                              : "standard",
                        heightIn,
                        linearIn: linear,
                        sqft
                      }
                    }
                  ];
                })
              }),
              pieces,
              notes: ""
            });
          }
          if (rooms.length) scope = { ...scope, rooms };
        } catch {
          // Leave scope empty; UI can show takeoff-approved but seed failed.
        }
      }
    }

    const takeoffChanged =
      row.sourceTakeoffResultId &&
      resultId &&
      String(row.sourceTakeoffResultId) !== String(resultId);

    // Never silently overwrite commercial scope when Takeoff changes after seed.
    if (takeoffChanged && !needsSeed) {
      const staleMsg =
        "Takeoff measurements changed — refresh Estimate Scope to update rooms/pieces";
      if (row.status === STUDIO_ESTIMATE_STATUSES.APPROVED) {
        return revisePreservingApprovedSnapshot(row, organizationId, actorUserId, {
          status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
          sourceTakeoffResultId: resultId,
          takeoffJobId: row.takeoffJobId,
          staleReason: staleMsg
        });
      }
      return repository.update(
        organizationId,
        row.id,
        {
          sourceTakeoffResultId: resultId,
          staleReason: staleMsg,
          status:
            row.status === STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL
              ? STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE
              : row.status
        },
        actorUserId
      );
    }

    /** @type {Record<string, unknown>} */
    const patch = {
      sourceTakeoffResultId: resultId,
      scope
    };
    if (
      row.status === STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL ||
      row.status === STUDIO_ESTIMATE_STATUSES.DRAFT
    ) {
      patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
      if (needsSeed) patch.staleReason = null;
    }

    return repository.update(organizationId, row.id, patch, actorUserId);
  }

  async function refreshScopeFromTakeoff(row, organizationId, actorUserId, { force = false } = {}) {
    assertTakeoffApproved(
      await loadWorkspace({ organizationId, takeoffJobId: row.takeoffJobId })
    );
    const workspace = await loadWorkspace({
      organizationId,
      takeoffJobId: row.takeoffJobId
    });
    const latest = await loadLatestResult({
      organizationId,
      takeoffJobId: row.takeoffJobId
    });
    const resultId = workspace?.latestResult?.id || latest?.id || null;
    if (!latest?.normalizedTakeoffJson) {
      const err = new Error("Approved Takeoff result unavailable");
      err.statusCode = 409;
      err.code = "takeoff_result_missing";
      throw err;
    }
    const payload = buildTakeoffImportPayload({
      takeoffJobId: row.takeoffJobId,
      takeoffResultId: resultId,
      takeoffResult: latest.normalizedTakeoffJson,
      reviewState: latest.reviewState || null,
      computed: latest.computedMeasurementsJson || null,
      validation: latest.validationDiagnosticsJson || null,
      requireApproved: true,
      reviewStatus: "approved",
      approvedAt: workspace.approvedAt || null,
      approvedBy: workspace.approvedByUserId || null
    });
    const nextScope = seedScopeFromTakeoffPayload(payload, {
      customerName: row.scope?.customerName,
      projectName: row.scope?.projectName,
      partnerAccountId: row.scope?.partnerAccountId,
      materialGroupId: row.scope?.materialGroupId,
      colorId: row.scope?.colorId,
      markupPercent: row.scope?.markupPercent
    });
    const preview = {
      previousRoomCount: Array.isArray(row.scope?.rooms) ? row.scope.rooms.length : 0,
      nextRoomCount: nextScope.rooms?.length ?? 0,
      previousCountertopSf: (row.scope?.rooms ?? []).reduce(
        (s, r) => s + (Number(r.countertopSqft) || 0),
        0
      ),
      nextCountertopSf: (nextScope.rooms ?? []).reduce(
        (s, r) => s + (Number(r.countertopSqft) || 0),
        0
      )
    };
    if (!force) {
      return { preview, estimate: safeEstimateView(row) };
    }
    const updated = await repository.update(
      organizationId,
      row.id,
      {
        scope: nextScope,
        sourceTakeoffResultId: resultId,
        staleReason: null,
        status:
          row.status === STUDIO_ESTIMATE_STATUSES.APPROVED
            ? STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE
            : row.status === STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL
              ? STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE
              : row.status,
        calculation: null,
        approval: null
      },
      actorUserId
    );
    return { preview, estimate: safeEstimateView(updated) };
  }

  return {
    repositoryMode,
    repository,
    safeEstimateView,

    async getOrCreateForCase({ organizationId, intakeCaseId, takeoffJobId, actorUserId }) {
      let row = await ensureEstimate({
        organizationId,
        intakeCaseId,
        takeoffJobId,
        actorUserId
      });
      try {
        row = await refreshTakeoffGate(row, organizationId, actorUserId);
      } catch (e) {
        if (e?.code === "takeoff_unavailable" || e?.statusCode === 404) {
          // Keep estimate; UI shows needs takeoff.
          return safeEstimateView(row);
        }
        throw e;
      }
      return safeEstimateView(row);
    },

    async refreshScopeFromTakeoff({ organizationId, estimateId, actorUserId, force = false }) {
      const row = await repository.getById(organizationId, estimateId);
      if (!row) {
        const err = new Error("Estimate not found");
        err.statusCode = 404;
        err.code = "estimate_not_found";
        throw err;
      }
      return refreshScopeFromTakeoff(row, organizationId, actorUserId, { force });
    },

    async updateScope({ organizationId, estimateId, body, actorUserId }) {
      rejectCallerAuthority(body);
      const scopePatch = body?.scope && typeof body.scope === "object" ? body.scope : body;
      const clean = { ...scopePatch };
      delete clean.organizationId;
      delete clean.actorUserId;
      delete clean.totals;

      let row = await repository.getById(organizationId, estimateId);
      if (!row) {
        const err = new Error("Estimate not found");
        err.statusCode = 404;
        err.code = "estimate_not_found";
        throw err;
      }

      const nextScope = { ...row.scope, ...clean };
      if ("partnerAccountId" in clean) {
        const resolved = await resolveTrustedPartnerOnScope(organizationId, nextScope);
        Object.assign(nextScope, resolved.scope);
      }
      const wasApproved = row.status === STUDIO_ESTIMATE_STATUSES.APPROVED;
      const scopeChanged = scopeFingerprint(row.scope) !== scopeFingerprint(nextScope);

      if (wasApproved && scopeChanged) {
        row = await revisePreservingApprovedSnapshot(row, organizationId, actorUserId, {
          status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
          scope: nextScope,
          staleReason: "Scope changed after approval — recalculate and reapprove"
        });
        return safeEstimateView(row);
      }

      /** @type {Record<string, unknown>} */
      const patch = { scope: nextScope };
      if (row.status === STUDIO_ESTIMATE_STATUSES.PRICED && scopeChanged) {
        patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
        patch.calculationSnapshot = null;
        patch.staleReason = "Scope changed — recalculate";
      } else if (
        row.status !== STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL &&
        row.status !== STUDIO_ESTIMATE_STATUSES.APPROVED
      ) {
        patch.status = STUDIO_ESTIMATE_STATUSES.DRAFT;
      }

      row = await repository.update(organizationId, estimateId, patch, actorUserId);
      return safeEstimateView(row);
    },

    async calculate({ organizationId, estimateId, actorUserId, body }) {
      rejectCallerAuthority(body);
      let row = await repository.getById(organizationId, estimateId);
      if (!row) {
        const err = new Error("Estimate not found");
        err.statusCode = 404;
        err.code = "estimate_not_found";
        throw err;
      }
      row = await refreshTakeoffGate(row, organizationId, actorUserId);
      const workspace = await loadWorkspace({
        organizationId,
        takeoffJobId: row.takeoffJobId
      });
      assertTakeoffApproved(workspace);

      const resolved = await resolveTrustedPartnerOnScope(organizationId, row.scope);
      if (resolved.scope.partnerAccountId !== row.scope.partnerAccountId) {
        row = await repository.update(
          organizationId,
          estimateId,
          { scope: resolved.scope },
          actorUserId
        );
      }

      const calc = await calculateImpl({
        scope: resolved.scope,
        actorUserId,
        env
      });

      row = await repository.update(
        organizationId,
        estimateId,
        {
          calculationSnapshot: calc,
          status: STUDIO_ESTIMATE_STATUSES.PRICED,
          staleReason: null
        },
        actorUserId
      );
      return safeEstimateView(row);
    },

    async approve({ organizationId, estimateId, actorUserId, body }) {
      rejectCallerAuthority(body);
      if (body?.confirm !== true) {
        const err = new Error("confirm: true is required to approve");
        err.statusCode = 400;
        err.code = "confirm_required";
        throw err;
      }

      let row = await repository.getById(organizationId, estimateId);
      if (!row) {
        const err = new Error("Estimate not found");
        err.statusCode = 404;
        err.code = "estimate_not_found";
        throw err;
      }

      // Idempotent: already approved for same calculation fingerprint.
      if (
        row.status === STUDIO_ESTIMATE_STATUSES.APPROVED &&
        row.approval?.calculationFingerprint &&
        row.calculationSnapshot?.fingerprint === row.approval.calculationFingerprint
      ) {
        return safeEstimateView(row);
      }

      row = await refreshTakeoffGate(row, organizationId, actorUserId);
      const workspace = await loadWorkspace({
        organizationId,
        takeoffJobId: row.takeoffJobId
      });
      assertTakeoffApproved(workspace);

      if (!row.calculationSnapshot?.fingerprint) {
        const err = new Error("Calculate the estimate before approving");
        err.statusCode = 409;
        err.code = "not_priced";
        throw err;
      }

      const unresolved = collectUnresolvedItems(row.scope);
      if (unresolved.length && !row.scope?.unresolvedManualReview) {
        const err = new Error("Unresolved commercial items block approval");
        err.statusCode = 422;
        err.code = "unresolved_items";
        err.details = unresolved;
        throw err;
      }

      const approval = {
        approvedAt: new Date().toISOString(),
        approvedByUserId: actorUserId || null,
        calculationFingerprint: row.calculationSnapshot.fingerprint,
        sourceTakeoffResultId: row.sourceTakeoffResultId,
        scopeFingerprint: scopeFingerprint(row.scope),
        exactInternalTotal: row.calculationSnapshot.totals?.exactInternalTotal ?? null,
        customerDisplayTotal: row.calculationSnapshot.totals?.customerDisplayTotal ?? null
      };

      row = await repository.update(
        organizationId,
        estimateId,
        {
          status: STUDIO_ESTIMATE_STATUSES.APPROVED,
          approval,
          staleReason: null
        },
        actorUserId
      );
      return safeEstimateView(row);
    }
  };
}

export function hashTakeoffApprovalToken(resultId, approvedAt) {
  return createHash("sha256")
    .update(`${resultId || ""}|${approvedAt || ""}`)
    .digest("hex")
    .slice(0, 24);
}
