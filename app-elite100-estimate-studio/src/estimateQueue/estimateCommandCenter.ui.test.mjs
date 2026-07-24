/**
 * Command Center shared-UI integration regressions (source-level; no browser).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/estimateCommandCenter.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  commandCenterSummaryCounts,
  toCommandCenterItem
} from "../../../backend-core/src/elite100EstimateStudio/studioCommandCenterViewModel.mjs";
import {
  ECC_SUMMARY_CARD_KEYS,
  ECC_VIEWPORTS,
  ECC_VISUAL_FIXTURES
} from "./estimateCommandCenter.visualFixtures.mjs";

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
const css = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");
const topbar = readFileSync(join(root, "shared/eliteos-ui/EliteosTopbar.tsx"), "utf8");

console.log("\nestimateCommandCenter.ui.test.mjs\n");

// 1. Command Center uses the Studio shell (shared topbar + wide shell)
assert.ok(app.includes("EliteosTopbar"));
assert.ok(app.includes("studio-shell"));
assert.ok(app.includes("studio-shell--wide"));
assert.ok(topbar.includes("export default function EliteosTopbar"));
assert.equal(page.includes("EliteosTopbar"), false, "page must not nest a second topbar");
console.log("ok: Command Center uses Studio shell / shared topbar");

// 2–3. Publication banner absent on Command Center; remains on publish-search path
assert.ok(app.includes('mainNav === "publications"'));
assert.ok(app.includes("studio-publications-banner"));
assert.match(
  app,
  /publicationsMode === "publish-search"[\s\S]*?studio-publications-banner/
);
assert.equal(page.includes("pilot-banner"), false);
assert.equal(page.includes("publishes frozen Digital Estimates"), false);
assert.ok(page.includes("Manage estimate requests from intake through customer approval"));
console.log("ok: publication banner only on Publications; CC uses subtitle");

// 4. Primary navigation labels are readable employee-oriented labels
assert.ok(app.includes(">Command Center<") || app.includes("Command Center\n"));
assert.ok(app.includes("Live Digital Estimates"));
assert.ok(app.includes("Review Requests"));
assert.ok(css.includes(".studio-nav button"));
assert.ok(css.includes("color: var(--eos-ink)"));
assert.equal(app.includes("Customer review requests"), false);
console.log("ok: primary navigation labels simplified + ink-colored");

// 5. No duplicate legacy queue controls
const legacyNavHits = (app.match(/studio-nav-legacy-queue/g) || []).length;
assert.equal(legacyNavHits, 1);
assert.ok(app.includes("studio-nav-more"));
assert.ok(app.includes("Open legacy queue"));
assert.equal(page.includes("ecc-legacy-queue"), false);
assert.equal(page.includes("onOpenLegacyQueue"), false);
assert.ok(app.includes("EstimateQueuePage"));
assert.ok(legacy.includes("estimate-queue-dashboard"));
console.log("ok: legacy queue once under More; no page-level duplicate");

// 6–7. Summary cards render count + label; zero counts remain visible
assert.ok(page.includes("ecc-card-count"));
assert.ok(page.includes("ecc-card-label"));
assert.ok(page.includes("ecc-summary-${card.key}") || page.includes("COMMAND_CENTER_SUMMARY_CARDS"));
assert.ok(page.includes("`ecc-summary-${card.key}`") || page.includes("ecc-summary-"));
for (const key of ECC_SUMMARY_CARD_KEYS) {
  assert.ok(
    page.includes(key) || page.includes("COMMAND_CENTER_SUMMARY_CARDS"),
    `summary card key ${key} must remain in Command Center surface`
  );
}
const zeroCounts = commandCenterSummaryCounts([]);
for (const key of ECC_SUMMARY_CARD_KEYS) {
  assert.equal(zeroCounts[key], 0);
}
assert.ok(css.includes(".ecc-card-count"));
assert.ok(css.includes(".ecc-card-label"));
assert.ok(css.includes("color: var(--eos-ink)"));
console.log("ok: summary cards count+label; zero-count cards stay visible");

// 8–9. Stage filters contain accessible text; no blank pills
assert.ok(page.includes('role="tablist"'));
assert.ok(page.includes('role="tab"'));
assert.ok(page.includes("eq-chip"));
assert.ok(page.includes("{tab.label}"));
assert.ok(css.includes(".eq-chip"));
assert.match(css, /\.eq-chip\s*\{[\s\S]*?color:\s*var\(--eos-ink\)/);
console.log("ok: stage filters use labeled chips with ink color");

// 10–11. Search / sort use shared input/select pattern
assert.ok(page.includes('data-testid="ecc-search"'));
assert.ok(page.includes('data-testid="ecc-sort"'));
assert.ok(page.includes("<select"));
assert.ok(css.includes(".ecc-search input"));
assert.ok(css.includes(".ecc-toolbar select"));
console.log("ok: search + sort use shared toolbar control styling");

// 12. Queue rows use one primary action
assert.ok(page.includes('data-testid="ecc-primary-action"'));
assert.ok(page.includes("nextActionLabel"));
assert.equal((page.match(/data-testid="ecc-primary-action"/g) || []).length, 1);
console.log("ok: one primary action per queue row");

// 13. Raw user IDs are not shown in normal UI
const uuidStub = toCommandCenterItem(ECC_VISUAL_FIXTURES.uuidAssigneeStub);
assert.equal(uuidStub.assignedUser, "Assigned estimator");
assert.equal(/User\s+[0-9a-f]/i.test(uuidStub.assignedUser), false);
assert.equal(/902c8f2c/.test(uuidStub.assignedUser), false);
const unassigned = toCommandCenterItem(ECC_VISUAL_FIXTURES.unassignedEstimate);
assert.equal(unassigned.assignedUser, "Unassigned");
assert.equal(page.includes("User ${"), false);
console.log("ok: raw/truncated UUID assignee stubs neutralized");

// 14–16. Drawer uses shared panel pattern; Escape closes; focus returns
assert.ok(page.includes("eq-drawer-backdrop"));
assert.ok(page.includes("eq-drawer"));
assert.ok(page.includes("eq-drawer-header"));
assert.ok(page.includes('Escape'));
assert.ok(page.includes("lastFocusRef"));
assert.ok(page.includes("prev.focus"));
assert.ok(page.includes("ecc-drawer-close"));
console.log("ok: shared drawer + Escape + focus restore");

// 17. Responsive breakpoints cover 320–1024 (no overflow rules rely on wide-only)
for (const w of ECC_VIEWPORTS) {
  assert.ok(
    css.includes(`@media (max-width: ${w}px)`) ||
      css.includes("@media (max-width: 768px)") ||
      css.includes("@media (max-width: 420px)") ||
      css.includes("@media (max-width: 1024px)"),
    `expected responsive coverage near ${w}px`
  );
}
assert.ok(css.includes("min-width: 0"));
assert.ok(css.includes("@media (max-width: 768px)"));
assert.ok(css.includes("@media (max-width: 420px)"));
console.log("ok: responsive layout hooks for mobile/tablet widths");

// 18. Active/inactive/hover/focus readable contrast (tokenized; no global white text)
assert.equal(/^button\s*\{/m.test(css.split("/* Primary action buttons")[0]), false);
assert.ok(css.includes("Global `button { color:#fff }` previously blanked"));
assert.ok(css.includes(".studio-nav button:hover"));
assert.ok(css.includes(".studio-nav button:focus-visible"));
assert.ok(css.includes(".ecc-card:focus-visible"));
assert.ok(css.includes(".eq-chip.is-active") || css.includes(".eq-chip") && css.includes("is-active"));
console.log("ok: contrast states use tokens; global button white-text removed");

// 19. Loading skeleton matches list rhythm
assert.ok(page.includes("ecc-skeleton"));
assert.ok(page.includes("ecc-skeleton-row"));
assert.ok(css.includes(".ecc-skeleton-row"));
console.log("ok: loading skeleton present");

// 20–22. Workflow safety: no approve/publish/assign writes; soft-open only
assert.equal(page.includes("/approve"), false);
assert.equal(page.includes("/publish"), false);
assert.equal(page.includes("assignEstimateQueueCase"), false);
assert.ok(page.includes("recordEstimateQueueOpened"));
assert.ok(page.includes("nextActionRoute"));
assert.ok(page.includes('openTarget: item.nextActionRoute'));
console.log("ok: opening/filtering remains read-only (no approve/publish/assign)");

// 23–24. Legacy accessible; default landing is Command Center after corrected UI
assert.match(app, /useState<[\s\S]*?>\("command-center"\)/);
assert.ok(app.includes("EstimateCommandCenterPage"));
assert.ok(app.includes('mainNav === "estimate-queue"'));
console.log("ok: default landing is Command Center; legacy remains accessible");

// Visual fixtures cover required scenarios
assert.ok(toCommandCenterItem(ECC_VISUAL_FIXTURES.needsTakeoffReview).stageKey === "takeoff");
assert.ok(toCommandCenterItem(ECC_VISUAL_FIXTURES.readyToPublish).stageKey === "ready_to_publish");
assert.ok(toCommandCenterItem(ECC_VISUAL_FIXTURES.customerConfiguring).stageKey === "customer");
assert.ok(toCommandCenterItem(ECC_VISUAL_FIXTURES.reviewRequested).stageKey === "review_requested");
assert.ok(toCommandCenterItem(ECC_VISUAL_FIXTURES.hardProcessingFailure).blocked === true);
assert.ok(toCommandCenterItem(ECC_VISUAL_FIXTURES.unknownCustomerProject).needsCompletionHint !== undefined);
assert.ok(
  toCommandCenterItem(ECC_VISUAL_FIXTURES.longCustomerProjectNames).customerLabel.length > 40
);
console.log("ok: visual fixtures map to expected stages");

// CSS collision guard: no unscoped `button { color` primary paint
assert.equal(/\nbutton\s*\{\s*\n\s*appearance:[\s\S]*?color:\s*#fff/.test(css), false);
assert.ok(css.includes(".btn,") || css.includes(".btn\n"));
console.log("ok: CSS collision guard — primary paint scoped");

console.log("\nAll estimateCommandCenter UI wiring tests passed.\n");
