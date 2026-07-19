/**
 * Publish / revoke / replace-token / link-copied — Phase DE.1.
 * Publish and token-replace require repository.publishAtomic / replaceTokenAtomic.
 */

import {
  DIGITAL_ESTIMATE_ENGINE_VERSION,
  DIGITAL_ESTIMATE_TERMS_VERSION,
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublishEnabled,
  readDigitalEstimateAccessTtlDays,
  readDigitalEstimatePricingValidDays
} from "./digitalEstimateConfig.mjs";
import { assessElite100PublicationEligibility } from "./digitalEstimateEligibility.mjs";
import { sanitizeDigitalEstimateEventMetadata } from "./digitalEstimateEvents.mjs";
import { buildPublicationFreezePayloads } from "./digitalEstimateSnapshot.mjs";
import { generateDigitalEstimateAccessToken } from "./digitalEstimateToken.mjs";
import {
  assertDigitalEstimateLinkWrapConfigured,
  buildDigitalEstimateCustomerUrl,
  buildLinkRecoveryDiagnostics,
  unwrapDigitalEstimateAccessTokenDetailed,
  wrapDigitalEstimateAccessToken
} from "./digitalEstimateTokenWrap.mjs";
import { describeSyntheticPublicAccessibility } from "./syntheticPilotGuard.mjs";

async function persistAndVerifyWrappedAccessToken(
  repository,
  organizationId,
  publicationId,
  rawToken,
  env
) {
  if (typeof repository?.setActiveTokenWrapped !== "function") {
    const err = new Error("Customer link recovery storage is unavailable on this Brain.");
    err.code = "token_wrap_persist_failed";
    err.statusCode = 503;
    err.diagnostics = buildLinkRecoveryDiagnostics(env, null, {
      code: "token_wrap_persist_failed",
      decryptSucceeded: false
    });
    throw err;
  }

  // Memory atomic insert may already include token_wrapped.
  if (typeof repository.getActiveTokenForPublication === "function") {
    const existing = await repository.getActiveTokenForPublication(organizationId, publicationId);
    if (existing?.token_wrapped) {
      const early = unwrapDigitalEstimateAccessTokenDetailed(existing.token_wrapped, env, {
        tokenRow: existing
      });
      if (early.ok && early.rawToken === rawToken) {
        return { wrapped: existing.token_wrapped, diagnostics: early.diagnostics };
      }
    }
  }

  const wrapped = wrapDigitalEstimateAccessToken(rawToken, env);
  let persisted;
  try {
    persisted = await repository.setActiveTokenWrapped(organizationId, publicationId, wrapped);
  } catch (e) {
    if (e?.code === "active_token_missing" && typeof repository.getPublication === "function") {
      const pub = await repository.getPublication(organizationId, publicationId);
      if (pub && pub.status !== "active") {
        // Concurrent family publish superseded this publication before wrap persist.
        return {
          wrapped: null,
          diagnostics: buildLinkRecoveryDiagnostics(env, null, {
            code: "publication_superseded_during_persist",
            decryptSucceeded: false
          })
        };
      }
    }
    if (!e.diagnostics) {
      e.diagnostics = buildLinkRecoveryDiagnostics(env, null, {
        code: e.code || "token_wrap_persist_failed",
        decryptSucceeded: false
      });
    }
    throw e;
  }
  const verify = unwrapDigitalEstimateAccessTokenDetailed(persisted?.token_wrapped, env, {
    tokenRow: persisted
  });
  if (!verify.ok || verify.rawToken !== rawToken) {
    const err = new Error(
      "Customer link was stored but could not be recovered with the current wrap key. Check DIGITAL_ESTIMATE_LINK_WRAP_KEY."
    );
    err.code = verify.code || "link_unwrap_failed";
    err.statusCode = 503;
    err.diagnostics = verify.diagnostics;
    throw err;
  }
  return { wrapped, diagnostics: verify.diagnostics };
}

