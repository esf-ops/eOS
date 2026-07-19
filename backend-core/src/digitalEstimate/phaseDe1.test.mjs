/**
 * Phase DE.1 — Digital Estimate backend tests (fake repo / no network).
 * Run: node backend-core/src/digitalEstimate/phaseDe1.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { assessElite100PublicationEligibility } from "./digitalEstimateEligibility.mjs";
import {
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublishEnabled,
  isDigitalEstimatePublicReadEnabled
} from "./digitalEstimateConfig.mjs";
import {
  assertPublicDtoHasNoForbiddenContent,
  buildPublicDigitalEstimateDto,
  PUBLIC_ESTIMATE_DTO_KEYS
} from "./digitalEstimatePublicSerializer.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken,
  revokeDigitalEstimatePublication
} from "./digitalEstimatePublishService.mjs";
import { resolvePublicDigitalEstimate } from "./digitalEstimateAccessService.mjs";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import {
  attachDigitalEstimateRoutes,
  maybeAttachDigitalEstimateRoutes
} from "./digitalEstimateRoutes.js";
import {
  generateDigitalEstimateAccessToken,
  hashDigitalEstimateToken,
  redactDigitalEstimateTokenPath
} from "./digitalEstimateToken.mjs";
import { resetDigitalEstimatePublicRateLimitsForTests } from "./digitalEstimateRateLimit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "https://digital.eliteosfab.com",
  DIGITAL_ESTIMATE_VIEW_THROTTLE_SECONDS: "0",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: "u1",
  ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS: "pilot@example.com"
};

function eliteHeader(overrides = {}) {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-DYER-000100",
    quote_number_base: "ESF-DYER-000100",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Test Customer",
    project_name: "Kitchen Remodel",
    project_address: "1 Main St",
    estimated_material_group: "Group B",
    calculation_snapshot: {
      materialGroup: "Group B",
      materialProgramDefault: "elite_100",
      totals: { retail: 12450, wholesale: 10000, estimated_sqft: 40 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 12450,
        customer_estimate_customer_facing_notes: "Thank you.",
        estimate_rooms: [
          {
            name: "Kitchen",
            materialGroup: "Group B",
            colorName: "Carrara Classic",
            countertopSqft: 35,
            backsplashSqft: 5,
            materialProgramOverride: "inherit"
          }
        ],
        custom_line_items: [
          { name: "Sink cutout", customerFacing: true, lineTotal: 150 },
          { name: "Hidden cost", customerFacing: false, lineTotal: 999 }
        ],
        customer_estimate_print_snapshot: {
          finalRounded: 12450,
          rooms: [
            {
              name: "Kitchen",
              materialLabel: "Group B",
              colorLabel: "Carrara Classic",
              summaryLines: ["Countertop 35 sf"]
            }
          ],
          summaryRows: [{ key: "project_total", label: "Estimated project total", displayAmount: 12450 }]
        }
      }
    },
    ...overrides
  };
}

console.log("\nphaseDe1.test.mjs\n");

// Flags off by default
{
  assert.equal(isDigitalEstimateApiEnabled({}), false);
  assert.equal(isDigitalEstimatePublishEnabled({}), false);
  assert.equal(isDigitalEstimatePublicReadEnabled({}), false);
  console.log("ok: flags off by default");
}

// Eligibility
{
  const ok = assessElite100PublicationEligibility(eliteHeader());
  assert.equal(ok.eligible, true);

  const custom = assessElite100PublicationEligibility(
    eliteHeader({ quote_source: "custom_quote" })
  );
  assert.equal(custom.eligible, false);
  assert.equal(custom.code, "not_elite_100_internal");

  const ambiguous = assessElite100PublicationEligibility(
    eliteHeader({
      calculation_snapshot: {
        materialGroup: "Group B",
        internal_ui: {
          customer_display_total: 1000,
          estimate_rooms: []
          // material_program_default intentionally missing
        }
      }
    })
  );
  assert.equal(ambiguous.eligible, false);
  assert.equal(ambiguous.code, "elite_100_eligibility_ambiguous");
  assert.equal(ambiguous.details.missingField.includes("material_program_default"), true);

  const ooc = assessElite100PublicationEligibility(
    eliteHeader({
      calculation_snapshot: {
        materialProgramDefault: "elite_100",
        internal_ui: {
          material_program_default: "elite_100",
          customer_display_total: 1000,
          estimate_rooms: [
            {
              name: "Island",
              materialProgramOverride: "out_of_collection",
              materialGroup: "Group A"
            }
          ]
        }
      }
    })
  );
  assert.equal(ooc.eligible, false);
  console.log("ok: Elite 100 eligibility fail-closed");
}

// Publish + immutable public response after quote mutation
{
  const repo = createInMemoryDigitalEstimateRepository();
  const header = eliteHeader();
  repo.seedQuote(header);

  const published = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "user-1",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  assert.ok(published.accessToken);
  assert.ok(published.customerUrl.includes("/e#") || published.customerUrl.includes("/e/"));
  assert.equal(published.customerUrl.includes(published.accessToken), true);
  // New Studio links use fragment format (DE.2E); raw token not in path after #
  if (published.customerUrl.includes("/e#")) {
    const pathPart = published.customerUrl.split("#")[0];
    assert.equal(pathPart.includes(published.accessToken), false);
  }

  const dump = repo._dump();
  assert.equal(JSON.stringify(dump).includes(published.accessToken), false);
  assert.ok(dump.tokens.every((t) => t.token_hash && !String(t.token_hash).includes(published.accessToken)));

  const before = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: published.accessToken,
    clientIp: "1.2.3.4",
    userAgent: "Mozilla/5.0 Chrome/120"
  });
  assert.equal(before.estimate.totals.estimatedProjectTotal, 12450);
  assertPublicDtoHasNoForbiddenContent(before);
  for (const k of Object.keys(before.estimate)) {
    assert.ok(PUBLIC_ESTIMATE_DTO_KEYS.includes(k), `unexpected key ${k}`);
  }

  // Mutate source quote (current revision overwrite simulation)
  await repo.updateQuoteHeader(ORG, QUOTE_ID, {
    calculation_snapshot: {
      ...header.calculation_snapshot,
      internal_ui: {
        ...header.calculation_snapshot.internal_ui,
        customer_display_total: 99999,
        customer_estimate_print_snapshot: {
          ...header.calculation_snapshot.internal_ui.customer_estimate_print_snapshot,
          finalRounded: 99999
        }
      }
    }
  });

  const after = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: published.accessToken,
    clientIp: "1.2.3.4",
    userAgent: "Mozilla/5.0 Chrome/120"
  });
  assert.equal(after.estimate.totals.estimatedProjectTotal, 12450);
  assert.notEqual(after.estimate.totals.estimatedProjectTotal, 99999);
  console.log("ok: publish freezes snapshot; later quote edit does not change public DTO");
}

// Supersede + revoke indistinguishable public errors
{
  resetDigitalEstimatePublicRateLimitsForTests();
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());

  const p1 = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const p2 = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  assert.equal(p2.supersededCount, 1);

  await assert.rejects(
    () =>
      resolvePublicDigitalEstimate({
        env: ENV_ON,
        repository: repo,
        rawToken: p1.accessToken
      }),
    (e) => e.statusCode === 404
  );

  const ok2 = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: p2.accessToken
  });
  assert.equal(ok2.ok, true);

  await revokeDigitalEstimatePublication({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    publicationId: p2.publication.id,
    body: { confirm: true }
  });

  await assert.rejects(
    () =>
      resolvePublicDigitalEstimate({
        env: ENV_ON,
        repository: repo,
        rawToken: p2.accessToken
      }),
    (e) => e.statusCode === 404 && e.message === "Not found"
  );

  await assert.rejects(
    () =>
      resolvePublicDigitalEstimate({
        env: ENV_ON,
        repository: repo,
        rawToken: "totally-unknown-token-value-xxxxxxxxxxxx"
      }),
    (e) => e.statusCode === 404 && e.message === "Not found"
  );
  console.log("ok: supersede/revoke/missing return indistinguishable 404");
}

// Cross-org administration denied
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const p = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  await assert.rejects(
    () =>
      revokeDigitalEstimatePublication({
        env: ENV_ON,
        organizationId: ORG_B,
        actorUserId: "u2",
        repository: repo,
        publicationId: p.publication.id,
        body: { confirm: true }
      }),
    (e) => e.code === "publication_not_found"
  );
  console.log("ok: cross-org cannot administer publication");
}

// Token replace; lost token not retrievable
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const p = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const oldTok = p.accessToken;
  const replaced = await replaceDigitalEstimateToken({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    publicationId: p.publication.id,
    body: { confirm: true }
  });
  assert.notEqual(replaced.accessToken, oldTok);
  await assert.rejects(() =>
    resolvePublicDigitalEstimate({ env: ENV_ON, repository: repo, rawToken: oldTok })
  );
  const ok = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: replaced.accessToken
  });
  assert.equal(ok.ok, true);
  console.log("ok: token replace; old token unusable");
}

// Public caller cannot choose org/quote; flags off create no data
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  await assert.rejects(
    () =>
      publishDigitalEstimate({
        env: { ...ENV_ON, DIGITAL_ESTIMATE_PUBLISH_ENABLED: "0" },
        organizationId: ORG,
        repository: repo,
        body: { quoteId: QUOTE_ID, confirm: true }
      }),
    (e) => e.code === "digital_estimate_disabled"
  );
  assert.equal(repo._dump().publications.length, 0);

  await assert.rejects(
    () =>
      publishDigitalEstimate({
        env: ENV_ON,
        organizationId: ORG,
        repository: repo,
        body: { quoteId: QUOTE_ID, confirm: true, organizationId: ORG_B }
      }),
    (e) => e.code === "forbidden"
  );
  console.log("ok: flags-off no data; caller org override rejected");
}

// Historical revision reproducibility via frozen fingerprint
{
  const repo = createInMemoryDigitalEstimateRepository();
  const histId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const hist = eliteHeader({
    id: histId,
    is_current_revision: false,
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: histId
  });
  repo.seedQuote(hist);
  const p = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: histId, confirm: true }
  });
  const snap = repo._dump().snapshots[0];
  assert.equal(snap.pricing_evidence_json.sourceQuoteId, histId);
  assert.ok(snap.pricing_evidence_json.calculationSnapshotCopy);
  const dto = buildPublicDigitalEstimateDto(snap.customer_snapshot_json);
  assert.equal(dto.estimate.revisionNumber, 1);
  assert.equal(JSON.stringify(repo._dump()).includes(p.accessToken), false);
  console.log("ok: historical revision publication freezes evidence");
}

// Pricing Admin / calculator fixture change simulation does not alter publication
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const p = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  // Simulate calculator constant drift by mutating only source header
  await repo.updateQuoteHeader(ORG, QUOTE_ID, {
    calculation_snapshot: {
      ...eliteHeader().calculation_snapshot,
      totals: { retail: 1, wholesale: 1, estimated_sqft: 1 },
      internal_ui: {
        ...eliteHeader().calculation_snapshot.internal_ui,
        customer_display_total: 1,
        customer_estimate_print_snapshot: { finalRounded: 1 }
      }
    }
  });
  const dto = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: p.accessToken
  });
  assert.equal(dto.estimate.totals.estimatedProjectTotal, 12450);
  console.log("ok: calculator/pricing fixture changes do not alter publication");
}

// Redaction helper + token entropy
{
  const { rawToken, tokenHash } = generateDigitalEstimateAccessToken();
  assert.equal(tokenHash, hashDigitalEstimateToken(rawToken));
  assert.ok(Buffer.from(rawToken, "base64url").length >= 32);
  assert.equal(
    redactDigitalEstimateTokenPath(`/api/public-digital-estimate/v1/${rawToken}`).includes(rawToken),
    false
  );
  console.log("ok: token entropy + path redaction");
}

// Routes: flags off mount nothing; public GET generic
{
  const appOff = express();
  const r = maybeAttachDigitalEstimateRoutes(appOff, {
    requireAuth: () => (_req, _res, next) => next(),
    getSupabase: () => ({}),
    env: {}
  });
  assert.equal(r.mounted, false);

  resetDigitalEstimatePublicRateLimitsForTests();
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const app = express();
  attachDigitalEstimateRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      req.user = {
        id: "u1",
        email: "pilot@example.com",
        role: "admin",
        isActive: true
      };
      next();
    },
    getSupabase: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [{ organization_id: ORG }], error: null })
          })
        })
      })
    }),
    env: ENV_ON,
    repository: repo
  });

  // Use publish via service then hit public route with inject
  const published = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u1",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const resOk = await fetch(`http://127.0.0.1:${port}/api/public-digital-estimate/v1/${published.accessToken}`);
  assert.equal(resOk.status, 200);
  const bodyOk = await resOk.json();
  assert.equal(bodyOk.ok, true);
  assert.equal(resOk.headers.get("referrer-policy"), "no-referrer");

  const resBad = await fetch(`http://127.0.0.1:${port}/api/public-digital-estimate/v1/not-a-real-token-zzzz`);
  assert.equal(resBad.status, 404);
  const bodyBad = await resBad.json();
  assert.deepEqual(bodyBad, { ok: false, error: "Not found" });
  server.close();
  console.log("ok: routes flag-off + public GET headers/errors");
}

// Source inventory: no quote_share_links dependency; no estimate.eliteosfab as public host
{
  const files = readdirSync(__dirname).filter(
    (f) => /\.(mjs|js)$/.test(f) && !f.includes(".test.")
  );
  for (const f of files) {
    const src = readFileSync(join(__dirname, f), "utf8");
    assert.equal(src.includes("quote_share_links"), false, f);
    assert.equal(src.includes("estimate.eliteosfab.com"), false, f);
  }
  const sql = readFileSync(
    join(__dirname, "../../supabase/eliteos_digital_estimate_v1.sql"),
    "utf8"
  );
  assert.ok(sql.includes("quote_publications"));
  assert.ok(sql.includes("token_hash"));
  assert.equal(sql.includes("quote_share_links"), false);
  console.log("ok: migration + package avoid share_links / IE alias host");
}

// Confirm required for publish
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  await assert.rejects(
    () =>
      publishDigitalEstimate({
        env: ENV_ON,
        organizationId: ORG,
        repository: repo,
        body: { quoteId: QUOTE_ID }
      }),
    (e) => e.code === "confirm_required"
  );
  console.log("ok: publish confirm required");
}

// Atomic publish: concurrent requests leave exactly one active publication
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const results = await Promise.all([
    publishDigitalEstimate({
      env: ENV_ON,
      organizationId: ORG,
      actorUserId: "u-a",
      repository: repo,
      body: { quoteId: QUOTE_ID, confirm: true }
    }),
    publishDigitalEstimate({
      env: ENV_ON,
      organizationId: ORG,
      actorUserId: "u-b",
      repository: repo,
      body: { quoteId: QUOTE_ID, confirm: true }
    }),
    publishDigitalEstimate({
      env: ENV_ON,
      organizationId: ORG,
      actorUserId: "u-c",
      repository: repo,
      body: { quoteId: QUOTE_ID, confirm: true }
    })
  ]);
  const dump = repo._dump();
  const actives = dump.publications.filter((p) => p.status === "active");
  assert.equal(actives.length, 1);
  assert.equal(dump.publications.length, 3);
  assert.equal(dump.snapshots.length, 3);
  for (const pub of dump.publications) {
    assert.ok(dump.snapshots.some((s) => s.publication_id === pub.id));
    const toks = dump.tokens.filter((t) => t.publication_id === pub.id && !t.revoked_at);
    if (pub.status === "active") assert.equal(toks.length, 1);
    else assert.equal(toks.length, 0);
  }
  // Exactly one of the three tokens still resolves publicly
  let publicOk = 0;
  for (const r of results) {
    try {
      await resolvePublicDigitalEstimate({
        env: ENV_ON,
        repository: repo,
        rawToken: r.accessToken
      });
      publicOk += 1;
    } catch {
      /* superseded */
    }
  }
  assert.equal(publicOk, 1);
  console.log("ok: concurrent publish → one active + one usable token");
}

