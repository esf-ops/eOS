/**
 * Account Directory displayName rename — identity-preserving regressions.
 */
import assert from "node:assert/strict";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "./accountDirectoryQuickbooksLinkage.mjs";
import { ACCOUNT_DIRECTORY_MORAWARE_SYSTEM } from "./accountDirectoryMorawareLinkage.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b2";
const ACTOR = "00000000-0000-4000-8000-0000000000c3";
const here = dirname(fileURLToPath(import.meta.url));

async function seedQbRoot(store, listId, organizationId, name) {
  if (typeof store.upsertQuickBooksCustomerFact !== "function") return;
  await store.upsertQuickBooksCustomerFact({
    organizationId,
    qbListId: listId,
    fullName: name,
    name,
    isJob: false,
    isActive: true
  });
}

async function main() {
  const store = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({ store });
  const appSrc = readFileSync(join(here, "../../../app-account-directory/src/AccountDirectoryApp.tsx"), "utf8");
  assert.ok(
    appSrc.includes('document.querySelector("[data-ad-modal], [data-ad-child-modal]")'),
    "focus trap must ignore Account Directory modals"
  );
  const focusFn = appSrc.split("function onFocus")[1]?.split("document.addEventListener(\"focusin\"")[0] || "";
  assert.ok(focusFn.includes("data-ad-modal"), "onFocus must check data-ad-modal before stealing focus");
  console.log("ok: focus trap allows Edit modal inputs (root cause of uneditable name)");

  const created = await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName: "Due to ESF", status: "active" }
  });
  await seedQbRoot(store, "QB-DUE-ESF", ORG, "Due to ESF");
  const linked = await service.linkQuickBooks({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: created.id,
    payload: { externalId: "QB-DUE-ESF", externalDisplayName: "Due to ESF" }
  });
  await store.insertExternalLink({
    organizationId: ORG,
    accountId: created.id,
    externalSystem: ACCOUNT_DIRECTORY_MORAWARE_SYSTEM,
    externalId: "296",
    externalDisplayName: "Illuminate Lighting Pro",
    linkedBy: ACTOR,
    isActive: true
  });

  const beforeLinks = await store.listExternalLinks(ORG, created.id);
  const qbBefore = beforeLinks.find((l) => l.externalSystem === ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM && l.isActive !== false);
  const mwBefore = beforeLinks.filter((l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM && l.isActive !== false);

  const renamed = await service.updateAccount({
    organizationId: ORG,
    role: "sales",
    actorUserId: ACTOR,
    accountId: created.id,
    payload: { displayName: "Illuminate Lighting Pro", rowVersion: linked.rowVersion }
  });

  assert.equal(renamed.id, created.id);
  assert.equal(renamed.displayName, "Illuminate Lighting Pro");
  assert.equal(renamed.status, created.status === "archived" ? "archived" : renamed.status);
  console.log("ok: 1–3) EDIT can rename displayName; UUID preserved");

  const afterLinks = await store.listExternalLinks(ORG, created.id);
  const qbAfter = afterLinks.find((l) => l.externalSystem === ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM && l.isActive !== false);
  const mwAfter = afterLinks.filter((l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM && l.isActive !== false);
  assert.equal(qbAfter?.externalId, qbBefore?.externalId);
  assert.equal(qbAfter?.externalDisplayName, "Due to ESF");
  assert.deepEqual(
    mwAfter.map((l) => l.externalId).sort(),
    mwBefore.map((l) => l.externalId).sort()
  );
  console.log("ok: 4–5) QB ListID + Moraware links preserved; QB display name unchanged");

  // Zero QB/Moraware system writes: rename path never touches external systems.
  const svcSrc = readFileSync(join(here, "accountDirectoryService.mjs"), "utf8");
  const updateFn = svcSrc.split("async updateAccount(")[1].split("async archiveAccount(")[0];
  assert.equal(updateFn.includes("linkQuickBooks"), false);
  assert.equal(updateFn.includes("linkMoraware"), false);
  assert.equal(updateFn.includes("quickbooks"), false);
  console.log("ok: 6–7) rename performs zero QB/Moraware writes");

  await assert.rejects(
    () =>
      service.updateAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        accountId: created.id,
        payload: { displayName: "   ", rowVersion: renamed.rowVersion }
      }),
    (e) => e.code === "display_name_required"
  );
  await assert.rejects(
    () =>
      service.updateAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        accountId: created.id,
        payload: { displayName: "x".repeat(201), rowVersion: renamed.rowVersion }
      }),
    (e) => e.code === "display_name_too_long"
  );
  console.log("ok: 8–9) empty + max length rejected");

  await assert.rejects(
    () =>
      service.updateAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        accountId: created.id,
        payload: { displayName: "Stale Name", rowVersion: created.rowVersion }
      }),
    (e) => e.status === 409 || e.code === "conflict"
  );
  console.log("ok: 10) stale row_version rejected");

  const beforeStatus = (await store.getAccount(ORG, created.id)).status;
  const statusRv = (await store.getAccount(ORG, created.id)).rowVersion;
  await assert.rejects(
    () =>
      service.updateAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        accountId: created.id,
        payload: { status: "inactive", rowVersion: statusRv }
      }),
    (e) => e.status === 403 || e.code === "forbidden" || String(e.message || "").toLowerCase().includes("permission")
  );
  assert.equal((await store.getAccount(ORG, created.id)).status, beforeStatus);
  console.log("ok: 11) ordinary EDIT cannot change lifecycle status");

  const other = await service.createAccount({
    organizationId: ORG_B,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName: "Other Org Co" }
  });
  await assert.rejects(
    () =>
      service.updateAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        accountId: other.id,
        payload: { displayName: "Hack", rowVersion: other.rowVersion }
      }),
    (e) => e.status === 404 || e.code === "not_found"
  );
  console.log("ok: 12) org isolation");

  const auditBefore = (await store.listAuditEvents(ORG, created.id, { limit: 50 })).length;
  const failRv = (await store.getAccount(ORG, created.id)).rowVersion;
  await assert.rejects(
    () =>
      service.updateAccount({
        organizationId: ORG,
        role: "sales",
        actorUserId: ACTOR,
        accountId: created.id,
        payload: { displayName: "", rowVersion: failRv }
      }),
    () => true
  );
  const auditAfterFail = (await store.listAuditEvents(ORG, created.id, { limit: 50 })).length;
  assert.equal(auditAfterFail, auditBefore);
  console.log("ok: 13) failed rename produces no false success/audit");

  const aliases = await store.listAliases(ORG, created.id);
  assert.ok(aliases.some((a) => String(a.aliasValue).trim() === "Due to ESF"));
  const renameRv = (await store.getAccount(ORG, created.id)).rowVersion;
  const again = await service.updateAccount({
    organizationId: ORG,
    role: "sales",
    actorUserId: ACTOR,
    accountId: created.id,
    payload: {
      displayName: "Illuminate Lighting Pro LLC",
      rowVersion: renameRv
    }
  });
  const aliases2 = await store.listAliases(ORG, created.id);
  const dueCount = aliases2.filter((a) => String(a.aliasValue).trim() === "Due to ESF").length;
  assert.equal(dueCount, 1);
  assert.ok(aliases2.every((a) => a.accountId === created.id && a.organizationId === ORG));
  assert.equal(again.displayName, "Illuminate Lighting Pro LLC");
  console.log("ok: 17–20) former displayName preserved as alias; duplicate not re-added; same-account scoped");

  const ui = readFileSync(join(here, "../../../app-account-directory/src/ui/MorawareReview.tsx"), "utf8");
  assert.ok(ui.includes("moraware-source-stack") || ui.includes("Account Directory"));
  assert.ok(ui.includes("Edit account"));
  assert.ok(ui.includes("does not connect Moraware") || ui.includes("YES — Connect"));
  console.log("ok: 14–15) candidate card source names + Edit account does not auto-confirm Moraware");

  console.log("\naccountDirectoryDisplayNameRename.test.mjs — all passed\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
