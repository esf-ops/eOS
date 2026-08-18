import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  FINAL_ACTION_READINESS,
  NON_EXECUTABLE_FINAL_ACTIONS,
  buildFinalActionQueueSummary,
  buildFinalActionReadiness,
  classifyFinalActionReadiness,
  finalActionRowToReviewItem,
  isFastFinalActionQueueRow,
  resolveMorawareSourceAccounts,
  stageMorawareConnectAfterQbCreate,
  toFastFinalActionQueue
} from "./accountDirectoryMorawareFinalActionQueue.mjs";
import {
  loadFinalActionPlan,
  resolveFinalActionPlanPath,
  resolveFinalActionPlanPathWithLocalFallback
} from "./accountDirectoryMorawareFinalActionPlanLoad.mjs";
import { listMorawareReconciliationQueue } from "./accountDirectoryMorawareReconciliation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const sourceAccounts = [
  { sourceAccountId: "101", accountName: "Heartland Design" },
  { sourceAccountId: "202", accountName: "Dyersville- BK Flooring & Kitchen" },
  { sourceAccountId: "303", accountName: "Advance Millwork of Iowa" }
];

function action(overrides) {
  return {
    moraware_name: "Heartland Design",
    normalized_customer_name: "Heartland Design",
    final_action: "CONNECT_MORAWARE_TO_EXISTING_AD",
    ad_uuid: "ad-heartland",
    ad_display_name: "Heartland Designs",
    qb_name: "Heartland Designs",
    qb_list_id: "80000CAB-1327164153",
    qb_active: "YES",
    ...overrides
  };
}

{
  const hit = resolveMorawareSourceAccounts(action(), sourceAccounts);
  assert.equal(hit.matches.length, 1);
  assert.equal(hit.matches[0].sourceAccountId, "101");
  console.log("ok: 1) exact Moraware source ID can enter ready path");
}

{
  const hit = resolveMorawareSourceAccounts(action({ moraware_name: "Nobody LLC" }), sourceAccounts);
  assert.equal(hit.matches.length, 0);
  assert.equal(hit.reason, "zero_source_id_match");
  const row = classifyFinalActionReadiness({
    action: action({ moraware_name: "Nobody LLC" }),
    sourceAccounts,
    morawareLinksBySourceId: new Map(),
    qbLinksByListId: new Map(),
    directoryAccounts: []
  });
  assert.equal(row.readiness, FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID);
  assert.equal(isFastFinalActionQueueRow(row), false);
  console.log("ok: 2) zero source-ID match is blocked");
}

{
  const dupes = [
    ...sourceAccounts,
    { sourceAccountId: "109", accountName: "Heartland Design" }
  ];
  const hit = resolveMorawareSourceAccounts(action(), dupes);
  assert.ok(hit.matches.length > 1);
  const row = classifyFinalActionReadiness({
    action: action(),
    sourceAccounts: dupes,
    morawareLinksBySourceId: new Map(),
    qbLinksByListId: new Map(),
    directoryAccounts: []
  });
  assert.equal(row.readiness, FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID);
  assert.equal(isFastFinalActionQueueRow(row), false);
  console.log("ok: 3) multiple source-ID matches are blocked");
}