async function assertReplaceWrapReady(repository, organizationId, publicationId, env) {
  assertDigitalEstimateLinkWrapConfigured(env);
  // Prove wrap works before invalidating the current token.
  wrapDigitalEstimateAccessToken("preflight-token-aaaaaaaaaaaaaaaaaa", env);
  if (typeof repository?.probeTokenWrappedColumn === "function") {
    await repository.probeTokenWrappedColumn();
  }
  if (typeof repository?.assertActiveTokenWrappedWritable === "function") {
    await repository.assertActiveTokenWrappedWritable(organizationId, publicationId);
  }
}

function deError(message, code, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function addDaysIso(days, now = new Date()) {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function addDaysDateOnly(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const FORBIDDEN_BODY_KEYS = [
  "organizationId",
  "organization_id",
  "token",
  "accessToken",
  "tenantId",
  "publicationId",
  "publication_id",
  "snapshotId",
  "snapshot_id",
  "material_program_default",
  "materialProgramDefault",
  "elite_100"
];

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   repository: any,
 *   body?: object,
 *   now?: () => Date
 * }} input
 */
export async function publishDigitalEstimate(input) {
  const env = input.env ?? process.env;
  if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
    throw deError("Digital Estimate publish disabled", "digital_estimate_disabled", 404);
  }

  if (typeof input.repository?.publishAtomic !== "function") {
    throw deError(
      "Publication repository missing atomic publish boundary",
      "atomic_publish_unavailable",
      500
    );
  }

  const body = input.body && typeof input.body === "object" ? input.body : {};
  if (body.confirm !== true && body.confirm !== "true") {
    throw deError("Explicit publish confirmation required", "confirm_required", 400);
  }

  for (const k of FORBIDDEN_BODY_KEYS) {
    if (body[k] != null && String(body[k]).trim() !== "") {
      throw deError("Caller-controlled fields are not accepted", "forbidden", 400);
    }
  }

  const quoteId = String(body.quoteId ?? body.quote_id ?? "").trim();
  if (!quoteId) throw deError("quoteId required", "quote_id_required", 400);

  const header = await input.repository.getQuoteHeader(input.organizationId, quoteId);
  if (!header) throw deError("Quote not found", "quote_not_found", 404);

  // Org authority is session-derived organizationId + repository org filter — never body.
  if (
    header.organization_id &&
    String(header.organization_id) !== String(input.organizationId)
  ) {
    throw deError("Quote not found", "quote_not_found", 404);
  }

  const eligibility = assessElite100PublicationEligibility(header);
  if (!eligibility.eligible) {
    throw deError(eligibility.message, eligibility.code, 400);
  }

  const nowFn = input.now ?? (() => new Date());
  const now = nowFn();
  const publishedAt = now.toISOString();
  const accessExpiresAt = addDaysIso(readDigitalEstimateAccessTtlDays(env), now);
  let pricingValidThrough = addDaysDateOnly(readDigitalEstimatePricingValidDays(env), now);
  if (body.pricingValidThrough != null && String(body.pricingValidThrough).trim() !== "") {
    const requested = String(body.pricingValidThrough).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
      throw deError("pricingValidThrough must be YYYY-MM-DD", "invalid_pricing_valid_through", 400);
    }
    pricingValidThrough = requested;
  }

  const freeze = buildPublicationFreezePayloads({
    header,
    publishedAt,
    pricingValidThrough,
    termsDisclosureVersion: DIGITAL_ESTIMATE_TERMS_VERSION,
    calculationEngineVersion: DIGITAL_ESTIMATE_ENGINE_VERSION
  });

  const familyRoot = header.quote_family_root_id || header.id;
  const priorActive = await input.repository.listActivePublicationsForFamily(
    input.organizationId,
    familyRoot
  );

  assertDigitalEstimateLinkWrapConfigured(env);
  if (typeof input.repository?.probeTokenWrappedColumn === "function") {
    await input.repository.probeTokenWrappedColumn();
  }

  const { rawToken, tokenHash } = generateDigitalEstimateAccessToken();
  const tokenWrapped = wrapDigitalEstimateAccessToken(rawToken, env);

  const publishMetadata =
    body.publishMetadata && typeof body.publishMetadata === "object" ? body.publishMetadata : {};

  const atomic = await input.repository.publishAtomic({
    organizationId: input.organizationId,
    sourceQuoteId: header.id,
    quoteFamilyRootId: familyRoot,
    quoteNumber: header.quote_number,
    revisionNumber: Number(header.revision_number) || 1,
    revisionLabel: header.revision_label || `R${Number(header.revision_number) || 1}`,
    quoteSource: header.quote_source,
    publishedByUserId: input.actorUserId ?? null,
    accessExpiresAt,
    pricingValidThrough,
    termsDisclosureVersion: DIGITAL_ESTIMATE_TERMS_VERSION,
    calculationEngineVersion: DIGITAL_ESTIMATE_ENGINE_VERSION,
    sourceQuoteFingerprint: freeze.sourceQuoteFingerprint,
    customerSnapshotHash: freeze.customerSnapshotHash,
    pricingEvidenceHash: freeze.pricingEvidenceHash,
    customerSnapshotJson: freeze.customerSnapshot,
    pricingEvidenceJson: freeze.pricingEvidence,
    tokenHash,
    tokenWrapped,
    publishedAt,
    publishedEventMetadata: sanitizeDigitalEstimateEventMetadata({
      revisionNumber: Number(header.revision_number) || 1,
      quoteNumber: String(header.quote_number),
      supersededPriorCount: priorActive.length,
      ...publishMetadata
    })
  });

  // Supabase RPC does not accept wrapped ciphertext — persist + verify after atomic insert.
  const wrapPersist = await persistAndVerifyWrappedAccessToken(
    input.repository,
    input.organizationId,
    atomic.publication.id,
    rawToken,
    env
  );

  const customerUrl = buildDigitalEstimateCustomerUrl(rawToken, env);
  const syntheticAccess = describeSyntheticPublicAccessibility(atomic.publication.id, env);

  return {
    ok: true,
    publication: staffPublicationView(atomic.publication),
    accessToken: rawToken,
    customerUrl,
    linkStatus: "active",
    linkDiagnostics: wrapPersist.diagnostics,
    eligibility,
    supersededCount: atomic.supersededCount ?? priorActive.length,
    syntheticPilot: syntheticAccess,
    staffNotice: syntheticAccess.awaitingSyntheticAllowlist
      ? "Replacement publication awaiting synthetic allowlist"
      : null
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   repository: any,
 *   publicationId: string,
 *   body?: object,
 *   now?: () => Date
 * }} input
 */
