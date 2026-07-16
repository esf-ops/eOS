/**
 * Phase DE.2G — One-time link response contract (publish/replace vs GET).
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken
} from "./digitalEstimatePublishService.mjs";
import { sanitizeDigitalEstimateEventMetadata } from "./digitalEstimateEvents.mjs";
import { buildPublicDigitalEstimateDto } from "./digitalEstimatePublicSerializer.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
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

console.log("\nphaseDe11.oneTimeLink.test.mjs\n");

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
  assert.ok(published.accessToken);
  assert.ok(published.customerUrl.includes("/e#"));
  assert.equal(published.customerUrl.endsWith(published.accessToken), true);

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

  const dump = JSON.stringify(repo._dump());
  assert.equal(dump.includes(published.accessToken), false);
  assert.equal(dump.includes(replaced.accessToken), false);
  assert.ok(repo._dump().tokens.every((t) => t.token_hash && !String(t.token_hash).includes(replaced.accessToken)));

  const pubView = published.publication;
  assert.equal("customerUrl" in pubView, false);
  assert.equal("accessToken" in pubView, false);

  assert.throws(
    () => sanitizeDigitalEstimateEventMetadata({ accessToken: "secret" }),
    /Prohibited/
  );

  const snap = repo._dump().snapshots[0];
  const publicDto = buildPublicDigitalEstimateDto(snap.customer_snapshot_json, {
    accessExpiresAt: null
  });
  assert.equal(JSON.stringify(publicDto).includes(replaced.accessToken), false);

  console.log("ok: one-time link only on publish/replace; hash-only persistence");
}

console.log("\nAll one-time link backend tests passed.\n");
