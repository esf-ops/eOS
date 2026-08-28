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
  "src/lib/accountListScopeCopy.mjs",
  "src/ui/SalesOpsApp.tsx",
  "src/ui/Account360Workspace.tsx",
  "src/ui/PlanAdmin.tsx",
  "src/ui/IdentityReview.tsx",
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
assert.ok(app.includes("/api/sales-ops/me/performance"));
assert.ok(app.includes("/api/sales-ops/me/performance/accounts"));
assert.ok(app.includes("/api/sales-ops/team/performance"));
assert.ok(app.includes("/api/sales-ops/team/${"));
assert.ok(app.includes("accounts=1"));
assert.ok(app.includes("Plan Builder"));
assert.ok(app.includes("Team Performance"));
assert.ok(app.includes("Identity Review"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("/api/sales-ops/admin/identity-reviews"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("/api/sales-ops/admin/identity-reviews/bulk-preview"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("/api/sales-ops/admin/identity-reviews/bulk"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Approved starter book"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Salesperson"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("assignedUserId"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("bulkEligible"));
assert.ok(!app.includes("api.moraware.com"));
assert.ok(!app.includes("quickbooks"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("/api/sales-ops/admin/plans/"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("generate-ramp"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("anchors"));
assert.ok(!/Thera/.test(app));
assert.ok(!/Thera/.test(read("src/ui/PlanAdmin.tsx")));
assert.ok(!/Thera/.test(read("src/ui/IdentityReview.tsx")));
assert.ok(!read("src/ui/IdentityReview.tsx").includes("ListID"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("quickbooksLinked"));

const { accountListScopeCopy } = await import("./lib/accountListScopeCopy.mjs");
assert.equal(
  accountListScopeCopy({ isOrgAdmin: true, isManager: false }),
  "You can see every active account in this organization. Unmapped Monday owners stay hidden from normal sales books but remain visible here."
);
assert.equal(
  accountListScopeCopy({ isOrgAdmin: false, isManager: true }),
  "You see your managed scope: accounts assigned to you and to people who report to you. Unmapped Monday owners stay hidden."
);
assert.equal(
  accountListScopeCopy({ isOrgAdmin: false, isManager: false }),
  "You only see your assigned book — accounts currently assigned to you. Unmapped Monday owners stay hidden."
);
assert.equal(
  accountListScopeCopy({ isOrgAdmin: true, isManager: true }),
  "You can see every active account in this organization. Unmapped Monday owners stay hidden from normal sales books but remain visible here."
);
assert.ok(accountListScopeCopy({}).includes("your assigned book"));
assert.equal(/user_profiles|role === ["']admin["']/.test(read("src/lib/accountListScopeCopy.mjs")), false);

console.log("salesOpsFrontendContract.test.mjs: ok");
