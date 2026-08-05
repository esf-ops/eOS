/**
 * Elite 100 Quote Flow — Activity tab + library row collapse.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowActivity.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildQuoteFlowActivityPayload,
  createQuoteFlowActivityService
} from "./quoteFlowActivity.mjs";
import { selectOfficialQuoteFlowLibraryRows } from "./quoteFlowLibraryRows.mjs";
import { createQuoteFlowEstimatesService } from "./quoteFlowEstimates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nquoteFlowActivity.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "case-activity-1";
const EST_R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const EST_R2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const EST_UNSCOPED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

function scopedRow(id, revision, extras = {}) {
  return {
    id,
    intakeCaseId: CASE,
    revision,
    status: "approved",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: `2026-08-0${revision}T12:00:00.000Z`,
    takeoffJobId: "to-1",
    approval: {
      approvedAt: "2026-08-02T15:00:00.000Z",
      approvedByUserId: "actor-1",
      calculationFingerprint: "fp-1",
      customerDisplayTotal: 4200
    },
    calculationSnapshot: {
      fingerprint: "fp-1",
      calculatedAt: "2026-08-02T14:00:00.000Z",
      pricingEngine: "elite100-room-pricing-v1",
      pricingVersion: 4,
      totals: { customerDisplayTotal: 4200, exactInternalTotal: 4000 }
    },
    scope: {
      projectName: "Activity Kitchen",
      rooms: [
        {
          id: "r1",
          name: "Kitchen",
          included: true,
          pieces: [{ id: "p1", name: "Island", included: true, openEdgeLf: 10, lengthIn: 96, depthIn: 25.5 }]
        }
      ],
      quoteFlowReview: {
        status: "approved",
        approvedAt: "2026-08-02T15:00:00.000Z",
        approvedByUserId: "actor-1",
        calculationFingerprint: "fp-1"
      },
      quoteFlowDigitalEstimate: {
        status: "published",
        publishedAt: "2026-08-03T16:00:00.000Z",
        publishedByUserId: "actor-1",
        publicationId: "pub-1",
        customerUrl: "http://localhost:5190/e/token-1",
        sourceApprovalFingerprint: "fp-1",
        sourceCalculationFingerprint: "fp-1"
      },
      ...extras.scope
    },
    ...extras
  };
}

{
  const r1 = scopedRow(EST_R1, 1);
  const r2 = scopedRow(EST_R2, 2, {
    scope: {
      ...scopedRow(EST_R2, 2).scope,
      quoteFlowDigitalEstimate: {
        ...scopedRow(EST_R2, 2).scope.quoteFlowDigitalEstimate,
        publicationId: "pub-2",
        customerUrl: "http://localhost:5190/e/token-2",
        publishedAt: "2026-08-04T10:00:00.000Z"
      }
    }
  });
  const unscoped = {
    id: EST_UNSCOPED,
    intakeCaseId: CASE,
    revision: 3,
    status: "draft",
    scope: { rooms: [] }
  };
  const selected = selectOfficialQuoteFlowLibraryRows([r1, r2, unscoped]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, EST_R2);
  console.log("ok: library collapse keeps one official row per intake case (highest revision)");
}

{
  const row = scopedRow(EST_R2, 2);
  const activity = buildQuoteFlowActivityPayload(row, {
    publications: [
      {
        id: "pub-1",
        status: "superseded",
        publishedAt: "2026-08-03T16:00:00.000Z",
        revisionLabel: "R1",
        supersededAt: "2026-08-04T10:00:00.000Z",
        customerUrl: "http://localhost:5190/e/token-1"
      },
      {
        id: "pub-2",
        status: "active",
        publishedAt: "2026-08-04T10:00:00.000Z",
        revisionLabel: "R2",
        customerUrl: "http://localhost:5190/e/token-2",
        linkStatus: "active"
      }
    ],
    activePublication: {
      id: "pub-2",
      status: "active",
      publishedAt: "2026-08-04T10:00:00.000Z",
      customerUrl: "http://localhost:5190/e/token-2"
    },
    publicationEvents: [],
    reviewRequests: [],
    organizationId: ORG
  });

  assert.equal(activity.ok, true);
  assert.ok(activity.timeline.some((e) => e.type === "review_approved"));
  assert.ok(activity.timeline.some((e) => e.type === "de_published" || e.type === "de_republished"));
  assert.equal(activity.publicationHistory.length, 2);
  assert.equal(activity.summary.customerLinkAvailable, true);
  assert.match(String(activity.customerSelections.label), /Not tracked yet|No customer activity/i);
  assert.equal(activity.sideEffects.sold, false);
  assert.equal(activity.sideEffects.accepted, false);
  assert.equal(activity.sideEffects.handoffCreated, false);
  assert.equal(activity.sideEffects.emailed, false);
  assert.equal(activity.sideEffects.mutated, false);
  console.log("ok: activity includes review + publication history; no accept/sold/handoff");
}

{
  const byId = new Map([
    [EST_R2, scopedRow(EST_R2, 2)],
    [EST_UNSCOPED, { id: EST_UNSCOPED, status: "draft", scope: { rooms: [] } }]
  ]);
  const repo = {
    async getById(_org, id) {
      return byId.has(id) ? structuredClone(byId.get(id)) : null;
    },
    async listActiveForOrganization() {
      return [scopedRow(EST_R1, 1), scopedRow(EST_R2, 2)];
    }
  };
  const activity = createQuoteFlowActivityService({
    estimateRepository: repo,
    studioDigitalEstimateService: {
      async listPublications() {
        return {
          publications: [
            {
              id: "pub-2",
              status: "active",
              publishedAt: "2026-08-04T10:00:00.000Z",
              customerUrl: "http://localhost:5190/e/token-2"
            }
          ],
          activePublication: {
            id: "pub-2",
            status: "active",
            customerUrl: "http://localhost:5190/e/token-2"
          }
        };
      }
    },
    env: {}
  });
  const loaded = await activity.getActivity({ organizationId: ORG, estimateId: EST_R2 });
  assert.equal(loaded.ok, true);
  assert.ok(loaded.timeline.some((e) => e.type === "review_approved"));

  await assert.rejects(
    () => activity.getActivity({ organizationId: ORG, estimateId: EST_UNSCOPED }),
    (e) => e.code === "estimate_not_scoped"
  );

  const estimates = createQuoteFlowEstimatesService({ estimateRepository: repo, env: {} });
  const listed = await estimates.listEstimates({ organizationId: ORG });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].estimateId, EST_R2);
  console.log("ok: activity route service loads scoped estimate; listEstimates collapses siblings");
}

{
  const src = readFileSync(join(__dirname, "quoteFlowActivity.mjs"), "utf8");
  assert.doesNotMatch(src, /markSold|finalAcceptance|sendEmail|notifyCustomer/i);
  assert.match(src, /sold:\s*false/);
  assert.match(src, /accepted:\s*false/);
  assert.match(src, /handoffCreated:\s*false/);
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /estimates\/:estimateId\/activity/);
  assert.match(routes, /quoteFlowActivityService/);
  const lib = readFileSync(join(__dirname, "quoteFlowLibraryRows.mjs"), "utf8");
  assert.match(lib, /selectOfficialQuoteFlowLibraryRows/);
  assert.match(lib, /Does not delete sibling revisions|non-destructive/i);
  assert.doesNotMatch(lib, /\.delete\(|destroy\(|hardReset|TRUNCATE/i);
  console.log("ok: route/source contracts; no destructive cleanup / sold / handoff");
}

console.log("\nquoteFlowActivity.test.mjs: ok\n");