// Atomic publish rollback: mid-flight failure does not revoke prior
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const first = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const priorActive = repo._dump().publications.filter((p) => p.status === "active");
  assert.equal(priorActive.length, 1);

  const realPublish = repo.publishAtomic.bind(repo);
  let calls = 0;
  repo.publishAtomic = async (payload) => {
    calls += 1;
    if (calls === 1) {
      // Force failure after starting — repository must roll back.
      const result = await realPublish({
        ...payload,
        // Corrupt hash path by throwing after internal work via wrapper:
        customerSnapshotJson: null
      });
      return result;
    }
    return realPublish(payload);
  };
  // Null snapshot should fail integrity inside publishAtomic
  await assert.rejects(() =>
    publishDigitalEstimate({
      env: ENV_ON,
      organizationId: ORG,
      actorUserId: "u",
      repository: repo,
      body: { quoteId: QUOTE_ID, confirm: true }
    })
  );
  const afterFail = repo._dump();
  assert.equal(afterFail.publications.filter((p) => p.status === "active").length, 1);
  assert.equal(afterFail.publications.filter((p) => p.status === "active")[0].id, priorActive[0].id);
  const stillOk = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: first.accessToken
  });
  assert.equal(stillOk.ok, true);
  console.log("ok: failed republish leaves prior publication usable");
}

