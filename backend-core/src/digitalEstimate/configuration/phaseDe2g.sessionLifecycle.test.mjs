/**
 * Phase DE.2G — Session lifecycle on envelope supersession.
 * Atomic revoke (status-only), generic 404 for old sessions, history preserved.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2g.sessionLifecycle.test.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import {
  createPublicConfigurationService
} from "./publicConfigurationService.mjs";
import {
  createReviewRequestService
} from "./reviewRequestService.mjs";
import { createInMemoryAmendmentRepository } from "./amendmentRepository.mjs";
import {
  generateConfigurationSessionSecret,
  hashConfigurationSessionSecret
} from "./publicConfigurationSession.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");
const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_AMENDMENTS_ENABLED: "1",
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
        ]
      }
    }
  };
}

async function seedStack() {
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
  const amendmentRepo = createInMemoryAmendmentRepository();
  const reviewService = createReviewRequestService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository: amendmentRepo
  });

  return { deRepo, cfgRepo, pricing, published, publication, service, reviewService };
}

async function activateReplacement(cfgRepo, publicationId) {
  const active = await cfgRepo.getActiveEnvelope(ORG, publicationId);
  const clone = await cfgRepo.cloneEnvelopeToDraft(ORG, active.id, { actorUserId: "u1" });
  return cfgRepo.activateEnvelope(ORG, clone.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "p2",
    catalogFingerprint: "c2"
  });
}

function isGeneric404(e) {
  return e?.statusCode === 404 && (e.code === "not_found" || e.code === "configuration_unavailable");
}

console.log("\nphaseDe2g.sessionLifecycle.test.mjs\n");

// --- Additive migration checksum + revoke semantics in SQL ---
{
  const manifest = JSON.parse(
    readFileSync(
      join(repoRoot, "docs/digital-estimate/MIGRATION_CHECKSUMS_DE_2G_SESSION_LIFECYCLE.json"),
      "utf8"
    )
  );
  for (const m of manifest.migrations) {
    const buf = readFileSync(join(repoRoot, m.path));
    assert.equal(createHash("sha256").update(buf).digest("hex"), m.sha256);
    assert.equal(buf.length, m.bytes);
    const sql = buf.toString("utf8");
    assert.ok(sql.includes("configuration_session_revoked"));
    assert.ok(sql.includes("sessions_revoked_count"));
    assert.ok(/status\s*=\s*'revoked'/i.test(sql));
    assert.equal(/\bdelete\s+from\s+public\.digital_estimate_configuration_sessions\b/i.test(sql), false);
    assert.equal(/\bdelete\s+from\s+public\.digital_estimate_configuration_selections\b/i.test(sql), false);
    assert.equal(/\bdelete\s+from\s+public\.digital_estimate_configuration_calculations\b/i.test(sql), false);
    assert.equal(/\bdelete\s+from\s+public\.digital_estimate_configuration_events\b/i.test(sql), false);
    assert.ok(/grant execute[\s\S]*service_role/i.test(sql));
    assert.ok(/revoke all on function/i.test(sql));
  }
  // Prior DE.2G.0 checksums remain untouched and still match on-disk files
  const prior = JSON.parse(
    readFileSync(join(repoRoot, "docs/digital-estimate/MIGRATION_CHECKSUMS_DE_2G_0.json"), "utf8")
  );
  for (const m of prior.migrations) {
    const buf = readFileSync(join(repoRoot, m.path));
    assert.equal(createHash("sha256").update(buf).digest("hex"), m.sha256);
  }
  console.log("ok: additive migration checksum; no history deletes; prior DE.2G.0 checksums intact");
}

// --- Activate replacement revokes all live sessions; history preserved ---
{
  const { published, service, cfgRepo, publication, reviewService } = await seedStack();
  const secrets = [];
  for (let i = 0; i < 3; i += 1) {
    const exchanged = await service.exchangePublicationToken({ rawToken: published.accessToken });
    secrets.push(exchanged.rawSecret);
    const saved = await service.saveSelections({
      rawSecret: exchanged.rawSecret,
      body: {
        expectedRowVersion: exchanged.state.session.rowVersion,
        idempotencyKey: `sel-${i}`,
        items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
      }
    });
    assert.equal(saved.ok, true);
  }

  const before = cfgRepo._dump();
  const sessionCountBefore = before.sessions.length;
  const selectionCountBefore = before.selections.length;
  const calcCountBefore = before.calculations.length;
  const eventCountBefore = before.events.length;
  assert.ok(sessionCountBefore >= 3);
  assert.ok(selectionCountBefore >= 3);
  assert.ok(calcCountBefore >= 3);

  const activated = await activateReplacement(cfgRepo, publication.id);
  assert.ok(Number(activated.sessionsRevokedCount) >= 3);
  assert.equal(
    (await cfgRepo.listEnvelopesForPublication(ORG, publication.id)).filter((e) => e.status === "active")
      .length,
    1
  );

  const after = cfgRepo._dump();
  assert.equal(after.sessions.length, sessionCountBefore);
  assert.equal(after.selections.length, selectionCountBefore);
  assert.equal(after.calculations.length, calcCountBefore);
  assert.ok(after.events.length > eventCountBefore);
  assert.ok(after.events.some((e) => e.event_type === "configuration_session_revoked"));

  for (const rawSecret of secrets) {
    const sess = await cfgRepo.getSessionBySecretHash(hashConfigurationSessionSecret(rawSecret));
    assert.equal(sess.status, "revoked");
    await assert.rejects(() => service.resumeFromSessionSecret({ rawSecret }), isGeneric404);
    await assert.rejects(
      () =>
        service.saveSelections({
          rawSecret,
          body: {
            expectedRowVersion: 1,
            idempotencyKey: "after-revoke",
            items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
          }
        }),
      isGeneric404
    );
    await assert.rejects(
      () =>
        reviewService.createReviewRequest({
          rawSecret,
          body: {
            expectedRowVersion: 1,
            idempotencyKey: `rr-${rawSecret.slice(0, 8)}`,
            customerNote: null
          }
        }),
      isGeneric404
    );
  }
  console.log("ok: supersede revokes all sessions; old GET/PUT/review → 404; history preserved");
}

// --- New v2 session after supersede still works ---
{
  const { published, service, cfgRepo, publication } = await seedStack();
  const old = await service.exchangePublicationToken({ rawToken: published.accessToken });
  await service.saveSelections({
    rawSecret: old.rawSecret,
    body: {
      expectedRowVersion: old.state.session.rowVersion,
      idempotencyKey: "old-save",
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
    }
  });
  await activateReplacement(cfgRepo, publication.id);

  const neu = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(neu.state.lifecycle, "active");
  assert.ok(neu.state.configuration);
  const saved = await service.saveSelections({
    rawSecret: neu.rawSecret,
    body: {
      expectedRowVersion: neu.state.session.rowVersion,
      idempotencyKey: "new-v2-save",
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
    }
  });
  assert.equal(saved.ok, true);
  const resumed = await service.resumeFromSessionSecret({ rawSecret: neu.rawSecret });
  assert.equal(resumed.lifecycle, "active");
  await assert.rejects(() => service.resumeFromSessionSecret({ rawSecret: old.rawSecret }), isGeneric404);
  console.log("ok: new v2 session works after supersede; old session remains 404");
}

// --- Concurrent activation: single active + sessions on superseded revoked ---
{
  const { published, service, cfgRepo, publication } = await seedStack();
  const live = await service.exchangePublicationToken({ rawToken: published.accessToken });
  await service.saveSelections({
    rawSecret: live.rawSecret,
    body: {
      expectedRowVersion: live.state.session.rowVersion,
      idempotencyKey: "live-before-race",
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
    }
  });

  const active = await cfgRepo.getActiveEnvelope(ORG, publication.id);
  const a = await cfgRepo.cloneEnvelopeToDraft(ORG, active.id, { actorUserId: "u1" });
  const b = await cfgRepo.cloneEnvelopeToDraft(ORG, active.id, { actorUserId: "u2" });

  const results = await Promise.allSettled([
    cfgRepo.activateEnvelope(ORG, a.id, {
      actorUserId: "u1",
      pricingPolicyFingerprint: "pa",
      catalogFingerprint: "ca"
    }),
    cfgRepo.activateEnvelope(ORG, b.id, {
      actorUserId: "u2",
      pricingPolicyFingerprint: "pb",
      catalogFingerprint: "cb"
    })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  const actives = (await cfgRepo.listEnvelopesForPublication(ORG, publication.id)).filter(
    (e) => e.status === "active"
  );
  assert.equal(actives.length, 1);

  const oldSess = await cfgRepo.getSessionBySecretHash(
    hashConfigurationSessionSecret(live.rawSecret)
  );
  assert.equal(oldSess.status, "revoked");
  await assert.rejects(() => service.resumeFromSessionSecret({ rawSecret: live.rawSecret }), isGeneric404);

  const neu = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(neu.state.lifecycle, "active");
  assert.equal(neu.state.configuration?.envelopeId, actives[0].id);
  console.log("ok: concurrent activation → one active; prior sessions revoked");
}

// --- Status-only: revoke does not drop session secret hash row ---
{
  const { published, service, cfgRepo, publication } = await seedStack();
  const exchanged = await service.exchangePublicationToken({ rawToken: published.accessToken });
  const hash = hashConfigurationSessionSecret(exchanged.rawSecret);
  await activateReplacement(cfgRepo, publication.id);
  const row = await cfgRepo.getSessionBySecretHash(hash);
  assert.ok(row);
  assert.equal(row.session_secret_hash, hash);
  assert.equal(row.status, "revoked");
  // Fresh secret still unused
  const { secretHash: unused } = generateConfigurationSessionSecret();
  assert.equal(await cfgRepo.getSessionBySecretHash(unused), null);
  console.log("ok: revoke is status-only; session row retained");
}

console.log("\nAll phaseDe2g session lifecycle tests passed.\n");
