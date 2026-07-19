/**
 * Cron process-queued route contract.
 * Run: node backend-core/src/takeoff/takeoffInternalRoutes.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateCronSecret, attachTakeoffInternalRoutes, readCronSecret } from "./takeoffInternalRoutes.js";

const root = dirname(fileURLToPath(import.meta.url));
const vercel = JSON.parse(readFileSync(join(root, "../../vercel.json"), "utf8"));

console.log("\ntakeoffInternalRoutes.test.mjs\n");

{
  assert.equal(readCronSecret({ CRON_SECRET: "abc" }), "abc");
  assert.equal(readCronSecret({ EOS_CRON_SECRET: "eos" }), "eos");
  assert.equal(readCronSecret({ ELITEOS_CRON_SECRET: "elite" }), "elite");
  console.log("  ✓ cron secret env aliases");
}

{
  const env = { CRON_SECRET: "secret-1" };
  assert.equal(
    validateCronSecret({ headers: { authorization: "Bearer secret-1" } }, env).ok,
    true
  );
  assert.equal(
    validateCronSecret({ headers: { "x-eos-cron-secret": "secret-1" } }, env).ok,
    true
  );
  assert.equal(
    validateCronSecret({ headers: { authorization: "Bearer wrong" } }, env).status,
    401
  );
  assert.equal(validateCronSecret({ headers: {} }, { CRON_SECRET: "" }).status, 500);
  console.log("  ✓ Bearer + header auth; missing secret → 500");
}

{
  const paths = (vercel.crons || []).map((c) => c.path);
  assert.ok(paths.includes("/api/internal/takeoff/process-queued"));
  const cron = (vercel.crons || []).find((c) => c.path === "/api/internal/takeoff/process-queued");
  assert.equal(cron.schedule, "* * * * *");
  console.log("  ✓ vercel.json cron GET path every minute");
}

{
  const methods = [];
  const app = {
    get(path, handler) {
      methods.push(["GET", path, handler]);
    },
    post(path, handler) {
      methods.push(["POST", path, handler]);
    }
  };
  const mounted = attachTakeoffInternalRoutes(app, {
    getSupabase: () => null,
    env: { CRON_SECRET: "cron-test" }
  });
  assert.equal(mounted.mounted, true);
  assert.equal(methods.length, 2);
  assert.ok(methods.some(([m, p]) => m === "GET" && p === "/api/internal/takeoff/process-queued"));
  assert.ok(methods.some(([m, p]) => m === "POST" && p === "/api/internal/takeoff/process-queued"));

  const getHandler = methods.find(([m]) => m === "GET")[2];
  let status = 0;
  let body = null;
  await getHandler(
    { method: "GET", headers: { authorization: "Bearer cron-test" }, query: {}, body: {} },
    {
      set() {},
      status(code) {
        status = code;
        return this;
      },
      json(payload) {
        body = payload;
        return this;
      }
    }
  );
  assert.equal(status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.code, "supabase_unavailable");
  assert.equal(body.claimed, 0);
  console.log("  ✓ GET handler mounted; auth passes; supabase missing → 503 contract");
}

console.log("\ntakeoffInternalRoutes.test.mjs — passed\n");
