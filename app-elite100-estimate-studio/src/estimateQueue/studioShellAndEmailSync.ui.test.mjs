/**
 * Studio Home-shell + Command Center mailbox preview wiring regressions.
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
const legacy = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateQueuePage.tsx"),
  "utf8"
);
const modal = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/MailboxSyncModal.tsx"),
  "utf8"
);
const css = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");
const home = readFileSync(join(root, "app-home/src/ui/App.tsx"), "utf8");
const topbar = readFileSync(join(root, "shared/eliteos-ui/EliteosTopbar.tsx"), "utf8");
const api = readFileSync(join(root, "app-elite100-estimate-studio/src/lib/quoteIntakeApi.mjs"), "utf8");
const routes = readFileSync(join(root, "backend-core/src/quoteIntake/quoteIntakeRoutes.js"), "utf8");

console.log("\nstudioShellAndEmailSync.ui.test.mjs\n");

// Shell parity
assert.ok(home.includes('from "../../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(app.includes('from "../../shared/eliteos-ui/EliteosTopbar"'));
assert.ok(topbar.includes("Visual source of truth: the Home Launcher topbar"));
assert.equal(app.includes("statusSlot"), false);
assert.equal(/Private pilot/i.test(app), false);
assert.ok(app.includes('className="shell"'));
assert.ok(app.includes("Profile & preferences"));
assert.ok(app.includes('apiGet("/api/me"'));
assert.ok(css.includes("--eos-accent: #a3132f"));
console.log("ok: Studio uses shared EliteosTopbar / Home shell tokens");

assert.match(app, /useState<[\s\S]*?>\("command-center"\)/);
assert.ok(app.includes("studio-nav-more"));
assert.ok(page.includes("ecc-summary"));
console.log("ok: Command Center default + nav preserved");

// 1–3. Sync inbox opens existing MailboxSyncModal; preview does not import
assert.ok(page.includes('import MailboxSyncModal from "./MailboxSyncModal"'));
assert.ok(page.includes("<MailboxSyncModal"));
assert.ok(page.includes('data-testid="ecc-sync-inbox"'));
assert.ok(page.includes("setMailboxSyncOpen(true)"));
assert.ok(legacy.includes("<MailboxSyncModal"));
assert.ok(modal.includes("Preview mailbox"));
assert.ok(modal.includes("confirmImport"));
assert.ok(modal.includes("importMailboxMessages"));
assert.ok(modal.includes("Nothing is imported until you confirm") || modal.includes("confirm"));
assert.equal(page.includes("startMailboxSync"), false);
assert.equal(page.includes("getMailboxSyncStatus"), false);
assert.equal(api.includes("mailbox/sync-status"), false);
assert.equal(api.includes('mailbox/sync"'), false);
assert.equal(routes.includes("mailbox/sync-status"), false);
assert.equal(routes.includes("/mailbox/sync`"), false);
assert.equal(routes.includes("/mailbox/sync'"), false);
assert.ok(routes.includes("/mailbox/preview"));
assert.ok(routes.includes("/mailbox/import"));
console.log("ok: Sync inbox opens MailboxSyncModal; background runner removed");

// 8–10. Refresh is queue-only; no sync-status polling
const refreshIdx = page.indexOf('data-testid="ecc-refresh"');
const refreshBlock = page.slice(refreshIdx, refreshIdx + 420);
assert.equal(refreshBlock.includes("previewMailbox"), false);
assert.equal(refreshBlock.includes("importMailboxMessages"), false);
assert.equal(refreshBlock.includes("setMailboxSyncOpen"), false);
assert.ok(refreshBlock.includes("setRefreshTick"));
assert.equal(page.includes("EMAIL_SYNC_POLL"), false);
assert.equal(page.includes("setInterval"), false);
assert.equal(page.includes("ecc-email-syncing"), false);
assert.equal(page.includes("ecc-sync-activity"), false);
console.log("ok: Refresh is queue-only; no background sync polling");

// Import success refreshes queue and preserves filters via session prefs
assert.ok(page.includes("onImported={(summary)"));
assert.ok(page.includes("setRefreshTick((n) => n + 1)"));
assert.ok(page.includes("saveCommandCenterSessionPrefs"));
assert.ok(page.includes("ecc-import-notice"));
assert.ok(modal.includes("onImported({"));
assert.ok(modal.includes("createdCount") || modal.includes("created:"));
console.log("ok: confirmed import refreshes Command Center with real counters");

console.log("\nAll studio shell + email-sync UI tests passed.\n");
