/**
 * Approved Takeoff measurement summary — display-mapping regression.
 *
 * Proves polling recovery (no consolidatedSummary postMessage) still maps
 * canonical Scope + calculation into non-zero card values.
 *
 * Run: node app-elite100-estimate-studio/src/estimateQueue/aiTakeoffApprovedSummary.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertApprovedSummaryConsistent,
  buildApprovalSummaryFromEstimate,
  estimateHasMeasuredScope,
  measuredBacksplashSfFromEstimate,
  measuredCountertopSfFromEstimate,
  measuredEdgeLfFromEstimate,
  openingsFromEstimate
} from "./aiTakeoffApprovedSummary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const panel = readFileSync(join(root, "src/estimateQueue/AiEstimatorWorkspace.tsx"), "utf8");

console.log("\naiTakeoffApprovedSummary.test.mjs\n");

/** Production-shaped estimate after successful handoff (no scopeBilling). */
function recoveryEstimate() {
  return {
    id: "est-approved-summary-1",
    revision: 2,
    scope: {
      projectName: "Kitchen",
      customerEmail: "customer@example.com",
      edgeEligibleLinearFeet: 26.25,
      addOns: {
        "qty-sink": 1,
        "qty-bar": 0,
        "qty-cook": 1,
        "qty-outlet": 2
      },
      rooms: [
        {
          id: "room-kitchen",
          name: "Kitchen",
          included: true,
          countertopSqft: 48.45,
          backsplashSqft: 5.79,
          pieces: [
            {
              id: "p1",
              name: "Cooktop wall",
              lengthIn: 112.5,
              depthIn: 25.5,
              included: true
            },
            {
              id: "p2",
              name: "Sink wall",
              lengthIn: 96,
              depthIn: 25.5,
              included: true
            }
          ]
        }
      ]
    },
    calculation: {
      pricingVersion: 4,
      pricingEngine: "elite100-room-pricing-v1",
      // Deliberately omit scopeBilling — the production defect path.
      totals: {
        customerDisplayTotal: 4130
      },
      fabrication: {
        edge: {
          finalLf: 26.25
        }
      }
    }
  };
}

{
  const est = recoveryEstimate();
  assert.equal(estimateHasMeasuredScope(est), true);
  // Piece-derived CT (never trust inflated room.countertopSqft when pieces exist)
  assert.equal(measuredCountertopSfFromEstimate(est), 36.92);
  assert.equal(measuredBacksplashSfFromEstimate(est, null), 5.79);
  assert.equal(measuredEdgeLfFromEstimate(est, null), 26.25);
  assert.equal(openingsFromEstimate(est, null).total, 4);

  // No consolidatedSummary / pending — polling recovery path.
  const summary = buildApprovalSummaryFromEstimate(est, null);
  assert.ok(summary);
  assert.equal(summary.countertopSf, 36.92);
  assert.equal(summary.backsplashSf, 5.79);
  assert.equal(summary.edgeLf, 26.25);
  assert.equal(
    summary.kitchenSinkCutouts +
      summary.vanityBarSinkCutouts +
      summary.cooktopCutouts +
      summary.outletCutouts,
    4
  );
  assert.equal(summary.customerDisplayTotal, 4130);
  assert.equal(assertApprovedSummaryConsistent(summary, est), true);
  assert.ok(
    summary.countertopSf > 0,
    "approved card cannot display 0 SF when estimateHasMeasuredScope is true"
  );

  // Card display strings match the required presentation.
  assert.equal(`${summary.countertopSf.toFixed(2)} SF`, "36.92 SF");
  assert.equal(`${summary.backsplashSf.toFixed(2)} SF`, "5.79 SF");
  assert.equal(`${summary.edgeLf.toFixed(2)} LF`, "26.25 LF");
  assert.equal(
    `$${Number(summary.customerDisplayTotal).toFixed(2)}`,
    "$4130.00"
  );
  console.log("ok: 1 polling recovery maps Scope pieces → 36.92 / 5.79 / 26.25 / 4 / $4130");
}

{
  const est = recoveryEstimate();
  const pending = {
    countertopSf: 48.45,
    backsplashSf: 5.79,
    edgeLf: 26.25,
    kitchenSinkCutouts: 1,
    vanityBarSinkCutouts: 0,
    cooktopCutouts: 1,
    outletCutouts: 2,
    customerDisplayTotal: 4130
  };
  const fromPostMessage = buildApprovalSummaryFromEstimate(est, pending);
  const fromPolling = buildApprovalSummaryFromEstimate(est, null);
  assert.deepEqual(
    {
      countertopSf: fromPostMessage.countertopSf,
      backsplashSf: fromPostMessage.backsplashSf,
      edgeLf: fromPostMessage.edgeLf,
      openings:
        fromPostMessage.kitchenSinkCutouts +
        fromPostMessage.vanityBarSinkCutouts +
        fromPostMessage.cooktopCutouts +
        fromPostMessage.outletCutouts,
      total: fromPostMessage.customerDisplayTotal
    },
    {
      countertopSf: fromPolling.countertopSf,
      backsplashSf: fromPolling.backsplashSf,
      edgeLf: fromPolling.edgeLf,
      openings:
        fromPolling.kitchenSinkCutouts +
        fromPolling.vanityBarSinkCutouts +
        fromPolling.cooktopCutouts +
        fromPolling.outletCutouts,
      total: fromPolling.customerDisplayTotal
    },
    "postMessage and polling recovery produce the same summary"
  );
  console.log("ok: 2 postMessage and polling recovery produce identical summary");
}

{
  // Piece-derived countertop wins over scopeBilling when pieces exist (avoids inflated CT).
  const est = recoveryEstimate();
  est.calculation.scopeBilling = {
    measuredCountertopSf: 50,
    backsplashSf: 6,
    edgeLf: 30
  };
  assert.equal(measuredCountertopSfFromEstimate(est), 36.92);
  assert.equal(measuredBacksplashSfFromEstimate(est, null), 6);
  // fabrication.edge.finalLf still wins over billing.edgeLf when present.
  assert.equal(measuredEdgeLfFromEstimate(est, null), 26.25);
  console.log("ok: 3 piece-derived CT preferred over inflated billing when pieces exist");
}

{
  assert.ok(panel.includes("buildApprovalSummaryFromEstimate"));
  assert.ok(panel.includes("aiTakeoffApprovedSummary.mjs"));
  assert.ok(panel.includes("estimateHasMeasuredScope"));
  // applyEstimateView must not only read billing + pending for countertop.
  const apply = panel.slice(
    panel.indexOf("const applyEstimateView"),
    panel.indexOf("const refreshFromTakeoffWithRetry")
  );
  assert.ok(apply.includes("buildApprovalSummaryFromEstimate"));
  assert.equal(
    /billing\.measuredCountertopSf/.test(apply),
    false,
    "applyEstimateView no longer hard-codes billing-only countertop mapping"
  );
  assert.ok(panel.includes("AiEstimatorWorkspace") || panel.includes("export default function AiEstimatorWorkspace"));
  assert.ok(panel.includes("eq-takeoff-iframe") || panel.includes("eq-ai-approved-measurements"));
  console.log("ok: 4 panel wires authoritative summary helper; Takeoff-first unchanged");
}

console.log("\naiTakeoffApprovedSummary.test.mjs — passed\n");
