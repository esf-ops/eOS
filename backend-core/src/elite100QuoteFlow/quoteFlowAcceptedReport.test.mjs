/**
 * Quote Flow accepted-job report (internal staff).
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowAcceptedReport.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  buildQuoteFlowAcceptedReport,
  createQuoteFlowAcceptedReportService,
  measuredPieceSfFromScope,
  presentQuoteFlowAcceptance
} from "./quoteFlowAcceptedReport.mjs";
import { ceilBillableSquareFeet } from "../quotes/billableSquareFeet.mjs";
import { createInMemoryStudioLifecycleRepository } from "../elite100EstimateStudio/studioLifecycleRepository.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nquoteFlowAcceptedReport.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const EST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

function makeEstimate(extras = {}) {
  const pieceMeasured = measuredPieceSfFromScope({
    lengthIn: 96,
    depthIn: 25.5,
    quantity: 1
  });
  const pieceBilled = ceilBillableSquareFeet(pieceMeasured);
  return {
    id: EST,
    intakeCaseId: "case-1",
    takeoffJobId: "to-1",
    revision: 2,
    status: "approved",
    customerIdentitySnapshot: {
      displayName: "Jordan Customer",
      email: "jordan@example.com"
    },
    scope: {
      projectName: "Accepted Kitchen",
      quoteFlowEstimateName: "Accepted Kitchen",
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          pieces: [
            {
              id: "p1",
              name: "Island",
              pieceType: "counter",
              lengthIn: 96,
              depthIn: 25.5,
              quantity: 1,
              included: true,
              openEdgeLf: 12
            }
          ]
        }
      ],
      quoteFlowPricing: {
        customLineItems: [
          {
            id: "c1",
            label: "Customer install credit",
            type: "credit",
            visibility: "customer",
            quantity: 1,
            unitAmount: -50,
            amount: -50
          },
          {
            id: "i1",
            label: "Shop scrap",
            type: "charge",
            visibility: "internal",
            quantity: 1,
            unitAmount: 25,
            amount: 25
          }
        ]
      },
      quoteFlowDigitalEstimate: {
        status: "published",
        publicationId: PUB,
        customerUrl: "http://localhost:5190/e/tok"
      }
    },
    calculationSnapshot: {
      pricingBasis: "wholesale",
      pricingVersion: 4,
      pricingEngine: "elite100-room-pricing-v1",
      totals: {
        customerDisplayTotal: 4310,
        exactInternalTotal: 4100
      },
      fabrication: {
        addOns: { "qty-sink": 1 },
        customLineItems: [
          {
            name: "Customer install credit",
            lineTotal: -50,
            customerFacing: true,
            commercialRole: "customer_charge"
          },
          {
            name: "Shop scrap",
            lineTotal: 25,
            customerFacing: false,
            commercialRole: "internal_only"
          }
        ]
      },
      elite100: {
        rooms: [
          {
            roomId: "kitchen",
            roomName: "Kitchen",
            materialGroup: "Group Promo",
            measuredCountertopSf: pieceMeasured,
            billedCountertopSf: pieceBilled,
            pieceSections: [
              {
                pieceId: "p1",
                pieceName: "Island",
                measuredSf: pieceMeasured,
                billedSf: pieceBilled
              }
            ],
            countertopMaterialSubtotal: 800,
            backsplashMaterialSubtotal: 100,
            cutoutsTotal: 200,
            cutouts: {
              kitchenSinkQty: 1,
              kitchenSinkCharge: 200,
              vanitySinkQty: 0,
              vanitySinkCharge: 0
            },
            sinkProductsTotal: 0,
            productsTotal: 75,
            materialUseTaxAmount: 40,
            exactTotal: 1215,
            edge: { profileLabel: "Eased" },
            backsplash: {
              selected: true,
              heightIn: 4,
              measuredSf: 8.2,
              billedSf: 9,
              materialSubtotal: 100
            },
            customerFacingLines: [
              { description: "Kitchen sink cutout", amount: 200, commercialRole: "customer_charge" }
            ],
            internalOnlyLines: [
              { description: "Shop scrap", amount: 25, commercialRole: "internal_only" }
            ],
            absorbedLines: []
          }
        ]
      }
    },
    ...extras
  };
}

function makeAcceptance(overrides = {}) {
  return {
    id: randomUUID(),
    organization_id: ORG,
    studio_estimate_id: EST,
    intake_case_id: "case-1",
    estimate_revision: 2,
    publication_id: PUB,
    customer_display_total: 4310,
    accepted_at: "2026-08-04T20:00:00.000Z",
    material_summary_json: [
      { roomId: "kitchen", roomName: "Kitchen", materialGroup: "Group Promo" }
    ],
    customer_configuration_json: {
      selectedMaterial: {
        colorId: "e100-carrara-classic",
        colorName: "Carrara Classic",
        roomId: "kitchen",
        materialGroup: "promo"
      }
    },
    customer_safe_snapshot_json: {
      acceptedAsPublished: true,
      acceptedAsConfigured: false,
      acceptedPublicationId: PUB,
      customerName: "Jordan Customer",
      projectName: "Accepted Kitchen",
      materialGroup: "Group Promo",
      totals: {
        customerDisplayTotal: 4310,
        publishedBaselineTotal: 4310
      }
    },
    ...overrides
  };
}

{
  const empty = buildQuoteFlowAcceptedReport(makeEstimate(), null);
  assert.equal(empty.status, "not_accepted");
  assert.equal(empty.report, null);
  assert.equal(empty.sideEffects.sold, false);
  assert.equal(empty.sideEffects.jobCreated, false);
  assert.equal(empty.sideEffects.quickbooksInvoiceCreated, false);
  assert.equal(empty.sideEffects.emailed, false);
  assert.equal(empty.sideEffects.handoffCreated, false);
  assert.equal(empty.sideEffects.mutated, false);
  console.log("ok: not accepted returns safe not-accepted state");
}

{
  const acceptance = makeAcceptance();
  const presented = presentQuoteFlowAcceptance(acceptance);
  assert.equal(presented.selectionSource, "published");
  assert.equal(presented.customerDisplayTotal, 4310);
  assert.equal(presented.acceptedAt, "2026-08-04T20:00:00.000Z");

  const report = buildQuoteFlowAcceptedReport(makeEstimate(), acceptance, {
    selectionReview: {
      pricedSelections: {
        rooms: [
          {
            roomKey: "kitchen",
            roomName: "Kitchen",
            material: { label: "Carrara Classic", group: "promo" },
            edge: { label: "Eased" },
            sink: { label: "Customer-provided sink" },
            faucet: { label: "ESF Faucet" },
            accessories: [{ label: "Soap dispenser", quantity: 1 }]
          }
        ]
      }
    }
  });
  assert.equal(report.status, "accepted");
  assert.ok(report.acceptance.publicationId === PUB);
  assert.equal(report.report.header.acceptedCustomerTotal, 4310);
  assert.equal(report.report.header.quickbooksInvoiceCreated, false);
  assert.match(String(report.report.purpose), /Internal report/i);

  const kitchen = report.report.rooms.find((r) => r.roomId === "kitchen");
  assert.ok(kitchen);
  assert.match(String(kitchen.material), /Carrara Classic/i);
  assert.match(String(kitchen.priceGroup), /promo|Group Promo/i);
  assert.match(String(kitchen.edgeProfile), /Eased/i);
  assert.match(String(kitchen.sink), /sink/i);
  assert.match(String(kitchen.faucet), /Faucet/i);
  assert.ok(kitchen.accessories.some((a) => /Soap/i.test(String(a.label))));
  assert.equal(kitchen.sinkCutout.kitchenSinkQty, 1);
  assert.equal(kitchen.sinkCutout.kitchenSinkCharge, 200);

  const piece = kitchen.pieces.find((p) => p.pieceId === "p1");
  assert.ok(piece);
  assert.equal(piece.rawSquareFeet, measuredPieceSfFromScope(piece));
  assert.equal(piece.roundedSquareFeet, ceilBillableSquareFeet(piece.rawSquareFeet));
  assert.equal(
    kitchen.roundingCheck.sumRoundedIncludedCountertopPieces,
    kitchen.countertopRoundedSf
  );
  assert.equal(kitchen.roundingCheck.matchesRoomTotal, true);
  assert.ok(kitchen.backsplash?.roundedSf === 9);

  assert.ok(report.report.lineItems.customerFacing.some((l) => /credit/i.test(l.label)));
  assert.ok(
    report.report.lineItems.internalOnly.some(
      (l) => l.internalOnly === true && /scrap/i.test(String(l.label))
    )
  );
  assert.ok(kitchen.internalOnlyLines.some((l) => l.internalOnly === true));

  assert.equal(report.report.invoicePreparation.acceptedCustomerTotal, 4310);
  assert.equal(report.report.invoicePreparation.sinkCutoutTotal, 200);
  assert.match(String(report.report.invoicePreparation.suggestedQuickBooksNotes), /No QuickBooks/i);
  assert.equal(report.sideEffects.sold, false);
  assert.equal(report.sideEffects.quickbooksInvoiceCreated, false);
  console.log("ok: accepted report rooms/pieces/selections/invoice prep; internal lines staff-only");
}

{
  const configured = makeAcceptance({
    customer_display_total: 4873,
    customer_safe_snapshot_json: {
      acceptedAsConfigured: true,
      acceptedAsPublished: false,
      acceptedPublicationId: PUB,
      acceptedSelectionId: randomUUID(),
      totals: {
        customerDisplayTotal: 4873,
        acceptedConfiguredTotal: 4873,
        publishedBaselineTotal: 4310,
        displayDelta: 563
      }
    }
  });
  const presented = presentQuoteFlowAcceptance(configured);
  assert.equal(presented.selectionSource, "customer_configured");
  assert.equal(presented.customerDisplayTotal, 4873);
  assert.equal(presented.publishedBaselineTotal, 4310);
  assert.equal(presented.difference, 563);
  console.log("ok: configured acceptance totals + difference");
}

{
  const lifecycle = createInMemoryStudioLifecycleRepository();
  const estimate = makeEstimate();
  const byId = new Map([[EST, estimate]]);
  const svc = createQuoteFlowAcceptedReportService({
    estimateRepository: {
      async getById(_org, id) {
        return byId.has(id) ? structuredClone(byId.get(id)) : null;
      }
    },
    lifecycleRepository: lifecycle,
    env: {}
  });
  const notYet = await svc.getAcceptedReport({ organizationId: ORG, estimateId: EST });
  assert.equal(notYet.status, "not_accepted");

  await lifecycle.createAcceptance({
    organizationId: ORG,
    intakeCaseId: "case-1",
    studioEstimateId: EST,
    estimateRevision: 2,
    publicationId: PUB,
    customerDisplayTotal: 4310,
    customerSafeSnapshot: {
      acceptedAsPublished: true,
      totals: { customerDisplayTotal: 4310, publishedBaselineTotal: 4310 }
    },
    materialSummary: [],
    customerConfiguration: {},
    termsVersion: "v1",
    publicationSnapshotHash: "h"
  });
  const accepted = await svc.getAcceptedReport({ organizationId: ORG, estimateId: EST });
  assert.equal(accepted.status, "accepted");
  assert.ok(accepted.acceptance.acceptedAt);
  assert.equal(accepted.sideEffects.mutated, false);
  console.log("ok: service reads existing lifecycle acceptance");
}

{
  const src = readFileSync(join(__dirname, "quoteFlowAcceptedReport.mjs"), "utf8");
  assert.match(src, /ceilBillableSquareFeet/);
  assert.match(src, /presentQuoteFlowAcceptance/);
  assert.doesNotMatch(src, /markSold|createJob|sendEmail|quickbooks\.|createInvoice/i);
  assert.match(src, /quickbooksInvoiceCreated:\s*false/);
  assert.match(src, /sold:\s*false/);
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /accepted-report/);
  assert.match(routes, /quoteFlowAcceptedReportService/);
  console.log("ok: route/source contracts; no sold/handoff/QB/email");
}

console.log("\nquoteFlowAcceptedReport.test.mjs: ok\n");
