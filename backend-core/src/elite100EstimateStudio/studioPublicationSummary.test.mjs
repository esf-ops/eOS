/**
 * Safe Studio publication summary — unit tests (sentinel data only).
 * Run: node backend-core/src/elite100EstimateStudio/studioPublicationSummary.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildSafeStudioPublicationSummary,
  isCurrentActivePublicationForEstimate,
  normalizePublicationStatus
} from "./studioPublicationSummary.mjs";

console.log("\nstudioPublicationSummary.test.mjs\n");

const estimate = { id: "est-1", revision: 2, status: "approved" };

{
  assert.equal(normalizePublicationStatus({ status: "active" }), "active");
  assert.equal(normalizePublicationStatus({ status: "active", revokedAt: "x" }), "revoked");
  assert.equal(normalizePublicationStatus({ status: "superseded" }), "superseded");
  assert.equal(normalizePublicationStatus({ status: "expired" }), "expired");
  console.log("  ✓ status normalization");
}

{
  const s = buildSafeStudioPublicationSummary({ estimate });
  assert.equal(s.state, "not_published");
  assert.equal(s.active, false);
  assert.equal(s.customerUrl, null);
  console.log("  ✓ not published");
}

{
  const active = {
    id: "pub-1",
    status: "active",
    revisionNumber: 2,
    publishedAt: "2026-07-24T12:00:00Z",
    pricingValidThrough: "2026-08-22",
    customerUrl: "https://example.test/de/abc",
    linkStatus: "active"
  };
  const s = buildSafeStudioPublicationSummary({
    estimate,
    activePublication: active
  });
  assert.equal(s.active, true);
  assert.equal(s.state, "published_waiting_for_customer");
  assert.equal(s.customerUrl, "https://example.test/de/abc");
  assert.equal(s.publicationId, "pub-1");
  assert.ok(!JSON.stringify(s).includes("token"));
  assert.ok(!JSON.stringify(s).includes("wrapKey"));
  console.log("  ✓ active summary includes safe URL, no token fields");
}

{
  const active = {
    id: "pub-2",
    status: "active",
    revisionNumber: 2,
    publishedAt: "2026-07-24T12:00:00Z",
    customerUrl: null,
    linkStatus: "needs_replace"
  };
  const s = buildSafeStudioPublicationSummary({ estimate, activePublication: active });
  assert.equal(s.state, "publication_link_unavailable");
  assert.equal(s.customerUrlAvailable, false);
  console.log("  ✓ missing recovered URL → publication_link_unavailable");
}

{
  const prior = {
    id: "pub-old",
    status: "active",
    revisionNumber: 1,
    publishedAt: "2026-07-01T12:00:00Z",
    customerUrl: "https://example.test/de/old",
    linkStatus: "active"
  };
  assert.equal(isCurrentActivePublicationForEstimate(estimate, prior), false);
  const s = buildSafeStudioPublicationSummary({ estimate, activePublication: prior });
  assert.equal(s.active, false);
  assert.equal(s.historical, true);
  assert.equal(s.customerUrl, null);
  console.log("  ✓ prior revision publication is historical");
}

{
  for (const status of ["revoked", "superseded", "expired"]) {
    const s = buildSafeStudioPublicationSummary({
      estimate,
      activePublication: {
        id: `pub-${status}`,
        status,
        revisionNumber: 2,
        customerUrl: "https://example.test/de/x",
        linkStatus: "active"
      }
    });
    assert.equal(s.active, false);
    assert.match(s.state, /publication_/);
  }
  console.log("  ✓ revoked/replaced/superseded/expired are not active");
}

{
  const s = buildSafeStudioPublicationSummary({
    estimate,
    activePublication: {
      id: "pub-rr",
      status: "active",
      revisionNumber: 2,
      customerUrl: "https://example.test/de/rr",
      linkStatus: "active"
    },
    reviewRequests: [{ id: "rr-1", status: "open", publication_id: "pub-rr" }]
  });
  assert.equal(s.state, "customer_review_requested");
  assert.equal(s.reviewRequestOpen, true);
  console.log("  ✓ open review request state");
}

{
  const s = buildSafeStudioPublicationSummary({
    estimate,
    activePublication: {
      id: "pub-v",
      status: "active",
      revisionNumber: 2,
      customerUrl: "https://example.test/de/v",
      linkStatus: "active"
    },
    customerViewed: true
  });
  assert.equal(s.state, "customer_viewed");
  console.log("  ✓ customer viewed state");
}

console.log("\nstudioPublicationSummary.test.mjs — all passed\n");
