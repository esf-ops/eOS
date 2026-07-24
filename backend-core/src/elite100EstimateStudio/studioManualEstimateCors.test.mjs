/**
 * Manual estimate CORS + Idempotency-Key preflight contracts (sentinel only).
 * Run: node backend-core/src/elite100EstimateStudio/studioManualEstimateCors.test.mjs
 *
 * Proves the production failure mode: OPTIONS for Studio origin requesting
 * Authorization, Content-Type, and Idempotency-Key must succeed without mutating
 * intake/estimate state, while POST still requires authz.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";

import {
  EOS_CORS_ALLOWED_HEADERS,
  EOS_CORS_METHODS,
  corsAllowHeadersIncludes
} from "../http/eosCorsPolicy.mjs";
import { attachElite100EstimateStudioRoutes } from "./elite100EstimateStudioRoutes.js";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { DEFAULT_ORGANIZATION_KEY } from "../organizations/organizationContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const STUDIO_ORIGIN = "https://elite100.eliteosfab.com";
const DISALLOWED_ORIGIN = "https://evil.example.com";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PILOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PILOT_EMAIL = "pilot@example.com";
const MANUAL_PATH = "/api/elite100-estimate-studio/manual-estimates";

const ENV_STUDIO = {
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: PILOT_ID,
  ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS: PILOT_EMAIL,
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "0",
  HEAD_URL_ELITE100_ESTIMATE_STUDIO: STUDIO_ORIGIN,
  EOS_TRUST_ELITEOSFAB_SUBDOMAIN_ORIGINS: "1"
};

function normalizeBrowserOrigin(raw) {
  const s = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    return `${u.protocol.toLowerCase()}//${u.hostname.toLowerCase()}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return "";
  }
}

function isTrustedEliteOsFabHttpsOrigin(normalizedOrigin) {
  try {
    const u = new URL(normalizedOrigin);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "eliteosfab.com" || h.endsWith(".eliteosfab.com");
  } catch {
    return false;
  }
}

/** Mirror production Express CORS policy (shared allow-headers + eliteosfab subdomain trust). */
function applySharedCors(app) {
  const allowed = new Set([STUDIO_ORIGIN, "https://account.eliteosfab.com", "https://estimate.eliteosfab.com"].map(normalizeBrowserOrigin));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const norm = normalizeBrowserOrigin(origin);
        if (!norm) return callback(null, false);
        if (allowed.has(norm)) return callback(null, true);
        if (isTrustedEliteOsFabHttpsOrigin(norm)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      allowedHeaders: [...EOS_CORS_ALLOWED_HEADERS],
      methods: [...EOS_CORS_METHODS]
    })
  );
}

