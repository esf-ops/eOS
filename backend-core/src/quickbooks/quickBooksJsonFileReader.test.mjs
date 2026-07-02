/**
 * quickBooksJsonFileReader — unit tests (fake fixture data only, no real QuickBooks data).
 * Run: node backend-core/src/quickbooks/quickBooksJsonFileReader.test.mjs
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildJsonShapeSummary,
  countXmlRetTagsForEntity,
  decodeQuickBooksJsonBuffer,
  extractRecordCountFromBatchJson,
  readQuickBooksJsonFile,
  stripLeadingJsonNoise,
} from "./quickBooksJsonFileReader.js";

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-json-reader-test-"));
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

const FAKE_MANIFEST = {
  RunId: "fake-run-1",
  StartedAt: "2026-07-01T00:00:00Z",
  CompletedAt: "2026-07-01T00:05:00Z",
  QbXmlVersion: "13.0",
  CompanyFile: "(currently open company file)",
  ExportDirectory: "/fake/exports/fake-run-1",
  Entities: [],
  Errors: [],
};

// ── decodeQuickBooksJsonBuffer: UTF-8 BOM ─────────────────────────────────────
{
  const text = JSON.stringify(FAKE_MANIFEST);
  const buffer = Buffer.concat([UTF8_BOM, Buffer.from(text, "utf8")]);
  const decoded = decodeQuickBooksJsonBuffer(buffer);
  assert.equal(decoded, text);
  console.log("ok: decodeQuickBooksJsonBuffer strips UTF-8 BOM at decode time");
}

// ── decodeQuickBooksJsonBuffer: UTF-16LE BOM ──────────────────────────────────
{
  const text = JSON.stringify(FAKE_MANIFEST);
  const buffer = Buffer.concat([UTF16LE_BOM, Buffer.from(text, "utf16le")]);
  const decoded = decodeQuickBooksJsonBuffer(buffer);
  assert.equal(decoded, text);
  console.log("ok: decodeQuickBooksJsonBuffer decodes UTF-16LE");
}

// ── decodeQuickBooksJsonBuffer: UTF-16BE BOM ──────────────────────────────────
{
  const text = JSON.stringify({ a: 1, b: "two" });
  const le = Buffer.from(text, "utf16le");
  const be = Buffer.alloc(le.length);
  for (let i = 0; i + 1 < le.length; i += 2) {
    be[i] = le[i + 1];
    be[i + 1] = le[i];
  }
  const buffer = Buffer.concat([UTF16BE_BOM, be]);
  const decoded = decodeQuickBooksJsonBuffer(buffer);
  assert.equal(decoded, text);
  console.log("ok: decodeQuickBooksJsonBuffer decodes UTF-16BE");
}

// ── stripLeadingJsonNoise: BOM char + control chars before '{' ───────────────
{
  const noisy = "\uFEFF\u0000\u0001{\"a\":1}";
  assert.equal(stripLeadingJsonNoise(noisy), '{"a":1}');

  const clean = '{"a":1}';
  assert.equal(stripLeadingJsonNoise(clean), clean);

  // Non-whitespace prefix (genuinely malformed) is left untouched.
  const malformed = 'garbage{"a":1}';
  assert.equal(stripLeadingJsonNoise(malformed), malformed);
  console.log("ok: stripLeadingJsonNoise only strips safe leading noise");
}

// ── readQuickBooksJsonFile: manifest with UTF-8 BOM ───────────────────────────
{
  const dir = await makeTempDir();
  const filePath = path.join(dir, "manifest.json");
  const text = JSON.stringify(FAKE_MANIFEST, null, 2);
  await fs.writeFile(filePath, Buffer.concat([UTF8_BOM, Buffer.from(text, "utf8")]));

  const result = await readQuickBooksJsonFile(filePath);
  assert.equal(result.ok, true);
  assert.equal(result.data.RunId, "fake-run-1");
  console.log("ok: readQuickBooksJsonFile parses manifest with UTF-8 BOM");
}

// ── readQuickBooksJsonFile: manifest with UTF-16LE encoding (no BOM) ──────────
{
  const dir = await makeTempDir();
  const filePath = path.join(dir, "manifest.json");
  const text = JSON.stringify(FAKE_MANIFEST, null, 2);
  await fs.writeFile(filePath, Buffer.concat([UTF16LE_BOM, Buffer.from(text, "utf16le")]));

  const result = await readQuickBooksJsonFile(filePath);
  assert.equal(result.ok, true);
  assert.equal(result.data.QbXmlVersion, "13.0");
  console.log("ok: readQuickBooksJsonFile parses manifest with UTF-16LE encoding");
}

// ── readQuickBooksJsonFile: missing file never throws ─────────────────────────
{
  const dir = await makeTempDir();
  const result = await readQuickBooksJsonFile(path.join(dir, "does-not-exist.json"));
  assert.equal(result.ok, false);
  assert.match(result.error, /not found or unreadable/);
  console.log("ok: readQuickBooksJsonFile handles missing file safely");
}

// ── readQuickBooksJsonFile: error messages never echo file content ───────────
{
  const dir = await makeTempDir();
  const filePath = path.join(dir, "broken.json");
  await fs.writeFile(filePath, '\uFEFF{"SecretCustomerName": "Definitely Not Real Co", broken', "utf8");

  const result = await readQuickBooksJsonFile(filePath);
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /Definitely Not Real Co/);
  assert.doesNotMatch(result.error, /SecretCustomerName/);
  console.log("ok: readQuickBooksJsonFile error messages never echo file content");
}

// ── extractRecordCountFromBatchJson: known shapes ─────────────────────────────
{
  assert.deepEqual(extractRecordCountFromBatchJson([{ a: 1 }, { a: 2 }]), {
    recordCount: 2,
    shape: "top-level-array",
    warning: null,
  });

  const lower = extractRecordCountFromBatchJson({ entityType: "customers", records: [1, 2, 3] });
  assert.equal(lower.recordCount, 3);
  assert.equal(lower.shape, "object.records");
  assert.equal(lower.warning, null);

  const upper = extractRecordCountFromBatchJson({ EntityType: "customers", Records: [1, 2, 3, 4] });
  assert.equal(upper.recordCount, 4);
  assert.equal(upper.shape, "object.Records");
  assert.equal(upper.warning, null);

  console.log("ok: extractRecordCountFromBatchJson handles top-level array, records, Records");
}

// ── extractRecordCountFromBatchJson: single obvious fallback array ───────────
{
  const fallback = extractRecordCountFromBatchJson({ entityType: "items", items: [1, 2] });
  assert.equal(fallback.recordCount, 2);
  assert.match(fallback.shape, /fallback/);
  assert.equal(fallback.warning, null);
  console.log("ok: extractRecordCountFromBatchJson falls back to single obvious array property");
}

// ── extractRecordCountFromBatchJson: unknown shape returns 0 with warning ────
{
  const unknown = extractRecordCountFromBatchJson({ entityType: "mystery", note: "no arrays here" });
  assert.equal(unknown.recordCount, 0);
  assert.equal(unknown.shape, "unknown");
  assert.match(unknown.warning, /unrecognized batch JSON shape/);

  const nullShape = extractRecordCountFromBatchJson(null);
  assert.equal(nullShape.recordCount, 0);
  assert.match(nullShape.warning, /unrecognized/);

  console.log("ok: extractRecordCountFromBatchJson returns 0 + warning for unknown shape, never throws");
}

// ── extractRecordCountFromBatchJson: ambiguous multiple arrays picks largest ─
{
  const ambiguous = extractRecordCountFromBatchJson({ recordsA: [1], recordsB: [1, 2, 3] });
  assert.equal(ambiguous.recordCount, 3);
  assert.match(ambiguous.shape, /ambiguous fallback/);
  assert.match(ambiguous.warning, /multiple array properties/);
  console.log("ok: extractRecordCountFromBatchJson flags ambiguous multi-array shape but still counts largest");
}

// ── extractRecordCountFromBatchJson: ignores Errors/Warnings/Attempts arrays ─
{
  const withErrors = extractRecordCountFromBatchJson({
    entityType: "estimates",
    records: [1, 2],
    Errors: ["one error"],
    Attempts: ["attempt-1", "attempt-2", "attempt-3"],
  });
  assert.equal(withErrors.recordCount, 2);
  assert.equal(withErrors.shape, "object.records");
  console.log("ok: extractRecordCountFromBatchJson ignores Errors/Attempts arrays when records is present");
}

// ── buildJsonShapeSummary: structure only, never raw values ───────────────────
{
  const summary = buildJsonShapeSummary({
    entityType: "customers",
    batchNumber: 1,
    records: [{ Name: "Fake Customer", Balance: "999.00" }],
  });

  assert.equal(summary.topLevelType, "object");
  assert.equal(summary.properties.entityType.type, "string");
  assert.equal(summary.properties.batchNumber.type, "number");
  assert.equal(summary.properties.records.type, "array");
  assert.equal(summary.properties.records.length, 1);

  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /Fake Customer/);
  assert.doesNotMatch(serialized, /999\.00/);
  console.log("ok: buildJsonShapeSummary reports structure only, never raw values");
}

// ── string-wrapped payload: JSON string wrapping an object with Records ──────
{
  const innerObject = { EntityType: "vendors", Records: [{ ListID: "V-1" }, { ListID: "V-2" }] };
  const stringWrapped = JSON.stringify(innerObject);

  const result = extractRecordCountFromBatchJson(stringWrapped, "vendors");
  assert.equal(result.recordCount, 2);
  assert.match(result.shape, /^string-json > object\.Records/);
  assert.equal(result.warning, null);
  console.log("ok: extractRecordCountFromBatchJson unwraps JSON string wrapping an object with Records");
}

// ── string-wrapped payload: batch JSON file's top-level string is XML with CustomerRet tags ─
// (i.e. reading + JSON.parse-ing the file once already yields a plain JS string whose
// content is XML text — this is what `readQuickBooksJsonFile` hands to the extractor)
{
  const fakeCustomerXml =
    '<?xml version="1.0"?><QBXML><QBXMLMsgsRs><CustomerQueryRs statusCode="0">' +
    '<CustomerRet><ListID>{FAKE-1}</ListID><Name>Fake Customer One</Name></CustomerRet>' +
    "<CustomerRet><ListID>{FAKE-2}</ListID><Name>Fake Customer Two</Name></CustomerRet>" +
    "</CustomerQueryRs></QBXMLMsgsRs></QBXML>";

  const result = extractRecordCountFromBatchJson(fakeCustomerXml, "customers");
  assert.equal(result.recordCount, 2);
  assert.match(result.shape, /^string-xml/);
  assert.match(result.shape, /CustomerRet=2/);
  assert.equal(result.warning, null);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Fake Customer One/);
  assert.doesNotMatch(serialized, /FAKE-1/);
  console.log("ok: extractRecordCountFromBatchJson counts a string-wrapped XML payload with CustomerRet tags");
}

// ── string-wrapped payload: double-JSON-encoded XML (string that itself re-parses to a JSON string) ─
{
  const fakeVendorXml = "<VendorRet><ListID>{FAKE-V1}</ListID></VendorRet>";
  const doubleEncoded = JSON.stringify(fakeVendorXml);

  const result = extractRecordCountFromBatchJson(doubleEncoded, "vendors");
  assert.equal(result.recordCount, 1);
  assert.match(result.shape, /^string-json > string-xml/);
  console.log("ok: extractRecordCountFromBatchJson handles double-JSON-encoded XML strings");
}

// ── XML string with attributes on Ret tags (both <Tag> and <Tag attr="..."> forms) ─
{
  const fakeInvoiceXml =
    "<InvoiceQueryRs statusCode=\"0\">" +
    '<InvoiceRet ListID="{X1}"><RefNumber>FAKE-1001</RefNumber></InvoiceRet>' +
    "<InvoiceRet><RefNumber>FAKE-1002</RefNumber></InvoiceRet>" +
    '<InvoiceLineRet ListID="{L1}"><Amount>0.00</Amount></InvoiceLineRet>' +
    "</InvoiceQueryRs>";

  const invoices = countXmlRetTagsForEntity(fakeInvoiceXml, "invoices");
  assert.equal(invoices.total, 2);
  assert.equal(invoices.matchedTagCounts.InvoiceRet, 2);
  assert.equal(invoices.matchedTagCounts.InvoiceLineRet, undefined);

  const invoiceLines = countXmlRetTagsForEntity(fakeInvoiceXml, "invoice-lines");
  assert.equal(invoiceLines.total, 1);
  assert.equal(invoiceLines.matchedTagCounts.InvoiceLineRet, 1);

  console.log("ok: countXmlRetTagsForEntity counts <Tag> and <Tag attr=\"...\"> forms, scoped per entity");
}

// ── string-wrapped payload: raw XML string (not JSON-wrapped) ────────────────
{
  const fakeItemXml =
    "<ItemQueryRs statusCode=\"0\">" +
    "<ItemInventoryRet><FullName>Fake Item A</FullName></ItemInventoryRet>" +
    '<ItemNonInventoryRet ListID="{I2}"><FullName>Fake Item B</FullName></ItemNonInventoryRet>' +
    "<ItemServiceRet><FullName>Fake Item C</FullName></ItemServiceRet>" +
    "</ItemQueryRs>";

  const result = extractRecordCountFromBatchJson(fakeItemXml, "items");
  assert.equal(result.recordCount, 3);
  assert.match(result.shape, /^string-xml/);
  assert.equal(result.warning, null);
  console.log("ok: extractRecordCountFromBatchJson counts raw XML string via wildcard Item*Ret pattern");
}

// ── string-wrapped payload: unknown string returns 0 + warning, never crashes ─
{
  const malformedBraceString = "{ this is not JSON and not the known C# object shape either }";

  const result = extractRecordCountFromBatchJson(malformedBraceString, "classes");
  assert.equal(result.recordCount, 0);
  assert.equal(result.shape, "string-unknown");
  assert.match(result.warning, /looked like JSON.*failed to parse/);

  const plainUnknown = extractRecordCountFromBatchJson("just some opaque text", "classes");
  assert.equal(plainUnknown.recordCount, 0);
  assert.equal(plainUnknown.shape, "string-unknown");
  assert.match(plainUnknown.warning, /neither JSON- nor XML-looking/);

  console.log("ok: extractRecordCountFromBatchJson returns 0 + warning for unknown string shapes, never throws");
}

// ── buildJsonShapeSummary for string payloads never leaks raw values ─────────
{
  const stringWrappedXml = JSON.stringify(
    '<CustomerRet><Name>Definitely Real Sounding Customer LLC</Name><Balance>42000.55</Balance></CustomerRet>'
  );

  const shape = buildJsonShapeSummary(stringWrappedXml, "customers");
  assert.equal(shape.topLevelType, "string");
  assert.equal(shape.kind, "string-json");
  assert.equal(typeof shape.stringLength, "number");
  assert.equal(shape.firstNonWhitespaceChar, '"');
  assert.equal(shape.innerShape.kind, "string-xml");
  assert.equal(shape.innerShape.matchedTagCounts.CustomerRet, 1);

  const serialized = JSON.stringify(shape);
  assert.doesNotMatch(serialized, /Definitely Real Sounding Customer LLC/);
  assert.doesNotMatch(serialized, /42000\.55/);
  console.log("ok: buildJsonShapeSummary for string payloads reports structure only, never raw values");
}

// ── C# anonymous-object string shape: single fake object with recordCount=2 ──
{
  const csharpString =
    "{ entityType = customers, batchNumber = 1, recordCount = 2, records = System.Collections.Generic.List`1[System.Collections.Generic.Dictionary`2[System.String,System.Object]] }";

  const result = extractRecordCountFromBatchJson(csharpString, "customers");
  assert.equal(result.recordCount, 2);
  assert.equal(result.shape, "csharp-object-string (recordCount=2)");
  assert.equal(result.warning, null);
  assert.equal(result.selfReportedOnly, true);
  console.log("ok: extractRecordCountFromBatchJson recognizes C# anonymous-object string shape");
}

// ── C# anonymous-object string shape without batchNumber (e.g. terms/date-driven-terms.json) ─
{
  const csharpString =
    "{ entityType = terms, recordCount = 1, records = System.Collections.Generic.List`1[System.Object] }";

  const result = extractRecordCountFromBatchJson(csharpString, "terms");
  assert.equal(result.recordCount, 1);
  assert.equal(result.shape, "csharp-object-string (recordCount=1)");
  assert.equal(result.warning, null);
  assert.equal(result.selfReportedOnly, true);

  const shape = buildJsonShapeSummary(csharpString, "terms");
  assert.equal(shape.kind, "csharp-object-string");
  assert.deepEqual(shape.propertyLabels, ["entityType", "recordCount", "records"]);
  assert.equal(shape.recordCount, 1);
  console.log("ok: extractRecordCountFromBatchJson counts C# anonymous-object string without batchNumber");
}

// ── C# anonymous-object string shape safe diagnostics never leak raw values ──
{
  const csharpString =
    '{ entityType = customers, batchNumber = 1, recordCount = 2, records = [ { Name = "Fake Customer LLC", Balance = 42000.55 } ] }';

  const shape = buildJsonShapeSummary(csharpString, "customers");
  assert.equal(shape.kind, "csharp-object-string");
  assert.deepEqual(shape.propertyLabels, ["entityType", "batchNumber", "recordCount", "records"]);
  assert.equal(shape.recordCount, 2);

  const serialized = JSON.stringify(shape);
  assert.doesNotMatch(serialized, /Fake Customer LLC/);
  assert.doesNotMatch(serialized, /42000\.55/);
  console.log("ok: C# anonymous-object string shape summary never leaks raw record content");
}

console.log("\nAll quickBooksJsonFileReader tests passed.");
