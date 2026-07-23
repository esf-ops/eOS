import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import {
  assertAllowedSeedInputPath,
  candidateToWritePayloads,
  FORBIDDEN_FIELD_NAMES,
  formatImportConsoleSummary,
  loadSeedCandidates,
  runControlledSeedImport,
  runControlledSeedVerify,
  validateSeedCandidate,
  validateSeedFile
} from "./accountDirectoryControlledSeed.mjs";
import {
  assertApplySafety,
  parseImportArgs,
  runImportCli
} from "../scripts/accountDirectoryControlledSeedImport.mjs";

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ACTOR = "00000000-0000-4000-8000-0000000000bb";

function makeCandidate(overrides = {}) {
  return {
    proposedAccount: {
      displayName: "Sentinel Builders",
      legalName: null,
      status: "active",
      source: "quickbooks_workbook_seed",
      ...(overrides.proposedAccount || {})
    },
    proposedPrimaryContact: {
      displayName: "Pat Sentinel",
      email: "pat@sentinel.example",
      phone: "555-0199",
      ...(overrides.proposedPrimaryContact || {})
    },
    proposedPrimaryLocation: {
      sourceAddressRaw: "100 Test St",
      addressLine1: "100 Test St",
      city: "Boise",
      state: "ID",
      postalCode: "83702",
      ...(overrides.proposedPrimaryLocation || {})
    },
    externalLink: {
      externalSystem: "quickbooks_desktop",
      externalId: "QB-SENTINEL-1",
      externalDisplayName: "Sentinel Builders",
      sourceSnapshot: "test-snapshot",
      ...(overrides.externalLink || {})
    },
    importMetadata: {
      sourceRow: 2,
      sourceNeedsReview: false,
      warnings: [],
      reasonCodes: [],
      ...(overrides.importMetadata || {})
    },
    ...overrides.top
  };
}

function writeTempSeed(candidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ad-seed-"));
  const file = path.join(dir, "account-directory-seed.json");
  fs.writeFileSync(file, JSON.stringify(candidates));
  return { dir, file };
}

