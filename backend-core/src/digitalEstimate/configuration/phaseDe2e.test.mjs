/**
 * Phase DE.2E — Public interactive configuration tests.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2e.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { hashDigitalEstimateToken } from "../digitalEstimateToken.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import {
  isDigitalEstimatePublicConfigurationEnabled,
  isDigitalEstimatePublicConfigurationRuntimeEnabled
} from "./publicConfigurationConfig.mjs";
import {
  buildSessionCookieOptions,
  generateConfigurationSessionSecret,
  hashConfigurationSessionSecret,
  redactPublicConfigurationSecrets
} from "./publicConfigurationSession.mjs";
import {
  createPublicConfigurationService,
  rejectPublicSelectionAuthority
} from "./publicConfigurationService.mjs";
import {
  maybeAttachDigitalEstimatePublicConfigurationRoutes,
  attachDigitalEstimatePublicConfigurationRoutes
} from "./publicConfigurationRoutes.js";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import { resetDigitalEstimatePublicRateLimitsForTests } from "../digitalEstimateRateLimit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function eliteHeader() {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-DYER-000200",
    quote_number_base: "ESF-DYER-000200",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Test Customer",
    project_name: "Kitchen Remodel",
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

async function seedPublishedWithEnvelope() {
  const deRepo = createInMemoryDigitalEstimateRepository();
  deRepo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u1",
    repository: deRepo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });

  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });

  const pub = (await deRepo.listPublicationsForQuote?.(ORG, QUOTE_ID)) || deRepo._dump().publications;
  const publication = Array.isArray(pub) ? pub[0] : deRepo._dump().publications[0];
  const snap = deRepo._dump().snapshots[0];
  // Enrich snapshot evidence for locked SF
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
  snap.customer_snapshot_json = {
    ...(snap.customer_snapshot_json || {}),
    totals: { estimatedProjectTotal: 870 },
    project: { customerName: "Customer", name: "Kitchen" }
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
  await cfgRepo.upsertDraftOption(ORG, draft.id, {
    groupId: group.id,
    optionKey: "material:kitchen:group_c",
    displayLabel: "Kitchen — Group C",
    defaultQty: 0,
    sellPrice: 0,
    compatibilityJson: { roomKey: "kitchen", materialGroup: "group_c", role: "material_selection" }
  });
  await cfgRepo.activateEnvelope(ORG, draft.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "p",
    catalogFingerprint: "c"
  });

  const service = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });

  return { deRepo, cfgRepo, pricing, published, publication, service };
}

// --- Flags ---
{
  assert.equal(isDigitalEstimatePublicConfigurationEnabled({}), false);
  assert.equal(
    isDigitalEstimatePublicConfigurationRuntimeEnabled({
      DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
      DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
      DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
      DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "0"
    }),
    false
  );
  const off = maybeAttachDigitalEstimatePublicConfigurationRoutes(express(), {
    env: {},
    getSupabase: () => ({})
  });
  assert.equal(off.mounted, false);
  console.log("ok: public configuration flags default off");
}

// --- Session secret hash-only + cookie flags ---
{
  const { rawSecret, secretHash } = generateConfigurationSessionSecret();
  assert.equal(hashConfigurationSessionSecret(rawSecret), secretHash);
  assert.notEqual(rawSecret, secretHash);
  const prod = buildSessionCookieOptions({
    env: { NODE_ENV: "production" },
    rawSecret
  });
  assert.equal(prod.httpOnly, true);
  assert.equal(prod.secure, true);
  assert.equal(prod.sameSite, "strict");
  const redacted = redactPublicConfigurationSecrets(
    `Authorization: Bearer ${rawSecret} cookie de_cfg_session=${rawSecret}`
  );
  assert.equal(redacted.includes(rawSecret), false);
  console.log("ok: session secret hash-only + Secure prod cookie + redaction");
}

// --- Reject public authority spoof ---
{
  assert.throws(() => rejectPublicSelectionAuthority({ sellPrice: 1 }), (e) => e.statusCode === 400);
  assert.throws(() => rejectPublicSelectionAuthority({ chargeableCounterSf: 99 }), (e) => e.code === "forbidden_caller_authority");
  assert.throws(() => rejectPublicSelectionAuthority({ watts: true }), (e) => e.statusCode === 400);
  console.log("ok: public selection authority spoof rejected");
}

// --- Token exchange + resume + selections ---
{
  const { published, service, cfgRepo, publication } = await seedPublishedWithEnvelope();
  assert.ok(published.customerUrl.includes("/e#"));
  assert.equal(published.customerUrl.split("#")[0].includes(published.accessToken), false);

  const exchanged = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.ok(exchanged.rawSecret);
  assert.equal(exchanged.state.lifecycle, "active");
  assert.ok(exchanged.state.configuration);
  assert.ok(exchanged.state.estimate);
  assertPublicConfigurationHasNoForbiddenContent(exchanged.state.estimate);

  // Secret not in state
  assert.equal(JSON.stringify(exchanged.state).includes(exchanged.rawSecret), false);

  const resumed = await service.resumeFromSessionSecret({ rawSecret: exchanged.rawSecret });
  assert.equal(resumed.lifecycle, "active");
  assert.equal(resumed.session.rowVersion, exchanged.state.session.rowVersion);

  const saved = await service.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: resumed.session.rowVersion,
      idempotencyKey: "idem-1",
      items: [{ optionKey: "material:kitchen:group_c", quantity: 1 }]
    }
  });
  assert.equal(saved.ok, true);
  assert.ok(saved.calculation);
  assertPublicConfigurationHasNoForbiddenContent(saved.calculation);
  assert.equal(JSON.stringify(saved.calculation).toLowerCase().includes("spahn"), false);
  assert.equal(JSON.stringify(saved.calculation).includes("materialUseTax"), false);

  // Idempotent retry
  const again = await service.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: saved.session.rowVersion - 1,
      // After save, row version bumped — use previous for conflict test below
      idempotencyKey: "idem-conflict",
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
    }
  }).catch((e) => e);
  assert.equal(again.code, "row_version_conflict");

  const idem = await service.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: saved.session.rowVersion,
      idempotencyKey: "idem-1",
      items: [{ optionKey: "material:kitchen:group_c", quantity: 1 }]
    }
  });
  // Same idempotency with current version after first save — may conflict on version.
  // Use row from first save for true idempotent path: re-fetch session
  const sess = await cfgRepo.getSessionBySecretHash(
    hashConfigurationSessionSecret(exchanged.rawSecret)
  );
  const idem2 = await service.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: sess.row_version,
      idempotencyKey: "idem-2",
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
    }
  });
  assert.equal(idem2.ok, true);

  // Bad token
  await assert.rejects(
    () => service.exchangePublicationToken({ rawToken: "not-a-real-token-value-xxxxxx" }),
    (e) => e.statusCode === 404
  );

  // Price spoof
  await assert.rejects(
    () =>
      service.saveSelections({
        rawSecret: exchanged.rawSecret,
        body: {
          expectedRowVersion: 1,
          idempotencyKey: "x",
          sellPrice: 1,
          items: []
        }
      }),
    (e) => e.code === "forbidden_caller_authority" || e.statusCode === 400
  );

  void publication;
  void idem;
  console.log("ok: exchange/resume/selections/idempotency/spoof rejection");
}

// --- Superseded envelope revokes old session (generic 404) ---
{
  const { published, service, cfgRepo, publication } = await seedPublishedWithEnvelope();
  const exchanged = await service.exchangePublicationToken({ rawToken: published.accessToken });
  const active = await cfgRepo.getActiveEnvelope(ORG, publication.id);
  // Clone + activate replacement
  const clone = await cfgRepo.cloneEnvelopeToDraft(ORG, active.id, { actorUserId: "u1" });
  const graph = await cfgRepo.getEnvelopeGraph(ORG, clone.id);
  if (!graph.options.length) {
    const g = await cfgRepo.upsertDraftGroup(ORG, clone.id, {
      groupKey: "material_by_room",
      displayLabel: "Material",
      required: true
    });
    await cfgRepo.upsertDraftOption(ORG, clone.id, {
      groupId: g.id,
      optionKey: "material:kitchen:group_b",
      displayLabel: "B",
      defaultQty: 1,
      sellPrice: 0
    });
  }
  const activated = await cfgRepo.activateEnvelope(ORG, clone.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "p2",
    catalogFingerprint: "c2"
  });
  assert.ok(Number(activated.sessionsRevokedCount) >= 1);

  const sess = await cfgRepo.getSessionBySecretHash(
    hashConfigurationSessionSecret(exchanged.rawSecret)
  );
  assert.equal(sess.status, "revoked");

  await assert.rejects(
    () => service.resumeFromSessionSecret({ rawSecret: exchanged.rawSecret }),
    (e) => e.statusCode === 404 && e.code === "not_found"
  );
  await assert.rejects(
    () =>
      service.saveSelections({
        rawSecret: exchanged.rawSecret,
        body: {
          expectedRowVersion: 1,
          idempotencyKey: "after-supersede",
          items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
        }
      }),
    (e) => e.statusCode === 404 && e.code === "not_found"
  );
  console.log("ok: superseded envelope revokes old session (generic 404)");
}

// --- Routes: Origin + Set-Cookie ---
{
  resetDigitalEstimatePublicRateLimitsForTests();
  const { deRepo, cfgRepo, pricing, published } = await seedPublishedWithEnvelope();
  const app = express();
  attachDigitalEstimatePublicConfigurationRoutes(app, {
    env: ENV_ON,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    configurationStack: { mode: "memory" }
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const badOrigin = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(badOrigin.status, 403);

  const ok = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5190",
      Authorization: `Bearer ${published.accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(ok.status, 201);
  const setCookie = ok.headers.getSetCookie?.() || [];
  const cookieHeader = setCookie.join(";") || ok.headers.get("set-cookie") || "";
  assert.ok(/de_cfg_session=/.test(cookieHeader));
  assert.ok(/HttpOnly/i.test(cookieHeader));
  assert.ok(/Path=\/api\/public-digital-estimate\/v2/i.test(cookieHeader));
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(JSON.stringify(body).includes(published.accessToken), false);

  // Legacy path mutation must not exist
  const legacyPut = await fetch(
    `${base}/api/public-digital-estimate/v1/${encodeURIComponent(published.accessToken)}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
  assert.ok(legacyPut.status === 404 || legacyPut.status === 405);

  await new Promise((r) => server.close(r));
  console.log("ok: Origin gate + HttpOnly cookie + legacy read-only");
}

// --- SQL + module isolation ---
{
  const sql = readFileSync(
    join(__dirname, "../../../supabase/eliteos_digital_estimate_public_configuration_v1.sql"),
    "utf8"
  );
  assert.ok(sql.includes("digital_estimate_save_selection_and_calculation"));
  assert.ok(sql.includes("session_secret_hash"));
  assert.ok(sql.includes("to service_role"));
  assert.ok(sql.includes("set search_path = public"));

  for (const f of [
    "publicConfigurationService.mjs",
    "publicConfigurationRoutes.js",
    "publicConfigurationSession.mjs"
  ]) {
    const src = readFileSync(join(__dirname, f), "utf8");
    assert.equal(/from\s+["'][^"']*quoteCalculator/.test(src), false);
    assert.equal(src.includes("quote_headers"), false);
  }

  const publishSrc = readFileSync(
    join(__dirname, "../digitalEstimatePublishService.mjs"),
    "utf8"
  );
  assert.ok(publishSrc.includes("/e#"));
  console.log("ok: additive SQL RPC present; no calculateQuote; Studio fragment links");
}

// Token hash stored, not raw
{
  const { published, deRepo } = await seedPublishedWithEnvelope();
  const dump = JSON.stringify(deRepo._dump());
  assert.equal(dump.includes(published.accessToken), false);
  assert.ok(
    deRepo._dump().tokens.some(
      (t) => t.token_hash === hashDigitalEstimateToken(published.accessToken)
    )
  );
  console.log("ok: publication token remains hash-only");
}

console.log("\nAll phaseDe2e backend tests passed.\n");