// Token replace atomic + concurrent replace deterministic
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const p = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const oldTok = p.accessToken;
  const [a, b] = await Promise.all([
    replaceDigitalEstimateToken({
      env: ENV_ON,
      organizationId: ORG,
      actorUserId: "u1",
      repository: repo,
      publicationId: p.publication.id,
      body: { confirm: true }
    }),
    replaceDigitalEstimateToken({
      env: ENV_ON,
      organizationId: ORG,
      actorUserId: "u2",
      repository: repo,
      publicationId: p.publication.id,
      body: { confirm: true }
    })
  ]);
  const activeToks = repo._dump().tokens.filter(
    (t) => t.publication_id === p.publication.id && !t.revoked_at
  );
  assert.equal(activeToks.length, 1);
  await assert.rejects(() =>
    resolvePublicDigitalEstimate({ env: ENV_ON, repository: repo, rawToken: oldTok })
  );
  // Both callers return the persisted active token after readback (race-safe).
  assert.equal(a.accessToken, b.accessToken);
  assert.equal(a.customerUrl, b.customerUrl);
  const resolved = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: a.accessToken
  });
  assert.equal(resolved.ok, true);
  console.log("ok: concurrent token replace → exactly one active token");
}

// first_viewed concurrency-safe (recorded once)
{
  resetDigitalEstimatePublicRateLimitsForTests();
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const p = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  await Promise.all(
    Array.from({ length: 8 }, () =>
      resolvePublicDigitalEstimate({
        env: ENV_ON,
        repository: repo,
        rawToken: p.accessToken,
        clientIp: "9.9.9.9",
        userAgent: "Mozilla/5.0"
      })
    )
  );
  const firsts = repo._dump().events.filter((e) => e.event_type === "first_viewed");
  assert.equal(firsts.length, 1);
  console.log("ok: first_viewed once under concurrent views");
}

