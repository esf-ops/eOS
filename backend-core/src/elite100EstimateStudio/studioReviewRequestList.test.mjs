/**
 * Studio review-request list — root-cause + contract tests.
 * Sentinel data only. No production mutations.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioReviewRequestList.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import {
  createInMemoryAmendmentRepository,
  createSupabaseAmendmentRepository
} from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { REVIEW_STATUS } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import { createStudioReviewRequestService } from "./studioReviewRequestService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PUB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SNAP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function stubStudioEstimateService() {
  return {
    repository: {
      async get() {
        return null;
      }
    },
    async get() {
      return null;
    }
  };
}

async function seedRequest(amendmentRepo, { organizationId = ORG, status = REVIEW_STATUS.REQUESTED, id = null } = {}) {
  const created = await amendmentRepo.createReviewRequest({
    organizationId,
    publicationId: PUB,
    publicationSnapshotId: SNAP,
    envelopeId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    envelopeVersion: 1,
    sessionId: id ? `session-${id}` : `session-${Math.random().toString(16).slice(2)}`,
    selectionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    calculationId: "11111111-1111-4111-8111-111111111111",
    selectionHash: "sel-hash",
    calculationInputFingerprint: "calc-fp",
    clientIdempotencyKey: id || `idem-${Math.random().toString(16).slice(2)}`,
    customerNote: null,
    requestSnapshotJson: {
      selectedOptions: [{ optionKey: "material:elite100:carrara" }],
      estimateIdentity: { quoteNumber: "SE-LIST-1" }
    },
    baselineDisplayTotal: 1000,
    configuredDisplayTotal: 1200,
    displayDelta: 200,
    pricingValidThrough: "2026-09-01"
  });
  if (status !== REVIEW_STATUS.REQUESTED) {
    await amendmentRepo.updateReviewRequestStatus(organizationId, created.request.id, status);
  }
  return created.request;
}

console.log("\nstudioReviewRequestList.test.mjs\n");

{
  // Reproduce production failure: Supabase repo previously lacked listAmendmentsForRequest.
  const incomplete = {
    async listReviewRequests() {
      return [
        {
          id: "rr-1",
          organization_id: ORG,
          publication_id: PUB,
          status: REVIEW_STATUS.REQUESTED,
          created_at: "2026-07-20T00:00:00.000Z",
          request_snapshot_json: {},
          baseline_display_total: null,
          configured_display_total: null,
          display_delta: null,
          customer_note: null
        }
      ];
    }
  };
  const broken = createStudioReviewRequestService({
    amendmentRepository: incomplete,
    deRepository: {
      async getPublication() {
        return { id: PUB, status: "active", quote_number: "SE-1", revision_number: 1 };
      },
      async getSnapshotByPublicationId() {
        return null;
      }
    },
    studioEstimateService: stubStudioEstimateService(),
    studioDigitalEstimateService: {}
  });
  await assert.rejects(() => broken.list(ORG, {}), /enrichment is unavailable|listAmendmentsForRequest/);
  console.log("ok: incomplete amendment repo fails loudly (production root cause)");
}

{
  const mem = createInMemoryAmendmentRepository();
  const deRepo = createInMemoryDigitalEstimateRepository();
  await deRepo.insertPublication({
    id: PUB,
    organization_id: ORG,
    source_quote_id: "est-1",
    quote_family_root_id: "case-1",
    quote_number: "SE-LIST-1",
    revision_number: 1,
    revision_label: "R1",
    status: "active",
    published_at: "2026-07-20T10:00:00.000Z",
    published_by_user_id: "user-1",
    access_expires_at: "2026-10-01T00:00:00.000Z",
    pricing_valid_through: "2026-09-01"
  });
  await deRepo.insertSnapshot({
    organization_id: ORG,
    publication_id: PUB,
    customer_snapshot_json: {
      project: { customerName: "Example Homes", projectName: "Kitchen" }
    },
    pricing_evidence_json: {}
  });

  const svc = createStudioReviewRequestService({
    amendmentRepository: mem,
    deRepository: deRepo,
    studioEstimateService: stubStudioEstimateService(),
    studioDigitalEstimateService: {}
  });

  const empty = await svc.list(ORG, {});
  assert.deepEqual(empty.reviewRequests, []);
  assert.equal(empty.ok, true);
  console.log("ok: 1 authorized empty list → 200-shaped { reviewRequests: [] }");

  const req = await seedRequest(mem);
  const listed = await svc.list(ORG, {});
  assert.equal(listed.reviewRequests.length, 1);
  assert.equal(listed.reviewRequests[0].id, req.id);
  assert.equal(listed.reviewRequests[0].operatorStatus, "new");
  assert.equal(listed.reviewRequests[0].customerName, "Example Homes");
  assert.equal(listed.reviewRequests[0].quoteNumber, "SE-LIST-1");
  const raw = JSON.stringify(listed);
  assert.doesNotMatch(raw, /token_hash|token_wrapped|service_role|ListID|rawWorkbookRow/i);
  console.log("ok: 2 safe queue fields for existing request; no secrets");

  const emptyFilter = await svc.list(ORG, { status: "" });
  assert.equal(emptyFilter.reviewRequests.length, 1);
  console.log("ok: 3 empty status filter works");

  for (const status of Object.values(REVIEW_STATUS)) {
    const filtered = await svc.list(ORG, { status });
    assert.ok(Array.isArray(filtered.reviewRequests));
    if (status === REVIEW_STATUS.REQUESTED) {
      assert.equal(filtered.reviewRequests.length, 1);
    } else {
      assert.equal(filtered.reviewRequests.length, 0);
    }
  }
  console.log("ok: 4 every supported status filter works");

  const unknown = await svc.list(ORG, { status: "not_a_real_status" });
  assert.equal(unknown.reviewRequests.length, 1); // safely ignored → all
  console.log("ok: 5 unknown status safely ignored");

  // Null optional fields must not crash
  await mem.createReviewRequest({
    organizationId: ORG,
    publicationId: PUB,
    publicationSnapshotId: null,
    envelopeId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    envelopeVersion: 1,
    sessionId: "session-null-fields",
    selectionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    calculationId: "11111111-1111-4111-8111-111111111111",
    selectionHash: "sel-hash-2",
    calculationInputFingerprint: "calc-fp-2",
    clientIdempotencyKey: "idem-null",
    customerNote: null,
    requestSnapshotJson: null,
    baselineDisplayTotal: null,
    configuredDisplayTotal: null,
    displayDelta: null,
    pricingValidThrough: null
  });
  const withNulls = await svc.list(ORG, {});
  assert.ok(withNulls.reviewRequests.length >= 2);
  console.log("ok: 6 null optional fields do not crash list");

  await seedRequest(mem, { organizationId: ORG2, id: "org2-only" });
  const orgScoped = await svc.list(ORG, {});
  assert.ok(orgScoped.reviewRequests.every((r) => r.id !== undefined));
  assert.equal(
    orgScoped.reviewRequests.some((r) => String(r.id).includes("org2")),
    false
  );
  const otherOrg = await svc.list(ORG2, {});
  assert.equal(otherOrg.reviewRequests.length, 1);
  console.log("ok: 7 organization scoping enforced");
}

{
  // Supabase repository surface must include list enrichment methods.
  const fakeDb = {
    _rows: [],
    from(table) {
      const self = this;
      const state = { table, filters: [], order: null, limit: null, payload: null, op: "select" };
      const builder = {
        select() {
          state.op = "select";
          return builder;
        },
        insert(row) {
          state.op = "insert";
          state.payload = row;
          return builder;
        },
        update(row) {
          state.op = "update";
          state.payload = row;
          return builder;
        },
        eq(col, val) {
          state.filters.push([col, val]);
          return builder;
        },
        order(col, opts) {
          state.order = { col, opts };
          return builder;
        },
        limit(n) {
          state.limit = n;
          return builder;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(async () => {
              if (state.table === "digital_estimate_amendments" && state.op === "select") {
                return { data: [], error: null };
              }
              if (state.table === "digital_estimate_configuration_review_requests") {
                return { data: [], error: null };
              }
              if (state.table === "digital_estimate_amendment_events" && state.op === "insert") {
                return { data: null, error: null };
              }
              return { data: [], error: null };
            })
            .then(resolve, reject);
        }
      };
      return builder;
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    }
  };
  const sb = createSupabaseAmendmentRepository({ db: fakeDb });
  assert.equal(typeof sb.listAmendmentsForRequest, "function");
  assert.equal(typeof sb.listEvents, "function");
  assert.equal(typeof sb.updateReviewRequestStatus, "function");
  assert.equal(typeof sb.createAmendmentDraft, "function");
  assert.equal(typeof sb.closeReviewRequest, "function");
  assert.equal(typeof sb.appendEvent, "function");
  const amendments = await sb.listAmendmentsForRequest(ORG, "rr-1");
  assert.deepEqual(amendments, []);
  console.log("ok: Supabase amendment repository exposes list enrichment methods");
}

{
  // Side-effect free GET — list must not call publish helpers.
  const calls = [];
  const mem = createInMemoryAmendmentRepository();
  const deRepo = {
    async getPublication() {
      return null;
    },
    async getSnapshotByPublicationId() {
      return null;
    },
    async publishAtomic() {
      calls.push("publishAtomic");
      throw new Error("must not publish");
    }
  };
  const svc = createStudioReviewRequestService({
    amendmentRepository: mem,
    deRepository: deRepo,
    studioEstimateService: stubStudioEstimateService(),
    studioDigitalEstimateService: {
      async publishFromStudioEstimate() {
        calls.push("publishFromStudioEstimate");
        throw new Error("must not publish");
      }
    }
  });
  await seedRequest(mem);
  await svc.list(ORG, {});
  assert.deepEqual(calls, []);
  console.log("ok: 13 list creates zero publications/events mutations beyond reads");
}

{
  const page = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/ReviewWorkspace.tsx"),
    "utf8"
  );
  assert.match(page, /review-queue-empty/);
  assert.match(page, /review-queue-error/);
  assert.match(page, /review-queue-loading/);
  assert.match(page, /review-queue-refresh/);
  assert.match(page, /No customer review requests/);
  assert.match(page, /!loadingQueue && !error && !rows\.length/);
  assert.doesNotMatch(page, /useEffect\([\s\S]{0,200}apiPost/);
  console.log("ok: 10–12 frontend empty/error/loading/refresh contracts");
}

{
  const access = readFileSync(
    path.join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioAccess.mjs"),
    "utf8"
  );
  assert.match(access, /status\(401\)/);
  assert.match(access, /status\(403\)/);
  const routes = readFileSync(
    path.join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
    "utf8"
  );
  const listSlice = routes.slice(
    routes.indexOf('/api/elite100-estimate-studio/review-requests"'),
    routes.indexOf('/api/elite100-estimate-studio/review-requests"') + 400
  );
  assert.match(listSlice, /\.\.\.staffStack/);
  console.log("ok: 8–9 review list uses staffStack (401 unauthenticated / 403 unauthorized)");
}

console.log("\nstudioReviewRequestList.test.mjs: ok\n");
