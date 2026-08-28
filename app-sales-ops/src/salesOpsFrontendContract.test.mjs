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
  "src/ui/Account360Workspace.tsx",
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
const workspace = read("src/ui/Account360Workspace.tsx");
assert.ok(app.includes("/api/sales-ops/me/accounts?limit=50"));
assert.ok(app.includes("/updates?limit=50"));
assert.ok(app.includes("/subitems?limit=50"));
assert.ok(app.includes("/files?limit=50"));
assert.ok(app.includes("/docs?limit=50"));
assert.ok(app.includes("/activity?limit=50"));
assert.ok(app.includes("cursor="));
assert.ok(app.includes("#account="));
assert.ok(!app.includes("api.monday.com"));
assert.ok(!workspace.includes("api.monday.com"));
assert.ok(!app.includes("localhost:3001"));
assert.ok(app.includes("EliteosTopbar"));
assert.ok(app.includes("PlanAdmin"));
assert.ok(app.includes("Account360Workspace"));
assert.ok(workspace.includes("asset_fetch_not_enabled"));
assert.ok(workspace.includes("Content download is not available"));
assert.ok(!workspace.includes("sourceUrl"));
assert.ok(!workspace.includes("JSON.stringify"));
assert.ok(!/\/files\/\$\{/.test(app));
assert.ok(!/\/files\/\$\{/.test(workspace));
assert.ok(!app.includes("Thera's path"));
assert.ok(!app.includes("Assign the approved"));
assert.ok(!app.includes("cedar_valley_2026_2028"));
assert.ok(!/localStorage\.setItem/.test(app));
assert.ok(app.includes("20000"), "visible-tab poll interval");

console.log("salesOpsFrontendContract.test.mjs: ok");
