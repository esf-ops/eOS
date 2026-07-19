/**
 * Shared public v1 contract for reusable Digital Estimate customer links.
 * Run: node backend-core/src/digitalEstimate/phaseDe11.publicV1ReusableLink.test.mjs
 */
import assert from "node:assert/strict";
import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken,
  revokeDigitalEstimatePublication
} from "./digitalEstimatePublishService.mjs";
import { attachDigitalEstimateRoutes } from "./digitalEstimateRoutes.js";
import { resolvePublicDigitalEstimate } from "./digitalEstimateAccessService.mjs";
import { assertPublicDtoHasNoForbiddenContent } from "./digitalEstimatePublicSerializer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: "",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
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

async function listen(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  return { server, port };
}

console.log("\nphaseDe11.publicV1ReusableLink.test.mjs\n");

// Frontend calls the correct Brain route
{
  const appSrc = readFileSync(
    join(__dirname, "../../../app-digital-estimate/src/App.tsx"),
    "utf8"
  );
  const apiSrc = readFileSync(
    join(__dirname, "../../../app-digital-estimate/src/publicConfigApi.ts"),
    "utf8"
  );
  assert.ok(apiSrc.includes("/api/public-digital-estimate/v1/"));
  assert.ok(apiSrc.includes("fetchPublicEstimateByToken"));
  assert.ok(appSrc.includes("fetchPublicEstimateByToken"));
  assert.equal(appSrc.includes("fetchLegacyPathEstimate"), false);
  console.log("ok: /e/<token> bootstrap calls GET /api/public-digital-estimate/v1/:token");
}

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

  const app = express();
  attachDigitalEstimateRoutes(app, {
    requireAuth: () => (_req, _res, next) => next(),
    getSupabase: () => ({}),
    env: ENV,
    repository: repo
  });
  const { server, port } = await listen(app);
  const url = `http://127.0.0.1:${port}/api/public-digital-estimate/v1/${encodeURIComponent(published.accessToken)}`;

  const res1 = await fetch(url);
  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  assert.equal(body1.ok, true);
  assert.ok(body1.estimate);
  assert.equal(body1.access?.status, "active");
  assert.ok(body1.access?.pricingValidThrough);
  assertPublicDtoHasNoForbiddenContent(body1);
  const raw = JSON.stringify(body1).toLowerCase();
  assert.equal(raw.includes("wholesale"), false);
  assert.equal(raw.includes("internalmarkup"), false);
  assert.equal(raw.includes("use_tax"), false);
  assert.equal(raw.includes("service_role"), false);

  const res2 = await fetch(url);
  assert.equal(res2.status, 200);
  const body2 = await res2.json();
  assert.equal(body2.estimate.quoteNumber, body1.estimate.quoteNumber);
  console.log("ok: valid reusable token returns public estimate and works repeatedly");

  const replaced = await replaceDigitalEstimateToken({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    publicationId: published.publication.id,
    body: { confirm: true }
  });
  const resOld = await fetch(url);
  assert.ok(resOld.status === 404 || resOld.status === 410);
  const resNew = await fetch(
    `http://127.0.0.1:${port}/api/public-digital-estimate/v1/${encodeURIComponent(replaced.accessToken)}`
  );
  assert.equal(resNew.status, 200);
  console.log("ok: replaced old token fails; new token works");

  await revokeDigitalEstimatePublication({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    publicationId: published.publication.id,
    body: { confirm: true }
  });
  const resRev = await fetch(
    `http://127.0.0.1:${port}/api/public-digital-estimate/v1/${encodeURIComponent(replaced.accessToken)}`
  );
  assert.ok(resRev.status === 404 || resRev.status === 410);
  console.log("ok: revoked token fails");

  server.close();
}

// Access-expired fails; pricing-expired still loads
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

  await repo.updatePublication(ORG, published.publication.id, {
    access_expires_at: "2000-01-01T00:00:00.000Z"
  });
  await assert.rejects(
    () =>
      resolvePublicDigitalEstimate({
        env: ENV,
        repository: repo,
        rawToken: published.accessToken,
        now: () => new Date("2026-07-18T12:00:00.000Z")
      }),
    (e) => e.statusCode === 410 || e.code === "access_expired"
  );
  console.log("ok: access-expired token fails");

  const repo2 = createInMemoryDigitalEstimateRepository();
  repo2.seedQuote(eliteHeader());
  const pub2 = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo2,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  await repo2.updatePublication(ORG, pub2.publication.id, {
    pricing_valid_through: "2020-01-15"
  });
  const priced = await resolvePublicDigitalEstimate({
    env: ENV,
    repository: repo2,
    rawToken: pub2.accessToken,
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  assert.equal(priced.ok, true);
  assert.equal(priced.access.status, "pricing_expired");
  assert.equal(priced.access.pricingValidThrough, "2020-01-15");
  assert.ok(priced.estimate);
  console.log("ok: pricing-expired estimate still loads with warning status");
}

// Legacy hash URL parsing still targets the same v1 route (app contract)
{
  const apiSrc = readFileSync(
    join(__dirname, "../../../app-digital-estimate/src/publicConfigApi.ts"),
    "utf8"
  );
  const appSrc = readFileSync(
    join(__dirname, "../../../app-digital-estimate/src/App.tsx"),
    "utf8"
  );
  assert.ok(apiSrc.includes("parseTokenFromHash"));
  assert.ok(appSrc.includes("fragmentToken"));
  assert.ok(appSrc.includes("fetchPublicEstimateByToken(accessToken)"));
  console.log("ok: legacy hash-token URL still uses shared public v1 GET");
}

// Unmatched / wrong route prefix must not be the app contract
{
  const apiSrc = readFileSync(
    join(__dirname, "../../../app-digital-estimate/src/publicConfigApi.ts"),
    "utf8"
  );
  assert.equal(apiSrc.includes("/api/digital-estimate/public/"), false);
  assert.ok(apiSrc.includes("fetchPublicEstimateByToken"));
  console.log("ok: unmatched alternate public routes are not used for token bootstrap");
}

console.log("\nAll public v1 reusable-link tests passed.\n");
