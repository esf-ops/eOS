/**
 * Elite 100 Quote Flow — Slice 1A shell contracts.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowSlice1a.test.mjs
 */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  maybeAttachElite100QuoteFlowRoutes,
  attachElite100QuoteFlowRoutes
} from "./elite100QuoteFlowRoutes.js";
import {
  ELITE100_QUOTE_FLOW_HEAD_SLUG,
  isElite100QuoteFlowEnabled
} from "./elite100QuoteFlowConfig.mjs";
import { buildMeHeadsPayload } from "../me/launcherHeads.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowSlice1a.test.mjs\n");

function mockSupabase({ headRows = [], userKind = "internal" } = {}) {
  return {
    from(table) {
      if (table === "user_profiles") {
        const result = {
          data: [{ user_kind: userKind }],
          error: null
        };
        const single = { data: { user_kind: userKind }, error: null };
        const api = {
          select: () => api,
          eq: () => api,
          limit: async () => result,
          maybeSingle: async () => single
        };
        return api;
      }
      if (table === "user_head_access") {
        const rows = headRows;
        const api = {
          select: () => api,
          eq: () =>
            Promise.resolve({
              data: rows,
              error: null
            })
        };
        return api;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            limit: async () => ({ data: [], error: null })
          })
        })
      };
    }
  };
}

async function requestApp(app, path) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { Authorization: "Bearer test" }
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

assert.equal(ELITE100_QUOTE_FLOW_HEAD_SLUG, "elite100_quote_flow");
assert.equal(isElite100QuoteFlowEnabled({ ELITE100_QUOTE_FLOW_ENABLED: "1" }), true);
assert.equal(isElite100QuoteFlowEnabled({ ELITE100_QUOTE_FLOW_ENABLED: "0" }), false);
assert.equal(isElite100QuoteFlowEnabled({}), false);
console.log("ok: flag + head slug");

{
  const off = maybeAttachElite100QuoteFlowRoutes(express(), {
    requireAuth: () => (_req, _res, next) => next(),
    getSupabase: () => ({}),
    env: { ELITE100_QUOTE_FLOW_ENABLED: "0" }
  });
  assert.deepEqual(off, { mounted: false, reason: "flag_off" });
  console.log("ok: routes not mounted when flag off");
}

{
  const app = express();
  const on = maybeAttachElite100QuoteFlowRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      req.user = {
        id: "u-mount-check",
        email: "est@example.com",
        role: "estimator",
        isActive: true,
        user_kind: "internal"
      };
      next();
    },
    getSupabase: () =>
      mockSupabase({ headRows: [{ head_slug: ELITE100_QUOTE_FLOW_HEAD_SLUG }] }),
    env: { ELITE100_QUOTE_FLOW_ENABLED: "1" }
  });
  assert.equal(on.mounted, true);
  const health = await requestApp(app, "/api/elite100-quote-flow/health");
  assert.equal(health.status, 200);
  assert.ok(
    health.body?.shell === "slice-1a" ||
      health.body?.shell === "slice-1b" ||
      health.body?.shell === "slice-1c" ||
      health.body?.shell === "slice-1d"
  );
  const cfg = await requestApp(app, "/api/elite100-quote-flow/config");
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body?.config?.headSlug, ELITE100_QUOTE_FLOW_HEAD_SLUG);
  console.log("ok: routes mounted when flag on");
}

{
  const app = express();
  attachElite100QuoteFlowRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      req.user = {
        id: "u-no-access",
        email: "est@example.com",
        role: "estimator",
        isActive: true,
        user_kind: "internal"
      };
      next();
    },
    getSupabase: () => mockSupabase({ headRows: [] }),
    env: { ELITE100_QUOTE_FLOW_ENABLED: "1" }
  });
  const { status, body } = await requestApp(app, "/api/elite100-quote-flow/health");
  assert.equal(status, 403);
  assert.equal(body?.ok, false);
  console.log("ok: user without head access cannot call Quote Flow API");
}

{
  const app = express();
  attachElite100QuoteFlowRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      req.user = {
        id: "u-granted",
        email: "est@example.com",
        role: "estimator",
        isActive: true,
        user_kind: "internal"
      };
      next();
    },
    getSupabase: () =>
      mockSupabase({ headRows: [{ head_slug: ELITE100_QUOTE_FLOW_HEAD_SLUG }] }),
    env: { ELITE100_QUOTE_FLOW_ENABLED: "1" }
  });
  const { status, body } = await requestApp(app, "/api/elite100-quote-flow/health");
  assert.equal(status, 200);
  assert.equal(body?.ok, true);
  assert.ok(
    body?.shell === "slice-1a" ||
      body?.shell === "slice-1b" ||
      body?.shell === "slice-1c" ||
      body?.shell === "slice-1d"
  );
  console.log("ok: granted user reaches health stub");
}

