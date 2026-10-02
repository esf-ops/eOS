import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requestTimingMiddleware } from "./requestStageTimer.mjs";

async function perfHeader({ vercelEnv, envFlag, query }) {
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, ELITEOS_REQUEST_TIMING: process.env.ELITEOS_REQUEST_TIMING };
  if (vercelEnv == null) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  if (envFlag == null) delete process.env.ELITEOS_REQUEST_TIMING;
  else process.env.ELITEOS_REQUEST_TIMING = envFlag;
  const app = express();
  app.use("/api/x", requestTimingMiddleware());
  app.get("/api/x/items/:id", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const logs = [];
  const info = console.info;
  console.info = (...args) => logs.push(args.join(" "));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/x/items/secret-id-123${query}`);
    await res.text();
    await new Promise((r) => setImmediate(r));
    return { header: res.headers.get("x-eliteos-perf"), logs };
  } finally {
    console.info = info;
    server.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("?perf=1 outside production returns the route template and counts, not the concrete URL", async () => {
  const { header } = await perfHeader({ vercelEnv: "preview", query: "?perf=1" });
  const parsed = JSON.parse(header);
  assert.equal(parsed.label, "GET /api/x/items/:id");
  assert.equal(header.includes("secret-id-123"), false);
  assert.deepEqual(parsed.supabase.db, { n: 0, ms: 0 });
});

test("production never sends the header and ignores ?perf=1", async () => {
  const { header, logs } = await perfHeader({ vercelEnv: "production", query: "?perf=1" });
  assert.equal(header, null);
  assert.equal(logs.some((l) => l.includes("[eliteos-perf]")), false);
});

test("production with ELITEOS_REQUEST_TIMING=1 logs server-side only", async () => {
  const { header, logs } = await perfHeader({ vercelEnv: "production", envFlag: "1", query: "" });
  assert.equal(header, null);
  const line = logs.find((l) => l.includes("[eliteos-perf]"));
  assert.ok(line);
  assert.equal(line.includes("secret-id-123"), false);
});

test("disabled by default", async () => {
  const { header, logs } = await perfHeader({ vercelEnv: "preview", query: "" });
  assert.equal(header, null);
  assert.equal(logs.length, 0);
});
