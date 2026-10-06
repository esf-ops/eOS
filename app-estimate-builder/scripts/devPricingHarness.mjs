#!/usr/bin/env node
/**
 * DEV-ONLY local pricing harness for the Estimate Builder head.
 *
 * Serves the two read-only Estimate Builder endpoints (catalog + price) on 127.0.0.1 using the *production*
 * Brain modules in backend-core — no auth, no Supabase, no persistence. The Elite 100 color list is the
 * Brain's own no-database fallback catalog, and the head shows that warning banner.
 *
 * Never deploy this. It refuses to start under NODE_ENV=production or on Vercel and only binds loopback.
 *
 *   npm run dev:harness            # http://127.0.0.1:3091
 *   VITE_ESTIMATE_BUILDER_PREVIEW=1 VITE_BACKEND_URL=http://127.0.0.1:3091 npm run dev
 */

import http from "node:http";

import { fetchEliteProgramMaterialColors } from "../../backend-core/src/quotes/materialColorsCatalog.js";
import { buildEstimateBuilderCatalog } from "../../backend-core/src/estimateBuilder/estimateBuilderCatalog.mjs";
import { buildDirectory, normalizeDirectoryConfig } from "../../backend-core/src/estimateBuilder/estimateBuilderDirectory.mjs";
import {
  buildEstimatePriceResponse,
  buildEstimateProposalPreviewResponse
} from "../../backend-core/src/estimateBuilder/estimateBuilderRoutes.js";

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  console.error("devPricingHarness: refusing to run in a production environment.");
  process.exit(1);
}

const PORT = Number(process.env.ESTIMATE_BUILDER_HARNESS_PORT || 3091);
const HOST = "127.0.0.1";
const ALLOWED_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const MAX_BODY = 2 * 1024 * 1024;

const { colors, warnings } = await fetchEliteProgramMaterialColors(null);

/** Synthetic preview directory and customers (fake ListIDs, sample names) — never real QuickBooks data. */
const PREVIEW_DIRECTORY = buildDirectory(
  normalizeDirectoryConfig({
    branches: [
      { code: "branch_a", label: "Dyersville", qbClassListId: "PREVIEW-C1" },
      { code: "branch_b", label: "Lisbon - North", qbClassListId: "PREVIEW-C2" },
      { code: "branch_c", label: "Lisbon - South", qbClassListId: "PREVIEW-C3" }
    ],
    salesReps: [
      { code: "SR1", name: "Sample Rep One", qbSalesRepListId: "PREVIEW-R1" },
      { code: "SR2", name: "Sample Rep Two", qbSalesRepListId: "PREVIEW-R2" },
      { code: "SR3", name: "Sample Rep Three", qbSalesRepListId: "PREVIEW-R3" }
    ]
  }),
  new Map([
    ["PREVIEW-C1", { fullName: "Preview - Branch A", active: true }],
    ["PREVIEW-C2", { fullName: "Preview - Branch B", active: true }],
    ["PREVIEW-C3", { fullName: "Preview - Branch C", active: true }]
  ]),
  new Map([
    ["PREVIEW-R1", { initials: "SR1", fullName: "Sample Rep One", active: true }],
    ["PREVIEW-R2", { initials: "SR2", fullName: "Sample Rep Two", active: true }],
    ["PREVIEW-R3", { initials: "SR3", fullName: "Sample Rep Three", active: true }]
  ])
);
const PREVIEW_CUSTOMERS = ["Sample Homes LLC", "Sample Builders Inc", "Example Remodeling", "Sample Cabinet Co"].map((fullName, i) => ({
  listId: `PREVIEW-CU${i + 1}`,
  fullName,
  city: "Sampletown",
  state: "IA"
}));

function send(res, status, body, origin) {
  const headers = { "content-type": "application/json" };
  if (origin && ALLOWED_ORIGIN.test(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "content-type, authorization";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers.vary = "origin";
  }
  res.writeHead(status, headers);
  res.end(body == null ? "" : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url || "/", `http://${HOST}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204, null, origin);
    if (req.method === "GET" && url.pathname === "/api/estimate-builder/catalog") {
      const catalog = buildEstimateBuilderCatalog(colors, [...warnings, "Dev pricing harness — not connected to Supabase."]);
      return send(res, 200, { ...catalog, directory: PREVIEW_DIRECTORY }, origin);
    }
    if (req.method === "GET" && url.pathname === "/api/estimate-builder/qb-customers") {
      const q = String(url.searchParams.get("q") ?? "").trim().toLowerCase();
      const customers = q.length < 2 ? [] : PREVIEW_CUSTOMERS.filter((c) => c.fullName.toLowerCase().includes(q));
      return send(res, 200, { ok: true, customers }, origin);
    }
    if (req.method === "POST" && url.pathname === "/api/estimate-builder/price") {
      return send(res, 200, await buildEstimatePriceResponse(await readJson(req), colors), origin);
    }
    if (req.method === "POST" && url.pathname === "/api/estimate-builder/proposal/preview") {
      return send(res, 200, await buildEstimateProposalPreviewResponse(await readJson(req), colors), origin);
    }
    if (url.pathname.startsWith("/api/estimate-builder/")) {
      return send(res, 403, { ok: false, error: "Saving and opening estimates are disabled in the dev pricing harness." }, origin);
    }
    send(res, 404, { ok: false, error: "Not found" }, origin);
  } catch (e) {
    send(res, 500, { ok: false, error: String(e?.message || e) }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Estimate Builder dev pricing harness on http://${HOST}:${PORT} (${colors.length} fallback colors)`);
});
