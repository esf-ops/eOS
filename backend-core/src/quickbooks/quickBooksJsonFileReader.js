/**
 * quickBooksJsonFileReader — Phase 1 QuickBooks ingestion (local export preview only).
 *
 * The QuickBooks SDK connector (`quickbooks-sdk-connector/`, .NET 4.8) writes JSON via
 * `Encoding.UTF8`, whose default .NET instance emits a UTF-8 byte-order-mark preamble.
 * Node's `JSON.parse` does not strip a leading BOM/control character, which causes real
 * export manifest.json and batch JSON files to fail parsing even though they are
 * otherwise well-formed JSON. This module decodes and sanitizes the raw bytes before
 * parsing so the reader tolerates BOM/encoding quirks from any writer.
 *
 * KNOWN CONNECTOR ISSUE (investigate for a later connector patch): real archived batch
 * files parse as a top-level JSON *string* rather than an object/array — confirmed by
 * safe diagnostic to be a C# anonymous-object `.ToString()` string, e.g.
 * `{ entityType = customers, batchNumber = 1, recordCount = 100, records = System.Collections... }`.
 * The most likely cause is `quickbooks-sdk-connector/Normalization/JsonSerializationHelper.cs`'s
 * `WriteValue` switch — its `default` case calls `Convert.ToString(value)` and writes
 * the result via `WriteStringValue`. The top-level `payload` passed by
 * `IteratorQueryRunner.WriteJson`/`RunSingleQuery` is a C# anonymous object
 * (`new { entityType, batchNumber, recordCount, records }`), which does not match any
 * of the `IDictionary<string, object>` / `IDictionary` / `IEnumerable` cases, so it
 * falls through to `default` and gets serialized as a single JSON string containing the
 * object's default `.ToString()` text instead of a proper JSON object. This module does
 * NOT change the connector — it makes the Node-side preview reader robust enough to
 * safely parse and count records out of this string-wrapped shape (see
 * `detectCSharpAnonymousObjectString` below) without needing to regenerate the archived
 * export. Fixing the connector to emit real JSON objects (e.g. by adding an
 * anonymous-object/reflection case, or by having callers pass
 * `IDictionary<string, object>` instead of anonymous types) is tracked as a follow-up in
 * `docs/eliteos/QUICKBOOKS_INGESTION_PLAN.md`.
 *
 * SAFETY: Never logs or returns raw file text/content. Error messages and diagnostics
 * are built only from whitelisted, structural details (byte length, string length,
 * first non-whitespace character, matched QuickBooks Ret tag names/counts,
 * position/line/column numbers) — never substrings of customer/financial content.
 */

import { promises as fs } from "node:fs";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

/** Leading whitespace/control/BOM characters that are always safe to strip before the first JSON token. */
const LEADING_NOISE_PATTERN = /^[\s\u0000-\u001F\uFEFF]*/;

/**
 * Decode a raw file buffer to a string, detecting common BOM prefixes.
 * Falls back to UTF-8 when no BOM is present.
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
export function decodeQuickBooksJsonBuffer(buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return buffer.subarray(3).toString("utf8");
  }

  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16LE_BOM)) {
    return buffer.subarray(2).toString("utf16le");
  }

  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16BE_BOM)) {
    // Node has no native UTF-16BE decoder — byte-swap into UTF-16LE order first.
    const body = buffer.subarray(2);
    const swapped = Buffer.alloc(body.length - (body.length % 2));
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return swapped.toString("utf16le");
  }

  return buffer.toString("utf8");
}

/**
 * Strip any leading BOM/whitespace/control characters that sit before the first
 * `{` or `[` token. Only strips when the prefix is entirely made of such
 * characters, so it never mangles genuinely malformed JSON in a misleading way.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripLeadingJsonNoise(text) {
  const firstTokenIndex = text.search(/[{[]/);
  if (firstTokenIndex < 0) {
    return text.replace(LEADING_NOISE_PATTERN, "");
  }

  const prefix = text.slice(0, firstTokenIndex);
  const noiseMatch = prefix.match(LEADING_NOISE_PATTERN);
  if (noiseMatch && noiseMatch[0].length === prefix.length) {
    return text.slice(firstTokenIndex);
  }

  return text;
}

/**
 * Strip only genuinely-leading BOM/whitespace/control characters from the very
 * start of a string, regardless of what character follows. Safe for any content
 * (JSON, XML, or otherwise) since it never scans past the leading run.
 *
 * @param {string} text
 * @returns {string}
 */