{
  const routesSrc = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routesSrc, /requireHeadAccess\(ELITE100_QUOTE_FLOW_HEAD_SLUG/);
  assert.match(routesSrc, /assertInternalQuoteOperator/);
  assert.match(routesSrc, /requested-selections/);
  assert.match(routesSrc, /starting-configuration/);
  assert.match(routesSrc, /account-directory-link/);
  assert.match(routesSrc, /\/api\/elite100-quote-flow\/account-directory/);
  // Later slices intentionally mount Digital Estimate publish on this file.
  // Still forbid sold/handoff/takeoff-finish wiring here.
  assert.doesNotMatch(routesSrc, /markSold|approveWorkingDraft|takeoff-finish/);
  console.log("ok: staff stack requires head access; selections + AD soft-link mounted");
}

function chain(data) {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => ({ data, error: null }),
    then: undefined
  };
  api.eq = () => {
    const eqApi = {
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve, reject) =>
        Promise.resolve({
          data: Array.isArray(data) ? data : data ? [data] : [],
          error: null
        }).then(resolve, reject)
    };
    return eqApi;
  };
  return api;
}

function mockSb(headRows) {
  return {
    from: (table) => {
      if (table === "user_profiles") return chain({ user_kind: "internal" });
      if (table === "user_head_access") return chain(headRows);
      return chain(null);
    }
  };
}

const prev = { ...process.env };
process.env.HEAD_URL_ELITE100_QUOTE_FLOW = "https://quote-flow.eliteosfab.com";

{
  process.env.ELITE100_QUOTE_FLOW_ENABLED = "1";
  const payload = await buildMeHeadsPayload(mockSb([{ head_slug: ELITE100_QUOTE_FLOW_HEAD_SLUG }]), {
    id: "granted-user",
    email: "granted@example.com",
    role: "estimator",
    isActive: true
  });
  const tile = payload.heads.find((h) => h.slug === ELITE100_QUOTE_FLOW_HEAD_SLUG);
  assert.ok(tile, "granted user sees Quote Flow tile when flag on");
  assert.equal(tile.url, "https://quote-flow.eliteosfab.com");
  console.log("ok: launcher shows tile with flag + head access");
}

{
  process.env.ELITE100_QUOTE_FLOW_ENABLED = "1";
  const payload = await buildMeHeadsPayload(mockSb([]), {
    id: "ungranted-user",
    email: "other@example.com",
    role: "estimator",
    isActive: true
  });
  assert.equal(
    payload.heads.some((h) => h.slug === ELITE100_QUOTE_FLOW_HEAD_SLUG),
    false,
    "user without head access does not see tile"
  );
  console.log("ok: launcher hides tile without head access");
}

{
  process.env.ELITE100_QUOTE_FLOW_ENABLED = "0";
  const payload = await buildMeHeadsPayload(mockSb([{ head_slug: ELITE100_QUOTE_FLOW_HEAD_SLUG }]), {
    id: "granted-user",
    email: "granted@example.com",
    role: "estimator",
    isActive: true
  });
  assert.equal(
    payload.heads.some((h) => h.slug === ELITE100_QUOTE_FLOW_HEAD_SLUG),
    false,
    "flag off hides tile even with grant"
  );
  console.log("ok: launcher hides tile when flag off");
}

for (const [k, v] of Object.entries(prev)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
for (const k of ["ELITE100_QUOTE_FLOW_ENABLED", "HEAD_URL_ELITE100_QUOTE_FLOW"]) {
  if (!(k in prev)) delete process.env[k];
}

{
  const quoteRoutes = readFileSync(join(root, "backend-core/src/quotes/quoteRoutes.js"), "utf8");
  assert.match(quoteRoutes, /maybeAttachElite100QuoteFlowRoutes/);
  const constants = readFileSync(
    join(root, "backend-core/src/auth/eosGovernanceConstants.js"),
    "utf8"
  );
  assert.match(constants, /elite100_quote_flow/);
  const urls = readFileSync(join(root, "backend-core/src/me/headDeploymentUrls.js"), "utf8");
  assert.match(urls, /HEAD_URL_ELITE100_QUOTE_FLOW/);
  console.log("ok: registration wiring present");
}

console.log("\nquoteFlowSlice1a.test.mjs: ok\n");
