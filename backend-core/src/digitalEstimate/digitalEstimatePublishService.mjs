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
  buildDigitalEstimateCustomerUrl,
  wrapDigitalEstimateAccessToken
} from "./digitalEstimateTokenWrap.mjs";
import { describeSyntheticPublicAccessibility } from "./syntheticPilotGuard.mjs";

async function persistWrappedAccessToken(repository, organizationId, publicationId, rawToken, env) {
  const wrapped = wrapDigitalEstimateAccessToken(rawToken, env);
  if (!wrapped || typeof repository?.setActiveTokenWrapped !== "function") return wrapped;
  try {
    await repository.setActiveTokenWrapped(organizationId, publicationId, wrapped);
  } catch {
    // Column may be absent until migration; publish still succeeds with one-shot response URL.
  }
  return wrapped;
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

  // Supabase RPC does not accept wrapped ciphertext — persist after atomic insert.
  await persistWrappedAccessToken(
    input.repository,
    input.organizationId,
    atomic.publication.id,
    rawToken,
    env
  );

  // Stable reusable path URL (fragment form still accepted by public head for legacy links).
  const customerUrl = buildDigitalEstimateCustomerUrl(rawToken, env);
  const syntheticAccess = describeSyntheticPublicAccessibility(atomic.publication.id, env);

  return {
    ok: true,
    publication: staffPublicationView(atomic.publication),
    accessToken: rawToken,
    customerUrl,
    linkStatus: "active",
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

  const now = (input.now ?? (() => new Date()))().toISOString();
  const { rawToken, tokenHash } = generateDigitalEstimateAccessToken();
  const tokenWrapped = wrapDigitalEstimateAccessToken(rawToken, env);

  await input.repository.replaceTokenAtomic({
    organizationId: input.organizationId,
    publicationId: pub.id,
    newTokenHash: tokenHash,
    tokenWrapped,
    actorUserId: input.actorUserId ?? null,
    replacedAt: now
  });

  await persistWrappedAccessToken(
    input.repository,
    input.organizationId,
    pub.id,
    rawToken,
    env
  );

  return {
    ok: true,
    accessToken: rawToken,
    customerUrl: buildDigitalEstimateCustomerUrl(rawToken, env),
    linkStatus: "active",
    publication: staffPublicationView(pub)
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