export async function revokeDigitalEstimatePublication(input) {
  const env = input.env ?? process.env;
  if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
    throw deError("Digital Estimate publish disabled", "digital_estimate_disabled", 404);
  }
  const body = input.body && typeof input.body === "object" ? input.body : {};
  if (body.confirm !== true && body.confirm !== "true") {
    throw deError("Explicit revoke confirmation required", "confirm_required", 400);
  }

  const pub = await input.repository.getPublication(input.organizationId, input.publicationId);
  if (!pub) throw deError("Publication not found", "publication_not_found", 404);

  const now = (input.now ?? (() => new Date()))().toISOString();
  await input.repository.updatePublication(input.organizationId, pub.id, {
    status: "revoked",
    revoked_at: now,
    revoked_by_user_id: input.actorUserId ?? null
  });
  const toks = await input.repository.listTokensForPublication(input.organizationId, pub.id);
  for (const t of toks) {
    if (!t.revoked_at) {
      await input.repository.updateToken(input.organizationId, t.id, { revoked_at: now });
    }
  }
  await input.repository.appendEvent({
    organization_id: input.organizationId,
    publication_id: pub.id,
    source_quote_id: pub.source_quote_id,
    event_type: "revoked",
    actor_type: "user",
    actor_user_id: input.actorUserId ?? null,
    metadata: {}
  });

  return { ok: true, publication: { id: pub.id, status: "revoked", revokedAt: now } };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   repository: any,
 *   publicationId: string,
 *   body?: object,
 *   now?: () => Date
 * }} input
 */
