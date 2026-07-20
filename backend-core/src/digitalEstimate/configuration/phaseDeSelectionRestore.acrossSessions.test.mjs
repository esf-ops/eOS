/**
 * Cross-session draft restore for the same active publication + envelope.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDeSelectionRestore.acrossSessions.test.mjs
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import { createPublicConfigurationService } from "./publicConfigurationService.mjs";
import { createConfigurationStudioService } from "./configurationStudioService.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM = "c1f2a3b4-5d6e-4f7a-8b9c-0d1e2f3a4b5c";
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

async function seedPublication(opts = {}) {
  const quoteId = opts.quoteId || QUOTE_ID;
  const roomId = opts.roomId || ROOM;
  const deRepo = createInMemoryDigitalEstimateRepository();
  deRepo.seedQuote({
    id: quoteId,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-RESTORE",
    quote_number_base: "ESF-RESTORE",
    revision_number: opts.revisionNumber || 1,
    revision_label: "R1",
    quote_family_root_id: quoteId,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Customer",
    project_name: "Kitchen",
    project_address: "1 Main",
    estimated_material_group: "Group Promo",
    partner_account_id: null,
    calculation_snapshot: {
      materialGroup: "Group Promo",
      materialProgramDefault: "elite_100",
      totals: { retail: 8361, wholesale: 8000, estimated_sqft: 68 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 8361,
        estimate_rooms: [
          {
            id: roomId,
            name: "Kitchen",
            countertopSqft: 68,
            backsplashSqft: 4,
            materialGroup: "promo"
          }
        ],
        customer_estimate_print_snapshot: { finalRounded: 8361 }
      }
    }
  });
  const published = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u1",
    repository: deRepo,
    body: { quoteId, confirm: true }
  });
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const publication = deRepo._dump().publications.find((p) => p.source_quote_id === quoteId);
  cfgRepo.seedPublication(publication);
  cfgRepo.seedSnapshot(deRepo._dump().snapshots.find((s) => s.publication_id === publication.id));
  const studio = createConfigurationStudioService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  const draft = await studio.createDraft(ORG, "u1", publication.id, {});
  const envelopeId = draft.envelope?.id || draft.id;
  const graph = await studio.getEnvelope(ORG, envelopeId);
  const matGroup = (graph.groups || []).find(
    (g) => (g.group_key || g.groupKey) === "material_by_room"
  );
  const indiaKey = `material:${roomId}:e100-india-black-pearl`;
  const carraraKey = `material:${roomId}:e100-carrara-classic`;
  await studio.putOptions(ORG, envelopeId, {
    options: [
      {
        groupId: matGroup.id,
        optionKey: carraraKey,
        displayLabel: "Carrara Classic",
        defaultQty: 1,
        includedInBaseline: true,
        requiredSelection: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: {
          roomKey: roomId,
          materialColorId: "e100-carrara-classic",
          role: "material_selection",
          isDefault: true
        }
      },
      {
        groupId: matGroup.id,
        optionKey: indiaKey,
        displayLabel: "India Black Pearl",
        defaultQty: 0,
        includedInBaseline: false,
        requiredSelection: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: {
          roomKey: roomId,
          materialColorId: "e100-india-black-pearl",
          role: "material_selection"
        }
      },
      {
        groupId: matGroup.id,
        optionKey: `backsplash:${roomId}:full_height`,
        displayLabel: "Full height",
        defaultQty: 0,
        includedInBaseline: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: { roomKey: roomId, role: "backsplash" }
      },
      {
        groupId: matGroup.id,
        optionKey: `sink:${roomId}:stock`,
        displayLabel: "Stock sink",
        defaultQty: 0,
        includedInBaseline: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: { roomKey: roomId, role: "sink" }
      },
      {
        groupId: matGroup.id,
        optionKey: `edge:${roomId}:d_edge`,
        displayLabel: "D edge",
        defaultQty: 0,
        includedInBaseline: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: { roomKey: roomId, role: "edge" }
      }
    ]
  });
  await studio.activate(ORG, envelopeId, { confirm: true, acknowledgeFreeze: true }, "u1");
  const service = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  return {
    published,
    service,
    cfgRepo,
    deRepo,
    publication,
    indiaKey,
    carraraKey,
    roomId
  };
}

{
  const { published, service, indiaKey, carraraKey } = await seedPublication();
  const first = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(first.state.lifecycle, "active");
  const sessionA = first.state.session.id;

  const saved = await service.saveSelections({
    rawSecret: first.rawSecret,
    body: {
      expectedRowVersion: first.state.session.rowVersion,
      idempotencyKey: "restore-save-1",
      items: [
        { optionKey: indiaKey, quantity: 1 },
        { optionKey: `backsplash:${ROOM}:full_height`, quantity: 1 },
        { optionKey: `sink:${ROOM}:stock`, quantity: 1 },
        { optionKey: `edge:${ROOM}:d_edge`, quantity: 1 }
      ],
      roomNotes: { [ROOM]: "Prefer polished finish" },
      projectNote: "Gate code 1234",
      customerInfoDraft: {
        customerName: "Pat Customer",
        projectName: "Kitchen remodel",
        phone: "555-0100",
        email: "pat@example.com",
        projectAddress: "1 Main St"
      },
      roomLabelDrafts: { [ROOM]: "Main Kitchen" }
    }
  });
  assert.equal(saved.ok, true);
  assert.equal(Number(saved.session.rowVersion), 2);
  assert.ok(Number(saved.calculation?.configuredDisplayTotal) >= 8361);

  // Fresh exchange = new session (hard refresh / new cookie)
  const second = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.notEqual(second.state.session.id, sessionA);
  assert.equal(second.state.lifecycle, "active");
  const qty = second.state.configuration.currentSelections || {};
  assert.equal(Number(qty[indiaKey]), 1, "new session must restore India Black Pearl");
  assert.notEqual(Number(qty[carraraKey] || 0), 1, "Carrara must not overwrite saved India");
  assert.equal(Number(qty[`backsplash:${ROOM}:full_height`]), 1);
  assert.equal(Number(qty[`sink:${ROOM}:stock`]), 1);
  assert.equal(Number(qty[`edge:${ROOM}:d_edge`]), 1);
  assert.equal(second.state.configuration.roomNotes?.[ROOM], "Prefer polished finish");
  assert.equal(second.state.configuration.projectNote, "Gate code 1234");
  assert.equal(second.state.configuration.customerInfoDraft?.customerName, "Pat Customer");
  assert.equal(second.state.configuration.roomLabelDrafts?.[ROOM], "Main Kitchen");
  assert.ok(second.state.configuration.latestCalculation);
  assert.equal(
    Number(second.state.configuration.latestCalculation.configuredDisplayTotal),
    Number(saved.calculation.configuredDisplayTotal)
  );
  console.log("ok: new session restores India Black Pearl + notes + options + totals");
}

{
  // Newest draft wins across multiple saves / sessions
  const { published, service, indiaKey, carraraKey } = await seedPublication({
    quoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  });
  const a = await service.exchangePublicationToken({ rawToken: published.accessToken });
  await service.saveSelections({
    rawSecret: a.rawSecret,
    body: {
      expectedRowVersion: a.state.session.rowVersion,
      idempotencyKey: "old-india",
      items: [{ optionKey: indiaKey, quantity: 1 }]
    }
  });
  const b = await service.exchangePublicationToken({ rawToken: published.accessToken });
  const savedCarrara = await service.saveSelections({
    rawSecret: b.rawSecret,
    body: {
      expectedRowVersion: b.state.session.rowVersion,
      idempotencyKey: "newer-carrara",
      items: [{ optionKey: carraraKey, quantity: 1 }],
      projectNote: "newest note"
    }
  });
  assert.equal(savedCarrara.ok, true);
  const c = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(Number(c.state.configuration.currentSelections?.[carraraKey]), 1);
  assert.equal(Number(c.state.configuration.currentSelections?.[indiaKey] || 0), 0);
  assert.equal(c.state.configuration.projectNote, "newest note");
  console.log("ok: newest saved draft wins");
}

{
  // Cross-publication isolation
  const pubA = await seedPublication({ quoteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  const pubB = await seedPublication({
    quoteId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    roomId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
  });
  const a = await pubA.service.exchangePublicationToken({ rawToken: pubA.published.accessToken });
  await pubA.service.saveSelections({
    rawSecret: a.rawSecret,
    body: {
      expectedRowVersion: a.state.session.rowVersion,
      idempotencyKey: "iso-a",
      items: [{ optionKey: pubA.indiaKey, quantity: 1 }],
      projectNote: "only A"
    }
  });
  const b = await pubB.service.exchangePublicationToken({ rawToken: pubB.published.accessToken });
  assert.equal(Number(b.state.configuration.currentSelections?.[pubA.indiaKey] || 0), 0);
  assert.equal(b.state.configuration.projectNote, null);
  // Baseline Carrara for B's room (or empty until default hydration)
  const bIndia = `material:${pubB.roomId}:e100-india-black-pearl`;
  assert.equal(Number(b.state.configuration.currentSelections?.[bIndia] || 0), 0);
  console.log("ok: another publication does not inherit selections");
}

{
  // View-model / App hydrate: persisted draft must win over baseline defaults
  const viewModel = readFileSync(
    join(__dirname, "../../../../app-digital-estimate/src/lovableViewModel.ts"),
    "utf8"
  );
  assert.ok(viewModel.includes("persistedQty"));
  assert.ok(viewModel.includes("effectiveQty"));
  assert.ok(viewModel.includes("roomHasMaterialSelection"));
  const app = readFileSync(
    join(__dirname, "../../../../app-digital-estimate/src/App.tsx"),
    "utf8"
  );
  assert.ok(app.includes("key={configState.session?.id"));
  console.log("ok: view-model / App prefer persisted draft over baseline Carrara");
}

console.log("\nphaseDeSelectionRestore.acrossSessions.test.mjs");