function stripLeadingNoiseOnly(text) {
  return text.replace(LEADING_NOISE_PATTERN, "");
}

/**
 * Build a safe error summary from a JSON.parse SyntaxError — never echoes file content.
 *
 * @param {unknown} err
 * @returns {string}
 */
function safeParseErrorSummary(err) {
  const message = String(err?.message ?? "");
  const lineColMatch = message.match(/line (\d+) column (\d+)/i);
  if (lineColMatch) {
    return `JSON.parse failed at line ${lineColMatch[1]}, column ${lineColMatch[2]}`;
  }

  const positionMatch = message.match(/position (\d+)/i);
  if (positionMatch) {
    return `JSON.parse failed at character position ${positionMatch[1]}`;
  }

  return "JSON.parse failed (unrecognized parser error format)";
}

/**
 * Read and parse a QuickBooks export JSON file (manifest.json or a batch file),
 * tolerating UTF-8 BOM, UTF-16LE BOM, UTF-16BE BOM, and stray leading control
 * characters. Never throws — always returns a result object.
 *
 * @param {string} filePath
 * @returns {Promise<{ ok: boolean, data: unknown, error: string|null, errorType: "not_found"|"parse_error"|null, byteLength: number }>}
 */
export async function readQuickBooksJsonFile(filePath) {
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: `not found or unreadable (${err.code ?? "unknown error"})`,
      errorType: "not_found",
      byteLength: 0,
    };
  }

  const decoded = decodeQuickBooksJsonBuffer(buffer);
  const sanitized = stripLeadingJsonNoise(decoded);

  try {
    const data = JSON.parse(sanitized);
    return { ok: true, data, error: null, errorType: null, byteLength: buffer.length };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: `not valid JSON — ${safeParseErrorSummary(err)}`,
      errorType: "parse_error",
      byteLength: buffer.length,
    };
  }
}

/** QuickBooks Ret element tag rules per entity export folder — literal names and/or a wildcard pattern. */
export const ENTITY_XML_RET_TAG_RULES = Object.freeze({
  customers: { tagNames: ["CustomerRet"] },
  invoices: { tagNames: ["InvoiceRet"] },
  "invoice-lines": {
    tagNames: ["InvoiceLineRet", "InvoiceLineGroupRet", "ItemLineRet", "ItemGroupLineRet"],
    tagPattern: /Line(Group)?Ret$/,
  },
  items: {
    tagNames: [
      "ItemServiceRet",
      "ItemInventoryRet",
      "ItemNonInventoryRet",
      "ItemOtherChargeRet",
      "ItemSubtotalRet",
      "ItemDiscountRet",
      "ItemPaymentRet",
      "ItemSalesTaxRet",
      "ItemSalesTaxGroupRet",
      "ItemGroupRet",
      "ItemFixedAssetRet",
    ],
    tagPattern: /^Item[A-Za-z]*Ret$/,
  },
  payments: { tagNames: ["ReceivePaymentRet"] },
  vendors: { tagNames: ["VendorRet"] },
  bills: { tagNames: ["BillRet"] },
  "purchase-orders": { tagNames: ["PurchaseOrderRet"] },
  accounts: { tagNames: ["AccountRet"] },
  classes: { tagNames: ["ClassRet"] },
  "sales-reps": { tagNames: ["SalesRepRet"] },
  terms: { tagNames: ["StandardTermsRet", "DateDrivenTermsRet"] },
  estimates: { tagNames: ["EstimateRet"] },
  "sales-orders": { tagNames: ["SalesOrderRet"] },
});

