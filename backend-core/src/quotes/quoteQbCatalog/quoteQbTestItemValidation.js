/**
 * Phase 1.1 — TEST company ItemQuery validation (read-only).
 * Does not create/modify items.
 */

import { processQbXmlSafely } from "./quoteQbWriteTransport.js";

/** QBTEST-0001 mapped item expectations (production ListIDs verified in Phase 0). */
export const QBTEST_0001_EXPECTED_ITEMS = Object.freeze([
  Object.freeze({ listId: "8000005C-1327168522", fullName: "Tear Out" }),
  Object.freeze({ listId: "80000023-1327168507", fullName: "Cooktop Cutout" }),
  Object.freeze({ listId: "8000006D-1327168526", fullName: "Undermount Sink Cutout" }),
  Object.freeze({ listId: "8000023B-1652221291", fullName: "Edge:Waterfall End Panels" })
]);

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {{ listId: string, qbXmlVersion?: string, requestId?: string }} opts
 */
export function buildItemQueryByListIdQbXml(opts) {
  const listId = String(opts?.listId || "").trim();
  if (!listId) throw new Error("ItemQuery requires listId.");
  const version = String(opts?.qbXmlVersion || "13.0").trim() || "13.0";
  const requestId = String(opts?.requestId || `item-query-${listId}`).trim();
  const inner =
    `<ItemQueryRq requestID="${escapeXml(requestId)}">` +
    `<ListID>${escapeXml(listId)}</ListID>` +
    `</ItemQueryRq>`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<?qbxml version="${escapeXml(version)}"?>` +
    `<QBXML><QBXMLMsgsRq onError="stopOnError">${inner}</QBXMLMsgsRq></QBXML>`
  );
}

/**
 * Parse first Item*Ret ListID / FullName / IsActive from ItemQueryRs.
 * @param {string} responseXml
 */
export function parseItemQueryRet(responseXml) {
  const xml = String(responseXml || "");
  const retMatch = xml.match(/<Item\w*Ret\b[\s\S]*?<\/Item\w*Ret>/i);
  if (!retMatch) {
    return { listId: null, fullName: null, isActive: null, found: false };
  }
  const block = retMatch[0];
  const listId = block.match(/<ListID>([^<]+)<\/ListID>/i)?.[1]?.trim() || null;
  const fullName = block.match(/<FullName>([^<]+)<\/FullName>/i)?.[1]?.trim() || null;
  const activeRaw = block.match(/<IsActive>([^<]+)<\/IsActive>/i)?.[1]?.trim().toLowerCase();
  const isActive = activeRaw == null ? null : activeRaw === "true";
  return { listId, fullName, isActive, found: true };
}

/**
 * Validate expected TEST items against live ItemQuery responses or pre-parsed rows.
 *
 * @param {ReadonlyArray<{ listId: string, fullName: string }>} expected
 * @param {ReadonlyArray<{ listId: string|null, fullName: string|null, isActive: boolean|null, found: boolean }>} observed
 */
export function validateExpectedTestItems(expected, observed) {
  /** @type {Array<{ code: string, message: string, field?: string }>} */
  const errors = [];
  /** @type {Array<{ listId: string, expectedFullName: string, observedFullName: string|null, isActive: boolean|null, ok: boolean }>} */
  const results = [];

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const obs = observed[i] || { listId: null, fullName: null, isActive: null, found: false };
    let ok = true;
    if (!obs.found || !obs.listId) {
      ok = false;
      errors.push({
        code: "QB_TEST_ITEM_MISSING",
        message: `TEST company missing item ListID ${exp.listId} (expected FullName "${exp.fullName}").`,
        field: exp.listId
      });
    } else if (obs.listId !== exp.listId) {
      ok = false;
      errors.push({
        code: "QB_TEST_ITEM_LISTID_MISMATCH",
        message: `ItemQuery returned ListID ${obs.listId} but expected ${exp.listId}.`,
        field: exp.listId
      });
    }
    if (obs.found && obs.isActive === false) {
      ok = false;
      errors.push({
        code: "QB_TEST_ITEM_INACTIVE",
        message: `Item ListID ${exp.listId} is inactive in TEST company.`,
        field: exp.listId
      });
    }
    if (obs.found && obs.fullName != null && obs.fullName !== exp.fullName) {
      ok = false;
      errors.push({
        code: "QB_TEST_ITEM_FULLNAME_MISMATCH",
        message: `ListID ${exp.listId} FullName "${obs.fullName}" !== expected "${exp.fullName}".`,
        field: exp.listId
      });
    }
    if (obs.found && (obs.fullName == null || obs.fullName === "")) {
      ok = false;
      errors.push({
        code: "QB_TEST_ITEM_FULLNAME_MISSING",
        message: `ListID ${exp.listId} returned without FullName.`,
        field: exp.listId
      });
    }
    results.push({
      listId: exp.listId,
      expectedFullName: exp.fullName,
      observedFullName: obs.fullName,
      isActive: obs.isActive,
      ok
    });
  }

  return { ok: errors.length === 0, errors, results };
}

/**
 * Query each expected ListID via SDK transport (read-only).
 * @param {{ processRequest: Function }} transport
 * @param {{ qbXmlVersion?: string, expected?: typeof QBTEST_0001_EXPECTED_ITEMS }} [opts]
 */
export async function queryAndValidateTestItems(transport, opts = {}) {
  const expected = opts.expected || QBTEST_0001_EXPECTED_ITEMS;
  const version = opts.qbXmlVersion || "13.0";
  /** @type {Array<{ listId: string|null, fullName: string|null, isActive: boolean|null, found: boolean }>} */
  const observed = [];

  for (const exp of expected) {
    const xml = buildItemQueryByListIdQbXml({ listId: exp.listId, qbXmlVersion: version });
    const res = await processQbXmlSafely(transport, xml, { dryRun: true, purpose: "ItemQuery" });
    if (!res.transmitted) {
      observed.push({ listId: null, fullName: null, isActive: null, found: false });
      continue;
    }
    observed.push(parseItemQueryRet(res.responseXml));
  }

  return validateExpectedTestItems(expected, observed);
}
