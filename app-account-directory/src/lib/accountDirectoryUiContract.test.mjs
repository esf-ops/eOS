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
const api = readFileSync(join(root, "app-account-directory/src/lib/accountDirectoryApi.ts"), "utf8");
const css = readFileSync(join(root, "app-account-directory/src/styles.css"), "utf8");
const install = readFileSync(join(root, "app-install-dashboard/src/InstallDashboardApp.tsx"), "utf8");
const topbar = readFileSync(join(root, "shared/eliteos-ui/EliteosTopbar.tsx"), "utf8");
const workspace = readFileSync(join(root, "app-account-directory/src/lib/accountDirectoryWorkspace.mjs"), "utf8");

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
assert.ok(app.includes("Needs review"));
assert.ok(app.includes("Archived"));
assert.ok(app.includes("New account"));
assert.ok(app.includes("QuickBooks restricted"));
assert.ok(app.includes("permission-denied"));
console.log("ok: nav tabs, list actions, and permission states present");

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
assert.ok(app.includes("profile-panel"), "profile-panel class present");
assert.ok(app.includes("Data health"), "data health section present");
// Activity labels
assert.ok(app.includes("activityLabel"), "activityLabel helper used");
assert.ok(app.includes("Activity"), "Activity tab present");
// Workspace helpers exported
assert.ok(workspace.includes("export function parseUrlState"), "parseUrlState exported");
assert.ok(workspace.includes("export function formatResultRange"), "formatResultRange exported");
assert.ok(workspace.includes("export function activityLabel"), "activityLabel exported");
assert.ok(workspace.includes("export function initials"), "initials exported");
console.log("ok: premium workspace features present (summary strip, pagination, URL state, profile panel)");

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