function limitResult(data) {
  const row = { data: data == null ? [] : Array.isArray(data) ? data : [data], error: null };
  return {
    limit: async () => row,
    maybeSingle: async () => ({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
    then: (resolve, reject) => Promise.resolve(row).then(resolve, reject)
  };
}

function mockSupabase({ organizationId = ORG } = {}) {
  const orgRow = {
    id: organizationId,
    organization_key: DEFAULT_ORGANIZATION_KEY,
    display_name: "Elite Stone Fabrication"
  };
  return {
    from(table) {
      if (table === "user_profiles") {
        return {
          select() {
            return {
              eq() {
                return limitResult({
                  user_kind: "internal",
                  organization_id: organizationId
                });
              }
            };
          }
        };
      }
      if (table === "organizations") {
        return {
          select() {
            return {
              eq(_col, val) {
                if (String(val) === DEFAULT_ORGANIZATION_KEY || String(val) === organizationId) {
                  return limitResult(orgRow);
                }
                return limitResult([]);
              }
            };
          }
        };
      }
      if (table === "user_head_access") {
        return {
          select() {
            return {
              eq() {
                return limitResult([{ head_slug: "elite100_estimate_studio" }]);
              }
            };
          }
        };
      }
      return {
        select() {
          return {
            eq() {
              return limitResult(null);
            }
          };
        }
      };
    }
  };
}

async function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
}

async function preflight(port, { origin, requestHeaders }) {
  return fetch(`http://127.0.0.1:${port}${MANUAL_PATH}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": requestHeaders
    }
  });
}

console.log("\nstudioManualEstimateCors.test.mjs\n");

// Shared policy contract + server.js wiring
{
  assert.ok(EOS_CORS_ALLOWED_HEADERS.includes("Idempotency-Key"));
  assert.ok(EOS_CORS_ALLOWED_HEADERS.includes("Authorization"));
  assert.ok(EOS_CORS_ALLOWED_HEADERS.includes("Content-Type"));
  assert.ok(EOS_CORS_ALLOWED_HEADERS.includes("x-organization-key"));
  assert.ok(EOS_CORS_METHODS.includes("POST"));
  assert.ok(EOS_CORS_METHODS.includes("OPTIONS"));

  const serverSrc = readFileSync(join(root, "backend-core/src/server.js"), "utf8");
  assert.match(serverSrc, /EOS_CORS_ALLOWED_HEADERS/);
  assert.match(serverSrc, /eosCorsPolicy\.mjs/);
  assert.doesNotMatch(
    serverSrc,
    /allowedHeaders:\s*\[\s*"Content-Type",\s*"Authorization",\s*"x-eos-cron-secret"/
  );
  assert.doesNotMatch(serverSrc, /Access-Control-Allow-Origin:\s*\*/);
  console.log("ok: shared CORS policy includes Idempotency-Key; server.js consumes it");
}

{
  const intake = new InMemoryQuoteIntakeRepository();
  const estimates = new InMemoryStudioEstimateRepository();
  const prevEnv = { ...process.env };
  Object.assign(process.env, ENV_STUDIO);

  const app = express();
  applySharedCors(app);

  let authMode = "ok"; // ok | missing | forbidden_pilot
  attachElite100EstimateStudioRoutes(app, {
    env: ENV_STUDIO,
    requireAuth: () => (req, res, next) => {
      if (authMode === "missing") {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      if (authMode === "forbidden_pilot") {
        req.user = {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          email: "not-pilot@example.com",
          role: "admin",
          isActive: true
        };
        return next();
      }
      req.user = {
        id: PILOT_ID,
        email: PILOT_EMAIL,
        role: "admin",
        isActive: true
      };
      return next();
    },
    getSupabase: () => mockSupabase({ organizationId: ORG }),
    repository: { mode: "memory" },
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates,
    studioManualEstimateService: createStudioManualEstimateService({
      quoteIntakeRepository: intake,
      studioEstimateRepository: estimates
    })
  });

  const server = await listen(app);
  const { port } = server.address();

  try {
    const casesBefore = intake.listCases(ORG, { limit: 50 }).length;

    // 1–5: allowed Studio origin preflight permits POST + required headers
    const okPreflight = await preflight(port, {
      origin: STUDIO_ORIGIN,
      requestHeaders: "authorization,content-type,idempotency-key"
    });
    assert.ok([200, 204].includes(okPreflight.status), `expected 200/204 got ${okPreflight.status}`);
    assert.equal(okPreflight.headers.get("access-control-allow-origin"), STUDIO_ORIGIN);
    assert.match(String(okPreflight.headers.get("access-control-allow-methods") || ""), /POST/i);
    const allowHeaders = okPreflight.headers.get("access-control-allow-headers") || "";
    assert.equal(corsAllowHeadersIncludes(allowHeaders, "Authorization"), true);
    assert.equal(corsAllowHeadersIncludes(allowHeaders, "Content-Type"), true);
    assert.equal(corsAllowHeadersIncludes(allowHeaders, "Idempotency-Key"), true);
    assert.equal(okPreflight.headers.get("access-control-allow-credentials"), "true");
    console.log("ok: 1–5 allowed Studio origin preflight permits POST + Authorization/Content-Type/Idempotency-Key");

    // 6: OPTIONS creates zero intake cases / estimates
    assert.equal(intake.listCases(ORG, { limit: 50 }).length, casesBefore);
    assert.equal((await estimates.listByIntakeCase(ORG, "nonexistent")).length, 0);
    console.log("ok: 6 OPTIONS creates zero intake cases and zero estimates");

    // 7: disallowed origin is not granted access
    const bad = await preflight(port, {
      origin: DISALLOWED_ORIGIN,
      requestHeaders: "authorization,content-type,idempotency-key"
    });
    const badAcao = bad.headers.get("access-control-allow-origin");
    assert.notEqual(badAcao, DISALLOWED_ORIGIN);
    assert.notEqual(badAcao, "*");
    console.log("ok: 7 disallowed origin does not receive permissive CORS");

    // 8: authenticated POST reaches route after preflight
    authMode = "ok";
    const created = await fetch(`http://127.0.0.1:${port}${MANUAL_PATH}`, {
      method: "POST",
      headers: {
        Origin: STUDIO_ORIGIN,
        Authorization: "Bearer sentinel-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "cors-idem-1"
      },
      body: JSON.stringify({
        idempotencyKey: "cors-idem-1",
        projectName: "CORS Sentinel Kitchen",
        customerName: "CORS Cabinets"
      })
    });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get("access-control-allow-origin"), STUDIO_ORIGIN);
    const createdBody = await created.json();
    assert.ok(createdBody.intakeCaseId);
    assert.ok(createdBody.estimateId);
    assert.equal(intake.listCases(ORG, { limit: 50 }).length, casesBefore + 1);
    console.log("ok: 8 authenticated POST reaches route after preflight");

    // 9: missing auth → 401
    authMode = "missing";
    const unauth = await fetch(`http://127.0.0.1:${port}${MANUAL_PATH}`, {
      method: "POST",
      headers: {
        Origin: STUDIO_ORIGIN,
        "Content-Type": "application/json",
        "Idempotency-Key": "cors-idem-unauth"
      },
      body: JSON.stringify({ projectName: "No Auth" })
    });
    assert.equal(unauth.status, 401);
    console.log("ok: 9 missing auth still receives 401");

    // 10: unauthorized (non-pilot) → 403
    authMode = "forbidden_pilot";
    const forbidden = await fetch(`http://127.0.0.1:${port}${MANUAL_PATH}`, {
      method: "POST",
      headers: {
        Origin: STUDIO_ORIGIN,
        Authorization: "Bearer sentinel-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "cors-idem-forbidden"
      },
      body: JSON.stringify({ projectName: "Forbidden" })
    });
    assert.equal(forbidden.status, 403);
    console.log("ok: 10 unauthorized Studio user still receives 403");

    // 11–13: idempotency invariants via authenticated route
    authMode = "ok";
    const again = await fetch(`http://127.0.0.1:${port}${MANUAL_PATH}`, {
      method: "POST",
      headers: {
        Origin: STUDIO_ORIGIN,
        Authorization: "Bearer sentinel-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "cors-idem-1"
      },
      body: JSON.stringify({
        idempotencyKey: "cors-idem-1",
        projectName: "CORS Sentinel Kitchen",
        customerName: "CORS Cabinets"
      })
    });
    assert.equal(again.status, 201);
    const againBody = await again.json();
    assert.equal(againBody.intakeCaseId, createdBody.intakeCaseId);
    assert.equal(againBody.estimateId, createdBody.estimateId);

    const conflict = await fetch(`http://127.0.0.1:${port}${MANUAL_PATH}`, {
      method: "POST",
      headers: {
        Origin: STUDIO_ORIGIN,
        Authorization: "Bearer sentinel-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "cors-idem-1"
      },
      body: JSON.stringify({
        idempotencyKey: "cors-idem-1",
        projectName: "Different Payload",
        customerName: "CORS Cabinets"
      })
    });
    assert.equal(conflict.status, 409);
    const conflictBody = await conflict.json();
    assert.equal(conflictBody.code, "idempotency_payload_conflict");

    const distinct = await fetch(`http://127.0.0.1:${port}${MANUAL_PATH}`, {
      method: "POST",
      headers: {
        Origin: STUDIO_ORIGIN,
        Authorization: "Bearer sentinel-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "cors-idem-2-distinct"
      },
      body: JSON.stringify({
        idempotencyKey: "cors-idem-2-distinct",
        projectName: "CORS Sentinel Kitchen",
        customerName: "CORS Cabinets"
      })
    });
    assert.equal(distinct.status, 201);
    const distinctBody = await distinct.json();
    assert.notEqual(distinctBody.intakeCaseId, createdBody.intakeCaseId);
    assert.notEqual(distinctBody.estimateId, createdBody.estimateId);
    console.log("ok: 11–13 idempotency same/conflict/distinct via authenticated POST");
  } finally {
    await new Promise((r) => server.close(r));
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    for (const k of Object.keys(ENV_STUDIO)) {
      if (!(k in prevEnv)) delete process.env[k];
    }
  }
}

console.log("\nstudioManualEstimateCors.test.mjs: ok\n");
