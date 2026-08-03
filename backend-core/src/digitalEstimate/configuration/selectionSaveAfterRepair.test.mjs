/**
 * Diagnostic: after Studio Repair rebuilds the envelope, hard-refresh (new
 * session exchange) then public save must succeed for on-envelope sink /
 * backsplash / material — and must report the exact rejected key if not.
 *
 * Run: node backend-core/src/digitalEstimate/configuration/selectionSaveAfterRepair.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "./configurationStudioService.mjs";
import { createInMemoryAmendmentRepository } from "./amendmentRepository.mjs";
import { createPublicConfigurationService } from "./publicConfigurationService.mjs";
import { InMemoryStudioEstimateRepository } from "../../elite100EstimateStudio/inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "../../elite100EstimateStudio/studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "../../elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs";
import { createStudioV2Service } from "../../elite100EstimateStudio/studioV2Service.mjs";
import {
  STUDIO_ESTIMATE_STATUSES,
  emptyStudioEstimateScope
} from "../../elite100EstimateStudio/studioEstimateTypes.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

const fakeCalc = {
  fingerprint: "v2-post-repair-save-fp",
  calculatedAt: "2026-08-03T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 4380, customerDisplayTotal: 4380 },
  warnings: [],
  unresolvedItems: [],
  fabrication: { customLineItems: [] }
};

function approvedScope() {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    pricingBasis: "wholesale",
    materialGroup: "B",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        includeBacksplash: true,
        backsplashSqft: 12,
        backsplashHeightMode: "standard",
        pieces: [
          {
            id: "run-1",
            name: "Main run",
            pieceType: "counter",
            included: true,
            lengthIn: 96,
            depthIn: 25.5,
            quantity: 1,
            sqft: 17
          }
        ]
      }
    ],
    addOns: { "qty-sink": 1 },
    customLineItems: []
  };
}

async function harness() {
  const studioRepo = new InMemoryStudioEstimateRepository();
  const deRepo = createInMemoryDigitalEstimateRepository();
  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const amendmentRepo = createInMemoryAmendmentRepository({
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });
  const studio = createStudioEstimateService({
    env: ENV_ON,
    repository: studioRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    }),
    loadLatestTakeoffResult: async () => null
  });
  Object.defineProperty(studio, "repositoryMode", { value: "memory" });

  const configurationStudioService = createConfigurationStudioService({
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    deRepository: deRepo,
    env: ENV_ON
  });

  const digitalEstimateService = createStudioEstimateDigitalEstimateService({
    env: ENV_ON,
    studioEstimateService: studio,
    digitalEstimateRepository: deRepo,
    configurationStudioService,
    amendmentRepository: amendmentRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    })
  });

  const v2 = createStudioV2Service({
    env: ENV_ON,
    repository: studioRepo,
    studioEstimateService: studio,
    studioDigitalEstimateService: digitalEstimateService,
    calculateStudioEstimateImpl: async () => fakeCalc
  });

  const pubSvc = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });

  return { studioRepo, deRepo, cfgRepo, v2, pubSvc };
}

async function createApprovedEstimate(studioRepo) {
  return studioRepo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    sourceTakeoffResultId: "result-1",
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: approvedScope(),
    calculationSnapshot: fakeCalc,
    pricingEngine: "elite100-room-pricing-v1",
    pricingVersion: 4,
    approval: {
      approvedAt: "2026-08-03T17:00:00.000Z",
      approvedByUserId: ACTOR,
      calculationFingerprint: "v2-post-repair-save-fp",
      customerDisplayTotal: 4380
    },
    staleReason: null
  });
}

function tokenFromCustomerUrl(url) {
  const m = String(url || "").match(/\/e\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function keysByRole(options) {
  /** @type {Record<string, string[]>} */
  const out = { sink: [], backsplash: [], material: [], edge: [] };
  for (const o of options || []) {
    const k = String(o.optionKey || o.option_key || "");
    const role = k.split(":")[0];
    if (out[role]) out[role].push(k);
  }
  return out;
}

console.log("\nselectionSaveAfterRepair.test.mjs\n");

