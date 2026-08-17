/**
 * Account Directory head shell contract regressions.
 * Run: node app-account-directory/src/lib/accountDirectoryUiContract.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const app = readFileSync(join(root, "app-account-directory/src/AccountDirectoryApp.tsx"), "utf8");
const panels = readFileSync(join(root, "app-account-directory/src/ui/Account360Panels.tsx"), "utf8");
const api = readFileSync(join(root, "app-account-directory/src/lib/accountDirectoryApi.ts"), "utf8");
const css = readFileSync(join(root, "app-account-directory/src/styles.css"), "utf8");
const install = readFileSync(join(root, "app-install-dashboard/src/InstallDashboardApp.tsx"), "utf8");
const topbar = readFileSync(join(root, "shared/eliteos-ui/EliteosTopbar.tsx"), "utf8");
const workspace = readFileSync(join(root, "app-account-directory/src/lib/accountDirectoryWorkspace.mjs"), "utf8");
const maintain = readFileSync(join(root, "app-account-directory/src/ui/AccountMaintain.tsx"), "utf8");

console.log("\naccountDirectoryUiContract.test.mjs\n");

// ── Shared topbar / shell tokens ──────────────────────────────────────────
assert.ok(app.includes('from "../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(install.includes('from "../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(topbar.includes("Visual source of truth: the Home Launcher topbar"));
assert.equal(app.includes("searchSlot"), false, "Account Directory must NOT use searchSlot");
assert.ok(app.includes('className="shell"'));
assert.ok(app.includes('appName="Account Directory"'));
assert.ok(app.includes('apiGet("/api/me"'));
assert.ok(app.includes("supabase.auth.signOut"));
assert.ok(css.includes("--eos-accent: #a3132f"));
console.log("ok: Account Directory uses shared EliteosTopbar / shell tokens");

// ── Navigation tabs ───────────────────────────────────────────────────────
assert.ok(app.includes('className="ad-nav"'));
assert.ok(app.includes("Accounts"));
assert.ok(app.includes("Prospects"));
assert.ok(app.includes("Account Needs Review"));
assert.ok(app.includes("Archived"));
assert.ok(app.includes("New account"));
assert.ok(app.includes("QuickBooks restricted"));
assert.ok(app.includes("permission-denied"));
assert.ok(app.includes("qbEnrichment=suggested_match") || app.includes('qbEnrichment: "suggested_match"') || workspace.includes('qbEnrichment: "suggested_match"'));
assert.ok(app.includes("qbEnrichment=needs_review") || app.includes('qbEnrichment: "needs_review"') || workspace.includes('qbEnrichment: "needs_review"'));
assert.ok(app.includes("QB Needs Review"));
assert.ok(app.includes("Status Review"));
assert.ok(app.includes("canReviewStatus"));
assert.ok(app.includes("StatusReviewSurface"));
assert.ok(api.includes("link-moraware"));
assert.ok(api.includes("unlinkMoraware") || api.includes("expectedSystem"));
assert.ok(api.includes("pageSize"));
assert.ok(app.includes("MorawareReviewSurface"));
assert.ok(app.includes("moraware_review"));
assert.ok(api.includes("/status-review"));
assert.ok(api.includes("moraware-reconciliation"));
assert.equal(app.includes("Confirm All"), false, "must not offer Confirm All for Moraware");
assert.equal(
  readFileSync(join(root, "app-account-directory/src/ui/MorawareReview.tsx"), "utf8").includes("Confirm All"),
  false
);
assert.ok(
  readFileSync(join(root, "app-account-directory/src/ui/MorawareReview.tsx"), "utf8").includes("Showing")
);
assert.ok(css.includes(".status-review"));
assert.equal(app.includes("Apply All"), false, "must not offer Apply All");
assert.equal(
  readFileSync(join(root, "app-account-directory/src/ui/AccountStatusReview.tsx"), "utf8").includes("Apply All"),
  false
);
assert.ok(workspace.includes("qbEnrichment"));
assert.ok(workspace.includes("applySummaryCardPreset"));
assert.ok(workspace.includes("applyToolbarFilterPatch"));
assert.ok(app.includes("applySummaryCard"));
assert.ok(app.includes("onApplyCard"));
assert.ok(api.includes("qbEnrichment"));
console.log("ok: nav tabs, qbEnrichment filter, exclusive summary presets, and Account Needs Review labeling");

// ── API client ─────────────────────────────────────────────────────────────
assert.ok(api.includes('const BASE = "/api/account-directory"'));
assert.ok(api.includes("${BASE}/accounts"));
assert.ok(api.includes("${BASE}/prospects"));
assert.ok(api.includes("link-quickbooks"));
assert.ok(api.includes("displayName"));
assert.equal(api.includes("payload.displayName") || api.includes("displayName: String(payload.displayName"), true);
assert.equal(app.includes("Estimate Studio"), false, "must not couple to Estimate Studio");
assert.equal(app.includes("estimate-studio"), false, "must not couple to Estimate Studio");
console.log("ok: account-directory API client wired; no Estimate Studio coupling");

// ── New workspace features ─────────────────────────────────────────────────
// Summary strip
assert.ok(app.includes("summary-strip"), "summary strip present");
assert.ok(app.includes("SummaryStrip"), "SummaryStrip component present");
// Pagination
assert.ok(app.includes("PaginationBar"), "PaginationBar component present");
assert.ok(app.includes("pagination-info"), "pagination info class present in app");
assert.ok(css.includes(".pagination"), "pagination styles present in CSS");
// URL state
assert.ok(app.includes("parseUrlState"), "URL state parsing present");
assert.ok(app.includes("serializeUrlState"), "URL state serialization present");
assert.ok(app.includes("history.pushState"), "URL history push present");
assert.ok(app.includes("popstate"), "popstate listener present");
// Debounced search
assert.ok(app.includes("searchDebounceRef"), "debounced search ref present");
assert.ok(app.includes("300"), "300ms debounce present");
// Profile panel
assert.ok(app.includes("ProfilePanel"), "ProfilePanel component present");
assert.ok(app.includes("account-workspace"), "Account Workspace overlay present");
assert.ok(css.includes("account-workspace"), "workspace styles present");
assert.equal(css.includes("minmax(340px, 440px)"), false, "must not keep the narrow 360 drawer");
assert.ok(panels.includes("Account health") || app.includes("Data health"), "account health section present");
assert.ok(app.includes("WorkspaceTabBoundary"), "tab error boundary present");
assert.ok(app.includes("summary-group"), "grouped summary strip present");
assert.ok(app.includes('"Financials"') || app.includes("Financials"), "Financials profile tab present");
assert.ok(app.includes('"Insights"') || app.includes("Insights"), "Insights tab present");
assert.ok(app.includes("FinancialsPanel") || app.includes("QuickBooks Financials") || panels.includes("FinancialsPanel"), "Financials panel present");
assert.ok(panels.includes("Customer performance") || panels.includes("Customer Performance"), "Customer performance section present");
assert.ok(panels.includes("Sales Orders"), "Sales Orders label present");
assert.equal(panels.includes("Quote → Sold") || panels.includes("Sold Job"), false, "must not call sales orders Sold");
assert.ok(panels.includes("Available history") || panels.includes("available history"), "available history copy present");
assert.ok(panels.includes("Commercial activity") || panels.includes("commercial activity"), "commercial activity not conversion funnel");
assert.ok(api.includes("/financials/transactions"), "history transactions API present");
assert.ok(app.includes("A/R Aging") || app.includes("financials-aging") || panels.includes("A/R Aging"), "A/R Aging section present");
assert.ok(app.includes("Collection status") || app.includes("collectionAttention") || panels.includes("Collection status"), "collection status present");
assert.ok(app.includes("due dates and unpaid balances") || app.includes("Collection status is based only") || panels.includes("Collection status is based only"), "collection help copy present");
assert.ok(api.includes("/financials"), "financials API client present");
assert.ok(api.includes("/insights"), "insights API client present");
assert.ok(css.includes("financials-panel"), "financials styles present");
assert.ok(css.includes("collection-status"), "collection status styles present");
assert.equal(app.includes("qb_root_customer_list_id"), false, "must not expose root ListIDs in UI");
assert.equal(app.includes("qb_customer_list_id"), false, "must not expose customer ListIDs in UI");
assert.equal(app.includes("terms_list_id"), false, "must not expose TermsId in UI");
assert.equal(/profit and loss|P&L|profitability|gross profit|gross margin|COGS/i.test(app + panels), false, "must not advertise company P&L language to staff");
assert.ok(app.includes("activity-list") || maintain.includes("activityLabel"), "directory activity preserved");
assert.ok(app.includes("ContactsMaintain") || maintain.includes("Deactivate"), "contact maintainability present");
assert.ok(maintain.includes("Former locations") || maintain.includes("Deactivate"), "location maintainability present");
// Workspace helpers exported
assert.ok(workspace.includes("export function parseUrlState"), "parseUrlState exported");
assert.ok(workspace.includes("export function formatResultRange"), "formatResultRange exported");
assert.ok(workspace.includes("export function activityLabel"), "activityLabel exported");
assert.ok(workspace.includes("export function initials"), "initials exported");
assert.ok(css.includes("max-width: 1500px") || css.includes("max-width:1480px") || css.includes("max-width: 1480px"), "directory list uses wide desktop shell");
assert.ok(css.includes("ad-freshness-strip"), "source-specific freshness strip");
assert.ok(css.includes("ad-empty-state"), "designed empty states");
assert.ok(panels.includes("buildRelationshipView"), "Relationship uses safe view-model");
assert.ok(panels.includes("No recorded timeline activity") || panels.includes("emptyCopy"), "Relationship empty copy");
assert.ok(panels.includes("Most recent commercial activity") || panels.includes("commercialRecencyLabel"));
assert.ok(panels.includes("Moraware Operations"), "Moraware Operations section present");
assert.ok(panels.includes("2026 Jobs"), "2026 job count label present");
assert.ok(panels.includes("2026 SqFt"), "2026 SqFt label present");
assert.ok(panels.includes("formatSqft"), "SqFt uses formatSqft");
assert.ok(panels.includes("formatJobsLabel"), "Jobs uses formatJobsLabel");
assert.ok(panels.includes("TrustedKpi") || panels.includes("ad-trusted-kpi"), "trusted KPI semantics present");
assert.ok(panels.includes("SectionSkeleton") || panels.includes("ad-section-loading"), "progressive loading skeletons");
assert.ok(panels.includes("Job salesperson"), "salesperson labeled as job fact");
assert.ok(app.includes("relationshipBusy"), "relationship loads independently of financials busy");
assert.ok(maintain.includes("Account Directory UUID") || maintain.includes("accountId"), "Connections shows AD UUID");
assert.ok(maintain.includes("Multiple Moraware Account IDs") || maintain.includes("legitimately map"), "multi-Moraware ID copy");
assert.equal(panels.includes("Account Owner"), false, "must not treat Moraware salesperson as account owner");
assert.equal(panels.includes("install completion"), false);
assert.equal(/material|color|room|edge profile/i.test(panels.slice(panels.indexOf("Moraware Operations"), panels.indexOf("Moraware Operations") + 1600)), false);
const relationshipSrc = readFileSync(join(root, "backend-core/src/accountDirectory/accountDirectory360.mjs"), "utf8");
assert.ok(
  relationshipSrc.includes("embedFinancials") || relationshipSrc.includes("params.financials"),
  "relationship no longer always embeds a second full financials load"
);
assert.ok(
  !/Promise\.all\(\[\s*params\.store\.listContacts[\s\S]*getAccountDirectoryFinancials\(params\)\s*\]\)/.test(
    relationshipSrc
  ),
  "relationship must not Promise.all financials with contacts by default"
);
console.log("ok: Phase 5.1 workspace UX + Relationship reliability");

// ── Design tokens ─────────────────────────────────────────────────────────
assert.ok(css.includes("IBM Plex Sans"), "IBM Plex Sans font present");
assert.equal(css.includes("linear-gradient(180deg"), false, "no decorative body gradient");
assert.ok(css.includes("summary-strip"), "summary strip styles present");
assert.ok(css.includes("status-pill-active"), "status pill color variants present");
assert.ok(css.includes("monogram"), "monogram styles present");
console.log("ok: design tokens and typography updated");

// ── Accessibility ─────────────────────────────────────────────────────────
assert.ok(app.includes("aria-live"), "aria-live present for live regions");
assert.ok(app.includes("aria-label"), "aria-label present");
assert.ok(app.includes("aria-current"), "aria-current present");
assert.ok(app.includes('role="dialog"'), "modal has dialog role");
console.log("ok: accessibility attributes present");

console.log("\nAll account directory UI contract checks passed.\n");
