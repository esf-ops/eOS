/**
 * Studio Home-shell + Command Center email-sync wiring regressions.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/studioShellAndEmailSync.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const app = readFileSync(join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
const page = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateCommandCenterPage.tsx"),
  "utf8"
);
const css = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");
const home = readFileSync(join(root, "app-home/src/ui/App.tsx"), "utf8");
const topbar = readFileSync(join(root, "shared/eliteos-ui/EliteosTopbar.tsx"), "utf8");
const api = readFileSync(join(root, "app-elite100-estimate-studio/src/lib/quoteIntakeApi.mjs"), "utf8");
const routes = readFileSync(join(root, "backend-core/src/quoteIntake/quoteIntakeRoutes.js"), "utf8");
const syncSvc = readFileSync(
  join(root, "backend-core/src/quoteIntake/quoteIntakeMailboxSyncService.mjs"),
  "utf8"
);

console.log("\nstudioShellAndEmailSync.ui.test.mjs\n");

// 1–2. Studio imports exact production Home shell; no deprecated Studio topbar
assert.ok(home.includes('from "../../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(app.includes('from "../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(topbar.includes("Visual source of truth: the Home Launcher topbar"));
assert.equal(app.includes("statusSlot"), false);
assert.equal(/Private pilot/i.test(app), false);
assert.equal(app.includes('className="topbar"') && app.includes("studio-topbar"), false);
console.log("ok: Studio uses shared EliteosTopbar; Private pilot removed");

// 3–6. One shell, one account block, Home-like menu
assert.ok(app.includes('className="shell"'));
assert.equal((app.match(/<EliteosTopbar/g) || []).length >= 1, true);
assert.ok(app.includes("Profile & preferences"));
assert.ok(app.includes("Open Home"));
assert.ok(app.includes('apiGet("/api/me"'));
assert.ok(app.includes("userSubtitle"));
assert.ok(app.includes("organization_logo_url") || app.includes("organizationLogoUrl"));
assert.equal(page.includes("EliteosTopbar"), false);
console.log("ok: shell wrapper + /api/me identity + Home-like account menu");

// 7–10. Nav below topbar; CC default; legacy under More; body preserved
assert.ok(app.includes("studio-primary-nav") || app.includes('aria-label="Studio sections"'));
assert.match(app, /useState<[\s\S]*?>\("command-center"\)/);
assert.ok(app.includes("studio-nav-more"));
assert.ok(app.includes("Open legacy queue"));
assert.ok(page.includes("ecc-summary"));
assert.ok(page.includes("ecc-primary-action"));
console.log("ok: Studio nav + Command Center defaults preserved");

// 11–12. CSS does not override shared shell classes; tokens match Home accent
assert.equal(/\.eliteos-topbar[^{\n]*\{[^}]*display:\s*none/i.test(css), false);
assert.ok(css.includes("--eos-accent: #a3132f"));
assert.ok(css.includes("--eos-ink: #0b1a33"));
assert.ok(css.includes("--r-md: 12px"));
assert.ok(css.includes('"Inter"'));
console.log("ok: Studio tokens aligned for shared topbar; no eliteos-topbar overrides");

// 13–16. Email sync status vs Refresh vs Sync inbox
assert.ok(page.includes("ecc-email-intake"));
assert.ok(page.includes("getMailboxSyncStatus"));
assert.ok(page.includes("startMailboxSync"));
assert.ok(page.includes('data-testid="ecc-refresh"'));
assert.ok(page.includes('data-testid="ecc-sync-inbox"'));
assert.ok(page.includes("Reload queue data without contacting the mailbox"));
assert.ok(page.includes("Run the canonical inbox ingestion process"));
assert.equal(page.includes("startMailboxSync"), true);
// Refresh must not call startMailboxSync
const refreshIdx = page.indexOf('data-testid="ecc-refresh"');
const refreshBlock = page.slice(refreshIdx, refreshIdx + 350);
assert.equal(refreshBlock.includes("startMailboxSync"), false);
assert.ok(page.includes("EMAIL_SYNC_POLL_MS"));
assert.ok(page.includes("EMAIL_SYNC_POLL_MAX_MS"));
console.log("ok: email status/load separate from Refresh; Sync inbox wired");

// 17–20. Backend contract reuses canonical ingestion
assert.ok(routes.includes("/mailbox/sync-status"));
assert.ok(routes.includes("/mailbox/sync"));
assert.ok(syncSvc.includes("previewQuoteIntakeMailbox"));
assert.ok(syncSvc.includes("importQuoteIntakeMailboxMessages"));
assert.ok(api.includes("mailbox/sync-status"));
assert.ok(api.includes("mailbox/sync"));
assert.ok(syncSvc.includes("attached"));
console.log("ok: sync routes + canonical preview/import reuse");

// 21–27. Result / failure / activity / no secrets
assert.ok(page.includes("ecc-email-result"));
assert.ok(page.includes("ecc-email-failure"));
assert.ok(page.includes("View details"));
assert.ok(page.includes("ecc-sync-activity"));
assert.ok(syncSvc.includes("safeError"));
assert.ok(syncSvc.includes("persistenceNote"));
assert.equal(syncSvc.includes("clientSecret"), false);
assert.equal(page.includes("access_token"), false);
assert.equal(page.includes("bodyPreview"), false);
console.log("ok: result/failure/activity surfaces; no secret fields");

console.log("\nAll studio shell + email-sync UI tests passed.\n");
