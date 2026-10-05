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
import { buildEstimatePriceResponse } from "../../backend-core/src/estimateBuilder/estimateBuilderRoutes.js";

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  console.error("devPricingHarness: refusing to run in a production environment.");
  process.exit(1);
}

const PORT = Number(process.env.ESTIMATE_BUILDER_HARNESS_PORT || 3091);
const HOST = "127.0.0.1";
const ALLOWED_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const MAX_BODY = 2 * 1024 * 1024;

const { colors, warnings } = await fetchEliteProgramMaterialColors(null);

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
      return send(res, 200, buildEstimateBuilderCatalog(colors, [...warnings, "Dev pricing harness — not connected to Supabase."]), origin);
    }
    if (req.method === "POST" && url.pathname === "/api/estimate-builder/price") {
      return send(res, 200, await buildEstimatePriceResponse(await readJson(req), colors), origin);
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
