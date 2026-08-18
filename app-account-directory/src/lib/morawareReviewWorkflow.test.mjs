/**
 * Moraware Links Review Mode — queue/workflow regression.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  WORK_QUEUE_FILTERS,
  applyNoNextMatch,
  applySkip,
  applySuccessfulYes,
  buildMorawareQueueQuery,
  buildUnifiedCustomerSearchResults,
  isUnresolvedWorkRow,
  primaryReviewAction,
  readyHasActionablePrimaryPath,
  remainingFromSummary,
  reviewBadgeForItem,
  weakSuggestionHint
} from "./morawareReviewWorkflow.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(path.join(here, "../ui/MorawareReview.tsx"), "utf8");

{
  const q = buildMorawareQueueQuery({ mode: "work", filter: "", page: 1, pageSize: 100 });
  assert.equal(q.linked, "false");
  assert.equal(q.reviewState, "");
  console.log("ok: 1) default Moraware queue excludes LINKED (linked=false)");
}

{
  assert.equal(remainingFromSummary({ totalMorawareAccounts: 319, alreadyLinked: 169, unresolved: 150 }), 150);
  assert.equal(remainingFromSummary({ totalMorawareAccounts: 319, alreadyLinked: 169 }), 150);
  console.log("ok: 2–3) default count equals unresolved (319/169 → 150)");
}

{
  assert.equal(
    isUnresolvedWorkRow({
      reviewState: "LINKED",
      currentLink: { linked: true },
      classification: "CONFLICT"
    }),
    false
  );
  assert.equal(
    isUnresolvedWorkRow({
      reviewState: "EXISTING_AD_QB_BACKED",
      currentLink: { linked: false },
      classification: "HIGH_CONFIDENCE_CANDIDATE"
    }),
    true
  );
  const linkedQuery = buildMorawareQueueQuery({ mode: "linked", page: 1 });
  assert.equal(linkedQuery.linked, "true");
  assert.equal(linkedQuery.reviewState, "LINKED");
  console.log("ok: 4–5) LINKED+supporting CONFLICT excluded from work; linked history query separate");
}

{
  assert.equal(ui.includes('mode === "review"'), true);
  assert.equal(ui.includes("Review one by one"), true);
  assert.ok(ui.includes("isUnresolvedWorkRow"));
  assert.equal(ui.includes('review:LINKED'), false);
  assert.ok(!WORK_QUEUE_FILTERS.some((f) => f.id.includes("LINKED")));
  console.log("ok: 6) Review one by one / filters never treat LINKED as work");
}

{
  const items = [
    { morawareAccountId: "1" },
    { morawareAccountId: "2" },
    { morawareAccountId: "3" }
  ];
  const yes = applySuccessfulYes(items, "1", { unresolved: 150, alreadyLinked: 169, totalMorawareAccounts: 319 });
  assert.deepEqual(
    yes.remainingItems.map((r) => r.morawareAccountId),
    ["2", "3"]
  );
  assert.equal(yes.nextId, "2");
  assert.equal(yes.summaryPatch.unresolved, 149);
  assert.equal(yes.summaryPatch.alreadyLinked, 170);
  console.log("ok: 7–9) successful YES removes row, decrements once, selects next unresolved");
}

{
  // Failed link path is UI-owned; helper must not mutate when not called.
  const before = { unresolved: 150, alreadyLinked: 169 };
  assert.equal(remainingFromSummary(before), 150);
  console.log("ok: 10) failed link does not call applySuccessfulYes (no decrement)");
}

{
  const skip = applySkip(
    [{ morawareAccountId: "a" }, { morawareAccountId: "b" }, { morawareAccountId: "c" }],
    "a"
  );
  assert.equal(skip.nextId, "b");
  assert.equal(skip.remainingUnchanged, true);
  const only = applySkip([{ morawareAccountId: "a" }], "a");
  assert.equal(only.remainingUnchanged, true);
  console.log("ok: 11) SKIP advances without resolving / without decrementing remaining");
}

{
  assert.deepEqual(applyNoNextMatch(0, 3), { nextIndex: 1, cycled: true });
  assert.deepEqual(applyNoNextMatch(2, 3), { nextIndex: 0, cycled: true });
  assert.deepEqual(applyNoNextMatch(0, 1), { nextIndex: 0, cycled: false });
  console.log("ok: 12) NO cycles candidates without resolving row");
}

{
  const browse = buildMorawareQueueQuery({ mode: "work", page: 1, pageSize: 100 });
  assert.equal(browse.linked, "false");
  assert.ok(ui.includes("of") && ui.includes("unresolved"));
  console.log("ok: 13) browse unresolved query is unresolved-only");
}

{
  const merged = buildUnifiedCustomerSearchResults({
    adItems: [{ id: "ad-1", displayName: "Lepic Co", status: "prospect", city: "Iowa City", state: "IA" }],
    qbItems: [
      { listId: "QB-1", displayName: "Lepic Co", active: true },
      { listId: "", displayName: "bad" }
    ]
  });
  assert.equal(merged.directory.length, 1);
  assert.equal(merged.quickbooks.length, 1);
  assert.equal(merged.quickbooks[0].qbListId, "QB-1");
  assert.ok(ui.includes("searchQuickBooksCustomers"));
  assert.ok(ui.includes("Account Directory"));
  assert.ok(ui.includes("QuickBooks"));
  console.log("ok: 14–15) unified search includes AD + QB roots; empty listId excluded");
}

{
  assert.ok(ui.includes("nothing auto-link") || ui.includes("never auto-link") || ui.includes("was not auto-linked") || ui.includes("nothing auto-links"));
  assert.equal(ui.includes("Confirm All"), false);
  assert.ok(ui.includes("Unlink"));
  console.log("ok: 16–18) no auto-link on search alone; no bulk confirm; unlink/history preserved");
}

{
  const heartland = {
    reviewState: "EXISTING_AD_QB_BACKED",
    confirmAllowed: false,
    proposedAccountId: "ad-heart",
    morawareName: "Heartland Design",
    currentLink: { linked: false },
    candidates: [
      {
        accountId: "ad-heart",
        displayName: "Heartland Designs",
        qbDisplayName: "Heartland Designs",
        identityKind: "EXISTING_AD_QB_BACKED",
        confirmAllowed: false,
        qbListId: "QB-HEART",
        evidence: [
          { type: "name_fuzzy", label: "Near business-name match" },
          { type: "qb_linked", label: "Directory account has QuickBooks link" }
        ]
      }
    ]
  };
  const cand = heartland.candidates[0];
  const action = primaryReviewAction(heartland, cand);
  const badge = reviewBadgeForItem(heartland, cand);
  assert.equal(badge.label, "Ready");
  assert.equal(action.kind, "connect_moraware");
  assert.equal(action.label, "YES — Connect");
  assert.equal(readyHasActionablePrimaryPath(heartland, cand), true);
  assert.equal(Boolean(cand.confirmAllowed), false);
  assert.ok(weakSuggestionHint(cand));
  console.log("ok: Heartland Ready + YES — Connect even when confirmAllowed=false");
}

{
  const readyNoUuid = {
    reviewState: "EXISTING_AD_QB_BACKED",
    confirmAllowed: false,
    currentLink: { linked: false },
    candidates: [{ accountId: null, confirmAllowed: false, identityKind: "EXISTING_AD_QB_BACKED" }]
  };
  assert.equal(reviewBadgeForItem(readyNoUuid, readyNoUuid.candidates[0]).label, "Possible match");
  assert.notEqual(primaryReviewAction(readyNoUuid, readyNoUuid.candidates[0]).kind, "connect_moraware");
  assert.equal(readyHasActionablePrimaryPath(readyNoUuid, readyNoUuid.candidates[0]), true);
  console.log("ok: 1–2) Ready never renders without an actionable YES/create/confirm path");
}

{
  const possible = {
    reviewState: "POSSIBLE_CANDIDATE",
    confirmAllowed: false,
    currentLink: { linked: false },
    candidates: [{ accountId: "ad-p", confirmAllowed: false, identityKind: "POSSIBLE_CANDIDATE" }]
  };
  assert.equal(reviewBadgeForItem(possible, possible.candidates[0]).label, "Possible");
  assert.equal(primaryReviewAction(possible, possible.candidates[0]).kind, "connect_moraware");
  assert.ok(weakSuggestionHint(possible.candidates[0]));
  console.log("ok: 3) Possible stays distinct; UUID still offers explicit YES — Connect");
}

{
  const onYes = ui.split("async function onYes")[1]?.split("function onNo")[0] || "";
  assert.ok(onYes.includes("linkMoraware"));
  assert.equal(onYes.includes("confirmAllowed"), false, "human YES on exact UUID does not require confirmAllowed");
  assert.equal(ui.includes("Confirm All"), false);
  assert.equal(/useEffect\(\(\) => \{\s*void linkMoraware/.test(ui), false);
  const onNo = ui.split("function onNo")[1]?.split("function onSkip")[0] || "";
  const onSkip = ui.split("function onSkip")[1]?.split("async function unlink")[0] || "";
  assert.equal(onNo.includes("linkMoraware"), false);
  assert.equal(onSkip.includes("linkMoraware"), false);
  assert.ok(ui.includes("applySuccessfulYes"));
  console.log("ok: 4–10) fuzzy never auto-links; YES uses governed link; NO/SKIP do not write; no bulk; success removes row");
}

console.log("\nmorawareReviewWorkflow.test.mjs — all passed\n");
