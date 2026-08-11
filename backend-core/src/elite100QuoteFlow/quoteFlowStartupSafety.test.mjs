/**
 * Startup / import-safety regression for Quote Flow routes after packet builder.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowStartupSafety.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nquoteFlowStartupSafety.test.mjs\n");

{
  const packetSrc = readFileSync(join(__dirname, "quoteFlowTakeoffPacket.mjs"), "utf8");
  assert.doesNotMatch(
    packetSrc,
    /^import\s+\{[^}]*PDFDocument[^}]*\}\s+from\s+["']pdf-lib["']/m,
    "pdf-lib must not be a top-level static import (Vercel backend-core scope)"
  );
  assert.match(packetSrc, /import\(["']pdf-lib["']\)/, "pdf-lib should be lazy-loaded");
  console.log("ok: packet module does not static-import pdf-lib");
}

{
  // Importing routes must not throw even before pdf-lib is exercised.
  const mod = await import("./elite100QuoteFlowRoutes.js");
  assert.equal(typeof mod.attachElite100QuoteFlowRoutes, "function");
  assert.equal(typeof mod.maybeAttachElite100QuoteFlowRoutes, "function");
  console.log("ok: elite100QuoteFlowRoutes import does not throw");
}

{
  const { normalizeStartTakeoffAttachmentKeys, buildTakeoffPacketPdf } = await import(
    "./quoteFlowTakeoffPacket.mjs"
  );
  assert.deepEqual(normalizeStartTakeoffAttachmentKeys({ attachmentKey: "a" }), ["a"]);
  await assert.rejects(
    () => buildTakeoffPacketPdf({ parts: [] }),
    (err) => err?.code === "attachment_required"
  );
  console.log("ok: helpers work; empty packet returns safe error (no crash)");
}

{
  process.env.ELITE100_QUOTE_FLOW_ENABLED = "1";
  const { attachElite100QuoteFlowRoutes } = await import("./elite100QuoteFlowRoutes.js");
  const app = express();
  const noopSvc = {};
  attachElite100QuoteFlowRoutes(app, {
    requireAuth: () => (_req, _res, next) => next(),
    getSupabase: () => ({}),
    env: { ...process.env, ELITE100_QUOTE_FLOW_ENABLED: "1" },
    quoteFlowService: {
      async listInbox() {
        return { ok: true, items: [], total: 0 };
      }
    },
    quoteFlowSetScopeService: noopSvc,
    quoteFlowEstimatesService: noopSvc,
    quoteFlowPricingService: noopSvc,
    quoteFlowReviewService: noopSvc,
    quoteFlowDigitalEstimateService: noopSvc,
    quoteFlowActivityService: noopSvc,
    quoteFlowAcceptedReportService: noopSvc,
    studioEstimateService: { repository: {} },
    studioEstimateRepository: {},
    sharedInboxService: {},
    studioEstimateQueueService: {},
    quoteIntakeRepository: {}
  });

  const stack = app.router?.stack || app._router?.stack || [];
  const layer = stack.find((l) => l?.route?.path === "/api/elite100-quote-flow/health");
  assert.ok(layer?.route, "health route registered");
  console.log("ok: health route registers without packet/pdf-lib crash");
}

{
  const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
  assert.ok(pkg.dependencies?.["pdf-lib"], "pdf-lib must be in backend-core/package.json for Vercel");
  console.log("ok: backend-core package.json declares pdf-lib");
}

console.log("\nquoteFlowStartupSafety.test.mjs: ok\n");
