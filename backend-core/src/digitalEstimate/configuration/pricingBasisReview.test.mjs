/**
 * Staff-only pricing-basis review: lists active pre-pin publications whose basis cannot be
 * established, with project, published scope, total and evidence. Read-only and org-scoped.
 * Run: node backend-core/src/digitalEstimate/configuration/pricingBasisReview.test.mjs
 */
import assert from "node:assert/strict";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { buildPricingBasisReview } from "./pricingBasisReview.mjs";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function header(org, id, n) {
  return {
    id,
    organization_id: org,
    quote_source: "internal_quote",
    quote_number: `ESF-REV-${n}`,
    quote_number_base: `ESF-REV-${n}`,
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: id,
    is_current_revision: true,
    archived_at: null,
    customer_name: `Synthetic ${n}`,
    project_name: `Kitchen ${n}`,
    project_address: `${n} Synthetic St`,
    estimated_material_group: "Group B",
    partner_account_id: null,
    calculation_snapshot: {
      materialGroup: "Group B",
      materialProgramDefault: "elite_100",
      pricingEngine: "elite100_v4",
      totals: { retail: 870, wholesale: 800, estimated_sqft: 10 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 870,
        pricing_basis: "direct",
        estimate_rooms: [{ id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }],
        customer_estimate_print_snapshot: { finalRounded: 870 }
      }
    }
  };
}

const repo = createInMemoryDigitalEstimateRepository();
const ids = {
  pinned: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
  legacyBasis: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
  noBasis: "aaaaaaaa-aaaa-4aaa-8aaa-000000000003",
  otherOrgNoBasis: "bbbbbbbb-bbbb-4bbb-8bbb-000000000004"
};
const seeds = [
  [ORG_A, ids.pinned, "001"],
  [ORG_A, ids.legacyBasis, "002"],
  [ORG_A, ids.noBasis, "003"],
  [ORG_B, ids.otherOrgNoBasis, "004"]
];
for (const [org, id, n] of seeds) {
  repo.seedQuote(header(org, id, n));
  await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: org,
    actorUserId: "u1",
    repository: repo,
    body: { quoteId: id, confirm: true }
  });
}

const pubByQuote = new Map(repo._dump().publications.map((p) => [p.source_quote_id, p]));
const snapFor = (quoteId) => repo._dump().snapshots.find((s) => s.publication_id === pubByQuote.get(quoteId).id);

for (const s of repo._dump().snapshots) assert.ok(s.pricing_evidence_json.pricingPin, "new publications are pinned");

// Simulate pre-pin publications.
function stripPin(quoteId, { dropBasis }) {
  const ev = snapFor(quoteId).pricing_evidence_json;
  delete ev.pricingPin;
  if (dropBasis) {
    delete ev.calculationSnapshotCopy.internal_ui.pricing_basis;
    delete ev.calculationSnapshotCopy.pricingBasis;
  }
}
stripPin(ids.legacyBasis, { dropBasis: false });
stripPin(ids.noBasis, { dropBasis: true });
stripPin(ids.otherOrgNoBasis, { dropBasis: true });

const before = JSON.stringify(repo._dump());
const review = await buildPricingBasisReview({
  organizationId: ORG_A,
  deRepository: repo,
  now: () => new Date("2026-09-29T12:00:00Z")
});

{
  assert.equal(review.scannedUnpinnedActive, 2, "pinned publication excluded; other org excluded");
  assert.equal(review.legacyWithEstablishedBasis, 1);
  assert.equal(review.count, 1);
  const item = review.items[0];
  assert.equal(item.publicationId, pubByQuote.get(ids.noBasis).id);
  assert.equal(item.quoteNumber, "ESF-REV-003");
  assert.equal(item.blocker.code, "pricing_basis_unestablished");
  assert.equal(item.publishedTotal, snapFor(ids.noBasis).customer_snapshot_json.totals.estimatedProjectTotal);
  assert.ok(Array.isArray(item.publishedScope.rooms));
  assert.equal(item.evidence.recordedPricingBasis, null);
  assert.equal(item.evidence.calculatorTotals.retail, 870);
  assert.equal(item.evidence.calculatorTotals.wholesale, 800);
  assert.ok(
    ["matches_retail_total", "matches_neither", "matches_both", "no_calculator_totals"].includes(
      item.evidence.publishedTotalMatches
    )
  );
  assert.equal(item.evidence.measuredRooms[0].materialGroup, "group_b");
  console.log("ok: review lists only this org's active publications whose basis cannot be established");
}

{
  assert.equal(JSON.stringify(repo._dump()), before, "review is read-only: nothing pinned, republished or revoked");
  for (const p of repo._dump().publications) assert.equal(p.status, "active");
  console.log("ok: review does not pin, republish or revoke");
}

{
  const other = await buildPricingBasisReview({ organizationId: ORG_B, deRepository: repo });
  assert.equal(other.count, 1);
  assert.equal(other.items[0].publicationId, pubByQuote.get(ids.otherOrgNoBasis).id);
  assert.ok(!other.items.some((i) => i.publicationId === pubByQuote.get(ids.noBasis).id));
  await assert.rejects(
    buildPricingBasisReview({ organizationId: "", deRepository: repo }),
    (e) => e.code === "organization_required" && e.statusCode === 403
  );
  console.log("ok: cross-org isolation; organization required");
}

{
  // Studio-style evidence: Promo 30.63 SF, published 1406 = 30.63 × 45 × 1.02 (wholesale).
  const fakeRepo = {
    async listActivePublicationsWithoutPricingPin(org) {
      assert.equal(org, ORG_A);
      return [
        {
          publication: { id: "p-w", quote_number: "SE-W", status: "active" },
          customerSnapshot: { totals: { estimatedProjectTotal: 1406 }, rooms: [{ name: "Reception Desk", materialLabel: "Group Promo" }] },
          pricingEvidence: {
            calculationSnapshotCopy: {
              pricingEngine: "quoteCalculator+studioTrustedOverlays",
              totals: { customerDisplayTotal: 1406 },
              internal_ui: { estimate_rooms: [{ name: "Reception Desk", materialGroup: "Group Promo", countertopSqft: 30.63, backsplashSqft: 0 }] }
            }
          },
          envelopes: [],
          acceptanceCount: 0
        }
      ];
    }
  };
  const r = await buildPricingBasisReview({ organizationId: ORG_A, deRepository: fakeRepo });
  const chk = r.items[0].evidence.materialOnlyCheck;
  assert.equal(chk.wholesaleMaterialOnly, 1405.92);
  assert.equal(chk.retailMaterialOnly, 2186.98);
  assert.equal(chk.consistentWith, "wholesale_only");
  assert.equal(r.items[0].blocker.code, "pricing_basis_unestablished", "evidence never establishes the basis");
  console.log("ok: material-only check flags retail as impossible, without establishing a basis");
}

{
  const serialized = JSON.stringify(review);
  assert.doesNotMatch(serialized, /accessToken|token_hash|rawToken|service_role/i, "no token material in review");
  console.log("ok: review carries no token material");
}
