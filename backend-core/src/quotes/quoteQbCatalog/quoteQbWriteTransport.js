/**
 * Phase 1 — SDK transport guard.
 * Query ProcessRequest is allowed. EstimateAdd (and all Add/Mod) transmission is blocked.
 */

import { qbXmlContainsWriteRequest } from "./quoteQbEstimateAddBuilder.js";

/**
 * @typedef {{
 *   processRequest: (qbXml: string) => Promise<string>|string,
 *   close?: () => Promise<void>|void
 * }} QbSdkTransport
 */

/**
 * Transmit EstimateAdd — intentionally disabled for Phase 1.
 * @param {never} [_args]
 * @returns {never}
 */
export function transmitEstimateAdd(_args) {
  throw new Error(
    "transmitEstimateAdd is disabled in Phase 1. DRY RUN only — EstimateAdd must not be sent to QuickBooks."
  );
}

/**
 * Guarded ProcessRequest: rejects any Add/Mod qbXML before calling transport.
 * @param {QbSdkTransport} transport
 * @param {string} qbXml
 * @param {{ dryRun?: boolean, purpose?: string }} [opts]
 */
export async function processQbXmlSafely(transport, qbXml, opts = {}) {
  const xml = String(qbXml || "");
  const dryRun = opts.dryRun !== false; // default true
  const purpose = opts.purpose || "unspecified";

  if (qbXmlContainsWriteRequest(xml)) {
    // Phase 1 hard stop — never transmit writes regardless of dryRun flag.
    return {
      transmitted: false,
      blocked: true,
      dryRun,
      purpose,
      reason: "WRITE_QBXML_BLOCKED_PHASE1",
      responseXml: null,
      requestXml: xml
    };
  }

  if (!transport || typeof transport.processRequest !== "function") {
    throw new Error("SDK transport.processRequest is required for read queries.");
  }

  const responseXml = await transport.processRequest(xml);
  return {
    transmitted: true,
    blocked: false,
    dryRun,
    purpose,
    reason: null,
    responseXml: responseXml != null ? String(responseXml) : "",
    requestXml: xml
  };
}

/**
 * Build CustomerQueryRq by exact FullName (read-only).
 * @param {{ fullName: string, qbXmlVersion?: string, requestId?: string }} opts
 */
export function buildCustomerQueryByFullNameQbXml(opts) {
  const fullName = String(opts?.fullName || "").trim();
  if (!fullName) throw new Error("CustomerQuery requires fullName.");
  const version = String(opts?.qbXmlVersion || "13.0").trim() || "13.0";
  const requestId = String(opts?.requestId || "customer-query-test").trim();
  const escape = (v) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const inner =
    `<CustomerQueryRq requestID="${escape(requestId)}">` +
    `<FullName>${escape(fullName)}</FullName>` +
    `</CustomerQueryRq>`;

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<?qbxml version="${escape(version)}"?>` +
    `<QBXML><QBXMLMsgsRq onError="stopOnError">${inner}</QBXMLMsgsRq></QBXML>`
  );
}

/**
 * Build CompanyQueryRq (read-only) — used to identify the connected company file.
 * @param {{ qbXmlVersion?: string, requestId?: string }} [opts]
 */
export function buildCompanyQueryQbXml(opts = {}) {
  const version = String(opts?.qbXmlVersion || "13.0").trim() || "13.0";
  const requestId = String(opts?.requestId || "company-query").trim();
  const escape = (v) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const inner = `<CompanyQueryRq requestID="${escape(requestId)}"></CompanyQueryRq>`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<?qbxml version="${escape(version)}"?>` +
    `<QBXML><QBXMLMsgsRq onError="stopOnError">${inner}</QBXMLMsgsRq></QBXML>`
  );
}

/**
 * Extract CustomerRet rows from a CustomerQueryRs payload.
 * @param {string} responseXml
 * @returns {Array<{ listId: string, fullName: string|null, isActive: boolean|null }>}
 */
export function parseCustomerQueryRets(responseXml) {
  const xml = String(responseXml || "");
  const rets = [...xml.matchAll(/<CustomerRet\b[\s\S]*?<\/CustomerRet>/gi)].map((m) => m[0]);
  return rets.map((block) => {
    const listId = block.match(/<ListID>([^<]+)<\/ListID>/i)?.[1]?.trim() || "";
    const fullName = block.match(/<FullName>([^<]+)<\/FullName>/i)?.[1]?.trim() || null;
    const activeRaw = block.match(/<IsActive>([^<]+)<\/IsActive>/i)?.[1]?.trim().toLowerCase();
    const isActive = activeRaw == null ? null : activeRaw === "true";
    return { listId, fullName, isActive };
  }).filter((r) => r.listId);
}

/**
 * Require exactly one active customer for the TEST name.
 * @param {string} responseXml
 * @param {string} expectedFullName
 */
export function resolveExactlyOneActiveTestCustomer(responseXml, expectedFullName) {
  const expected = String(expectedFullName || "").trim();
  const rows = parseCustomerQueryRets(responseXml);
  const matches = rows.filter(
    (r) => r.fullName === expected || (r.fullName && r.fullName.toLowerCase() === expected.toLowerCase())
  );
  /** @type {Array<{ code: string, message: string, field?: string }>} */
  const errors = [];
  if (matches.length === 0) {
    errors.push({
      code: "QB_TEST_CUSTOMER_MISSING",
      message: `Customer "${expected}" was not found. Create it manually in the TEST company. CustomerAdd is forbidden.`,
      field: "customer"
    });
    return { ok: false, errors, listId: null, fullName: null };
  }
  if (matches.length > 1) {
    errors.push({
      code: "QB_TEST_CUSTOMER_NOT_UNIQUE",
      message: `Customer "${expected}" resolved to ${matches.length} rows; exactly one is required.`,
      field: "customer"
    });
    return { ok: false, errors, listId: null, fullName: null };
  }
  const hit = matches[0];
  if (hit.isActive === false) {
    errors.push({
      code: "QB_TEST_CUSTOMER_INACTIVE",
      message: `Customer "${expected}" is inactive.`,
      field: "customer"
    });
    return { ok: false, errors, listId: null, fullName: null };
  }
  return { ok: true, errors: [], listId: hit.listId, fullName: hit.fullName || expected };
}

/**
 * Extract first CustomerRet ListID + FullName from a CustomerQueryRs payload.
 * @param {string} responseXml
 * @returns {{ listId: string|null, fullName: string|null }}
 */
export function parseCustomerQueryListId(responseXml) {
  const rows = parseCustomerQueryRets(responseXml);
  if (!rows.length) return { listId: null, fullName: null };
  return { listId: rows[0].listId, fullName: rows[0].fullName };
}

/**
 * Extract CompanyName (or CompanyFileName) from CompanyQueryRs.
 * @param {string} responseXml
 */
export function parseCompanyIdentity(responseXml) {
  const xml = String(responseXml || "");
  const companyName = xml.match(/<CompanyName>([^<]+)<\/CompanyName>/i);
  if (companyName) return companyName[1].trim();
  const fileName = xml.match(/<CompanyFileName>([^<]+)<\/CompanyFileName>/i);
  if (fileName) return fileName[1].trim();
  return null;
}
