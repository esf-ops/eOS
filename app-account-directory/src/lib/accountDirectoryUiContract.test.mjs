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

console.log("\naccountDirectoryUiContract.test.mjs\n");

assert.ok(app.includes('from "../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(install.includes('from "../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(topbar.includes("Visual source of truth: the Home Launcher topbar"));
assert.equal(app.includes("searchSlot"), false);
assert.ok(app.includes('className="shell"'));
assert.ok(app.includes('appName="Account Directory"'));
assert.ok(app.includes('apiGet("/api/me"'));
assert.ok(app.includes("supabase.auth.signOut"));
assert.ok(css.includes("--eos-accent: #a3132f"));
console.log("ok: Account Directory uses shared EliteosTopbar / shell tokens");

assert.ok(app.includes('className="ad-nav"'));
assert.ok(app.includes("Accounts"));
assert.ok(app.includes("Prospects"));
assert.ok(app.includes("Needs review"));
assert.ok(app.includes("Archived"));
assert.ok(app.includes("New account"));
assert.ok(app.includes("QuickBooks restricted"));
assert.ok(app.includes("permission-denied"));
console.log("ok: nav tabs, list actions, and permission states present");

assert.ok(api.includes('const BASE = "/api/account-directory"'));
assert.ok(api.includes("${BASE}/accounts"));
assert.ok(api.includes("${BASE}/prospects"));
assert.ok(api.includes("link-quickbooks"));
assert.equal(app.includes("Estimate Studio"), false);
assert.equal(app.includes("estimate-studio"), false);
console.log("ok: account-directory API client wired; no Estimate Studio coupling");

console.log("\nAll account directory UI contract checks passed.\n");