function buildReplaceLinkDiagnostics(flags) {
  return {
    wrapKeyPresent: Boolean(flags.wrapKeyPresent),
    tokenWrappedGenerated: Boolean(flags.tokenWrappedGenerated),
    tokenWrappedPersisted: Boolean(flags.tokenWrappedPersisted),
    persistedRowReadBack: Boolean(flags.persistedRowReadBack),
    decryptVerified: Boolean(flags.decryptVerified),
    customerUrlPresent: Boolean(flags.customerUrlPresent)
  };
}

export async function replaceDigitalEstimateToken(input) {
  const env = input.env ?? process.env;
  if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
    throw deError("Digital Estimate publish disabled", "digital_estimate_disabled", 404);
  }
  if (typeof input.repository?.replaceTokenAtomic !== "function") {
    throw deError(
      "Publication repository missing atomic token replace boundary",
      "atomic_replace_unavailable",
      500
    );
  }
  const body = input.body && typeof input.body === "object" ? input.body : {};
  if (body.confirm !== true && body.confirm !== "true") {
    throw deError("Explicit replace confirmation required", "confirm_required", 400);
  }

  const pub = await input.repository.getPublication(input.organizationId, input.publicationId);
  if (!pub) throw deError("Publication not found", "publication_not_found", 404);
  if (pub.status !== "active") {
    throw deError("Publication is not active", "publication_not_active", 400);
  }

  // Fail closed BEFORE invalidating the current token (old link stays valid until atomic commit).
  await assertReplaceWrapReady(input.repository, input.organizationId, pub.id, env);

  const now = (input.now ?? (() => new Date()))().toISOString();
  const { rawToken, tokenHash } = generateDigitalEstimateAccessToken();
  const tokenWrapped = wrapDigitalEstimateAccessToken(rawToken, env);
  const localUnwrap = unwrapDigitalEstimateAccessTokenDetailed(tokenWrapped, env, {
    tokenRow: { token_wrapped: tokenWrapped, revoked_at: null }
  });
  if (!localUnwrap.ok || localUnwrap.rawToken !== rawToken) {
    const err = deError(
      "Unable to protect the customer link for recovery.",
      localUnwrap.code || "link_wrap_failed",
      503
    );
    err.diagnostics = buildReplaceLinkDiagnostics({
      wrapKeyPresent: true,
      tokenWrappedGenerated: Boolean(tokenWrapped),
      tokenWrappedPersisted: false,
      persistedRowReadBack: false,
      decryptVerified: false,
      customerUrlPresent: false
    });
    throw err;
  }

  let atomic;
  try {
    atomic = await input.repository.replaceTokenAtomic({
      organizationId: input.organizationId,
      publicationId: pub.id,
      newTokenHash: tokenHash,
      tokenWrapped,
      actorUserId: input.actorUserId ?? null,
      replacedAt: now
    });
  } catch (e) {
    // Atomic failure rolls back — prior active token remains. Never claim success.
    // Preserve PostgREST rpc diagnostics (message/details/hint) when present.
    if (!e.diagnostics || e.diagnostics.rpc !== "digital_estimate_replace_token_atomic") {
      if (!e.diagnostics) {
        e.diagnostics = buildReplaceLinkDiagnostics({
          wrapKeyPresent: true,
          tokenWrappedGenerated: true,
          tokenWrappedPersisted: false,
          persistedRowReadBack: false,
          decryptVerified: false,
          customerUrlPresent: false
        });
      }
    }
    throw e;
  }

  // Prove the persisted row is recoverable before claiming replace success.
  if (typeof input.repository.getActiveTokenForPublication !== "function") {
    const err = deError(
      "Unable to verify customer link recovery after replace.",
      "token_wrap_persist_failed",
      503
    );
    err.diagnostics = buildReplaceLinkDiagnostics({
      wrapKeyPresent: true,
      tokenWrappedGenerated: true,
      tokenWrappedPersisted: Boolean(atomic?.tokenWrappedPersisted),
      persistedRowReadBack: false,
      decryptVerified: false,
      customerUrlPresent: false
    });
    throw err;
  }

  const persistedRow = await input.repository.getActiveTokenForPublication(
    input.organizationId,
    pub.id
  );
  const readBackOk = Boolean(persistedRow?.id && !persistedRow.revoked_at);
  const wrappedOnRow = String(persistedRow?.token_wrapped || "").trim();
  const verify = unwrapDigitalEstimateAccessTokenDetailed(wrappedOnRow, env, {
    tokenRow: persistedRow
  });
  // Prefer the persisted active token (handles concurrent replace races).
  const recoveredToken = verify.ok ? verify.rawToken : null;
  const customerUrl = recoveredToken
    ? buildDigitalEstimateCustomerUrl(recoveredToken, env)
    : null;
  const decryptVerified = Boolean(verify.ok && recoveredToken);
  const diagnostics = buildReplaceLinkDiagnostics({
    wrapKeyPresent: true,
    tokenWrappedGenerated: Boolean(tokenWrapped),
    tokenWrappedPersisted: Boolean(wrappedOnRow) || atomic?.tokenWrappedPersisted === true,
    persistedRowReadBack: readBackOk,
    decryptVerified,
    customerUrlPresent: Boolean(customerUrl)
  });

  if (!readBackOk || !wrappedOnRow || !decryptVerified || !customerUrl || !recoveredToken) {
    const err = deError(
      "Customer link was replaced but could not be recovered from storage. Apply reusable-links v2 SQL, verify DIGITAL_ESTIMATE_LINK_WRAP_KEY, and Replace Link again.",
      verify.code || "link_unwrap_failed",
      503
    );
    err.diagnostics = diagnostics;
    throw err;
  }

  return {
    ok: true,
    accessToken: recoveredToken,
    customerUrl,
    linkStatus: "active",
    linkDiagnostics: diagnostics,
    publication: {
      ...staffPublicationView(pub),
      customerUrl,
      linkStatus: "active",
      linkDiagnostics: diagnostics
    }
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   repository: any,
 *   publicationId: string
 * }} input
 */
