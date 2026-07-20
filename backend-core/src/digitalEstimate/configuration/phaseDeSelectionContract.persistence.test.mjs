/**
 * Selection contract persistence — fingerprint collision + invalid_selection.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDeSelectionContract.persistence.test.mjs
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import { createPublicConfigurationService } from "./publicConfigurationService.mjs";
import { createConfigurationStudioService } from "./configurationStudioService.mjs";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import { attachDigitalEstimateReviewRequestRoutes } from "./reviewRequestRoutes.js";
import { createInMemoryAmendmentRepository } from "./amendmentRepository.mjs";
import express from "express";

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
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

async function seed() {
  const deRepo = createInMemoryDigitalEstimateRepository();
  deRepo.seedQuote({
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-SEL",
    quote_number_base: "ESF-SEL",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
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
            id: ROOM,
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
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const publication = deRepo._dump().publications[0];
  cfgRepo.seedPublication(publication);
  cfgRepo.seedSnapshot(deRepo._dump().snapshots[0]);
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
  await studio.putOptions(ORG, envelopeId, {
    options: [
      {
        groupId: matGroup.id,
        optionKey: `material:${ROOM}:e100-carrara-classic`,
        displayLabel: "Carrara Classic",
        defaultQty: 1,
        includedInBaseline: true,
        requiredSelection: true,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: {
          roomKey: ROOM,
          materialColorId: "e100-carrara-classic",
          role: "material_selection",
          isDefault: true
        }
      },
      {
        groupId: matGroup.id,
        optionKey: `material:${ROOM}:e100-india-black-pearl`,
        displayLabel: "India Black Pearl",
        defaultQty: 0,
        includedInBaseline: false,
        requiredSelection: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: {
          roomKey: ROOM,
          materialColorId: "e100-india-black-pearl",
          role: "material_selection"
        }
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
  return { published, service, cfgRepo, deRepo, pricing, publication };
}

{
  // Normalize must not re-add baseline Carrara when India Black Pearl is selected.
  const options = [
    {
      option_key: `material:${ROOM}:e100-carrara-classic`,
      included_in_baseline: true,
      required_selection: true,
      default_qty: 1,
      min_qty: 0,
      max_qty: 1,
      availability_state: "active"
    },
    {
      option_key: `material:${ROOM}:e100-india-black-pearl`,
      included_in_baseline: false,
      required_selection: false,
      default_qty: 0,
      min_qty: 0,
      max_qty: 1,
      availability_state: "active"
    }
  ];
  const normalized = normalizeSelectionPayload(
    { selections: { [`material:${ROOM}:e100-india-black-pearl`]: 1 } },
    options
  );
  assert.equal(normalized.selections[`material:${ROOM}:e100-india-black-pearl`], 1);
  assert.equal(normalized.selections[`material:${ROOM}:e100-carrara-classic`], undefined);
  console.log("ok: normalize keeps canonical India Black Pearl without re-adding Carrara");
}

{
  const { published, service, cfgRepo } = await seed();
  const a = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(a.state.lifecycle, "active");
  const indiaKey = `material:${ROOM}:e100-india-black-pearl`;
  const selectable = (a.state.configuration.materials || []).filter((m) => m.selectable !== false);
  assert.ok(selectable.some((m) => m.optionKey === indiaKey));

  const savedA = await service.saveSelections({
    rawSecret: a.rawSecret,
    body: {
      expectedRowVersion: a.state.session.rowVersion,
      idempotencyKey: "contract-a-1",
      items: [{ optionKey: indiaKey, quantity: 1 }]
    }
  });
  assert.equal(savedA.ok, true);
  assert.equal(Number(savedA.session.rowVersion), 2);

  // Second independent session with the same same-group color must also persist.
  const b = await service.exchangePublicationToken({ rawToken: published.accessToken });
  const savedB = await service.saveSelections({
    rawSecret: b.rawSecret,
    body: {
      expectedRowVersion: b.state.session.rowVersion,
      idempotencyKey: "contract-b-1",
      items: [{ optionKey: indiaKey, quantity: 1 }]
    }
  });
  assert.equal(savedB.ok, true);
  assert.equal(Number(savedB.session.rowVersion), 2);

  const resumed = await service.resumeFromSessionSecret({ rawSecret: b.rawSecret });
  const qty = resumed.configuration?.currentSelections || {};
  assert.equal(Number(qty[indiaKey] || 0), 1);

  await assert.rejects(
    () =>
      service.saveSelections({
        rawSecret: b.rawSecret,
        body: {
          expectedRowVersion: savedB.session.rowVersion,
          idempotencyKey: "contract-bad",
          items: [{ optionKey: "e100-india-black-pearl", quantity: 1 }]
        }
      }),
    (e) =>
      e.code === "invalid_selection" &&
      e.statusCode === 422 &&
      e.selectionKey === "e100-india-black-pearl"
  );

  await assert.rejects(
    () =>
      service.saveSelections({
        rawSecret: b.rawSecret,
        body: {
          expectedRowVersion: 1,
          idempotencyKey: "contract-stale",
          items: [{ optionKey: indiaKey, quantity: 1 }]
        }
      }),
    (e) =>
      (e.code === "row_version_conflict" || e.code === "stale_configuration") &&
      e.statusCode === 409
  );

  void cfgRepo;
  console.log("ok: cross-session same-group save + invalid_selection + stale row_version");
}

{
  const { published, service, cfgRepo, deRepo, pricing } = await seed();
  const exchanged = await service.exchangePublicationToken({ rawToken: published.accessToken });
  const app = express();
  const amendmentRepository = createInMemoryAmendmentRepository({
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });
  attachDigitalEstimateReviewRequestRoutes(app, {
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository,
    pricingPolicyRepository: pricing,
    mode: "memory"
  });
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/public-digital-estimate/v2/review-requests/current`, {
    headers: {
      Origin: "http://localhost:5190",
      Cookie: `de_cfg_session=${exchanged.rawSecret}`
    }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.reviewRequest, null);
  server.close();
  console.log("ok: review current returns 200 null for valid session with no request");
}

console.log("\nphaseDeSelectionContract.persistence.test.mjs");