/** Matches an opening `<SomethingRet` tag, whether self-closed, closed with `>`, or with attributes. Never matches closing `</SomethingRet>` tags. */
const XML_RET_OPEN_TAG_REGEX = /<([A-Za-z][A-Za-z0-9_]*Ret)(?=[\s/>])/g;

/**
 * Count opening `<...Ret>` / `<...Ret ...>` tags in a QBXML/XML string, filtered to the
 * known Ret tag names/patterns for a given entity export folder. Structural regex
 * counting only — never returns or logs tag attribute values or element text content.
 * When `entityFolderName` has no known rule, falls back to counting every `*Ret` tag.
 *
 * @param {string} xmlText
 * @param {string|null} entityFolderName
 * @returns {{ total: number, matchedTagCounts: Record<string, number>, usedEntityMapping: boolean }}
 */
export function countXmlRetTagsForEntity(xmlText, entityFolderName = null) {
  const rule = entityFolderName ? ENTITY_XML_RET_TAG_RULES[entityFolderName] : null;
  const tagNames = new Set(rule?.tagNames ?? []);
  const tagPattern = rule?.tagPattern ?? null;

  /** @type {Record<string, number>} */
  const matchedTagCounts = {};
  let total = 0;

  const regex = new RegExp(XML_RET_OPEN_TAG_REGEX.source, "g");
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    const tagName = match[1];
    const isKnownTag = rule ? tagNames.has(tagName) || (tagPattern && tagPattern.test(tagName)) : true;
    if (isKnownTag) {
      matchedTagCounts[tagName] = (matchedTagCounts[tagName] ?? 0) + 1;
      total += 1;
    }
  }

  return { total, matchedTagCounts, usedEntityMapping: Boolean(rule) };
}

function summarizeTagCounts(matchedTagCounts) {
  const entries = Object.entries(matchedTagCounts ?? {});
  if (entries.length === 0) {
    return "no matching tags";
  }
  return entries.map(([tag, count]) => `${tag}=${count}`).join(", ");
}

/**
 * Matches the connector's known-buggy C# anonymous-object `.ToString()` shape:
 *   { entityType = <label>, batchNumber = <n>, recordCount = <n>, records = <...anything...> }
 * `batchNumber` is optional (some single-request batches, e.g. terms/date-driven-terms.json,
 * omit it). The `records = ` value is intentionally never captured or inspected — it may
 * contain a .NET type name, nested braces/brackets/commas, or (in principle) arbitrary
 * text, none of which is safe or useful to parse here. Only the three scalar fields
 * before it, and the mere fact that a `records` label exists, are extracted.
 */
const CSHARP_ANONYMOUS_OBJECT_STRING_REGEX =
  /^\{\s*entityType\s*=\s*[^,{}]+?\s*,\s*(batchNumber\s*=\s*-?\d+\s*,\s*)?recordCount\s*=\s*(-?\d+)\s*,\s*records\s*=/;

/**
 * Detect the connector's C# anonymous-object `.ToString()` string shape and extract only
 * the safe structural fields (property labels present, and the numeric `recordCount`).
 * Never captures or returns the `entityType` label value, the `batchNumber` value, or
 * anything from the `records = ...` body.
 *
 * @param {string} trimmed
 * @returns {{ recordCount: number, propertyLabels: string[] }|null}
 */
function detectCSharpAnonymousObjectString(trimmed) {
  const match = CSHARP_ANONYMOUS_OBJECT_STRING_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, batchNumberGroup, recordCountText] = match;
  const propertyLabels = ["entityType"];
  if (batchNumberGroup) {
    propertyLabels.push("batchNumber");
  }
  propertyLabels.push("recordCount", "records");

  return { recordCount: Number(recordCountText), propertyLabels };
}