export async function recordDigitalEstimateLinkCopied(input) {
  const env = input.env ?? process.env;
  if (!isDigitalEstimateApiEnabled(env)) {
    throw deError("Digital Estimate disabled", "digital_estimate_disabled", 404);
  }
  const pub = await input.repository.getPublication(input.organizationId, input.publicationId);
  if (!pub) throw deError("Publication not found", "publication_not_found", 404);

  await input.repository.appendEvent({
    organization_id: input.organizationId,
    publication_id: pub.id,
    source_quote_id: pub.source_quote_id,
    event_type: "link_copied",
    actor_type: "user",
    actor_user_id: input.actorUserId ?? null,
    metadata: sanitizeDigitalEstimateEventMetadata({ note: "manual_copy_not_sent" })
  });

  return { ok: true };
}

function staffPublicationView(pub) {
  return {
    id: pub.id,
    sourceQuoteId: pub.source_quote_id,
    quoteNumber: pub.quote_number,
    revisionNumber: pub.revision_number,
    revisionLabel: pub.revision_label,
    status: pub.status,
    publishedAt: pub.published_at,
    accessExpiresAt: pub.access_expires_at,
    pricingValidThrough: pub.pricing_valid_through,
    termsDisclosureVersion: pub.terms_disclosure_version
  };
}
