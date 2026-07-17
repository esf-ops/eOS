/**
 * Phase DE.2G — Public fragment exchange (baseline-only + replace-token + allowlist).
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken
} from "./digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configuration/configurationRepository.mjs";
import { createPublicConfigurationService } from "./configuration/publicConfigurationService.mjs";
import { hashDigitalEstimateToken } from "./digitalEstimateToken.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALLOWED_PUB_PLACEHOLDER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ENV_BASE = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "https://digital.eliteosfab.com"
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

function serviceFor(deRepo, cfgRepo, env) {
  return createPublicConfigurationService({
    env,
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });
}

console.log("\nphaseDe2g.publicExchange.test.mjs\n");

{
  const deRepo = createInMemoryDigitalEstimateRepository();
  const cfgRepo = createInMemoryConfigurationRepository();
  deRepo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: { ...ENV_BASE, DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0" },
    organizationId: ORG,
    actorUserId: "pilot",
    repository: deRepo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });

  const service = serviceFor(deRepo, cfgRepo, { ...ENV_BASE, DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0" });
  const exchanged = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(exchanged.state.lifecycle, "blocked");
  assert.equal(exchanged.state.readMode, "baseline");
  assert.ok(exchanged.state.estimate);
  assert.equal(exchanged.state.configuration, null);
  // v2 must expose the inner estimate DTO — not the v1 { ok, estimate, access } wrapper
  assert.equal("ok" in exchanged.state.estimate, false);
  assert.equal("access" in exchanged.state.estimate, false);
  assert.equal("estimate" in exchanged.state.estimate, false);
  assert.ok(typeof exchanged.state.estimate.documentTitle === "string");
  assert.ok(Array.isArray(exchanged.state.estimate.rooms));
  assert.ok(Array.isArray(exchanged.state.estimate.lineItems));
  assert.ok(exchanged.state.estimate.project && typeof exchanged.state.estimate.project === "object");
  assert.ok(exchanged.state.estimate.totals && typeof exchanged.state.estimate.totals === "object");
  assert.equal(JSON.stringify(exchanged.state).includes(published.accessToken), false);
  assert.equal(JSON.stringify(deRepo._dump()).includes(published.accessToken), false);
  console.log("ok: no-envelope exchange returns frozen baseline estimate");
}

{
  const deRepo = createInMemoryDigitalEstimateRepository();
  const cfgRepo = createInMemoryConfigurationRepository();
  deRepo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV_BASE,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: deRepo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const pubId = published.publication.id;
  const envAllow = {
    ...ENV_BASE,
    DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: pubId
  };
  const service = serviceFor(deRepo, cfgRepo, envAllow);

  const replaced = await replaceDigitalEstimateToken({
    env: ENV_BASE,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: deRepo,
    publicationId: pubId,
    body: { confirm: true }
  });

  await assert.rejects(
    () => service.exchangePublicationToken({ rawToken: published.accessToken }),
  );

  const exchanged = await service.exchangePublicationToken({ rawToken: replaced.accessToken });
  assert.ok(exchanged.state.estimate);
  assert.equal(exchanged.state.readMode, "baseline");

  const envBlock = { ...ENV_BASE, DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: ALLOWED_PUB_PLACEHOLDER };
  const blocked = serviceFor(deRepo, cfgRepo, envBlock);
  await assert.rejects(() => blocked.exchangePublicationToken({ rawToken: replaced.accessToken }));

  const oldHash = hashDigitalEstimateToken(published.accessToken);
  const oldRow = await deRepo.findAnyTokenByHash(oldHash);
  assert.ok(oldRow?.revoked_at);
  console.log("ok: replaced token exchanges; old token revoked; non-allowlisted blocked");
}

console.log("\nAll phase DE.2G public exchange tests passed.\n");
