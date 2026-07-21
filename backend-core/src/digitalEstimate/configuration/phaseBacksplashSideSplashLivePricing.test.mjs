/**
 * Live-pricing regressions — hosted "No backsplash still $248" and
 * "side splash saves but never changes price" defects.
 *
 * Full public configuration service path (exchange → save → persist →
 * resume), not just the pure projection helpers.
 *
 * Run: node backend-core/src/digitalEstimate/configuration/phaseBacksplashSideSplashLivePricing.test.mjs
 */
import assert from "node:assert/strict";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import { createPublicConfigurationService } from "./publicConfigurationService.mjs";
import { hashConfigurationSessionSecret } from "./publicConfigurationSession.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import { resolveSideSplashPriceEffect } from "../catalog/digitalEstimateProductOptions.mjs";
import { buildRoomPricingPublishSnapshot } from "./roomPricingPublishSnapshot.mjs";

console.log("\nphaseBacksplashSideSplashLivePricing.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

// Kitchen fixture:
//  - two countertop pieces (20.4→21, 18.2→19) = 40 billed SF
//  - governed standard 4" backsplash: 198 in × 4 in / 144 = 5.5 → 6 billed SF
//  - Group B direct $85/SF → backsplash = $510
//  - Sink Run depth 25.5 in; Peninsula depth 40 in (side-splash candidates)
const ROOM_EVIDENCE = {
  id: "kitchen",
  name: "Kitchen",
  countertopSqft: 40,
  backsplashSqft: 5.5,
  backsplashHeightMode: "standard",
  backsplashMeasuredLengthIn: 198,
  materialGroup: "group_b",
  pieces: [
    {
      id: "p1",
      name: "Sink Run",
      pieceType: "counter",
      sqft: 20.4,
      depthIn: 25.5,
      included: true,
      sideSplashLeftEligible: true,
      sideSplashRightEligible: true
    },
    {
      id: "p2",
      name: "Peninsula",
      pieceType: "counter",
      sqft: 18.2,
      depthIn: 40,
      included: true,
      sideSplashLeftEligible: true,
      sideSplashRightEligible: true
    }
  ]
};

function eliteHeader() {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-DYER-000300",
    quote_number_base: "ESF-DYER-000300",
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
      totals: { retail: 5000, wholesale: 4600, estimated_sqft: 46 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 5000,
        estimate_rooms: [ROOM_EVIDENCE],
        customer_estimate_print_snapshot: { finalRounded: 5000 }
      }
    }
  };
}

async function seed() {
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
      internal_ui: { estimate_rooms: [ROOM_EVIDENCE] }
    }
  };
  snap.customer_snapshot_json = {
    ...(snap.customer_snapshot_json || {}),
    totals: { estimatedProjectTotal: 5000 },
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
  const addOption = (optionKey, displayLabel, compatibilityJson = {}, defaultQty = 0) =>
    cfgRepo.upsertDraftOption(ORG, draft.id, {
      groupId: group.id,
      optionKey,
      displayLabel,
      defaultQty,
      sellPrice: 0,
      compatibilityJson
    });

  await addOption(
    "material:kitchen:group_b",
    "Kitchen — Group B",
    { roomKey: "kitchen", materialGroup: "group_b", role: "material_selection" },
    1
  );
  await addOption("material:kitchen:group_f", "Kitchen — Group F", {
    roomKey: "kitchen",
    materialGroup: "group_f",
    role: "material_selection"
  });
  await addOption(
    "backsplash:kitchen:standard_4in",
    "Kitchen — 4-inch backsplash",
    { roomKey: "kitchen", role: "backsplash_selection" },
    1
  );
  await addOption("backsplash:kitchen:none", "Kitchen — No backsplash", {
    roomKey: "kitchen",
    role: "backsplash_selection"
  });
  for (const [pieceKey, pieceDisplayName, pieceIndex] of [
    ["p1", "Sink Run", 1],
    ["p2", "Peninsula", 2]
  ]) {
    for (const mode of ["none", "left", "right", "both"]) {
      await addOption(
        `sidesplash:kitchen:${pieceKey}:${mode}`,
        `${pieceDisplayName} — ${mode}`,
        {
          roomKey: "kitchen",
          pieceKey,
          pieceDisplayName,
          pieceIndex,
          role: "sidesplash_selection",
          sideSplashMode: mode
        },
        mode === "none" ? 1 : 0
      );
    }
  }
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
  const exchanged = await service.exchangePublicationToken({
    rawToken: published.accessToken
  });
  return { service, cfgRepo, exchanged };
}

