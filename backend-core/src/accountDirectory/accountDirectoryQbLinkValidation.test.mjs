/**
 * Phase 0E — QuickBooks permanent-link validation.
 * Run: node backend-core/src/accountDirectory/accountDirectoryQbLinkValidation.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService, AccountDirectoryError } from "./accountDirectoryService.mjs";
import {
  evaluateQuickBooksLinkCandidate,
  isAdQbRootCustomerFact,
  normalizeQuickBooksListId,
  seedTrustedQuickBooksCustomerFact
} from "./accountDirectoryQbLinkValidation.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const ACTOR = "00000000-0000-4000-8000-000000000099";
const here = dirname(fileURLToPath(import.meta.url));

function svc() {
  const store = createAccountDirectoryMemoryStore();
  return { store, service: createAccountDirectoryService({ store }) };
}

async function createNamedAccount(service, name, org = ORG) {
  return service.createAccount({
    organizationId: org,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName: name }
  });
}

async function main() {
  assert.equal(normalizeQuickBooksListId("  80000001-1234  "), "80000001-1234");
  assert.equal(isAdQbRootCustomerFact({ is_job: false }), true);
  assert.equal(isAdQbRootCustomerFact({ isJob: true }), false);

  {
    const unknown = evaluateQuickBooksLinkCandidate(null, { organizationId: ORG, listId: "X" });
    assert.equal(unknown.code, "qb_customer_not_found");
    const job = evaluateQuickBooksLinkCandidate(
      { organizationId: ORG, qbListId: "JOB-1", isJob: true, parentListId: "ROOT-1" },
      { organizationId: ORG, listId: "JOB-1" }
    );
    assert.equal(job.code, "qb_job_not_linkable");
    const cross = evaluateQuickBooksLinkCandidate(
      { organizationId: ORG_B, qbListId: "ROOT-1", isJob: false },
      { organizationId: ORG, listId: "ROOT-1" }
    );
    assert.equal(cross.code, "qb_customer_not_found");
    console.log("ok: candidate evaluator exact/org/job rules");
  }

  // Valid exact root
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Root Customer Co");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "80000001-ROOT",
      name: "Root Customer Co",
      isJob: false
    });
    const linked = await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { externalId: "  80000001-ROOT  ", externalDisplayName: "Root Customer Co" }
    });
    assert.equal(linked.quickbooksLinked, true);
    const qb = (linked.externalLinks || []).find((l) => l.isActive !== false);
    assert.equal(qb.externalId, "80000001-ROOT");
    const audits = await store.listAuditEvents(ORG, account.id, { limit: 50 });
    assert.ok(audits.some((e) => e.action === "link_quickbooks"));
    console.log("ok: exact trusted root ListID links");
  }

  // Unknown ListID — no link, no success audit
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Unknown List Co");
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: account.id,
          payload: { externalId: "DOES-NOT-EXIST" }
        }),
      (e) => e instanceof AccountDirectoryError && e.code === "qb_customer_not_found" && e.status === 400
    );
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    assert.equal(detail.quickbooksLinked, false);
    assert.equal((detail.externalLinks || []).filter((l) => l.isActive !== false).length, 0);
    const audits = await store.listAuditEvents(ORG, account.id, { limit: 50 });
    assert.equal(audits.some((e) => e.action === "link_quickbooks"), false);
    console.log("ok: unknown ListID rejected with no mutation");
  }

  // Cross-org ListID
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Home Org Co");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG_B,
      qbListId: "SHARED-LOOKING-ID",
      name: "Other Org Customer",
      isJob: false
    });
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: account.id,
          payload: { externalId: "SHARED-LOOKING-ID" }
        }),
      (e) => e.code === "qb_customer_not_found"
    );
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    assert.equal(detail.quickbooksLinked, false);
    console.log("ok: cross-org ListID rejected");
  }

  // Child / job ListID — not remapped
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Parent With Job");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "80000001-PARENT",
      name: "Parent With Job",
      isJob: false
    });
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "80000001-JOB",
      name: "Kitchen",
      fullName: "Parent With Job:Kitchen",
      isJob: true,
      parentListId: "80000001-PARENT"
    });
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: account.id,
          payload: { externalId: "80000001-JOB" }
        }),
      (e) => e instanceof AccountDirectoryError && e.code === "qb_job_not_linkable"
    );
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    assert.equal(detail.quickbooksLinked, false);
    assert.ok(!(detail.externalLinks || []).some((l) => l.externalId === "80000001-PARENT"));
    console.log("ok: job ListID rejected without parent remap");
  }

  // Same name, different ListID — name is not identity
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Twin Name Cabinets");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "NAME-MATCH-ROOT",
      name: "Twin Name Cabinets",
      fullName: "Twin Name Cabinets",
      isJob: false
    });
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: account.id,
          payload: { externalId: "WRONG-LIST-ID", externalDisplayName: "Twin Name Cabinets" }
        }),
      (e) => e.code === "qb_customer_not_found"
    );
    const detail = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    assert.equal(detail.quickbooksLinked, false);
    console.log("ok: matching name with wrong ListID rejected");
  }

  // Duplicate active external identity unchanged
  {
    const { store, service } = svc();
    const a = await createNamedAccount(service, "First Linked");
    const b = await createNamedAccount(service, "Second Linked");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "DUP-ROOT",
      name: "First Linked",
      isJob: false
    });
    await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: a.id,
      payload: { externalId: "DUP-ROOT" }
    });
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: b.id,
          payload: { externalId: "DUP-ROOT" }
        }),
      (e) => e.code === "duplicate_external_id" && e.status === 409
    );
    const first = await service.getAccount({ organizationId: ORG, role: "admin", accountId: a.id });
    const second = await service.getAccount({ organizationId: ORG, role: "admin", accountId: b.id });
    assert.equal(first.quickbooksLinked, true);
    assert.equal(second.quickbooksLinked, false);
    console.log("ok: duplicate active ListID conflict unchanged");
  }

  // Historical links are not auto-deactivated when facts are absent
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Legacy Linked Co");
    const inserted = await store.insertExternalLink({
      organizationId: ORG,
      accountId: account.id,
      externalSystem: "quickbooks_desktop",
      externalId: "LEGACY-ABSENT-FROM-FACTS",
      externalDisplayName: "Legacy Linked Co",
      linkedBy: ACTOR
    });
    assert.equal(inserted.ok, true);
    const before = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    assert.equal(before.quickbooksLinked, true);
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "admin",
          actorUserId: ACTOR,
          accountId: account.id,
          payload: { externalId: "ANOTHER-MISSING" }
        }),
      (e) => e.code === "qb_customer_not_found"
    );
    const after = await service.getAccount({ organizationId: ORG, role: "admin", accountId: account.id });
    assert.equal(after.quickbooksLinked, true);
    assert.ok((after.externalLinks || []).some((l) => l.externalId === "LEGACY-ABSENT-FROM-FACTS"));
    console.log("ok: existing links not invalidated when facts are absent");
  }

  // EXTERNAL_LINK capability unchanged
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Auth Co");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "AUTH-ROOT",
      isJob: false
    });
    await assert.rejects(
      () =>
        service.linkQuickBooks({
          organizationId: ORG,
          role: "sales",
          actorUserId: ACTOR,
          accountId: account.id,
          payload: { externalId: "AUTH-ROOT" }
        }),
      (e) => e instanceof AccountDirectoryError && e.status === 403
    );
    console.log("ok: EXTERNAL_LINK authorization unchanged");
  }

  // Audit failure after insert still uses existing fail-soft (required=false) for QB
  {
    const { store, service } = svc();
    const account = await createNamedAccount(service, "Audit Soft Co");
    await seedTrustedQuickBooksCustomerFact(store, {
      organizationId: ORG,
      qbListId: "AUDIT-ROOT",
      isJob: false
    });
    const origInsert = store.insertAuditEvent.bind(store);
    store.insertAuditEvent = async (event) => {
      if (event.action === "link_quickbooks") return null;
      return origInsert(event);
    };
    const linked = await service.linkQuickBooks({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId: account.id,
      payload: { externalId: "AUDIT-ROOT" }
    });
    assert.equal(linked.quickbooksLinked, true);
    console.log("ok: QB audit-failure remains fail-soft after successful link");
  }

  {
    const serviceSrc = readFileSync(join(here, "accountDirectoryService.mjs"), "utf8");
    const apiSrc = readFileSync(join(here, "accountDirectoryApi.js"), "utf8");
    assert.ok(serviceSrc.includes("getQuickBooksCustomerFactByListId"));
    assert.ok(serviceSrc.includes("evaluateQuickBooksLinkCandidate"));
    assert.equal(/from\(["']quickbooks/i.test(serviceSrc), false);
    assert.equal(serviceSrc.includes("odbc"), false);
    assert.ok(apiSrc.includes("link-quickbooks"));
    assert.equal(/QuickBooks Desktop write|qbxml|ModRequest/i.test(serviceSrc), false);
    console.log("ok: no QuickBooks writeback in link path");
  }

  console.log("accountDirectoryQbLinkValidation.test.mjs — all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