async function main() {
  // Path guards
  assert.throws(
    () => assertAllowedSeedInputPath("/tmp/account-directory-review.csv", { allowTestPaths: true }),
    (e) => e.code === "review_input_forbidden"
  );
  assert.throws(
    () => assertAllowedSeedInputPath("/tmp/foo.xlsx", { allowTestPaths: true }),
    (e) => e.code === "workbook_input_forbidden"
  );

  // Forbidden fields
  {
    const bad = makeCandidate({ top: { "Lifetime Sales": 99 } });
    const v = validateSeedCandidate(bad, 0);
    assert.equal(v.ok, false);
    assert.ok(v.reasons.some((r) => r.startsWith("forbidden_field:")));
  }
  {
    const bad = makeCandidate({ top: { "CRM Status": "hot" } });
    assert.equal(validateSeedCandidate(bad, 0).ok, false);
  }
  {
    const bad = makeCandidate({ top: { "Parent Account": "Parent" } });
    assert.equal(validateSeedCandidate(bad, 0).ok, false);
  }

  // Required fields
  assert.equal(validateSeedCandidate(makeCandidate({ proposedAccount: { displayName: "" } }), 0).ok, false);
  assert.equal(
    validateSeedCandidate(makeCandidate({ externalLink: { externalId: "" } }), 0).ok,
    false
  );

  // Valid candidate
  assert.equal(validateSeedCandidate(makeCandidate(), 0).ok, true);

  // Duplicate external IDs stop
  assert.throws(
    () =>
      validateSeedFile([makeCandidate(), makeCandidate()], {
        expectedCount: 2
      }),
    (e) => e.code === "duplicate_external_ids_in_seed"
  );

  // Expected count mismatch
  assert.throws(
    () => validateSeedFile([makeCandidate()], { expectedCount: 2 }),
    (e) => e.code === "expected_count_mismatch"
  );

  // Apply safety
  assert.throws(
    () => assertApplySafety({ dryRun: false, apply: false, expectedCount: "1" }, {}),
    (e) => e.code === "mode_required"
  );
  assert.throws(
    () =>
      assertApplySafety(
        {
          dryRun: false,
          apply: true,
          expectedCount: "1",
          confirmCount: "2",
          environment: "production",
          confirmProduction: true
        },
        {}
      ),
    (e) => e.code === "confirm_count_mismatch"
  );
  assert.throws(
    () =>
      assertApplySafety(
        {
          dryRun: false,
          apply: true,
          expectedCount: "1",
          confirmCount: "1",
          environment: "staging",
          confirmProduction: true
        },
        {}
      ),
    (e) => e.code === "environment_required"
  );
  assert.throws(
    () =>
      assertApplySafety(
        {
          dryRun: false,
          apply: true,
          expectedCount: "1",
          confirmCount: "1",
          environment: "production",
          confirmProduction: false
        },
        {}
      ),
    (e) => e.code === "confirm_production_required"
  );

  const argsOk = parseImportArgs([
    "--apply",
    "--expected-count",
    "1",
    "--confirm-count",
    "1",
    "--environment",
    "production",
    "--confirm-production"
  ]);
  assert.equal(argsOk.apply, true);
  assert.equal(argsOk.confirmProduction, true);

  // Dry-run zero writes
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const before = store.__stats();
    const c1 = makeCandidate();
    const c2 = makeCandidate({
      proposedAccount: { displayName: "Second Co" },
      externalLink: { externalId: "QB-SENTINEL-2" },
      proposedPrimaryContact: { displayName: null, email: null, phone: null },
      proposedPrimaryLocation: {
        sourceAddressRaw: null,
        addressLine1: null,
        city: null,
        state: null,
        postalCode: null
      }
    });
    const result = await runControlledSeedImport({
      store,
      service,
      organizationId: ORG,
      actorUserId: ACTOR,
      candidates: [c1, c2],
      expectedCount: 2,
      mode: "dry-run"
    });
    assert.equal(result.summary.databaseWrites, 0);
    assert.equal(result.summary.wouldCreate, 2);
    assert.equal(result.summary.contactsThatWouldBeCreated, 1);
    assert.equal(result.summary.locationsThatWouldBeCreated, 1);
    assert.deepEqual(store.__stats(), before);
    const consoleText = formatImportConsoleSummary(result.summary);
    assert.equal(consoleText.includes("pat@sentinel.example"), false);
    assert.equal(consoleText.includes("Sentinel Builders"), false);
  }

  // Apply creates account/contact/location/link/audit; absent contact/location skipped
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const withContact = makeCandidate();
    const bare = makeCandidate({
      proposedAccount: { displayName: "Bare Seed Co" },
      externalLink: { externalId: "QB-BARE-1" },
      proposedPrimaryContact: { displayName: null, email: null, phone: null },
      proposedPrimaryLocation: {
        sourceAddressRaw: null,
        addressLine1: null,
        city: null,
        state: null,
        postalCode: null
      }
    });
    // Fix bare contact - empty object still might have displayName from spread - we overrode
    bare.proposedPrimaryContact = { displayName: null, email: null, phone: null };
    bare.proposedPrimaryLocation = {
      sourceAddressRaw: null,
      addressLine1: null,
      city: null,
      state: null,
      postalCode: null
    };

    const payloadsBare = candidateToWritePayloads(bare);
    assert.equal(payloadsBare.wouldCreateContact, false);
    assert.equal(payloadsBare.wouldCreateLocation, false);

    const result = await runControlledSeedImport({
      store,
      service,
      organizationId: ORG,
      actorUserId: ACTOR,
      candidates: [withContact, bare],
      expectedCount: 2,
      mode: "apply"
    });
    assert.equal(result.summary.createdAccounts, 2);
    assert.equal(result.summary.contactsCreated, 1);
    assert.equal(result.summary.locationsCreated, 1);
    assert.equal(result.summary.externalLinksCreated, 2);
    assert.equal(result.summary.auditEventsCreated, 2);
    assert.ok(result.summary.databaseWrites > 0);
    assert.equal(result.summary.failed, 0);

    const detail = await service.getAccount({
      organizationId: ORG,
      role: "admin",
      accountId: result.results.find((r) => r.externalId === "QB-SENTINEL-1").accountId
    });
    assert.equal(detail.contacts.length, 1);
    assert.equal(detail.locations.length, 1);
    assert.ok(detail.auditHistory?.some((e) => e.action === "seed_import_account"));
  }

  // Idempotent re-apply skips; does not overwrite
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const candidate = makeCandidate();
    await runControlledSeedImport({
      store,
      service,
      organizationId: ORG,
      actorUserId: ACTOR,
      candidates: [candidate],
      expectedCount: 1,
      mode: "apply"
    });
    const accountId = (await store.listActiveExternalLinksByExternalId(ORG, "quickbooks_desktop", "QB-SENTINEL-1"))[0]
      .accountId;
    await service.updateAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      accountId,
      payload: { displayName: "Manually Edited Name", rowVersion: 1 }
    });
    // bump row version after update
    const afterEdit = await store.getAccount(ORG, accountId);
    const second = await runControlledSeedImport({
      store,
      service,
      organizationId: ORG,
      actorUserId: ACTOR,
      candidates: [makeCandidate({ proposedAccount: { displayName: "Should Not Overwrite" } })],
      expectedCount: 1,
      mode: "apply"
    });
    assert.equal(second.summary.createdAccounts, 0);
    assert.equal(second.summary.skippedExisting, 1);
    const still = await store.getAccount(ORG, accountId);
    assert.equal(still.displayName, "Manually Edited Name");
    assert.equal(still.displayName, afterEdit.displayName);
  }

  // External link conflict (two links same id) reported
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const a = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "A1" }
    });
    const b = await service.createAccount({
      organizationId: ORG,
      role: "admin",
      actorUserId: ACTOR,
      payload: { displayName: "A2" }
    });
    // Force two active links with same external id by bypassing uniqueness in memory map
    // Memory store enforces uniqueness — simulate conflict by inserting second via raw map abuse:
    // Use insert then manually add second link with different system then change — simpler:
    // call listActive after inserting one, then inject second into store via private path.
    await store.insertExternalLink({
      organizationId: ORG,
      accountId: a.id,
      externalSystem: "quickbooks_desktop",
      externalId: "QB-CONFLICT",
      linkedBy: ACTOR
    });
    // Bypass uniqueness: directly poke — memory store blocks duplicates, so create conflict
    // by returning multiple from a stub store wrapper.
    const baseList = store.listActiveExternalLinksByExternalId.bind(store);
    store.listActiveExternalLinksByExternalId = async () => [
      { accountId: a.id, organizationId: ORG, externalId: "QB-CONFLICT", isActive: true },
      { accountId: b.id, organizationId: ORG, externalId: "QB-CONFLICT", isActive: true }
    ];
    const result = await runControlledSeedImport({
      store,
      service,
      organizationId: ORG,
      actorUserId: ACTOR,
      candidates: [
        makeCandidate({
          proposedAccount: { displayName: "Conflict Co" },
          externalLink: { externalId: "QB-CONFLICT" }
        })
      ],
      expectedCount: 1,
      mode: "apply"
    });
    assert.equal(result.summary.externalLinkConflicts, 1);
    assert.equal(result.summary.failed, 1);
    store.listActiveExternalLinksByExternalId = baseList;
  }

  // Partial failure compensation — link fails after create
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const originalLink = service.linkQuickBooks.bind(service);
    service.linkQuickBooks = async () => {
      throw new AccountDirectoryError("forced_link_fail", "forced", 500);
    };
    const result = await runControlledSeedImport({
      store,
      service,
      organizationId: ORG,
      actorUserId: ACTOR,
      candidates: [makeCandidate({ externalLink: { externalId: "QB-PARTIAL" } })],
      expectedCount: 1,
      mode: "apply"
    });
    assert.equal(result.summary.failed, 1);
    const accounts = await store.listAccounts(ORG, { includeArchived: true, limit: 50, offset: 0 });
    const orphan = accounts.items.find((a) => a.displayName === "Sentinel Builders");
    assert.ok(orphan);
    assert.ok(orphan.archivedAt || orphan.status === "archived");
    service.linkQuickBooks = originalLink;
  }

  // Verify detects missing / duplicate; zero writes
  {
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const candidate = makeCandidate({ externalLink: { externalId: "QB-VERIFY-1" } });
    await runControlledSeedImport({
      store,
      service,
      organizationId: ORG,
      actorUserId: ACTOR,
      candidates: [candidate],
      expectedCount: 1,
      mode: "apply"
    });
    const before = store.__stats();
    const ok = await runControlledSeedVerify({
      store,
      organizationId: ORG,
      candidates: [candidate],
      expectedCount: 1,
      receipt: { createdAccounts: 1, createdExternalIds: ["QB-VERIFY-1"] }
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.databaseWrites, 0);
    assert.deepEqual(store.__stats(), before);

    const missing = await runControlledSeedVerify({
      store,
      organizationId: ORG,
      candidates: [makeCandidate({ externalLink: { externalId: "QB-MISSING" } })],
      expectedCount: 1,
      receipt: { createdExternalIds: ["QB-MISSING"] }
    });
    assert.equal(missing.ok, false);
    assert.ok(missing.missingLinks >= 1);
  }

  // CLI dry-run writes ignored report without secrets
  {
    const { dir, file } = writeTempSeed([
      makeCandidate({ externalLink: { externalId: "QB-CLI-1" } })
    ]);
    const store = createAccountDirectoryMemoryStore();
    const service = createAccountDirectoryService({ store });
    const outDir = path.join(dir, "out");
    const SECRET = "SENTINEL_SERVICE_ROLE_SECRET_DO_NOT_PRINT";
    const result = await runImportCli({
      args: {
        dryRun: true,
        apply: false,
        input: file,
        expectedCount: "1",
        outputDir: outDir,
        allowTestInput: true,
        organizationId: ORG,
        actorUserId: ACTOR
      },
      env: {
        SUPABASE_URL: "https://fake.supabase.local",
        SUPABASE_SERVICE_ROLE_KEY: SECRET
      },
      store,
      service
    });
    assert.equal(result.summary.databaseWrites, 0);
    const receipt = fs.readFileSync(result.reportPath, "utf8");
    assert.equal(receipt.includes(SECRET), false);
    assert.ok(receipt.includes("candidatesRead"));
  }

  // Forbidden field list includes financial/CRM markers
  assert.ok(FORBIDDEN_FIELD_NAMES.includes("Lifetime Sales"));
  assert.ok(FORBIDDEN_FIELD_NAMES.includes("CRM Status"));

  // loadSeedCandidates rejects review via path helper when not allowTest
  {
    const review = path.join(os.tmpdir(), "account-directory-review.csv");
    fs.writeFileSync(review, "x");
    assert.throws(() => loadSeedCandidates(review, { allowTestPaths: true }), (e) =>
      ["review_input_forbidden", "invalid_input_type"].includes(e.code)
    );
  }

  console.log("accountDirectoryControlledSeed.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