{
  const links = new Map([
    ["101", { accountId: "ad-heartland", link: { id: "lnk-1" } }]
  ]);
  const nameOnly = classifyFinalActionReadiness({
    action: action(),
    sourceAccounts,
    morawareLinksBySourceId: new Map(),
    qbLinksByListId: new Map(),
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  assert.equal(nameOnly.readiness, FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD);
  const exact = classifyFinalActionReadiness({
    action: action(),
    sourceAccounts,
    morawareLinksBySourceId: links,
    qbLinksByListId: new Map(),
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  assert.equal(exact.readiness, FINAL_ACTION_READINESS.ALREADY_LINKED_EXACT);
  assert.equal(isFastFinalActionQueueRow(exact), false);
  console.log("ok: 4) display-name belief is not ALREADY_LINKED without exact source ID → AD link");
}

{
  const row = classifyFinalActionReadiness({
    action: action(),
    sourceAccounts,
    morawareLinksBySourceId: new Map(),
    qbLinksByListId: new Map(),
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  const item = finalActionRowToReviewItem(row);
  assert.equal(item.finalActionKind, FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD);
  assert.equal(item.proposedAccountId, "ad-heartland");
  assert.equal(item.candidates[0].confirmAllowed, true);
  assert.equal(item.createFromQuickBooksAllowed, false);
  console.log("ok: 5) existing AD target stages YES — CONNECT");
}

{
  const row = classifyFinalActionReadiness({
    action: action({
      moraware_name: "Advance Millwork of Iowa",
      final_action: "CREATE_AD_FROM_QB_THEN_CONNECT",
      ad_uuid: "",
      qb_list_id: "80000088-1327163139",
      qb_name: "Advance Millwork Inc."
    }),
    sourceAccounts,
    morawareLinksBySourceId: new Map(),
    qbLinksByListId: new Map(),
    directoryAccounts: []
  });
  assert.equal(row.readiness, FINAL_ACTION_READINESS.READY_CREATE_FROM_QB_THEN_CONNECT);
  const item = finalActionRowToReviewItem(row);
  assert.equal(item.candidates[0].createFromQuickBooksAllowed, true);
  assert.equal(item.candidates[0].accountId, null);
  assert.equal(item.confirmAllowed, false);
  console.log("ok: 6) QB-only target stages YES — CREATE ACCOUNT FROM QUICKBOOKS");
}

{
  const createItem = finalActionRowToReviewItem(
    classifyFinalActionReadiness({
      action: action({
        moraware_name: "Advance Millwork of Iowa",
        final_action: "CREATE_AD_FROM_QB_THEN_CONNECT",
        ad_uuid: "",
        qb_list_id: "80000088-1327163139",
        qb_name: "Advance Millwork Inc."
      }),
      sourceAccounts,
      morawareLinksBySourceId: new Map(),
      qbLinksByListId: new Map(),
      directoryAccounts: []
    })
  );
  const staged = stageMorawareConnectAfterQbCreate(createItem, {
    accountId: "ad-new",
    displayName: "Advance Millwork Inc.",
    qbListId: "80000088-1327163139"
  });
  assert.equal(staged.stagedAfterCreate, true);
  assert.equal(staged.createFromQuickBooksAllowed, false);
  assert.equal(staged.candidates[0].createFromQuickBooksAllowed, false);
  assert.equal(staged.confirmAllowed, true);
  assert.equal(staged.proposedAccountId, "ad-new");
  assert.equal(createItem.createFromQuickBooksAllowed, true, "create helper does not auto-link Moraware");
  console.log("ok: 7–8) create does not auto-connect Moraware; same record stages YES — CONNECT MORAWARE");
}

{
  const row = classifyFinalActionReadiness({
    action: action({
      moraware_name: "Advance Millwork of Iowa",
      final_action: "CREATE_AD_FROM_QB_THEN_CONNECT",
      ad_uuid: "",
      qb_list_id: "80000088-1327163139"
    }),
    sourceAccounts,
    morawareLinksBySourceId: new Map(),
    qbLinksByListId: new Map([["80000088-1327163139", { accountId: "ad-existing" }]]),
    directoryAccounts: [{ id: "ad-existing", displayName: "Advance Millwork Inc." }]
  });
  assert.equal(row.readiness, FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD);
  assert.equal(row.reclassified_from_create, true);
  assert.equal(row.ad_uuid, "ad-existing");
  console.log("ok: 9) QB ListID already linked converts CREATE to CONNECT; no duplicate account");
}

{
  const built = buildFinalActionReadiness({
    actions: [
      action({ final_action: "KEEP_UNRESOLVED", moraware_name: "CKF" }),
      action({ final_action: "IGNORE_LEGACY", moraware_name: "Boyd Crosby (HOLD)" }),
      action({ final_action: "INTERNAL_BUCKET", moraware_name: "Dyersville ESF" }),
      action({ final_action: "MANUAL_QB_ROOT_SELECTION", moraware_name: "Anchor Lumber" }),
      action({ final_action: "REVIEW_REQUIRED", moraware_name: "Mystery Co" }),
      action()
    ],
    sourceAccounts,
    morawareLinks: [],
    qbLinks: [],
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  const queue = toFastFinalActionQueue(built);
  assert.equal(built.counts.NON_EXECUTABLE_BY_PLAN, 5);
  assert.equal(queue.every((r) => r.readiness === FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD), true);
  assert.equal(queue.some((r) => NON_EXECUTABLE_FINAL_ACTIONS.includes(r.planned_final_action)), false);
  console.log("ok: 10) non-executable final-action classes never enter fast execution queue");
}

{
  const api = readFileSync(path.join(here, "accountDirectoryApi.js"), "utf8");
  assert.equal(/bulk[-_ ]confirm|confirmAll|linkAllMoraware/i.test(api), false);
  const svc = readFileSync(path.join(here, "accountDirectoryService.mjs"), "utf8");
  const createFn = svc.split("async createAccountFromQuickBooks")[1].split("async deactivateExternalLink")[0];
  assert.equal(createFn.includes("linkMoraware"), false);
  assert.equal(createFn.includes("morawareAutoLinked: false"), true);
  const queueSrc = readFileSync(path.join(here, "accountDirectoryMorawareFinalActionQueue.mjs"), "utf8");
  assert.equal(queueSrc.includes("insert("), false);
  assert.equal(queueSrc.includes("createAccount("), false);
  console.log("ok: 11–12) no bulk-confirm endpoint; create-from-QB does not write Moraware/QB");
}

{
  assert.equal(resolveFinalActionPlanPath({ NODE_ENV: "production" }), null);
  assert.equal(resolveFinalActionPlanPathWithLocalFallback({ NODE_ENV: "production", ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_ALLOW_LOCAL: "1" }), null);
  const missing = loadFinalActionPlan({ NODE_ENV: "production" });
  assert.equal(missing.available, false);
  console.log("ok: production never defaults to local-imports CSV/plan");
}

{
  const dy = resolveMorawareSourceAccounts(
    action({
      moraware_name: "Dyersville- BK Flooring & Kitchen",
      normalized_customer_name: "BK Flooring & Kitchen"
    }),
    sourceAccounts
  );
  assert.equal(dy.matches[0].sourceAccountId, "202");
  const dyFallback = resolveMorawareSourceAccounts(
    action({
      moraware_name: "Dyersville- Unique Cabinets",
      normalized_customer_name: "Heartland Design"
    }),
    [...sourceAccounts, { sourceAccountId: "404", accountName: "Unique Cabinets" }]
  );
  assert.equal(dyFallback.matches[0].sourceAccountId, "404");
  const leftoverNormalized = resolveMorawareSourceAccounts(
    action({ moraware_name: "Nobody LLC", normalized_customer_name: "Heartland Design" }),
    sourceAccounts
  );
  assert.equal(leftoverNormalized.matches.length, 0);
  console.log("ok: Dyersville prefix is exact/unique-strip only; leftover normalized names do not match");
}

{
  const built = buildFinalActionReadiness({
    actions: [action(), action({ moraware_name: "CKF", final_action: "KEEP_UNRESOLVED" })],
    sourceAccounts,
    morawareLinks: [],
    qbLinks: [],
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  const summary = buildFinalActionQueueSummary(built);
  assert.equal(summary.readyConnectExistingAd, 1);
  assert.equal(summary.nonExecutableByPlan, 1);
  assert.equal(summary.unresolved, 1);
}

{
  const row = classifyFinalActionReadiness({
    action: action(),
    sourceAccounts,
    morawareLinksBySourceId: new Map([["101", { accountId: "ad-other" }]]),
    qbLinksByListId: new Map(),
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  assert.equal(row.readiness, FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID);
  assert.equal(row.blocked_reason, "contradictory_current_moraware_link");
  assert.equal(isFastFinalActionQueueRow(row), false);
  console.log("ok: contradictory current Moraware link is blocked");
}

{
  const linked = classifyFinalActionReadiness({
    action: action(),
    sourceAccounts,
    morawareLinksBySourceId: new Map([["101", { accountId: "ad-heartland" }]]),
    qbLinksByListId: new Map(),
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  const mixed = buildFinalActionReadiness({
    actions: [action(), action({ moraware_name: "Heartland Design", final_action: "CONNECT_MORAWARE_TO_EXISTING_AD" })],
    sourceAccounts,
    morawareLinks: [{ externalId: "101", accountId: "ad-heartland", isActive: true, externalSystem: "moraware" }],
    qbLinks: [],
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }]
  });
  assert.equal(linked.readiness, FINAL_ACTION_READINESS.ALREADY_LINKED_EXACT);
  assert.equal(toFastFinalActionQueue(mixed).length, 0);
  console.log("ok: ALREADY_LINKED_EXACT never enters fast execution queue");
}

{
  const planSrc = readFileSync(path.join(here, "accountDirectoryMorawareFinalActionPlanLoad.mjs"), "utf8");
  assert.equal(planSrc.includes(".csv"), false);
  assert.equal(resolveFinalActionPlanPath({}), null);
  assert.equal(
    resolveFinalActionPlanPath({
      NODE_ENV: "production",
      ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_PATH: "/tmp/plan.json"
    }),
    "/tmp/plan.json"
  );
  console.log("ok: plan loader never reads CSV; production has no default plan");
}

{
  const dataset = {
    morawareAccounts: [{ sourceAccountId: "101", accountName: "Heartland Design" }],
    directoryAccounts: [{ id: "ad-heartland", displayName: "Heartland Designs" }],
    aliases: [],
    contacts: [],
    locations: [],
    qbLinksByAccountId: new Map(),
    morawareLinksBySourceId: new Map(),
    morawareLinksByAccountId: new Map(),
    jobsByMorawareId: new Map(),
    qbRootFacts: []
  };
  const blocked = await listMorawareReconciliationQueue({
    role: "admin",
    organizationId: "org",
    query: { queue: "final-action" },
    dataset,
    finalActionPlan: { available: false, actions: [] }
  });
  assert.equal(blocked.finalActionAvailable, false);
  assert.equal((blocked.items || []).length, 0);

  const ready = await listMorawareReconciliationQueue({
    role: "admin",
    organizationId: "org",
    query: { queue: "final-action", pageSize: 50 },
    dataset,
    finalActionPlan: {
      available: true,
      actions: [action()]
    }
  });
  assert.equal(ready.finalActionAvailable, true);
  assert.equal(ready.items.length, 1);
  assert.equal(ready.items[0].morawareAccountId, "101");
  assert.equal(ready.items[0].finalActionKind, FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD);
  assert.equal(ready.items[0].proposedAccountId, "ad-heartland");
  console.log("ok: reconciliation queue final-action mode uses injected plan, not CSV");
}

console.log("\naccountDirectoryMorawareFinalActionQueue.test.mjs — all passed\n");
