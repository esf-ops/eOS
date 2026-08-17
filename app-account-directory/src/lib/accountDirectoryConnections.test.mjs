/**
 * Phase 1 — Connections workspace helpers + identity UX contracts.
 * Run: node app-account-directory/src/lib/accountDirectoryConnections.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MULTIPLE_QB_NOTICE,
  STALE_QB_FACT_COPY,
  filterMorawareCandidatesForAccount,
  nextQbPickerLinkState,
  partitionConnectionLinks,
  qbConnectionDisplayName,
  qbConnectionStatusLabel,
  safeIdentityErrorMessage,
  shouldPostQbLinkOnSelect
} from "./accountDirectoryConnections.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

{
  assert.equal(shouldPostQbLinkOnSelect(), false);
  assert.equal(nextQbPickerLinkState("results", "select"), "selected");
  assert.equal(nextQbPickerLinkState("selected", "confirm"), "confirming");
  assert.notEqual(nextQbPickerLinkState("results", "select"), "confirming");
  console.log("ok: search selection does not link; confirm required");
}

{
  const partitioned = partitionConnectionLinks([
    { id: "1", system: "QuickBooks Desktop", externalSystem: "quickbooks_desktop", isActive: true, qbTrusted: { available: true, displayName: "Acme LLC", active: true } },
    { id: "2", system: "QuickBooks Desktop", externalSystem: "quickbooks_desktop", isActive: true, qbTrusted: { available: false, displayName: null, active: null } },
    { id: "3", system: "Moraware", externalSystem: "moraware", isActive: true, externalDisplayName: "Shop A", externalId: "111" },
    { id: "4", system: "Moraware", externalSystem: "moraware", isActive: true, externalDisplayName: "Shop B", externalId: "222" },
    { id: "5", system: "QuickBooks Desktop", externalSystem: "quickbooks_desktop", isActive: false }
  ]);
  assert.equal(partitioned.qb.length, 2);
  assert.equal(partitioned.moraware.length, 2);
  assert.equal(qbConnectionDisplayName(partitioned.qb[0]), "Acme LLC");
  assert.equal(qbConnectionDisplayName(partitioned.qb[1]), STALE_QB_FACT_COPY);
  assert.equal(qbConnectionStatusLabel(partitioned.qb[1]), "Linked — details unavailable");
  assert.equal(MULTIPLE_QB_NOTICE, "Multiple QuickBooks connections");
  console.log("ok: multiple QB/Moraware render helpers; stale fact copy; no silent removal");
}

{
  const candidates = filterMorawareCandidatesForAccount(
    [
      { morawareAccountId: "1", confirmAllowed: true, proposedAccountId: "acct-a", currentLink: { linked: false } },
      { morawareAccountId: "2", confirmAllowed: false, proposedAccountId: "acct-a", currentLink: { linked: false } },
      { morawareAccountId: "3", confirmAllowed: true, proposedAccountId: "acct-b", currentLink: { linked: false } }
    ],
    "acct-a"
  );
  assert.deepEqual(
    candidates.map((c) => c.morawareAccountId),
    ["1"]
  );
  console.log("ok: Moraware find only uses governed confirmAllowed candidates");
}

{
  assert.equal(
    safeIdentityErrorMessage({ status: 409, body: { code: "duplicate_external_id" } }),
    "That identity is already linked to another Account Directory account."
  );
  assert.equal(
    safeIdentityErrorMessage({ status: 400, body: { code: "qb_customer_not_found" } }),
    "That QuickBooks customer is not available in trusted staged data."
  );
  assert.equal(safeIdentityErrorMessage({ status: 403 }), "You do not have permission to change this connection.");
  assert.equal(
    safeIdentityErrorMessage({ message: JSON.stringify({ raw_payload: { secret: 1 } }) }),
    "The connection could not be updated."
  );
  console.log("ok: backend validation/conflict/RBAC messages stay safe");
}

{
  const picker = readFileSync(join(root, "app-account-directory/src/ui/QuickBooksCustomerPicker.tsx"), "utf8");
  const connections = readFileSync(join(root, "app-account-directory/src/ui/AccountConnections.tsx"), "utf8");
  const api = readFileSync(join(here, "accountDirectoryApi.ts"), "utf8");
  const app = readFileSync(join(root, "app-account-directory/src/AccountDirectoryApp.tsx"), "utf8");
  assert.ok(picker.includes("selectCandidate"));
  assert.equal(/selectCandidate[\s\S]{0,200}linkQuickBooks/.test(picker), false);
  assert.ok(picker.includes("confirmLink") && picker.includes("linkQuickBooks"));
  assert.ok(picker.includes("externalId: selected.listId"));
  assert.ok(picker.includes("AbortController"));
  assert.ok(connections.includes("unlinkQuickBooks"));
  assert.ok(connections.includes("expectedSystem") === false);
  assert.ok(api.includes('expectedSystem: "quickbooks_desktop"'));
  assert.ok(connections.includes("canLinkQuickBooks") && connections.includes("Disconnect"));
  assert.ok(connections.includes("canLinkMoraware"));
  assert.ok(connections.includes("linkMoraware"));
  assert.ok(connections.includes("confirmMoraware"));
  assert.equal(/setMwSelected\(row\)[\s\S]{0,80}linkMoraware/.test(connections), false);
  assert.ok(connections.includes("filterMorawareCandidatesForAccount"));
  assert.ok(app.includes('kind === "quickbooks"') || app.includes("kind === \"quickbooks\""));
  assert.ok(app.includes("clearPanel"));
  assert.equal(picker.includes("raw_payload"), false);
  assert.equal(connections.includes("raw_payload"), false);
  assert.equal(app.includes("QuickBooks List ID is required."), false);
  console.log("ok: picker/unlink/Moraware/RBAC/invalidation source contracts");
}

console.log("accountDirectoryConnections.test.mjs — all passed");