async function saveWith(service, cfgRepo, rawSecret, body) {
  const sess = await cfgRepo.getSessionBySecretHash(hashConfigurationSessionSecret(rawSecret));
  return service.saveSelections({
    rawSecret,
    body: {
      expectedRowVersion: sess.row_version,
      idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
      ...body
    }
  });
}

function roomPricingOf(saved) {
  return saved.calculation?.roomPricing || null;
}

const BASE_ITEMS = [
  { optionKey: "material:kitchen:group_b", quantity: 1 },
  { optionKey: "backsplash:kitchen:standard_4in", quantity: 1 }
];

// ---------------------------------------------------------------------------
// 1-6. No-backsplash zero through the complete service/serializer path
// ---------------------------------------------------------------------------
{
  const { service, cfgRepo, exchanged } = await seed();
  const raw = exchanged.rawSecret;

  const withSplash = await saveWith(service, cfgRepo, raw, {
    items: BASE_ITEMS,
    backsplashDrafts: { kitchen: { mode: "standard_4in" } }
  });
  const rpWith = roomPricingOf(withSplash);
  assert.ok(rpWith, "roomPricing present on save");
  // Frozen publish-time snapshot carves the display total SF-weighted, so the
  // governed backsplash amount is the frozen carve-out — a positive amount the
  // customer sees in Updated and must lose exactly when selecting None.
  const splashCents = rpWith.rooms[0].backsplash?.amountCents;
  assert.ok(Number(splashCents) > 0, "governed backsplash amount frozen and displayed");
  const totalWith = Number(withSplash.calculation.configuredDisplayTotal);

  // 1+2: public save of mode none returns Backsplash 0 through the full serializer.
  const noneSave = await saveWith(service, cfgRepo, raw, {
    items: [
      { optionKey: "material:kitchen:group_b", quantity: 1 },
      { optionKey: "backsplash:kitchen:none", quantity: 1 }
    ],
    backsplashDrafts: { kitchen: { mode: "none" } }
  });
  assertPublicConfigurationHasNoForbiddenContent(noneSave.calculation);
  const rpNone = roomPricingOf(noneSave);
  assert.equal(rpNone.rooms[0].backsplash.amountCents, 0, "public DTO backsplash = 0");
  assert.equal(rpNone.rooms[0].backsplashAmount, 0);

  // 3: frontend Updated contract receives the authoritative zero.
  assert.equal(rpNone.rooms[0].backsplash.displayAmount, 0);

  // 4: configured total decreases by the exact frozen governed backsplash amount.
  const totalNone = Number(noneSave.calculation.configuredDisplayTotal);
  assert.equal(Math.round((totalWith - totalNone) * 100), splashCents);

  // 5: refresh/reload (resume) retains 0.
  const resumed = await service.resumeFromSessionSecret({ rawSecret: raw });
  const latest = resumed.configuration.latestCalculation;
  assert.equal(latest.roomPricing.rooms[0].backsplash.amountCents, 0);
  assert.equal(resumed.configuration.backsplashDrafts.kitchen.mode, "none");

  // 6: a later save that omits backsplash entirely (the hosted stale-selection
  // shape: draft persisted "none", selection map untouched) cannot restore $510.
  const materialOnly = await saveWith(service, cfgRepo, raw, {
    items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }]
  });
  const rpStale = roomPricingOf(materialOnly);
  assert.equal(
    rpStale.rooms[0].backsplash.amountCents,
    0,
    "persisted draft mode none outranks stale/omitted backsplash selection"
  );
  assert.equal(
    Math.round(
      (Number(materialOnly.calculation.configuredDisplayTotal) - totalNone) * 100
    ),
    0
  );
  console.log("ok: 1-6. none → $0 through save/serialize/reload; stale save cannot restore it");
}

