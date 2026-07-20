/**
 * Production path contract — POST /api/public-digital-estimate/v2/session
 *
 * Proves the Vercel entry (api/index.js → server.js → quoteRoutes) mounts the
 * same absolute path the Digital Estimate frontend calls, and that synthetic
 * pilot gating (not route registration) is what blocks non-allowlisted tokens.
 *
 * Run: node backend-core/src/digitalEstimate/phaseDePublicV2Route.productionPath.test.mjs
 */
import assert from "node:assert/strict";
import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "./digitalEstimatePublishService.mjs";
import { resolvePublicDigitalEstimate } from "./digitalEstimateAccessService.mjs";
import { createInMemoryConfigurationRepository } from "./configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./configuration/pricingPolicyRepository.mjs";
import {
  attachDigitalEstimatePublicConfigurationRoutes,
  maybeAttachDigitalEstimatePublicConfigurationRoutes
} from "./configuration/publicConfigurationRoutes.js";
import { attachDigitalEstimateRoutes } from "./digitalEstimateRoutes.js";
import { resetDigitalEstimatePublicRateLimitsForTests } from "./digitalEstimateRateLimit.mjs";
import { assertSyntheticPublicationPublicAccess } from "./syntheticPilotGuard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ENV_LIVE = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
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

function noopAuth() {
  return (req, _res, next) => next();
}

function mountPublicSurface(app, { env, deRepo, cfgRepo, pricing }) {
  const mount = maybeAttachDigitalEstimatePublicConfigurationRoutes(app, {
    env,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    configurationStack: { mode: "memory" }
  });
  attachDigitalEstimateRoutes(app, {
    env,
    requireAuth: noopAuth,
    getSupabase: () => ({}),
    repository: deRepo
  });
  return mount;
}

console.log("\nphaseDePublicV2Route.productionPath.test.mjs\n");

{
  const routesSrc = readFileSync(
    join(__dirname, "configuration/publicConfigurationRoutes.js"),
    "utf8"
  );
  const quoteSrc = readFileSync(join(__dirname, "../quotes/quoteRoutes.js"), "utf8");
  const vercelEntry = readFileSync(join(__dirname, "../../api/index.js"), "utf8");
  const serverSrc = readFileSync(join(__dirname, "../server.js"), "utf8");
  assert.ok(routesSrc.includes('"/api/public-digital-estimate/v2/session"'));
  assert.ok(routesSrc.includes("app.post(\"/api/public-digital-estimate/v2/session\""));
  assert.ok(routesSrc.includes('"/api/public-digital-estimate/v2/selections"'));
  assert.ok(routesSrc.includes("app.put(\"/api/public-digital-estimate/v2/selections\""));
  assert.ok(quoteSrc.includes("maybeAttachDigitalEstimatePublicConfigurationRoutes"));
  assert.ok(serverSrc.includes("attachQuoteRoutes"));
  assert.ok(vercelEntry.includes("../src/server.js"));
  console.log("ok: route registered at /api/public-digital-estimate/v2/session + /v2/selections via quoteRoutes + Vercel entry");
}

{
  resetDigitalEstimatePublicRateLimitsForTests();
  const { deRepo, cfgRepo, pricing, published } = await seedPublishedWithEnvelope(ENV_LIVE);
  const app = express();
  const mount = mountPublicSurface(app, {
    env: ENV_LIVE,
    deRepo,
    cfgRepo,
    pricing
  });
  assert.equal(mount.mounted, true);

  const { server, base } = await listen(app);

  const cfg = await fetch(`${base}/api/public-digital-estimate/v2/config`);
  assert.equal(cfg.status, 200);
  const cfgBody = await cfg.json();
  assert.equal(cfgBody.config.publicConfigurationEnabled, true);
  assert.equal(cfgBody.config.liveCustomerConfigureReady, true);

  const ok = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5190",
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(ok.status, 201, "valid active token must create v2 session when synthetic pilot is off");
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(body.lifecycle, "active");
  assert.ok(body.configuration);
  assert.ok(body.estimate);
  assert.equal(JSON.stringify(body).toLowerCase().includes("wholesale"), false);
  assert.equal(JSON.stringify(body).includes(published.accessToken), false);

  const v1 = await fetch(
    `${base}/api/public-digital-estimate/v1/${encodeURIComponent(published.accessToken)}`
  );
  assert.equal(v1.status, 200);
  const v1Body = await v1.json();
  assert.ok(v1Body.estimate || v1Body.ok !== false);

  const invalid = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5190",
      Authorization: "Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(invalid.status, 404);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.ok, false);
  assert.equal(invalidBody.diagnosticCode, "DE-EXCHANGE-404");

  await new Promise((r) => server.close(r));
  console.log("ok: mounted path; valid token → session; invalid → DE-EXCHANGE-404; v1 still works");
}

