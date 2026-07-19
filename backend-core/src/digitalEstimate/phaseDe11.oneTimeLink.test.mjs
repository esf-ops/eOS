/**
 * Legacy filename — Digital Estimate customer links are now stable/reusable.
 * Delegates to phaseDe11.reusableLink.test.mjs contract checks.
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken
} from "./digitalEstimatePublishService.mjs";
import { sanitizeDigitalEstimateEventMetadata } from "./digitalEstimateEvents.mjs";
import { unwrapDigitalEstimateAccessToken } from "./digitalEstimateTokenWrap.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
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

console.log("\nphaseDe11.oneTimeLink.test.mjs (reusable-link contract)\n");

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
  assert.ok(published.customerUrl.includes("/e/"));
  assert.equal(published.customerUrl.includes("#"), false);

  const tokenRow = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  assert.equal(unwrapDigitalEstimateAccessToken(tokenRow.token_wrapped, ENV), published.accessToken);

  // Dump must not contain raw token plaintext outside ciphertext
  const dump = JSON.stringify(repo._dump());
  assert.equal(dump.includes(published.accessToken), false);

  const replaced = await replaceDigitalEstimateToken({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    publicationId: published.publication.id,
    body: { confirm: true }
  });
  assert.notEqual(replaced.accessToken, published.accessToken);
  assert.ok(replaced.customerUrl.includes("/e/"));

  assert.throws(
    () => sanitizeDigitalEstimateEventMetadata({ accessToken: "secret" }),
    /Prohibited/
  );

  console.log("ok: reusable links — path URL + wrapped recovery; events never store raw tokens");
}

console.log("\nAll phaseDe11 link contract tests passed.\n");
