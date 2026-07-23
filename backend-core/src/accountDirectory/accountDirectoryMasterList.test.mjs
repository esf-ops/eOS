import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import {
  APPLY_CONFIRM_PHRASE,
  FORBIDDEN_COLUMNS,
  assertAllowedMasterListInputPath,
  buildDirectoryMatchIndex,
  buildMasterListFingerprint,
  classificationsToMatchReportCsv,
  classifyMasterListRow,
  extractMasterListRows,
  normalizeEmail,
  normalizeOrgMatchKey,
  normalizePhoneDigits,
  reconcileExtractedRows,
  runMasterListApply,
  runMasterListReconcile
} from "./accountDirectoryMasterList.mjs";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";

const ORG = "00000000-0000-4000-8000-0000000000ml";
const ACTOR = "00000000-0000-4000-8000-0000000000ac";

function buildFakeWorkbookBytes() {
  const rows = [
    ["Account Master List"],
    ["Dyersville"],
    [
      "Name",
      "Sales Executive",
      "Status",
      "Key Contact",
      "Phone",
      "Email",
      "Last Contact",
      "Next Contact",
      "Market",
      "Address",
      "Branch",
      "Account Type",
      "Days Since Last Contact",
      "Sample Program",
      "Updated Tower",
      "monday Doc v2",
      "Balance Due",
      "Est. Kitchens/Month"
    ],
    [
      "Exact Match Builders LLC",
      "Rep A",
      "Active",
      "Pat Exact",
      "555-111-2222",
      "exact@example.test",
      "2020-01-01",
      "2020-02-01",
      "Residential",
      "100 Main St, Cedar Rapids, IA, USA",
      "Dyersville",
      "Builder",
      "99",
      "Yes",
      "No",
      "doc",
      "$999",
      "12"
    ],
    [
      "Alias Only Target",
      "Rep A",
      "Active",
      "Alias Person",
      "555-333-4444",
      "alias-row@example.test",
      "",
      "",
      "",
      "200 Oak Ave, Marion, IA, USA",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Email Match Co",
      "Rep A",
      "Lead",
      "Email Person",
      "",
      "email-match@example.test",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Phone Match Co",
      "Rep A",
      "Active",
      "Phone Person",
      "1-555-999-0000",
      "",
      "",
      "",
      "",
      "Cedar Falls, IA, USA",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Fuzzy Name Review Target Group Midwest",
      "Rep A",
      "Active",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Concept to Creation",
      "Rep A",
      "Active",
      "One",
      "555-000-1111",
      "ctc1@example.test",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Concept to Creation",
      "Rep B",
      "Lead",
      "Two",
      "555-000-2222",
      "ctc2@example.test",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Malformed Email Co",
      "Rep A",
      "Active",
      "X",
      "555-121-2121",
      "not-an-email",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Malformed Phone Co",
      "Rep A",
      "Active",
      "Y",
      "123456789012",
      "okphone@example.test",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Unmatched Active Sentinel",
      "Rep A",
      "Active",
      "Active Contact",
      "555-777-8888",
      "active-sentinel@example.test",
      "",
      "",
      "",
      "10 Pine St, Ames, IA, USA",
      "Dyersville",
      "Builder",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Unmatched Lead Sentinel",
      "Rep A",
      "Lead",
      "Lead Contact",
      "555-666-5555",
      "lead-sentinel@example.test",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Uses Cabinet Acct Builder",
      "Rep A",
      "Uses Cabinet acct",
      "Shared",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    ["New account"],
    ["Iowa City"],
    [
      "Name",
      "Sales Executive",
      "Status",
      "Key Contact",
      "Phone",
      "Email",
      "Last Contact",
      "Next Contact",
      "Market",
      "Address",
      "Branch",
      "Account Type",
      "Days Since Last Contact",
      "Sample Program",
      "Updated Tower",
      "monday Doc v2",
      "Balance Due",
      "Est. Kitchens/Month"
    ],
    [
      "Cabinets Galore-Waverly",
      "Rep A",
      "Lead",
      "LeeAnn",
      "",
      "",
      "",
      "",
      "",
      "122 10th St SW, Waverly, IA, USA",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "Cabinets Galore-Hiawatha",
      "Rep A",
      "Lead",
      "Sharon",
      "",
      "",
      "",
      "",
      "",
      "1450 East Boyson Road, Hiawatha, IA, USA",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    ["Retired/Closed/Do Not Contact Accounts"],
    [
      "Name",
      "Sales Executive",
      "Status",
      "Key Contact",
      "Phone",
      "Email",
      "Last Contact",
      "Next Contact",
      "Market",
      "Address",
      "Branch",
      "Account Type",
      "Days Since Last Contact",
      "Sample Program",
      "Updated Tower",
      "monday Doc v2",
      "Balance Due",
      "Est. Kitchens/Month"
    ],
    [
      "Closed Shop Sentinel",
      "Rep A",
      "Retired",
      "",
      "",
      "closed@example.test",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    ["Marketing Resources"],
    [
      "Name",
      "Sales Executive",
      "Status",
      "Key Contact",
      "Phone",
      "Email",
      "Last Contact",
      "Next Contact",
      "Market",
      "Address",
      "Branch",
      "Account Type",
      "Days Since Last Contact",
      "Sample Program",
      "Updated Tower",
      "monday Doc v2",
      "Balance Due",
      "Est. Kitchens/Month"
    ],
    ["Some Marketing Asset", "Rep", "Active", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Vendors"],
    [
      "Name",
      "Sales Executive",
      "Status",
      "Key Contact",
      "Phone",
      "Email",
      "Last Contact",
      "Next Contact",
      "Market",
      "Address",
      "Branch",
      "Account Type",
      "Days Since Last Contact",
      "Sample Program",
      "Updated Tower",
      "monday Doc v2",
      "Balance Due",
      "Est. Kitchens/Month"
    ],
    [
      "Vendor Supply Co",
      "Rep",
      "Active",
      "Vendor Contact",
      "555-444-3333",
      "vendor@example.test",
      "",
      "",
      "",
      "",
      "",
      "Vendor",
      "",
      "",
      "",
      "",
      "",
      ""
    ]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "account master list");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function seedDirectory(store, service) {
  const exact = await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: {
      displayName: "Exact Match Builders",
      primaryContactName: "Existing Contact",
      primaryEmail: "existing-exact@example.test",
      primaryPhone: "555-000-0001",
      city: "Cedar Rapids",
      state: "IA"
    }
  });
  await service.linkQuickBooks({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: exact.id,
    payload: { externalId: "QB-EXACT-1", externalDisplayName: "Exact Match Builders" }
  });

  const aliasTarget = await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName: "Canonical Alias Account" }
  });
  await service.addAlias({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    accountId: aliasTarget.id,
    payload: { alias: "Alias Only Target" }
  });

  await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: {
      displayName: "Other Email Account",
      primaryContactName: "Email Holder",
      primaryEmail: "email-match@example.test"
    }
  });

  await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: {
      displayName: "Other Phone Account",
      primaryContactName: "Phone Holder",
      primaryPhone: "555-999-0000"
    }
  });

  await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: ACTOR,
    payload: { displayName: "Fuzzy Name Review Target" }
  });

  return { exact };
}