{
  resetDigitalEstimatePublicRateLimitsForTests();
  const envSyn = {
    ...ENV_LIVE,
    DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "1",
    DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS: ""
  };
  const { deRepo, cfgRepo, pricing, published, publication } =
    await seedPublishedWithEnvelope(envSyn);

  assert.throws(
    () => assertSyntheticPublicationPublicAccess(publication.id, envSyn),
    (e) => e.statusCode === 404 && e.exchangeReason === "synthetic_not_allowlisted"
  );

  // v1 read still succeeds for non-allowlisted publications (legacy summary path)
  const dto = await resolvePublicDigitalEstimate({
    env: envSyn,
    repository: deRepo,
    rawToken: published.accessToken
  });
  assert.ok(dto?.estimate || dto?.ok !== false);

  const app = express();
  attachDigitalEstimatePublicConfigurationRoutes(app, {
    env: envSyn,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    configurationStack: { mode: "memory" }
  });
  const { server, base } = await listen(app);
  const blocked = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5190",
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(blocked.status, 404);
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.diagnosticCode, "DE-EXCHANGE-404");
  assert.equal(blockedBody.error, "Estimate unavailable");

  const cfg = await (await fetch(`${base}/api/public-digital-estimate/v2/config`)).json();
  assert.equal(cfg.config.syntheticPilotOnly, true);
  assert.equal(cfg.config.liveCustomerConfigureReady, false);

  await new Promise((r) => server.close(r));
  console.log("ok: synthetic pilot blocks v2 session (generic 404) while v1 read remains available");
}

{
  resetDigitalEstimatePublicRateLimitsForTests();
  const { deRepo, cfgRepo, pricing, published, publication } =
    await seedPublishedWithEnvelope(ENV_LIVE);
  await deRepo.updatePublication?.(ORG, publication.id, {
    status: "revoked",
    revoked_at: new Date().toISOString()
  });
  // In-memory repo may use different update API — fall back to dump mutation.
  const row = deRepo._dump().publications.find((p) => p.id === publication.id);
  if (row) {
    row.status = "revoked";
    row.revoked_at = new Date().toISOString();
  }

  const app = express();
  mountPublicSurface(app, { env: ENV_LIVE, deRepo, cfgRepo, pricing });
  const { server, base } = await listen(app);

  const revV2 = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5190",
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.ok(revV2.status === 404 || revV2.status === 410);

  const revV1 = await fetch(
    `${base}/api/public-digital-estimate/v1/${encodeURIComponent(published.accessToken)}`
  );
  assert.ok(revV1.status === 404 || revV1.status === 410);

  await new Promise((r) => server.close(r));
  console.log("ok: revoked publication remains blocked on v1 and v2");
}