// ---------------------------------------------------------------------------
// 7-14. Side-splash pricing authority (depth × configured height × room rate)
// ---------------------------------------------------------------------------
{
  const { service, cfgRepo, exchanged } = await seed();
  const raw = exchanged.rawSecret;

  const base = await saveWith(service, cfgRepo, raw, {
    items: BASE_ITEMS,
    backsplashDrafts: { kitchen: { mode: "standard_4in" } }
  });
  const baseTotal = Number(base.calculation.configuredDisplayTotal);
  const baseBacksplashCents = roomPricingOf(base).rooms[0].backsplash.amountCents;

  // 7: Right side = one priced section. Sink Run 25.5×4/144=0.708→1 SF × $85.
  const right = await saveWith(service, cfgRepo, raw, {
    items: [...BASE_ITEMS, { optionKey: "sidesplash:kitchen:p1:right", quantity: 1 }]
  });
  const rightTotal = Number(right.calculation.configuredDisplayTotal);
  assert.equal(Math.round((rightTotal - baseTotal) * 100), 8500, "Right = 1 SF × $85");

  // 15: line appears under room Add-ons with the customer-safe label.
  const rpRight = roomPricingOf(right);
  const sideLine = (rpRight.rooms[0].addOnLines || []).find((l) =>
    /^Side splash/i.test(String(l.label))
  );
  assert.ok(sideLine, "side-splash line under room Add-ons");
  assert.match(sideLine.label, /Right side/);
  assert.match(sideLine.label, /Sink Run/);
  assert.equal(sideLine.amountCents, 8500);

  // 16: backsplash category unchanged by side splash — the side-splash dollars
  // live only under Add-ons, never inside the primary Backsplash amount.
  assert.equal(rpRight.rooms[0].backsplash.amountCents, baseBacksplashCents);

  // 8: Left side = one priced section (same independent section math).
  const left = await saveWith(service, cfgRepo, raw, {
    items: [...BASE_ITEMS, { optionKey: "sidesplash:kitchen:p1:left", quantity: 1 }]
  });
  assert.equal(
    Math.round((Number(left.calculation.configuredDisplayTotal) - baseTotal) * 100),
    8500
  );

  // 9: Both = two independent sections (2 × 1 SF).
  const both = await saveWith(service, cfgRepo, raw, {
    items: [...BASE_ITEMS, { optionKey: "sidesplash:kitchen:p1:both", quantity: 1 }]
  });
  assert.equal(
    Math.round((Number(both.calculation.configuredDisplayTotal) - baseTotal) * 100),
    17000
  );

  // 11: side splash uses run depth — Peninsula (40 in) bills 40×4/144=1.11→2 SF.
  const peninsula = await saveWith(service, cfgRepo, raw, {
    items: [...BASE_ITEMS, { optionKey: "sidesplash:kitchen:p2:right", quantity: 1 }]
  });
  assert.equal(
    Math.round((Number(peninsula.calculation.configuredDisplayTotal) - baseTotal) * 100),
    17000,
    "deeper run bills more SF"
  );

  // 10+12: each side rounds independently at the configured backsplash height.
  // Custom 12" height: per side 25.5×12/144=2.125→3 SF; Both = 6 SF (a combined
  // ceiling would give ceil(4.25)=5 SF).
  const effectBoth12 = resolveSideSplashPriceEffect({
    mode: "both",
    depthIn: 25.5,
    heightIn: 12,
    materialRateCents: 8500
  });
  assert.equal(effectBoth12.billedSfPerSide, 3);
  assert.equal(effectBoth12.amountCents, 6 * 8500);

  // 13+14: configured room material group reprices side splash (Promo→F analog:
  // B $85 → F $135 shares the room rate authority).
  const groupF = await saveWith(service, cfgRepo, raw, {
    items: [
      { optionKey: "material:kitchen:group_f", quantity: 1 },
      { optionKey: "backsplash:kitchen:standard_4in", quantity: 1 },
      { optionKey: "sidesplash:kitchen:p1:right", quantity: 1 }
    ]
  });
  const rpF = roomPricingOf(groupF);
  const sideLineF = (rpF.rooms[0].addOnLines || []).find((l) =>
    /^Side splash/i.test(String(l.label))
  );
  assert.equal(sideLineF.amountCents, 13500, "1 SF × Group F $135");
  assert.ok(
    rpF.rooms[0].backsplash.amountCents > baseBacksplashCents,
    "primary backsplash reprices upward at the same configured room rate"
  );

  // 17: back to None removes the charge exactly once.
  const backToNone = await saveWith(service, cfgRepo, raw, {
    items: [...BASE_ITEMS, { optionKey: "sidesplash:kitchen:p1:none", quantity: 1 }]
  });
  assert.equal(
    Math.round((Number(backToNone.calculation.configuredDisplayTotal) - baseTotal) * 100),
    0
  );

  // 18: Changes view shows the side-splash change.
  const rightAgain = await saveWith(service, cfgRepo, raw, {
    items: [...BASE_ITEMS, { optionKey: "sidesplash:kitchen:p1:right", quantity: 1 }]
  });
  const changes = rightAgain.calculation.roomPricingChanges;
  assert.ok(changes, "roomPricingChanges present");
  const changeRows = JSON.stringify(changes);
  assert.match(changeRows, /Side splash/i, "Changes mentions the side splash");

  // Persistence after refresh (option effects + selection).
  const resumed = await service.resumeFromSessionSecret({ rawSecret: raw });
  assert.equal(
    resumed.configuration.currentSelections["sidesplash:kitchen:p1:right"],
    1
  );
  console.log("ok: 7-18. side-splash sections price, reprice, restore, and appear in Changes");
}

