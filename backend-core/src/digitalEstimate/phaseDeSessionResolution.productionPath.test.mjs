/**
 * Fresh-request-context session resolution after exchange.
 *
 * Proves: POST session → durable row → separate request PUT selections 200
 * using only the Set-Cookie value (simulates Vercel serverless isolation).
 *
 * Run: node backend-core/src/digitalEstimate/phaseDeSessionResolution.productionPath.test.mjs
 */
import assert from "node:assert/strict";
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "./digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./configuration/pricingPolicyRepository.mjs";
import {
  attachDigitalEstimatePublicConfigurationRoutes,
  maybeAttachDigitalEstimatePublicConfigurationRoutes
} from "./configuration/publicConfigurationRoutes.js";
import { maybeAttachDigitalEstimateReviewRequestRoutes } from "./configuration/reviewRequestRoutes.js";
import { attachDigitalEstimateRoutes } from "./digitalEstimateRoutes.js";
import { resetDigitalEstimatePublicRateLimitsForTests } from "./digitalEstimateRateLimit.mjs";
import {
  hashConfigurationSessionSecret,
  normalizeSessionSecret,
  generateConfigurationSessionSecret,
  buildSessionCookieOptions
} from "./configuration/publicConfigurationSession.mjs";
import { createInMemoryAmendmentRepository } from "./configuration/amendmentRepository.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ENV_LIVE = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUEST_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function eliteHeader() {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_number: "ESF-IC-000321",
    quote_source: "internal_quote",
    status: "saved",
    material_program_default: "elite_100",
    customer_display_total: 870,
    project_name: "Kitchen",
    customer_name: "Customer",
    project_address: "1 Main St",
    estimated_material_group: "Group B",
    partner_account_id: null,
    calculation_snapshot: {
      materialGroup: "Group B",
      materialProgramDefault: "elite_100",
      totals: { retail: 870, wholesale: 800, estimated_sqft: 10 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 870,
        customer_estimate_customer_facing_notes: "Thank you.",
        estimate_rooms: [
          { id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }
        ],
        customer_estimate_print_snapshot: { finalRounded: 870 }
      }
    }
  };
}

async function seedPublishedWithEnvelope(env = ENV_LIVE) {
  const deRepo = createInMemoryDigitalEstimateRepository();
  deRepo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env,
    organizationId: ORG,
    actorUserId: "u1",
    repository: deRepo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });

  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const publication = deRepo._dump().publications[0];
  const snap = deRepo._dump().snapshots[0];
  snap.pricing_evidence_json = {
    materialProgramDefault: "elite_100",
    calculationSnapshotCopy: {
      materialProgramDefault: "elite_100",
      internal_ui: {
        estimate_rooms: [
          { id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }
        ]
      }
    }
  };
  cfgRepo.seedPublication(publication);
  cfgRepo.seedSnapshot(snap);

  const draft = await cfgRepo.createDraftEnvelope({
    organizationId: ORG,
    publicationId: publication.id,
    actorUserId: "u1",
    body: {}
  });
  const group = await cfgRepo.upsertDraftGroup(ORG, draft.id, {
    groupKey: "material_by_room",
    displayLabel: "Material by room",
    required: true
  });
  await cfgRepo.upsertDraftOption(ORG, draft.id, {
    groupId: group.id,
    optionKey: "material:kitchen:group_b",
    displayLabel: "Kitchen — Group B",
    defaultQty: 1,
    sellPrice: 0,
    compatibilityJson: { roomKey: "kitchen", materialGroup: "group_b", role: "material_selection" }
  });
  await cfgRepo.activateEnvelope(ORG, draft.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "p",
    catalogFingerprint: "c"
  });

  return { deRepo, cfgRepo, pricing, published, publication };
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

function extractSessionCookieValue(setCookieHeaders) {
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [String(setCookieHeaders || "")];
  let found = null;
  for (const line of list) {
    const m = /(?:^|,\s*)de_cfg_session=([^;]*)/i.exec(line);
    if (!m) continue;
    const val = normalizeSessionSecret(m[1]);
    if (val.length >= 20) found = val;
  }
  return found;
}

console.log("\nphaseDeSessionResolution.productionPath.test.mjs\n");

{
  const { rawSecret, secretHash } = generateConfigurationSessionSecret();
  assert.equal(hashConfigurationSessionSecret(rawSecret), secretHash);
  assert.equal(hashConfigurationSessionSecret(`"${rawSecret}"`), secretHash);
  assert.equal(hashConfigurationSessionSecret(encodeURIComponent(rawSecret)), secretHash);
  const prod = buildSessionCookieOptions({ env: { NODE_ENV: "production" }, rawSecret });
  assert.equal(prod.sameSite, "none");
  assert.equal(prod.path, "/");
  assert.equal(prod.secure, true);
  console.log("ok: create/lookup hash normalization identical; prod SameSite=None Path=/");
}