/**
 * Inspect a top-level string payload to classify it as JSON-wrapped, XML-wrapped,
 * a known C# anonymous-object `.ToString()` shape, or unrecognized — without ever
 * retaining raw content beyond what's needed to classify and count. Shared by
 * `extractRecordCountFromBatchJson` and `buildJsonShapeSummary`.
 *
 * @param {string} text
 * @param {string|null} entityFolderName
 */
function inspectStringPayload(text, entityFolderName) {
  const trimmed = stripLeadingNoiseOnly(text);
  const firstChar = trimmed.length > 0 ? trimmed[0] : null;
  const stringLength = text.length;

  if (firstChar === "{" || firstChar === "[" || firstChar === '"') {
    try {
      const innerData = JSON.parse(trimmed);
      return { kind: "string-json", firstChar, stringLength, innerData, parseOk: true };
    } catch {
      if (firstChar === "{") {
        const csharpShape = detectCSharpAnonymousObjectString(trimmed);
        if (csharpShape) {
          return {
            kind: "csharp-object-string",
            firstChar,
            stringLength,
            recordCount: csharpShape.recordCount,
            propertyLabels: csharpShape.propertyLabels,
          };
        }
      }

      return {
        kind: "string-unknown",
        firstChar,
        stringLength,
        parseOk: false,
        reason: "looked like JSON (starts with { [ or \") but failed to parse on second pass",
      };
    }
  }

  if (firstChar === "<") {
    const { total, matchedTagCounts } = countXmlRetTagsForEntity(trimmed, entityFolderName);
    return { kind: "string-xml", firstChar, stringLength, matchedTagCounts, matchedTagTotal: total };
  }

  return {
    kind: "string-unknown",
    firstChar,
    stringLength,
    reason: "string payload does not look like JSON or XML (no leading { [ or <)",
  };
}

/**
 * Build a diagnostic-safe shape summary of parsed JSON: top-level type, property
 * names, property types, and array lengths only. For a top-level string payload,
 * classifies it as string-json / string-xml / string-unknown and reports only safe
 * structural details (string length, first non-whitespace character, matched Ret tag
 * names/counts, or the inner shape once re-parsed). Never includes raw values.
 *
 * @param {unknown} data
 * @param {string|null} [entityFolderName]
 * @returns {object}
 */
export function buildJsonShapeSummary(data, entityFolderName = null) {
  if (typeof data === "string") {
    const inspected = inspectStringPayload(data, entityFolderName);
    const base = {
      topLevelType: "string",
      kind: inspected.kind,
      stringLength: inspected.stringLength,
      firstNonWhitespaceChar: inspected.firstChar,
    };

    if (inspected.kind === "string-json" && inspected.parseOk) {
      return { ...base, innerShape: buildJsonShapeSummary(inspected.innerData, entityFolderName) };
    }

    if (inspected.kind === "csharp-object-string") {
      return {
        ...base,
        propertyLabels: inspected.propertyLabels,
        recordCount: inspected.recordCount,
      };
    }

    if (inspected.kind === "string-xml") {
      return {
        ...base,
        matchedTagCounts: inspected.matchedTagCounts,
        matchedTagTotal: inspected.matchedTagTotal,
      };
    }

    return { ...base, reason: inspected.reason ?? null };
  }

  if (data === null) {
    return { topLevelType: "null" };
  }

  if (Array.isArray(data)) {
    return { topLevelType: "array", arrayLength: data.length };
  }

  if (typeof data !== "object") {
    return { topLevelType: typeof data };
  }

  /** @type {Record<string, { type: string, length?: number }>} */
  const properties = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      properties[key] = { type: "array", length: value.length };
    } else if (value === null) {
      properties[key] = { type: "null" };
    } else {
      properties[key] = { type: typeof value };
    }
  }

  return { topLevelType: "object", properties };
}

const KNOWN_RECORDS_KEYS = Object.freeze(["records", "Records"]);
const IGNORED_ARRAY_KEYS = new Set(["errors", "Errors", "warnings", "Warnings", "attempts", "Attempts"]);