async function main() {
  // Path safety
  assert.throws(
    () => assertAllowedMasterListInputPath("/tmp/outside.xlsx"),
    (e) => e instanceof AccountDirectoryError && e.code === "input_path_forbidden"
  );

  const bytes = buildFakeWorkbookBytes();
  const { rows, profile } = extractMasterListRows(bytes, { workbookFileName: "fake.xlsx" });

  // 1–5 exclusions / sections / vendors
  assert.ok(profile.sectionCounts["Dyersville"] >= 1);
  assert.ok(profile.sectionCounts["Iowa City"] >= 1);
  assert.ok(profile.excludedCounts.column_header >= 2);
  assert.ok(profile.excludedCounts.new_account >= 1);
  assert.ok(profile.excludedCounts.marketing_resources >= 1);
  assert.ok(profile.excludedCounts.title >= 1);
  assert.equal(
    rows.some((r) => /marketing asset/i.test(r.displayName)),
    false
  );
  assert.ok(rows.some((r) => r.displayName === "Vendor Supply Co" && r.isVendorSection));

  // 6–7 allowed vs forbidden
  for (const row of rows) {
    for (const forbidden of FORBIDDEN_COLUMNS) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, forbidden), false);
    }
    assert.ok("displayName" in row);
    assert.ok("salesExecutive" in row || row.salesExecutive === null);
  }

  // Branch distinctions preserved
  assert.notEqual(
    normalizeOrgMatchKey("Cabinets Galore-Waverly"),
    normalizeOrgMatchKey("Cabinets Galore-Hiawatha")
  );

  // Email / phone helpers
  assert.equal(normalizeEmail("  A@B.com ").ok, true);
  assert.equal(normalizeEmail("bad").ok, false);
  assert.equal(normalizePhoneDigits("1-555-999-0000").digits, "5559990000");
  assert.equal(normalizePhoneDigits("123456789012").ok, false);

  const store = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({ store });
  const { exact } = await seedDirectory(store, service);
  const index = await buildDirectoryMatchIndex(store, ORG);
  const workbookNameCounts = new Map();
  for (const row of rows) {
    workbookNameCounts.set(row.normalizedName, (workbookNameCounts.get(row.normalizedName) || 0) + 1);
  }
  const classified = reconcileExtractedRows(rows, index);

  function findClass(name) {
    return classified.find((c) => c.workbookDisplayName === name);
  }

  // 8 exact name
  const exactClass = findClass("Exact Match Builders LLC");
  assert.ok(["exact_existing", "high_confidence_match"].includes(exactClass.matchClassification));
  assert.equal(exactClass.matchedAccountId, exact.id);
  assert.equal(exactClass.quickbooksLinked, true);

  // 9 alias
  const aliasClass = findClass("Alias Only Target");
  assert.ok(["exact_existing", "high_confidence_match"].includes(aliasClass.matchClassification));

  // 10 email
  const emailClass = findClass("Email Match Co");
  assert.ok(emailClass.matchReasons.includes("exact_email") || emailClass.matchedAccountId);

  // 11 phone
  const phoneClass = findClass("Phone Match Co");
  assert.ok(phoneClass.matchReasons.includes("exact_phone") || phoneClass.matchedAccountId);

  // 13 fuzzy-name-only review
  const fuzzy = findClass("Fuzzy Name Review Target Group Midwest");
  assert.equal(fuzzy.matchClassification, "probable_match_review");
  assert.ok(fuzzy.matchReasons.includes("fuzzy_name_only") || fuzzy.reviewReason === "fuzzy_name_only");

  // 15 duplicate
  const dups = classified.filter((c) => c.workbookDisplayName === "Concept to Creation");
  assert.equal(dups.length, 2);
  assert.ok(dups.every((c) => c.matchClassification === "duplicate_within_workbook"));

  // 16–17 malformed
  assert.equal(findClass("Malformed Email Co").matchClassification, "invalid_record");
  assert.equal(findClass("Malformed Phone Co").matchClassification, "invalid_record");

  // 18–20 unmatched mappings
  assert.equal(findClass("Unmatched Active Sentinel").proposedAction, "create_account");
  assert.equal(findClass("Unmatched Lead Sentinel").proposedAction, "create_prospect");
  assert.equal(
    findClass("Closed Shop Sentinel").matchClassification,
    "closed_or_archived_candidate"
  );

  // 5 vendor hold
  assert.equal(findClass("Vendor Supply Co").matchClassification, "vendor_hold");

  // special relationship
  assert.equal(
    findClass("Uses Cabinet Acct Builder").matchClassification,
    "special_relationship_review"
  );

  // Fingerprint stable
  const fp1 = buildMasterListFingerprint(rows.find((r) => r.displayName === "Unmatched Active Sentinel"));
  const fp2 = buildMasterListFingerprint(rows.find((r) => r.displayName === "Unmatched Active Sentinel"));
  assert.equal(fp1, fp2);

  // Dry-run zero writes + reports scrubbed
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ad-ml-"));
  const before = store.__stats();
  const dry = await runMasterListReconcile({
    store,
    organizationId: ORG,
    workbookBytes: bytes,
    workbookFileName: "fake.xlsx",
    outputDir: tmp,
    dryRun: true,
    allowTestPaths: true
  });
  assert.equal(dry.databaseWrites, 0);
  assert.deepEqual(store.__stats(), before);

  const report = fs.readFileSync(dry.paths.matchReport, "utf8");
  for (const forbidden of FORBIDDEN_COLUMNS) {
    assert.equal(report.includes(forbidden), false, `report must not include ${forbidden}`);
  }
  assert.equal(report.toLowerCase().includes("service_role"), false);
  assert.equal(report.toLowerCase().includes("supabase"), false);

  const createDoc = JSON.parse(fs.readFileSync(dry.paths.createCandidates, "utf8"));
  scrubAssert(createDoc);

  // Apply requires confirmation
  await assert.rejects(
    () =>
      runMasterListApply({
        store,
        service,
        organizationId: ORG,
        actorUserId: ACTOR,
        approvedArtifactPath: dry.paths.createCandidates,
        confirmPhrase: "NOPE",
        recheckProduction: true,
        outputDir: tmp
      }),
    (e) => e.code === "confirm_phrase_required"
  );

  // Apply create + idempotent second apply; QB links unchanged
  const qbBefore = await store.countActiveExternalLinks(ORG, "quickbooks_desktop");
  const apply1 = await runMasterListApply({
    store,
    service,
    organizationId: ORG,
    actorUserId: ACTOR,
    approvedArtifactPath: dry.paths.createCandidates,
    confirmPhrase: APPLY_CONFIRM_PHRASE,
    recheckProduction: true,
    outputDir: tmp
  });
  assert.ok(apply1.created >= 1);
  assert.equal(apply1.quickbooksLinksChanged, 0);
  const qbAfter = await store.countActiveExternalLinks(ORG, "quickbooks_desktop");
  assert.equal(qbAfter, qbBefore);

  // Existing QB-linked exact match was not duplicated
  const listed = await store.listAccounts(ORG, { includeArchived: true, limit: 5000, offset: 0 });
  const exactNames = listed.items.filter((a) =>
    normalizeOrgMatchKey(a.displayName).startsWith("exact match builders")
  );
  assert.equal(exactNames.length, 1);

  const apply2 = await runMasterListApply({
    store,
    service,
    organizationId: ORG,
    actorUserId: ACTOR,
    approvedArtifactPath: dry.paths.createCandidates,
    confirmPhrase: APPLY_CONFIRM_PHRASE,
    recheckProduction: true,
    outputDir: tmp
  });
  assert.equal(apply2.created, 0);
  assert.ok(apply2.skipped >= 1);

  // CSV helper
  const csv = classificationsToMatchReportCsv(classified);
  assert.ok(csv.includes("matchClassification"));

  // classifyMasterListRow direct fuzzy
  const fuzzyRow = rows.find((r) => r.displayName === "Fuzzy Name Review Target Group Midwest");
  const fuzzyDirect = classifyMasterListRow(fuzzyRow, index, { workbookNameCounts });
  assert.equal(fuzzyDirect.reviewReason, "fuzzy_name_only");

  console.log("accountDirectoryMasterList.test.mjs: ok");
}

function scrubAssert(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) scrubAssert(item);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    assert.equal(FORBIDDEN_COLUMNS.includes(k), false);
    scrubAssert(v);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
