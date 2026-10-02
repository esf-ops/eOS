/**
 * Non-prod Quote Flow endpoint latency benchmark (read-only GETs).
 *
 * Refuses to run unless both the Brain and Supabase URLs are loopback. Records only
 * route templates, status codes, latency and response size — never response bodies.
 *
 * Usage (from repo root, local Supabase + local Brain running):
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... BRAIN_URL=http://127.0.0.1:3001 \
 *   NONPROD_STAFF_EMAIL=... NONPROD_STAFF_PASSWORD=... BENCH_ESTIMATE_IDS=id1,id2 \
 *   node backend-core/src/scripts/nonprod/benchQuoteFlowEndpoints.mjs [--reps 7] [--label baseline]
 */
import { createClient } from "@supabase/supabase-js";

const isLoopback = (u) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(String(u || ""));

const supabaseUrl = process.env.SUPABASE_URL;
const brainUrl = process.env.BRAIN_URL || "http://127.0.0.1:3001";
if (!isLoopback(supabaseUrl) || !isLoopback(brainUrl)) {
  console.error("Refusing: SUPABASE_URL and BRAIN_URL must be loopback.");
  process.exit(2);
}

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const reps = Math.max(1, Number(argVal("--reps", "7")));
const label = argVal("--label", "run");
const estimateIds = String(process.env.BENCH_ESTIMATE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const sb = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);
const { data: auth, error } = await sb.auth.signInWithPassword({
  email: process.env.NONPROD_STAFF_EMAIL,
  password: process.env.NONPROD_STAFF_PASSWORD
});
if (error) {
  console.error("Sign-in failed:", error.code || error.status || "error");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${auth.session.access_token}` };

const base = "/api/elite100-quote-flow";
const listRoutes = [
  ["GET estimates list", `${base}/estimates`],
  ["GET inbox (all, 50)", `${base}/inbox?state=all&limit=50`],
  ["GET queue", `${base}/queue`]
];
const estimateRoutes = [
  ["GET estimate detail", (id) => `${base}/estimates/${id}`],
  ["GET pricing", (id) => `${base}/estimates/${id}/pricing`],
  ["GET review", (id) => `${base}/estimates/${id}/review`],
  ["GET digital-estimate", (id) => `${base}/estimates/${id}/digital-estimate`],
  ["GET activity", (id) => `${base}/estimates/${id}/activity`]
];

async function timed(path) {
  const t0 = performance.now();
  const res = await fetch(brainUrl + path + (path.includes("?") ? "&" : "?") + "perf=1", { headers });
  const buf = await res.arrayBuffer();
  let perf = null;
  try {
    perf = JSON.parse(res.headers.get("x-eliteos-perf") || "null");
  } catch {
    perf = null;
  }
  return {
    ms: performance.now() - t0,
    status: res.status,
    bytes: buf.byteLength,
    serverTiming: perf
      ? {
          db: perf.supabase?.db?.n ?? null,
          dbMs: perf.supabase?.db?.ms ?? null,
          auth: perf.supabase?.auth?.n ?? null,
          resources: perf.supabase?.resources ?? null
        }
      : null
  };
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const results = [];
async function measure(name, pathFor, ids) {
  const samples = [];
  const statuses = new Set();
  let bytes = 0;
  let serverTiming = null;
  for (const id of ids) {
    await timed(pathFor(id));
    for (let r = 0; r < reps; r += 1) {
      const t = await timed(pathFor(id));
      samples.push(t.ms);
      statuses.add(t.status);
      bytes = Math.max(bytes, t.bytes);
      serverTiming = t.serverTiming || serverTiming;
    }
  }
  results.push({
    route: name,
    n: samples.length,
    statuses: [...statuses].join("/"),
    p50ms: Math.round(pct(samples, 50)),
    p95ms: Math.round(pct(samples, 95)),
    maxBytes: bytes,
    serverTimingSample: serverTiming
  });
}

for (const [name, path] of listRoutes) await measure(name, () => path, [null]);
for (const [name, pathFor] of estimateRoutes) await measure(name, pathFor, estimateIds);

const openSamples = [];
for (const id of estimateIds) {
  for (let r = 0; r < reps; r += 1) {
    const t0 = performance.now();
    await Promise.all(estimateRoutes.map(([, pathFor]) => timed(pathFor(id))));
    openSamples.push(performance.now() - t0);
  }
}
results.push({
  route: "OPEN estimate (5 GETs in parallel)",
  n: openSamples.length,
  statuses: "-",
  p50ms: Math.round(pct(openSamples, 50)),
  p95ms: Math.round(pct(openSamples, 95)),
  maxBytes: null,
  serverTimingSample: null
});

console.log(JSON.stringify({ label, reps, estimates: estimateIds.length, at: new Date().toISOString(), results }, null, 2));
