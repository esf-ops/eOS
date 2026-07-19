/**
 * Public token access — reads frozen publication snapshot only.
 * Never calls calculateQuote. Never returns pricing evidence.
 * View-event write failures must not fail the safe read path.
 */

import {
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublicReadEnabled,
  readDigitalEstimateViewThrottleSeconds
} from "./digitalEstimateConfig.mjs";
import {
  coarseUserAgentFamily,
  hashIpForViewEvent,
  sanitizeDigitalEstimateEventMetadata
} from "./digitalEstimateEvents.mjs";
import {
  assertPublicDtoHasNoForbiddenContent,
  buildPublicDigitalEstimateDto
} from "./digitalEstimatePublicSerializer.mjs";
import {
  constantTimeEqualHex,
  hashDigitalEstimateToken
} from "./digitalEstimateToken.mjs";

function unavailable(code = "not_found", statusCode = 404) {
  const err = new Error("Not found");
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

/**
 * Pricing window status for public reads. Pricing expiry does not hide the estimate.
 * @param {string|null|undefined} pricingValidThrough
 * @param {Date} now
 */
export function resolvePublicPricingAccessStatus(pricingValidThrough, now = new Date()) {
  const day = String(pricingValidThrough || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { status: "active", pricingValidThrough: null };
  }
  const endMs = Date.parse(`${day}T23:59:59.999Z`);
  if (!Number.isFinite(endMs)) {
    return { status: "active", pricingValidThrough: day };
  }
  if (now.getTime() > endMs) {
    return { status: "pricing_expired", pricingValidThrough: day };
  }
  return { status: "active", pricingValidThrough: day };
}

/**
 * Public reusable-link resolve — hash lookup only; does not consume the token.
 * Token possession authorizes the frozen customer snapshot (v1). Synthetic allowlist
 * remains enforced on v2 configuration/session exchange, not on this read path.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   repository: any,
 *   rawToken: string,
 *   clientIp?: string,
 *   userAgent?: string,
 *   now?: () => Date
 * }} input
 */
export async function resolvePublicDigitalEstimate(input) {
  const env = input.env ?? process.env;
  if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublicReadEnabled(env)) {
    throw unavailable();
  }

  const rawToken = String(input.rawToken ?? "").trim();
  if (!rawToken || rawToken.length < 20 || rawToken.length > 256) {
    throw unavailable("token_shape");
  }

  const tokenHash = hashDigitalEstimateToken(rawToken);
  const tokenRow = await input.repository.findAnyTokenByHash(tokenHash);
  if (!tokenRow) throw unavailable("token_lookup_miss");

  // Defense: re-check hash with constant-time compare against stored digest.
  if (!constantTimeEqualHex(String(tokenRow.token_hash), tokenHash)) {
    throw unavailable("token_hash_mismatch");
  }
  if (tokenRow.revoked_at) throw unavailable("token_revoked", 410);

  const publication = await input.repository.getPublication(
    tokenRow.organization_id,
    tokenRow.publication_id
  );
  if (!publication) throw unavailable("publication_missing");

  const now = (input.now ?? (() => new Date()))();
  const expiresAt = new Date(publication.access_expires_at).getTime();
  if (
    publication.status !== "active" ||
    publication.revoked_at ||
    publication.status === "superseded" ||
    publication.status === "revoked" ||
    publication.status === "expired"
  ) {
    throw unavailable("publication_inactive", 410);
  }
  if (Number.isFinite(expiresAt) && now.getTime() > expiresAt) {
    throw unavailable("access_expired", 410);
  }

  const snap = await input.repository.getSnapshotByPublicationId(
    publication.organization_id,
    publication.id
  );
  if (!snap?.customer_snapshot_json) throw unavailable("snapshot_missing");

  const pricingValidThrough =
    publication.pricing_valid_through ||
    snap.customer_snapshot_json?.pricingValidThrough ||
    null;
  const pricingAccess = resolvePublicPricingAccessStatus(pricingValidThrough, now);

  const dto = buildPublicDigitalEstimateDto(snap.customer_snapshot_json, {
    accessExpiresAt: publication.access_expires_at,
    accessStatus: pricingAccess.status,
    pricingValidThrough: pricingAccess.pricingValidThrough
  });
  assertPublicDtoHasNoForbiddenContent(dto);

  // Side effects are best-effort: never fail closed on view telemetry.
  try {
    await recordViewTelemetry({
      repository: input.repository,
      publication,
      tokenRow,
      clientIp: input.clientIp,
      userAgent: input.userAgent,
      now,
      env
    });
  } catch {
    // Swallow — public read remains available.
  }

  return dto;
}

async function recordViewTelemetry({
  repository,
  publication,
  tokenRow,
  clientIp,
  userAgent,
  now,
  env
}) {
  const events = await repository.listEventsForPublication(
    publication.organization_id,
    publication.id,
    200
  );
  const hasFirst = events.some((e) => e.event_type === "first_viewed");
  const throttleSec = readDigitalEstimateViewThrottleSeconds(env);
  const lastViewed = events.find((e) => e.event_type === "viewed" || e.event_type === "first_viewed");
  const lastAt = lastViewed?.created_at ? new Date(lastViewed.created_at).getTime() : 0;
  const shouldRecordView =
    !hasFirst || !lastAt || now.getTime() - lastAt >= throttleSec * 1000;

  if (shouldRecordView) {
    const meta = sanitizeDigitalEstimateEventMetadata({
      ipHash: hashIpForViewEvent(clientIp || "unknown"),
      uaFamily: coarseUserAgentFamily(userAgent)
    });
    if (!hasFirst) {
      if (typeof repository.tryAppendFirstViewed === "function") {
        await repository.tryAppendFirstViewed({
          organization_id: publication.organization_id,
          publication_id: publication.id,
          source_quote_id: publication.source_quote_id,
          metadata: meta
        });
      } else {
        try {
          await repository.appendEvent({
            organization_id: publication.organization_id,
            publication_id: publication.id,
            source_quote_id: publication.source_quote_id,
            event_type: "first_viewed",
            actor_type: "public",
            actor_user_id: null,
            metadata: meta
          });
        } catch (e) {
          if (e?.code !== "23505") throw e;
        }
      }
    }
    await repository.appendEvent({
      organization_id: publication.organization_id,
      publication_id: publication.id,
      source_quote_id: publication.source_quote_id,
      event_type: "viewed",
      actor_type: "public",
      actor_user_id: null,
      metadata: meta
    });
  }

  await repository.updateToken(publication.organization_id, tokenRow.id, {
    last_accessed_at: now.toISOString(),
    access_count: Number(tokenRow.access_count || 0) + 1
  });
}
