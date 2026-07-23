import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  extractAccountDirectoryDryRun,
  normalizeMatchKey,
  isRootQbRecord,
  FORBIDDEN_SEED_FIELDS,
  reviewRowsToCsv
} from "./accountDirectoryWorkbookExtract.mjs";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function buildFixtureWorkbook() {
  const accountDirectory = [
    {
      "QuickBooks Account Name": "Alpha Builders",
      "Company Name": "Alpha Builders LLC",
      "Primary Contact": "Pat Lee",
      "Primary Email": "pat@alpha.example",
      "Primary Phone": "512-555-0100",
      "Physical Address": "100 Main St",
      City: "Austin",
      State: "TX",
      ZIP: "78701",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23",
      "Lifetime Sales": "999999",
      Notes: "secret note",
      "CRM Status": "hot"
    },
    {
      "QuickBooks Account Name": "Beta Homes",
      "Company Name": "Beta Homes",
      "Primary Contact": "Sam",
      "Primary Email": "not-an-email",
      "Primary Phone": "12",
      "Physical Address": "Care of Beta Homes / Suite A",
      City: "Dallas",
      State: "TX",
      ZIP: "75001",
      "Active?": "Yes",
      "Needs Review": "Yes",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "Gamma Works",
      "Company Name": "Gamma Works",
      "Primary Contact": "Riley Nguyen",
      "Primary Email": "riley@gamma.example",
      "Primary Phone": "214-555-0199",
      "Physical Address": "200 Oak Ave",
      City: "Houston",
      State: "TX",
      ZIP: "77001",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "No Match Corp",
      "Company Name": "No Match Corp",
      "Primary Contact": "Alex",
      "Primary Email": "alex@nomatch.example",
      "Primary Phone": "713-555-0111",
      "Physical Address": "9 Pine Rd",
      City: "Houston",
      State: "TX",
      ZIP: "77002",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "Ambiguous Dup",
      "Company Name": "Ambiguous Dup A",
      "Primary Contact": "One",
      "Primary Email": "one@dup.example",
      "Primary Phone": "512-555-0001",
      "Physical Address": "1 A St",
      City: "Austin",
      State: "TX",
      ZIP: "78702",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "Ambiguous Dup",
      "Company Name": "Ambiguous Dup B",
      "Primary Contact": "Two",
      "Primary Email": "two@dup.example",
      "Primary Phone": "512-555-0002",
      "Physical Address": "2 B St",
      City: "Austin",
      State: "TX",
      ZIP: "78703",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "Punctuation, Inc.",
      "Company Name": "Punctuation Inc",
      "Primary Contact": "Casey",
      "Primary Email": "casey@punct.example",
      "Primary Phone": "512-555-0144",
      "Physical Address": "44 Dot Ln",
      City: "Austin",
      State: "TX",
      ZIP: "78704",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "Whitespace Co",
      "Company Name": "Whitespace Co",
      "Primary Contact": "Jordan",
      "Primary Email": "jordan@ws.example",
      "Primary Phone": "512-555-0155",
      "Physical Address": "55 Space Rd",
      City: "Austin",
      State: "TX",
      ZIP: "78705",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "CASE ONLY LLC",
      "Company Name": "Case Only LLC",
      "Primary Contact": "Taylor",
      "Primary Email": "taylor@case.example",
      "Primary Phone": "512-555-0166",
      "Physical Address": "66 Case Blvd",
      City: "Austin",
      State: "TX",
      ZIP: "78706",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "",
      "Company Name": "",
      "Primary Contact": "",
      "Primary Email": "",
      "Primary Phone": "",
      "Physical Address": "",
      City: "",
      State: "",
      ZIP: "",
      "Active?": "",
      "Needs Review": "",
      "Source Snapshot": ""
    },
    {
      "QuickBooks Account Name": "Optional Email Co",
      "Company Name": "Optional Email Co",
      "Primary Contact": "Morgan",
      "Primary Email": "",
      "Primary Phone": "512-555-0177",
      "Physical Address": "77 Optional Way",
      City: "Austin",
      State: "TX",
      ZIP: "78707",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    },
    {
      "QuickBooks Account Name": "Soft Address Co",
      "Company Name": "Soft Address Co",
      "Primary Contact": "Quinn",
      "Primary Email": "quinn@soft.example",
      "Primary Phone": "512-555-0188",
      "Physical Address": "Care of Soft Address / Building B",
      City: "Austin",
      State: "TX",
      ZIP: "78708",
      "Active?": "Yes",
      "Needs Review": "No",
      "Source Snapshot": "2026-07-23"
    }
  ];

  const qbRecords = [
    {
      "QuickBooks Account Name": "Alpha Builders",
      "QuickBooks Full Name": "Alpha Builders",
      "Record Name": "Alpha Builders",
      "Parent Account": "",
      "QB List ID": "QB-ALPHA",
      "Project Custom Field": "should-ignore",
      Notes: "ignored"
    },
    {
      "QuickBooks Account Name": "Alpha Builders",
      "QuickBooks Full Name": "Alpha Builders:Kitchen Remodel",
      "Record Name": "Kitchen Remodel",
      "Parent Account": "Alpha Builders",
      "QB List ID": "QB-ALPHA-JOB",
      "Ship Address": "Job site only"
    },
    {
      "QuickBooks Account Name": "Gamma Works",
      "QuickBooks Full Name": "Gamma Works",
      "Record Name": "Gamma Works",
      "Parent Account": "   ",
      "QB List ID": "QB-GAMMA"
    },
    {
      "QuickBooks Account Name": "Ambiguous Dup",
      "QuickBooks Full Name": "Ambiguous Dup",
      "Record Name": "Ambiguous Dup",
      "Parent Account": "",
      "QB List ID": "QB-AMB-1"
    },
    {
      "QuickBooks Account Name": "Ambiguous Dup",
      "QuickBooks Full Name": "Ambiguous Dup",
      "Record Name": "Ambiguous Dup Alt",
      "Parent Account": "",
      "QB List ID": "QB-AMB-2"
    },
    {
      "QuickBooks Account Name": "Punctuation Inc",
      "QuickBooks Full Name": "Punctuation Inc",
      "Record Name": "Punctuation Inc",
      "Parent Account": "",
      "QB List ID": "QB-PUNCT-WRONG"
    },
    {
      "QuickBooks Account Name": "Whitespace   Co",
      "QuickBooks Full Name": "Whitespace   Co",
      "Record Name": "Whitespace Co",
      "Parent Account": "",
      "QB List ID": "QB-WS"
    },
    {
      "QuickBooks Account Name": "case only llc",
      "QuickBooks Full Name": "case only llc",
      "Record Name": "case only llc",
      "Parent Account": "",
      "QB List ID": "QB-CASE"
    },
    {
      "QuickBooks Account Name": "Optional Email Co",
      "QuickBooks Full Name": "Optional Email Co",
      "Record Name": "Optional Email Co",
      "Parent Account": "",
      "QB List ID": "QB-OPT"
    },
    {
      "QuickBooks Account Name": "Soft Address Co",
      "QuickBooks Full Name": "Soft Address Co",
      "Record Name": "Soft Address Co",
      "Parent Account": "",
      "QB List ID": "QB-SOFT"
    }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountDirectory), "Account Directory");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qbRecords), "QB Customer Records");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Field", "Notes"],
      ["displayName", "informational only"]
    ]),
    "Recommended Fields"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Note", "Value"],
      ["Source QuickBooks records", "36555"]
    ]),
    "Data Notes"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function main() {
  assert.equal(isRootQbRecord({ "Parent Account": "", "QuickBooks Full Name": "A", "QB List ID": "1" }), true);
  assert.equal(
    isRootQbRecord({ "Parent Account": "Parent", "QuickBooks Full Name": "A", "QB List ID": "1" }),
    false
  );
  assert.equal(
    isRootQbRecord({ "Parent Account": "", "QuickBooks Full Name": "A:Job", "QB List ID": "1" }),
    false
  );
  assert.equal(normalizeMatchKey("  Foo   Bar "), "foo bar");

  const bytes = buildFixtureWorkbook();
  const result = extractAccountDirectoryDryRun(bytes);

  assert.equal(result.report.accountDirectoryRowsRead, 12);
  assert.equal(result.report.blankRowsSkipped, 1);
  assert.ok(result.report.ignoredChildQbRecordCount >= 1);
  assert.ok(result.report.eligibleRootQbRecordCount >= 1);

  const seedByName = Object.fromEntries(result.seed.map((s) => [s.proposedAccount.displayName, s]));

  assert.ok(seedByName["Alpha Builders LLC"]);
  assert.equal(seedByName["Alpha Builders LLC"].externalLink.externalId, "QB-ALPHA");
  assert.ok(seedByName["Whitespace Co"]);
  assert.equal(seedByName["Whitespace Co"].externalLink.externalId, "QB-WS");
  assert.ok(seedByName["Case Only LLC"]);
  assert.equal(seedByName["Case Only LLC"].externalLink.externalId, "QB-CASE");

  const punctReview = result.review.filter((r) => /Punctuation/i.test(r.displayName || r.qbAccountName || ""));
  assert.ok(punctReview.length >= 1);
  assert.ok(punctReview.some((r) => String(r.reasonCodes).includes("missing_root_qb_id")));

  assert.ok(
    result.review.some((r) => /No Match/i.test(r.displayName || "") && /missing_root_qb_id/.test(r.reasonCodes))
  );
  assert.ok(
    result.review.some(
      (r) => /Ambiguous Dup/i.test(r.qbAccountName || "") && /ambiguous_root_qb_id/.test(r.reasonCodes)
    )
  );
  assert.ok(result.report.ambiguousRootIds >= 1);

  assert.ok(
    result.review.some((r) => /Beta Homes/i.test(r.displayName || "") && /invalid_primary_email/.test(r.reasonCodes))
  );
  assert.ok(seedByName["Optional Email Co"]);
  assert.equal(seedByName["Optional Email Co"].proposedPrimaryContact.email, null);
  // Soft ambiguous address seeds with warning; addressLine1 null
  assert.ok(seedByName["Soft Address Co"]);
  assert.equal(seedByName["Soft Address Co"].proposedPrimaryLocation.addressLine1, null);
  assert.ok(seedByName["Soft Address Co"].importMetadata.warnings.includes("ambiguous_address"));
  assert.ok(
    result.review.some(
      (r) => /Beta Homes/i.test(r.displayName || "") && /suspicious_primary_phone/.test(r.reasonCodes)
    )
  );
  assert.ok(
    result.review.some(
      (r) => /Beta Homes/i.test(r.displayName || "") && /source_flagged_needs_review/.test(r.reasonCodes)
    )
  );

  const seedJson = JSON.stringify(result.seed);
  for (const f of ["Lifetime Sales", "Notes", "CRM Status", "Ship Address", "Project Custom Field"]) {
    assert.equal(seedJson.includes(f), false, `seed must not include ${f}`);
  }
  for (const f of FORBIDDEN_SEED_FIELDS) {
    assert.equal(seedJson.includes(`"${f}"`), false);
  }
  assert.equal(seedJson.includes("QB-ALPHA-JOB"), false);

  const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
  assert.ok(gitignore.includes("local-imports/"));

  const summary = `seedReadyCount=${result.report.seedReadyCount} reviewCount=${result.report.reviewCount} dbWrites=${result.dbWrites}`;
  assert.equal(summary.includes("pat@alpha.example"), false);
  assert.equal(summary.includes("Alpha Builders"), false);
  assert.equal(result.dbWrites, 0);

  const store = createAccountDirectoryMemoryStore();
  const before = store.__stats();
  extractAccountDirectoryDryRun(bytes);
  assert.deepEqual(store.__stats(), before);

  assert.equal(result.report.sourceRecordCountFromDataNotes, 36555);
  const csv = reviewRowsToCsv(result.review);
  assert.ok(csv.includes("reasonCodes"));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ad-dry-"));
  fs.writeFileSync(path.join(dir, "account-directory-seed.json"), JSON.stringify(result.seed));
  fs.writeFileSync(path.join(dir, "account-directory-review.csv"), csv);
  fs.writeFileSync(path.join(dir, "account-directory-import-report.json"), JSON.stringify(result.report));

  console.log("accountDirectoryWorkbookExtract.test.mjs: ok");
}

main();
