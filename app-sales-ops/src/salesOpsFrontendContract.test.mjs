import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const files = [
  "src/lib/api.ts",
  "src/lib/supabase.ts",
  "src/ui/SalesOpsApp.tsx",
  "src/ui/PlanAdmin.tsx",
  "src/main.tsx",
  ".env.example"
];

for (const f of files) {
  const src = read(f);
  assert.equal(/MONDAY_API_TOKEN|SUPABASE_SERVICE_ROLE|SIGNING_SECRET|monday\.com\/v2/.test(src), false, f);
  assert.equal(/thera-performance-scorecards/.test(src), false, `${f} localStorage`);
  assert.equal(/account-strategy\.json|thera-monday-accounts/.test(src), false, `${f} static json`);
}

const app = read("src/ui/SalesOpsApp.tsx");
assert.ok(app.includes("/api/sales-ops/me/accounts?limit=50"));
assert.ok(app.includes("/updates?limit=50"));
assert.ok(app.includes("cursor="));
assert.ok(!app.includes("api.monday.com"));
assert.ok(!app.includes("localhost:3001"));
assert.ok(app.includes("EliteosTopbar"));
assert.ok(app.includes("PlanAdmin"));
assert.ok(!app.includes("Thera's path"));
assert.ok(!app.includes("Assign the approved"));
assert.ok(!app.includes("cedar_valley_2026_2028"));
assert.ok(!/localStorage\.setItem/.test(app));
assert.ok(app.includes("20000"), "visible-tab poll interval");

console.log("salesOpsFrontendContract.test.mjs: ok");