{
  const { studioRepo, cfgRepo, v2, pubSvc } = await harness();
  const row = await createApprovedEstimate(studioRepo);

  const first = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: `pub-${randomUUID()}` }
  });
  assert.equal(first.ok, true);
  const publicationId = first.publication?.publicationId;
  const token = tokenFromCustomerUrl(first.customerUrl);
  assert.ok(publicationId && token);

  // Session A — initial customer save (contaminated-ish but valid envelope keys).
  const exA = await pubSvc.exchangePublicationToken({ rawToken: token });
  const optsA = keysByRole(exA.state.configuration?.options);
  console.log(
    JSON.stringify({
      msg: "diag_envelope_keys_before_repair",
      publicationId,
      envelopeId: exA.state.configuration?.envelopeId || exA.state.configuration?.id,
      sinkSample: optsA.sink.filter((k) => /precis-24|customer_provided|none/.test(k)).slice(0, 8),
      backsplash: optsA.backsplash.slice(0, 8),
      materialSample: optsA.material.filter((k) => /antique-gray|carrara/.test(k)).slice(0, 6),
      edgeSample: optsA.edge.slice(0, 6)
    })
  );

  const precis24 = optsA.sink.find((k) => k.includes("precis-24") && !k.includes("accessories"));
  const noneSplash = optsA.backsplash.find((k) => k.endsWith(":none"));
  const stdSplash = optsA.backsplash.find((k) => k.includes("standard_4in"));
  const antique = optsA.material.find((k) => k.includes("antique-gray"));
  assert.ok(precis24, "envelope has Precis 24 family key");
  assert.ok(noneSplash, "envelope has none backsplash");
  assert.ok(stdSplash, "envelope has standard_4in");
  assert.ok(antique, "envelope has Antique Gray");

  const saveA = await pubSvc.saveSelections({
    rawSecret: exA.rawSecret,
    body: {
      expectedRowVersion: exA.state.session.rowVersion,
      idempotencyKey: `a-${randomUUID()}`,
      items: [
        { optionKey: antique, quantity: 1 },
        { optionKey: precis24, quantity: 1 },
        { optionKey: noneSplash, quantity: 1 }
      ],
      customerProductDrafts: {
        kitchen: {
          sink: {
            source: "esf",
            optionKey: precis24,
            productId: "blanco:precis-24",
            finish: "Coal Black",
            displayLabel: 'ESF Sink — Precis 24" Sink · Coal Black'
          }
        }
      },
      backsplashDrafts: { kitchen: { mode: "none", optionKey: noneSplash } }
    }
  });
  assert.equal(saveA.ok, true, "initial save succeeds");

  const envBefore = await cfgRepo.getActiveEnvelope(ORG, publicationId);

  // Repair (idempotent reuse rebuilds envelope + migrates selections).
  const repaired = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: `repair-${randomUUID()}` }
  });
  assert.equal(repaired.envelope?.envelopeRebuilt, true);
  assert.equal(repaired.customerUrl, first.customerUrl, "same customer link");

  const envAfter = await cfgRepo.getActiveEnvelope(ORG, publicationId);
  assert.ok(envAfter?.id);
  assert.notEqual(envAfter.id, envBefore.id, "new active envelope");

  // Hard refresh — new session exchange (must restore migrated selections).
  const exB = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.equal(exB.state.lifecycle, "active");
  assert.ok(exB.state.configuration);
  const restored = exB.state.configuration.currentSelections || {};
  console.log(
    JSON.stringify({
      msg: "diag_after_repair_exchange",
      publicationId,
      activeEnvelopeId: envAfter.id,
      exchangeEnvelopeId:
        exB.state.configuration.envelopeId || exB.state.configuration.envelope_id,
      sessionId: exB.state.session?.id,
      restoredPositiveKeys: Object.entries(restored)
        .filter(([, q]) => Number(q) > 0)
        .map(([k]) => k),
      sessionMatchesActive:
        String(exB.state.configuration.envelopeId || exB.state.configuration.envelope_id || "") ===
        String(envAfter.id)
    })
  );
  assert.equal(
    Object.keys(restored).some((k) => k === "qty-sink" || /^qty-sink:/i.test(k)),
    false,
    "public currentSelections must not expose governed qty-sink after repair"
  );

  const optsB = keysByRole(exB.state.configuration?.options);
  const precis24b = optsB.sink.find((k) => k.includes("precis-24") && !k.includes("accessories"));
  const noneSplashB = optsB.backsplash.find((k) => k.endsWith(":none"));
  const stdSplashB = optsB.backsplash.find((k) => k.includes("standard_4in"));
  const antiqueB = optsB.material.find((k) => k.includes("antique-gray"));
  assert.ok(precis24b && noneSplashB && stdSplashB && antiqueB);

  // Simulate UI full-map save (buildSelectionItems) when changing backsplash —
  // includes ALL restored positive keys from exchange, not just the clicked role.
  const restoredItems = Object.entries(restored)
    .filter(([k, q]) => !String(k).startsWith("__") && Number(q) > 0)
    .map(([optionKey, quantity]) => ({
      optionKey,
      quantity: Number(quantity)
    }));
  // Replace none splash with standard_4in (user changed backsplash).
  const splashItems = restoredItems
    .filter((i) => !i.optionKey.startsWith("backsplash:"))
    .concat([{ optionKey: stdSplashB, quantity: 1 }]);
  console.log(
    JSON.stringify({
      msg: "diag_backsplash_save_payload",
      items: splashItems,
      priorOnSession: "expected_empty_until_fix"
    })
  );

  let splashErr = null;
  let splashSave = null;
  try {
    splashSave = await pubSvc.saveSelections({
      rawSecret: exB.rawSecret,
      body: {
        expectedRowVersion: exB.state.session.rowVersion,
        idempotencyKey: `splash-${randomUUID()}`,
        items: splashItems,
        backsplashDrafts: { kitchen: { mode: "standard_4in", optionKey: stdSplashB } },
        customerProductDrafts: {
          kitchen: {
            sink: {
              source: "esf",
              optionKey: precis24b,
              productId: "blanco:precis-24",
              finish: "Coal Black"
            }
          }
        }
      }
    });
  } catch (e) {
    splashErr = e;
    console.log(
      JSON.stringify({
        msg: "diag_backsplash_save_rejected",
        code: e?.code,
        diagnosticCode: e?.diagnosticCode,
        selectionKey: e?.selectionKey || null,
        reason: e?.reason || null,
        message: e?.message,
        envelopeId: envAfter.id,
        itemKeys: splashItems.map((i) => i.optionKey)
      })
    );
  }
  assert.equal(
    splashErr,
    null,
    `backsplash save after repair must succeed; rejected key=${splashErr?.selectionKey || splashErr?.message}`
  );
  assert.equal(splashSave?.ok, true);

  // Sink re-save with finish in draft only + full map (same as UI).
  const sinkItems = Object.entries({
    ...(splashSave?.configuration?.currentSelections || restored),
    [precis24b]: 1,
    [stdSplashB]: 1,
    [noneSplashB]: 0
  })
    .filter(([k, q]) => !String(k).startsWith("__") && Number(q) > 0)
    .map(([optionKey, quantity]) => ({ optionKey, quantity: Number(quantity) }));
  // Prefer post-save qty if API returns it; else reuse splashItems with sink family key.
  const sinkPayload =
    sinkItems.length > 0
      ? sinkItems
      : splashItems.map((i) =>
          i.optionKey.startsWith("sink:") ? { optionKey: precis24b, quantity: 1 } : i
        );

  const sinkSave = await pubSvc.saveSelections({
    rawSecret: exB.rawSecret,
    body: {
      expectedRowVersion: splashSave.session.rowVersion,
      idempotencyKey: `sink-${randomUUID()}`,
      items: sinkPayload,
      customerProductDrafts: {
        kitchen: {
          sink: {
            source: "esf",
            optionKey: precis24b,
            productId: "blanco:precis-24",
            variantId: "blanco:precis-24:sku:522258",
            finish: "Coal Black",
            displayLabel: 'ESF Sink — Precis 24" Sink · Coal Black'
          }
        }
      },
      backsplashDrafts: { kitchen: { mode: "standard_4in", optionKey: stdSplashB } }
    }
  });
  assert.equal(sinkSave.ok, true, "sink save after repair succeeds");

  // Material change after repair (full map).
  const otherMat =
    optsB.material.find((k) => k.includes("carrara-classic")) ||
    optsB.material.find((k) => k !== antiqueB);
  assert.ok(otherMat);
  const matItems = sinkPayload
    .filter((i) => !i.optionKey.startsWith("material:"))
    .concat([{ optionKey: otherMat, quantity: 1 }]);
  const matSave = await pubSvc.saveSelections({
    rawSecret: exB.rawSecret,
    body: {
      expectedRowVersion: sinkSave.session.rowVersion,
      idempotencyKey: `mat-${randomUUID()}`,
      items: matItems
    }
  });
  assert.equal(matSave.ok, true, "material save after repair succeeds");

  // Off-envelope still fails with identifiable key (staff/test metadata).
  await assert.rejects(
    () =>
      pubSvc.saveSelections({
        rawSecret: exB.rawSecret,
        body: {
          expectedRowVersion: matSave.session.rowVersion,
          idempotencyKey: `off-${randomUUID()}`,
          items: [
            { optionKey: otherMat, quantity: 1 },
            { optionKey: "sink:kitchen:not-a-real-option", quantity: 1 }
          ]
        }
      }),
    (e) => {
      assert.equal(e.code, "selection_unavailable");
      assert.equal(e.selectionKey, "sink:kitchen:not-a-real-option");
      assert.ok(
        e.diagnosticCode === "DE-OPTION-NOT-ALLOWED" || e.diagnosticCode === "DE-EXCHANGE-404"
      );
      return true;
    }
  );

  // Stale finish-specific sink key in a full map must remap to family (not fail)
  // when family row exists; a truly foreign key must still fail and name itself.
  await assert.rejects(
    () =>
      pubSvc.saveSelections({
        rawSecret: exB.rawSecret,
        body: {
          expectedRowVersion: matSave.session.rowVersion,
          idempotencyKey: `poison-${randomUUID()}`,
          items: [
            ...matItems,
            { optionKey: "specialty:kitchen:esf:not-in-envelope-xyz", quantity: 1 }
          ]
        }
      }),
    (e) => {
      assert.equal(e.code, "selection_unavailable");
      assert.equal(e.selectionKey, "specialty:kitchen:esf:not-in-envelope-xyz");
      return true;
    }
  );

  console.log("ok: post-repair hard-refresh full-map saves succeed; off-envelope key diagnostics work");
}

console.log("\nAll selectionSaveAfterRepair tests passed.\n");