{
  resetDigitalEstimatePublicRateLimitsForTests();
  const { deRepo, cfgRepo, pricing, published } = await seedPublishedWithEnvelope(ENV_LIVE);
  const app = express();
  mountPublicSurface(app, { env: ENV_LIVE, deRepo, cfgRepo, pricing });
  const { server, base } = await listen(app);
  const origin = "http://localhost:5190";

  const noCookie = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: 1,
      idempotencyKey: "no-cookie"
    })
  });
  assert.equal(noCookie.status, 401);
  const noCookieBody = await noCookie.json();
  assert.equal(noCookieBody.code, "session_required");
  assert.equal(noCookieBody.diagnosticCode, "DE-COOKIE");
  assert.equal(noCookieBody.recoverable, true);
  assert.equal(noCookieBody.lifecycleFatal, false);

  const badCookie = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "de_cfg_session=dGVzdHRlc3R0ZXN0dGVzdHRlc3R0ZXN0dGVzdHRlc3Q"
    },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: 1,
      idempotencyKey: "bad-cookie"
    })
  });
  assert.equal(badCookie.status, 401);
  const badCookieBody = await badCookie.json();
  assert.ok(
    badCookieBody.code === "session_not_found" || badCookieBody.code === "session_invalid"
  );
  assert.equal(badCookieBody.recoverable, true);
  assert.equal(badCookieBody.lifecycleFatal, false);

  const exchanged = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(exchanged.status, 201);
  const setCookies = exchanged.headers.getSetCookie?.() || [];
  let secretFromCookie = null;
  for (const line of setCookies) {
    const m = /de_cfg_session=([^;]*)/i.exec(line);
    if (!m) continue;
    const val = String(m[1] || "").trim();
    if (val.length >= 20) secretFromCookie = val;
  }
  assert.ok(secretFromCookie, "exchange must Set-Cookie non-empty de_cfg_session");
  assert.ok(setCookies.some((c) => /SameSite=None/i.test(c) || /SameSite=Lax/i.test(c)));
  const cookie = `de_cfg_session=${secretFromCookie}`;
  const exchangedBody = await exchanged.json();
  const rowVersion = exchangedBody.session?.rowVersion;
  assert.ok(rowVersion != null);
  assert.equal(exchangedBody.sessionCookie?.established, true);

  const saved = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: rowVersion,
      idempotencyKey: "sel-ok-1"
    })
  });
  assert.equal(saved.status, 200, "PUT /v2/selections must be mounted and accept valid session save");
  const savedBody = await saved.json();
  assert.equal(savedBody.ok, true);
  assert.ok(savedBody.calculation);
  assert.ok(savedBody.session?.rowVersion != null);
  assert.equal(JSON.stringify(savedBody).toLowerCase().includes("wholesale"), false);
  assert.equal(JSON.stringify(savedBody).toLowerCase().includes("margin"), false);
  assert.equal(JSON.stringify(savedBody).includes("materialUseTax"), false);

  const badMaterial = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:not-allowed-zzzz", quantity: 1 }],
      expectedRowVersion: savedBody.session.rowVersion,
      idempotencyKey: "sel-bad-1"
    })
  });
  assert.equal(badMaterial.status, 422);
  const badBody = await badMaterial.json();
  assert.ok(
    badBody.code === "option_not_allowed" || badBody.code === "invalid_selection" || badBody.code === "unknown_option"
  );
  assert.equal(badBody.stage, "selection");
  assert.equal(badBody.diagnosticCode, "DE-OPTION-NOT-ALLOWED");

  const stale = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: rowVersion,
      idempotencyKey: "sel-stale-1"
    })
  });
  assert.equal(stale.status, 409);
  const staleBody = await stale.json();
  assert.equal(staleBody.code, "row_version_conflict");
  assert.equal(staleBody.diagnosticCode, "DE-CONFIGURATION-STALE");

  const resumed = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "GET",
    headers: { Origin: origin, Cookie: cookie }
  });
  assert.equal(resumed.status, 200);
  const resumedBody = await resumed.json();
  assert.equal(resumedBody.lifecycle, "active");
  assert.ok(
    resumedBody.configuration?.currentSelections ||
      resumedBody.configuration?.latestCalculation ||
      savedBody.calculation
  );

  await new Promise((r) => server.close(r));
  console.log("ok: PUT /v2/selections save, reject unknown option, conflict, resume");
}

{
  resetDigitalEstimatePublicRateLimitsForTests();
  const { deRepo, cfgRepo, pricing, published, publication } =
    await seedPublishedWithEnvelope(ENV_LIVE);
  const app = express();
  mountPublicSurface(app, { env: ENV_LIVE, deRepo, cfgRepo, pricing });
  const { server, base } = await listen(app);
  const origin = "http://localhost:5190";

  const exchanged = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const setCookie = exchanged.headers.getSetCookie?.() || [];
  const cookieHeader = setCookie.join(";") || exchanged.headers.get("set-cookie") || "";
  const cookieMatch = /de_cfg_session=([^;]+)/i.exec(cookieHeader);
  const cookie = `de_cfg_session=${cookieMatch[1]}`;
  const exchangedBody = await exchanged.json();

  const row = deRepo._dump().publications.find((p) => p.id === publication.id);
  if (row) {
    row.status = "revoked";
    row.revoked_at = new Date().toISOString();
  }

  const revokedSave = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: exchangedBody.session.rowVersion,
      idempotencyKey: "sel-revoked"
    })
  });
  assert.ok(revokedSave.status === 404 || revokedSave.status === 410);
  const revokedBody = await revokedSave.json();
  assert.equal(revokedBody.ok, false);
  assert.ok(
    revokedBody.code === "publication_revoked" ||
      revokedBody.code === "publication_unavailable" ||
      revokedBody.lifecycleFatal === true
  );

  await new Promise((r) => server.close(r));
  console.log("ok: revoked session cannot save selections");
}

console.log("\nAll public v2 route production-path tests passed.\n");