// ---------------------------------------------------------------------------
// Option effects: backend authoritative price effect for every side-splash mode
// ---------------------------------------------------------------------------
{
  const { service, exchanged } = await seed();
  const raw = exchanged.rawSecret;
  const resumed = await service.resumeFromSessionSecret({ rawSecret: raw });
  const options = resumed.configuration.options.filter((o) =>
    o.optionKey.startsWith("sidesplash:kitchen:p1:")
  );
  assert.equal(options.length, 4);
  const byMode = new Map(options.map((o) => [o.optionKey.split(":").pop(), o]));
  assert.equal(byMode.get("none").priceEffectLabel, "Original selection");
  assert.equal(byMode.get("none").priceEffectCents, 0);
  assert.equal(byMode.get("right").priceEffectCents, 8500);
  assert.match(byMode.get("right").priceEffectLabel, /^\+\$85/);
  assert.equal(byMode.get("left").priceEffectCents, 8500);
  assert.equal(byMode.get("both").priceEffectCents, 17000);
  assert.match(byMode.get("both").priceEffectLabel, /^\+\$170/);
  // Peninsula depth 40 → 2 SF per side.
  const p2Right = resumed.configuration.options.find(
    (o) => o.optionKey === "sidesplash:kitchen:p2:right"
  );
  assert.equal(p2Right.priceEffectCents, 17000);
  console.log("ok: option effects — None/Left/Right/Both carry backend-priced deltas");
}

// ---------------------------------------------------------------------------
// 19. Public DTO exposes no depth / SF / rate / internal ids
// ---------------------------------------------------------------------------
{
  const { service, cfgRepo, exchanged } = await seed();
  const raw = exchanged.rawSecret;
  const saved = await saveWith(service, cfgRepo, raw, {
    items: [...BASE_ITEMS, { optionKey: "sidesplash:kitchen:p1:both", quantity: 1 }],
    backsplashDrafts: { kitchen: { mode: "standard_4in" } }
  });
  assertPublicConfigurationHasNoForbiddenContent(saved.calculation);
  const rawJson = JSON.stringify(saved.calculation);
  for (const forbidden of [
    "depthIn",
    "billedSf",
    "billedSfPerSide",
    "materialRateCents",
    "ratePerSf",
    "configuredMaterialRateCents",
    "sideSplashHeightInches"
  ]) {
    assert.equal(rawJson.includes(forbidden), false, `public DTO leaks ${forbidden}`);
  }
  const resumed = await service.resumeFromSessionSecret({ rawSecret: raw });
  const optJson = JSON.stringify(resumed.configuration.options);
  for (const forbidden of ["depthIn", "billedSf", "materialRateCents", "ratePerSf"]) {
    assert.equal(optJson.includes(forbidden), false, `option DTO leaks ${forbidden}`);
  }
  console.log("ok: 19. no depth/SF/rate/internal pricing fields in public DTOs");
}

// ---------------------------------------------------------------------------
// 20. Newly published Original snapshot carries sink + cutout + trip + totals
// ---------------------------------------------------------------------------
{
  const snap = buildRoomPricingPublishSnapshot({
    estimateId: "est-1",
    quoteNumber: "SE-NEW00001",
    revision: 2,
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        countertopSqft: 40,
        backsplashSqft: 6,
        backsplashHeightMode: "standard",
        materialGroup: "Group B"
      }
    ],
    customerDisplayTotalCents: 550_000,
    fabricationAddOns: { "qty-sink": 1, "qty-ss": 1 },
    customLineItems: [
      { name: "Trip charge", quantity: 1, unitPrice: 150, customerFacing: true, category: "Service" }
    ]
  });
  const room = snap.rooms[0];
  assert.ok(room.countertopAmountCents > 0, "original Countertop");
  assert.ok(room.backsplashAmountCents > 0, "original Backsplash");
  const frozenLines = [
    ...snap.rooms.flatMap((r) => r.customerFacingLines || []),
    ...(snap.projectAddOnLines || [])
  ]
    .map((l) => String(l.label || ""))
    .join("|");
  assert.match(frozenLines, /sink/i, "original sink line frozen");
  assert.match(frozenLines, /cutout/i, "original sink cutout line frozen");
  assert.match(frozenLines, /trip/i, "original trip charge frozen");
  const roomsSum = snap.rooms.reduce((s, r) => s + r.roomTotalCents, 0);
  assert.equal(snap.totalCents, 550_000, "original project total");
  assert.equal(roomsSum, snap.roomSubtotalCents, "original room totals reconcile");
  console.log("ok: 20. newly published Original freezes sink, cutout, trip, and totals");
}

console.log("\nAll phaseBacksplashSideSplashLivePricing tests passed.\n");
