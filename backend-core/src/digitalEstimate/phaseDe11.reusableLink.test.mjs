/**
 * Stable reusable Digital Estimate customer links.
 * Run: node backend-core/src/digitalEstimate/phaseDe11.reusableLink.test.mjs
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken,
  revokeDigitalEstimatePublication
} from "./digitalEstimatePublishService.mjs";
import { createPublicConfigurationService } from "./configuration/publicConfigurationService.mjs";
import { createInMemoryConfigurationRepository } from "./configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./configuration/pricingPolicyRepository.mjs";
import { hashDigitalEstimateToken } from "./digitalEstimateToken.mjs";
import { unwrapDigitalEstimateAccessToken } from "./digitalEstimateTokenWrap.mjs";
import { buildPublicDigitalEstimateDto } from "./digitalEstimatePublicSerializer.mjs";
import { sanitizeDigitalEstimateEventMetadata } from "./digitalEstimateEvents.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG2 = "22222222-2222-4222-8222-222222222222";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "https://digital.eliteosfab.com",
  NODE_ENV: "test"
};

function eliteHeader() {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-EXAMPLE-000100",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Example Homes LLC",
    project_name: "Kitchen",
    calculation_snapshot: {
      materialProgramDefault: "elite_100",
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 10000,
        estimate_rooms: [{ name: "Kitchen", materialProgramOverride: "inherit" }],
        customer_estimate_print_snapshot: { finalRounded: 10000, rooms: [], summaryRows: [] }
      }
    }
  };
}

console.log("\nphaseDe11.reusableLink.test.mjs\n");

{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });

  assert.ok(published.customerUrl);
  assert.ok(published.customerUrl.includes("/e/"));
  assert.equal(published.customerUrl.includes("#"), false);
  assert.equal(published.customerUrl.endsWith(published.accessToken), true);
  assert.equal(published.linkStatus, "active");

  const tokenRow = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  assert.ok(tokenRow.token_wrapped);
  assert.equal(unwrapDigitalEstimateAccessToken(tokenRow.token_wrapped, ENV), published.accessToken);
  // Raw token must not appear as plaintext token_hash
  assert.equal(tokenRow.token_hash, hashDigitalEstimateToken(published.accessToken));
  assert.notEqual(tokenRow.token_wrapped, published.accessToken);

  const hash = hashDigitalEstimateToken(published.accessToken);
  const lookup1 = await repo.findTokenByHash(hash);
  const lookup2 = await repo.findTokenByHash(hash);
  assert.ok(lookup1 && !lookup1.revoked_at);
  assert.ok(lookup2 && !lookup2.revoked_at);
  assert.equal(lookup1.id, lookup2.id);
  console.log("ok: same link works repeatedly (not consumed)");

  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const publicSvc = createPublicConfigurationService({
    env: ENV,
    deRepository: repo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });

  const replaced = await replaceDigitalEstimateToken({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    publicationId: published.publication.id,
    body: { confirm: true }
  });
  assert.ok(replaced.customerUrl);
  assert.notEqual(replaced.accessToken, published.accessToken);

  assert.equal(await repo.findTokenByHash(hash), null);
  const newHash = hashDigitalEstimateToken(replaced.accessToken);
  assert.ok(await repo.findTokenByHash(newHash));
  console.log("ok: Replace invalidates old link; new link works");

  await revokeDigitalEstimatePublication({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    publicationId: published.publication.id,
    body: { confirm: true }
  });
  assert.equal(await repo.findTokenByHash(newHash), null);
  await assert.rejects(
    () => publicSvc.exchangePublicationToken({ rawToken: replaced.accessToken }),
    (e) => e?.exchangeReason === "token_revoked" || e?.statusCode === 404 || Boolean(e)
  );
  console.log("ok: Revoke invalidates current link");

  assert.throws(
    () => sanitizeDigitalEstimateEventMetadata({ accessToken: "secret" }),
    /Prohibited/
  );

  const snap = repo._dump().snapshots[0];
  const publicDto = buildPublicDigitalEstimateDto(snap.customer_snapshot_json, {
    accessExpiresAt: null
  });
  const dtoRaw = JSON.stringify(publicDto).toLowerCase();
  assert.equal(dtoRaw.includes("internalmarkup"), false);
  assert.equal(dtoRaw.includes("wholesale"), false);
  assert.equal(dtoRaw.includes(String(replaced.accessToken || "").toLowerCase()), false);
  console.log("ok: public DTO has no internal pricing fields or raw token");
}

// Cross-org cannot recover wrapped URL via active token lookup for other org
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const cross = await repo.getActiveTokenForPublication(ORG2, published.publication.id);
  assert.equal(cross, null);
  console.log("ok: unauthorized org cannot retrieve active token row");
}

// Malformed token
{
  const repo = createInMemoryDigitalEstimateRepository();
  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const publicSvc = createPublicConfigurationService({
    env: ENV,
    deRepository: repo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  await assert.rejects(
    () => publicSvc.exchangePublicationToken({ rawToken: "short" }),
    (e) => e?.exchangeReason === "token_shape" || e?.statusCode === 404
  );
  console.log("ok: malformed tokens fail closed");
}

console.log("\nAll reusable-link backend tests passed.\n");