/**
 * Extract a record count from a QuickBooks batch JSON payload, tolerating the
 * connector's known shapes plus a best-effort fallback for unrecognized ones.
 * Never returns or logs the underlying record values.
 *
 * Supported shapes:
 *   - top-level array
 *   - { records: [...] }
 *   - { Records: [...] }
 *   - { entityType, records: [...] }
 *   - { EntityType, Records: [...] }
 *   - any single obvious top-level array property (fallback)
 *   - top-level JSON *string* that itself re-parses to one of the shapes above
 *     (works around a known connector serialization issue — see module doc comment)
 *   - top-level XML/QBXML *string* — counted structurally via known `*Ret` tag names
 *     for the given entity folder (e.g. `CustomerRet`, `InvoiceRet`, `Item*Ret`)
 *   - top-level C# anonymous-object `.ToString()` *string* (the connector's real batch
 *     file shape today) — `recordCount` is read directly from its `recordCount = <n>`
 *     field; the `records = ...` body is never inspected or parsed
 *   - anything else (string or otherwise) — returns 0 with a safe warning, never throws
 *
 * @param {unknown} data
 * @param {string|null} [entityFolderName] Known entity folder name (e.g. "customers"),
 *   used to select the right `*Ret` tag rule when the payload is XML text.
 * @returns {{ recordCount: number, shape: string, warning: string|null }}
 */
export function extractRecordCountFromBatchJson(data, entityFolderName = null) {
  if (typeof data === "string") {
    const inspected = inspectStringPayload(data, entityFolderName);

    if (inspected.kind === "string-json" && inspected.parseOk) {
      const innerResult = extractRecordCountFromBatchJson(inspected.innerData, entityFolderName);
      return {
        recordCount: innerResult.recordCount,
        shape: `string-json > ${innerResult.shape}`,
        warning: innerResult.warning,
      };
    }

    if (inspected.kind === "csharp-object-string") {
      return {
        recordCount: inspected.recordCount,
        shape: `csharp-object-string (recordCount=${inspected.recordCount})`,
        warning: null,
      };
    }

    if (inspected.kind === "string-xml") {
      const tagSummary = summarizeTagCounts(inspected.matchedTagCounts);
      return {
        recordCount: inspected.matchedTagTotal,
        shape: `string-xml (${tagSummary})`,
        warning:
          inspected.matchedTagTotal === 0
            ? `string payload looked like XML but no known Ret tags matched for entity "${entityFolderName ?? "unknown"}"`
            : null,
      };
    }

    return {
      recordCount: 0,
      shape: "string-unknown",
      warning: `string-wrapped batch payload is neither JSON- nor XML-looking (${inspected.reason ?? "unrecognized"})`,
    };
  }

  if (Array.isArray(data)) {
    return { recordCount: data.length, shape: "top-level-array", warning: null };
  }

  if (data && typeof data === "object") {
    for (const key of KNOWN_RECORDS_KEYS) {
      if (Array.isArray(data[key])) {
        return { recordCount: data[key].length, shape: `object.${key}`, warning: null };
      }
    }

    const arrayProps = Object.entries(data).filter(
      ([key, value]) => Array.isArray(value) && !IGNORED_ARRAY_KEYS.has(key)
    );

    if (arrayProps.length === 1) {
      const [key, value] = arrayProps[0];
      return { recordCount: value.length, shape: `object.${key} (fallback)`, warning: null };
    }

    if (arrayProps.length > 1) {
      const [bestKey, bestValue] = arrayProps.reduce((best, current) =>
        current[1].length > best[1].length ? current : best
      );
      const allKeys = arrayProps.map(([key]) => key).join(", ");
      return {
        recordCount: bestValue.length,
        shape: `object.${bestKey} (ambiguous fallback among: ${allKeys})`,
        warning: `multiple array properties found (${allKeys}); used "${bestKey}" (largest)`,
      };
    }
  }

  return {
    recordCount: 0,
    shape: "unknown",
    warning: "unrecognized batch JSON shape — no array of records found",
  };
}