{
  resetDigitalEstimatePublicRateLimitsForTests();
  const { deRepo, cfgRepo, pricing, published } = await seedPublishedWithEnvelope();
  const amendmentRepo = createInMemoryAmendmentRepository({
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });

  // Request context A — exchange only
  const appA = express();
  maybeAttachDigitalEstimatePublicConfigurationRoutes(appA, {
    env: ENV_LIVE,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    configurationStack: { mode: "memory" }
  });
  maybeAttachDigitalEstimateReviewRequestRoutes(appA, {
    env: ENV_LIVE,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository: amendmentRepo,
    mode: "memory"
  });
  const { server: serverA, base: baseA } = await listen(appA);

  const exchanged = await fetch(`${baseA}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5190",
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(exchanged.status, 201);
  const setCookies = exchanged.headers.getSetCookie?.() || [];
  const secret = extractSessionCookieValue(setCookies);
  assert.ok(secret, "canonical non-empty de_cfg_session must be set");
  assert.ok(/SameSite=None/i.test(setCookies.join("\n")) || /SameSite=Lax/i.test(setCookies.join("\n")));

  const exchangedBody = await exchanged.json();
  assert.equal(exchangedBody.ok, true);
  assert.equal(exchangedBody.sessionCookie?.established, true);
  const rowVersion = exchangedBody.session?.rowVersion;
  assert.ok(rowVersion != null);

  const hash = hashConfigurationSessionSecret(secret);
  const row = await cfgRepo.getSessionBySecretHash(hash);
  assert.ok(row, "session row must exist durably after 201");
  assert.equal(row.status, "active");
  assert.equal(String(row.publication_id), String(published.publicationId || deRepo._dump().publications[0].id));

  await new Promise((r) => serverA.close(r));

  // Request context B — fresh Express app / process simulation; shared durable repo
  const appB = express();
  maybeAttachDigitalEstimatePublicConfigurationRoutes(appB, {
    env: ENV_LIVE,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    configurationStack: { mode: "memory" }
  });
  maybeAttachDigitalEstimateReviewRequestRoutes(appB, {
    env: ENV_LIVE,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository: amendmentRepo,
    mode: "memory"
  });
  const { server: serverB, base: baseB } = await listen(appB);
  const origin = "http://localhost:5190";
  const cookie = `de_cfg_session=${secret}`;

  const review = await fetch(`${baseB}/api/public-digital-estimate/v2/review-requests/current`, {
    headers: { Origin: origin, Cookie: cookie }
  });
  assert.equal(review.status, 200);
  const reviewBody = await review.json();
  assert.equal(reviewBody.ok, true);
  assert.equal(reviewBody.reviewRequest, null);

  const saved = await fetch(`${baseB}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: rowVersion,
      idempotencyKey: "fresh-ctx-save-1",
      roomNotes: { kitchen: "Please confirm sink location" },
      projectNote: "Gate code 1234"
    })
  });
  assert.equal(saved.status, 200, "fresh request context must resolve the exchange cookie");
  const savedBody = await saved.json();
  assert.equal(savedBody.ok, true);
  assert.ok(savedBody.calculation);
  assert.equal(JSON.stringify(savedBody).toLowerCase().includes("wholesale"), false);

  // Stale + valid cookie candidates — valid must win
  const staleSecret = generateConfigurationSessionSecret().rawSecret;
  const multiCookie = `de_cfg_session=${staleSecret}; de_cfg_session=${secret}`;
  const saved2 = await fetch(`${baseB}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: multiCookie
    },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: savedBody.session.rowVersion,
      idempotencyKey: "fresh-ctx-save-2"
    })
  });
  assert.equal(saved2.status, 200, "valid cookie must win over stale duplicate");

  // Re-exchange (refresh) and confirm selection still on prior session / new session can read notes via prior save on same publication
  const exchanged2 = await fetch(`${baseB}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(exchanged2.status, 201);
  const secret2 = extractSessionCookieValue(exchanged2.headers.getSetCookie?.() || []);
  assert.ok(secret2);
  const resumed = await fetch(`${baseB}/api/public-digital-estimate/v2/session`, {
    headers: { Origin: origin, Cookie: `de_cfg_session=${secret2}` }
  });
  assert.equal(resumed.status, 200);
  const resumedBody = await resumed.json();
  assert.equal(resumedBody.lifecycle, "active");

  await new Promise((r) => serverB.close(r));
  console.log("ok: exchange→durable row→fresh-context save 200; stale cookie ignored; review 200 null");
}

void join;
void attachDigitalEstimatePublicConfigurationRoutes;
void attachDigitalEstimateRoutes;
console.log("\nAll session-resolution production-path tests passed.\n");