// View-event write failure does not block public read
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const p = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  repo.appendEvent = async () => {
    throw new Error("event store down");
  };
  repo.tryAppendFirstViewed = async () => {
    throw new Error("event store down");
  };
  const dto = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: p.accessToken
  });
  assert.equal(dto.ok, true);
  assert.equal(dto.estimate.totals.estimatedProjectTotal, 12450);
  console.log("ok: view-event failure does not block public read");
}

// Immutability matrix: new revision / archive / only new publish changes public
{
  const repo = createInMemoryDigitalEstimateRepository();
  const family = QUOTE_ID;
  repo.seedQuote(eliteHeader({ quote_family_root_id: family }));
  const p1 = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const baseline = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: p1.accessToken
  });

  // Simulate creating another revision row (does not mutate frozen snapshot)
  const rev2Id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  repo.seedQuote(
    eliteHeader({
      id: rev2Id,
      revision_number: 2,
      revision_label: "R2",
      quote_family_root_id: family,
      is_current_revision: true,
      calculation_snapshot: {
        ...eliteHeader().calculation_snapshot,
        internal_ui: {
          ...eliteHeader().calculation_snapshot.internal_ui,
          customer_display_total: 7777,
          customer_estimate_print_snapshot: { finalRounded: 7777 }
        }
      }
    })
  );
  await repo.updateQuoteHeader(ORG, QUOTE_ID, { is_current_revision: false, archived_at: null });

  const afterRev = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: p1.accessToken
  });
  assert.equal(
    afterRev.estimate.totals.estimatedProjectTotal,
    baseline.estimate.totals.estimatedProjectTotal
  );

  // Archive source quote — publication still readable from frozen snapshot
  await repo.updateQuoteHeader(ORG, QUOTE_ID, { archived_at: new Date().toISOString() });
  const afterArchive = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: p1.accessToken
  });
  assert.equal(afterArchive.estimate.totals.estimatedProjectTotal, 12450);

  // Only explicit new publication changes customer-visible data
  const p2 = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u",
    repository: repo,
    body: { quoteId: rev2Id, confirm: true }
  });
  assert.equal(p2.supersededCount, 1);
  await assert.rejects(() =>
    resolvePublicDigitalEstimate({ env: ENV_ON, repository: repo, rawToken: p1.accessToken })
  );
  const next = await resolvePublicDigitalEstimate({
    env: ENV_ON,
    repository: repo,
    rawToken: p2.accessToken
  });
  assert.equal(next.estimate.totals.estimatedProjectTotal, 7777);
  console.log("ok: immutability matrix (revision/archive/new publish)");
}

