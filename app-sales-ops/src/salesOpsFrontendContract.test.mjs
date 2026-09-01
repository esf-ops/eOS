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
  "src/lib/salespersonLabel.ts",
  "src/ui/SalesOpsApp.tsx",
  "src/ui/Account360Workspace.tsx",
  "src/ui/PlanAdmin.tsx",
  "src/ui/PlanExperience.tsx",
  "src/ui/IdentityReview.tsx",
  "src/ui/BaselineGap.tsx",
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
assert.ok(app.includes("/api/sales-ops/team/${"));
assert.ok(app.includes("/accounts?limit=50"));
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
assert.ok(app.includes("/api/sales-ops/me/operating-view"));
assert.ok(app.includes("/api/sales-ops/team/${"));
assert.ok(app.includes("operating-view"));
assert.ok(app.includes("book-intelligence"));
assert.ok(app.includes("Plan Builder"));
assert.ok(app.includes("Team"));
assert.ok(app.includes("Identity Review"));
assert.ok(app.includes("Baseline Gap"));
assert.ok(app.includes("assigned accounts"));
assert.ok(app.includes("No published plan"));
assert.ok(app.includes("Sales performance"));
assert.ok(!app.includes('"Scorecards"'));
assert.ok(!app.includes('["commission"'));
assert.ok(app.includes("sessionStorage"));
assert.ok(app.includes("canSelectSalesperson") || app.includes("Viewing"));
assert.ok(read("src/ui/BaselineGap.tsx").includes("/api/sales-ops/admin/baseline-gap"));
assert.ok(read("src/ui/BaselineGap.tsx").includes("salespersonDisplayName"));
assert.ok(read("src/ui/BaselineGap.tsx").includes("Authoritative / approved reconstruction"));
assert.ok(read("src/ui/BaselineGap.tsx").includes("Diagnostic / potential reconstruction"));
assert.ok(!/Thera/.test(read("src/ui/BaselineGap.tsx")));
assert.equal(read("src/ui/BaselineGap.tsx").includes("|| p.userId"), false);
assert.ok(read("src/ui/IdentityReview.tsx").includes("/api/sales-ops/admin/identity-reviews"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("/api/sales-ops/admin/identity-reviews/bulk-preview"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("/api/sales-ops/admin/identity-reviews/bulk"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("possible_duplicate_of"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Salesperson"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("assignedUserId"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("bulkEligible"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("accountDirectoryAccountId"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Unassigned in Monday"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Monday owner not mapped to eliteOS"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("UNKNOWN_SALESPERSON_LABEL"));
assert.ok(read("src/lib/salespersonLabel.ts").includes("Unknown salesperson"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("High confidence / exact 1:1"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Match quality"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Current owner"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Conflict status"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Moraware linked"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("salespersonDisplayName(p.salespersonLabel, p.displayName)"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Technical details"));
assert.ok(read("src/ui/IdentityReview.tsx").includes("Preview selected"));
assert.equal(read("src/ui/IdentityReview.tsx").includes("No salesperson mapping"), false);
assert.equal(read("src/ui/IdentityReview.tsx").includes("userId.slice"), false);
assert.equal(read("src/ui/IdentityReview.tsx").includes("|| p.userId"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("placeholder=\"User UUID\""), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("placeholder=\"Salesperson user UUID\""), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("|| p.userId"), false);
assert.equal(read("src/ui/SalesOpsApp.tsx").includes("userId).slice"), false);
assert.equal(read("src/ui/SalesOpsApp.tsx").includes("userId.slice"), false);
assert.ok(read("src/ui/PlanAdmin.tsx").includes("salespersonDisplayName"));
assert.ok(read("src/ui/SalesOpsApp.tsx").includes("salespersonDisplayName"));
assert.ok(read("src/lib/salespersonLabel.ts").includes("Unknown salesperson"));
assert.ok(!app.includes("api.moraware.com"));
assert.ok(!app.includes("quickbooks"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("/api/sales-ops/admin/plans/"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("generate-ramp"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("anchors"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("Generate proposed monthly path"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("Meaningful customer touches"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("Compensation not yet configured"));
assert.ok(read("src/ui/PlanExperience.tsx").includes("Production history unavailable until account identity is resolved."));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("plan-preview-modal"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("Show estimated commission to salesperson"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("Plan priority"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("All roles"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("All health"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("badge-role"));
assert.ok(read("src/ui/PlanAdmin.tsx").includes("badge-health"));
assert.ok(read("src/ui/PlanExperience.tsx").includes("badge-health"));
assert.equal(read("src/ui/PlanAdmin.tsx").includes("lookbackMonths ="), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("attentionDeclinePct"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("reactivationDays"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("growthMinPriorSf"), false);
assert.equal(read("src/ui/PlanExperience.tsx").includes("attentionDeclinePct"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("lookback_months"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("json-area"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("JSON.stringify"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("JSON.parse"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("Plan / rule reference"), false);
assert.equal(read("src/ui/PlanAdmin.tsx").includes("insight-modal"), false);
assert.ok(read("src/ui/PlanExperience.tsx").includes("Your north star"));
assert.ok(read("src/ui/PlanExperience.tsx").includes("Completed Installation SF"));
assert.ok(read("src/ui/styles.css").includes("plan-preview-modal"));
assert.ok(read("src/ui/styles.css").includes("max-width: 1120px"));
assert.ok(read("src/ui/styles.css").includes(".plan-experience { width: min(100%, 960px)"));
assert.ok(!read("src/ui/styles.css").includes(".plan-preview-modal { position: relative; width: min(1040px, 100%);"));
assert.ok(read("src/ui/SalesOpsApp.tsx").includes("/api/sales-ops/me/book-intelligence"));
assert.equal(read("src/ui/SalesOpsApp.tsx").includes("reload().then"), false);
assert.ok(!/Thera/.test(app));
assert.ok(!/Thera/.test(read("src/ui/PlanAdmin.tsx")));
assert.ok(!/Thera/.test(read("src/ui/PlanExperience.tsx")));
assert.ok(!/Thera/.test(read("src/ui/IdentityReview.tsx")));
assert.ok(!/Thera/.test(read("src/ui/BaselineGap.tsx")));
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
assert.equal(
  accountListScopeCopy({ isOrgAdmin: true, isManager: false }, { viewingSelectedBook: true }),
  "You are viewing this salesperson’s currently assigned Monday book. Unmapped Monday owners stay hidden."
);
assert.ok(accountListScopeCopy({}).includes("your assigned book"));
assert.equal(/user_profiles|role === ["']admin["']/.test(read("src/lib/accountListScopeCopy.mjs")), false);

console.log("salesOpsFrontendContract.test.mjs: ok");