// Archived + non-elite + browser elite_100 body claim rejected
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader({ archived_at: new Date().toISOString() }));
  await assert.rejects(
    () =>
      publishDigitalEstimate({
        env: ENV_ON,
        organizationId: ORG,
        repository: repo,
        body: { quoteId: QUOTE_ID, confirm: true }
      }),
    (e) => e.code === "quote_archived"
  );

  const repo2 = createInMemoryDigitalEstimateRepository();
  repo2.seedQuote(
    eliteHeader({
      calculation_snapshot: {
        materialProgramDefault: "out_of_collection",
        internal_ui: {
          material_program_default: "out_of_collection",
          customer_display_total: 1000,
          estimate_rooms: []
        }
      }
    })
  );
  await assert.rejects(
    () =>
      publishDigitalEstimate({
        env: ENV_ON,
        organizationId: ORG,
        repository: repo2,
        body: {
          quoteId: QUOTE_ID,
          confirm: true,
          material_program_default: "elite_100",
          materialProgramDefault: "elite_100"
        }
      }),
    (e) => e.code === "forbidden" || e.code === "not_elite_100_internal"
  );
  console.log("ok: archived / non-elite / body elite_100 claim rejected");
}

// Migration security surface (unapplied SQL audit)
{
  const sql = readFileSync(
    join(__dirname, "../../supabase/eliteos_digital_estimate_v1.sql"),
    "utf8"
  );
  assert.ok(sql.includes("set search_path = public"));
  assert.ok(sql.includes("digital_estimate_publish_atomic"));
  assert.ok(sql.includes("digital_estimate_replace_token_atomic"));
  assert.ok(sql.includes("digital_estimate_try_first_viewed"));
  assert.ok(sql.includes("uq_quote_publications_one_active_per_family"));
  assert.ok(sql.includes("uq_quote_publication_one_active_token"));
  assert.ok(sql.includes("uq_quote_publication_events_first_viewed"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on table public.quote_publications from anon, authenticated"));
  assert.ok(sql.includes("organization_id is immutable"));
  assert.ok(sql.includes("child organization_id must match publication"));
  assert.equal(sql.includes("raw_token"), false);
  assert.equal(sql.includes("alter table public.quote_headers"), false);
  assert.ok(sql.includes("grant execute on function public.digital_estimate_publish_atomic"));
  console.log("ok: migration security surface audit (unapplied)");
}

// maybeAttach does not init repository when API flag off
{
  let repoFactoryCalled = false;
  const app = express();
  const r = maybeAttachDigitalEstimateRoutes(app, {
    requireAuth: () => (_req, _res, next) => next(),
    getSupabase: () => {
      repoFactoryCalled = true;
      return {};
    },
    env: { DIGITAL_ESTIMATE_API_ENABLED: "0" },
    repository: undefined
  });
  assert.equal(r.mounted, false);
  assert.equal(repoFactoryCalled, false);
  console.log("ok: API flag off → no mount / no supabase touch");
}

console.log("\nAll phaseDe1 backend tests passed.\n");
