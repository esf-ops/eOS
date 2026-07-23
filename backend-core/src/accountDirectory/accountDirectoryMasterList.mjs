/**
 * Account Directory master-list reconciliation.
 *
 * extract → normalize → compare → classify → review artifacts → dry-run → gated apply
 *
 * Does NOT replace the QuickBooks seed import.
 * Does NOT write QuickBooks links or financial/CRM activity fields.
 * Does NOT create SQL in this branch.
 *
 * Classification gap (sales executive, branch, market, account type, source section):
 * current account_directory_* schema has no safe home for these fields.
 * They stay in dry-run/review artifacts only until a future
 * account_directory_classifications table is approved. See FEATURE_DECISIONS.
 *
 * Idempotency for newly created master-list accounts uses external_system
 * `account_master_list` + stable fingerprint (NOT quickbooks_desktop).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as XLSX from "xlsx";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";

export const MASTER_LIST_SOURCE = "account_master_list";
export const MASTER_LIST_EXTERNAL_SYSTEM = "account_master_list";
export const MASTER_LIST_SHEET = "account master list";
export const APPLY_CONFIRM_PHRASE = "APPLY ACCOUNT MASTER LIST RECONCILIATION";

export const ALLOWED_COLUMNS = Object.freeze([
  "Name",
  "Sales Executive",
  "Status",
  "Key Contact",
  "Phone",
  "Email",
  "Market",
  "Address",
  "Branch",
  "Account Type"
]);

export const FORBIDDEN_COLUMNS = Object.freeze([
  "Last Contact",
  "Next Contact",
  "Days Since Last Contact",
  "Sample Program",
  "Updated Tower",
  "monday Doc v2",
  "Balance Due",
  "Est. Kitchens/Month"
]);

export const FORBIDDEN_FIELD_VARIANTS = Object.freeze([
  ...FORBIDDEN_COLUMNS,
  "lastContact",
  "nextContact",
  "daysSinceLastContact",
  "sampleProgram",
  "updatedTower",
  "mondayDocV2",
  "balanceDue",
  "estKitchensPerMonth",
  "balance_due",
  "est_kitchens_month"
]);

const KNOWN_SECTIONS = Object.freeze([
  "Dyersville",
  "Iowa City",
  "ESF - Lisbon",
  "Cabinet Dealer Protected Accounts",
  "Madison Prospect List",
  "Retired/Closed/Do Not Contact Accounts",
  "KBD Accounts",
  "Cambrian",
  "Aceno",
  "Fox Des Moines",
  "Blackstone",
  "Fox Omaha",
  "Marketing Resources",
  "Vendors"
]);

const SPECIAL_STATUS_RE =
  /uses\s+cabinet|protected|house\s*account|kbd|partner|dealer|do\s*not\s*contact|not\s*interested|shared/i;

const CLOSED_STATUS_RE =
  /retired|closed|do\s*not\s*contact|inactive|not\s*interested|dead|archive/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORP_SUFFIX_RE =
  /\b(llc|l\.l\.c\.|inc|inc\.|incorporated|corp|corp\.|corporation|company|co|co\.)\b/gi;

/**
 * @param {string} inputPath
 * @param {{ allowTestPaths?: boolean, repoRoot?: string }} [opts]
 */
export function assertAllowedMasterListInputPath(inputPath, opts = {}) {
  const resolved = path.resolve(inputPath);
  if (!resolved.toLowerCase().endsWith(".xlsx")) {
    throw new AccountDirectoryError(
      "invalid_input_type",
      "Master-list input must be an .xlsx workbook.",
      400
    );
  }
  if (opts.allowTestPaths) return resolved;
  const repoRoot = path.resolve(opts.repoRoot || process.cwd());
  const allowedRoot = path.resolve(repoRoot, "local-imports", "account-directory");
  if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
    throw new AccountDirectoryError(
      "input_path_forbidden",
      "Master-list input must live under local-imports/account-directory/ (gitignored).",
      400
    );
  }
  return resolved;
}

export function normalizeOrgMatchKey(value) {
  let s = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .replace(CORP_SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

export function normalizeEmail(value) {
  if (value == null || String(value).trim() === "") {
    return { ok: true, emails: [], display: null, reason: null };
  }
  const raw = String(value).trim();
  const parts = raw
    .split(/[;,|/]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return { ok: true, emails: [], display: null, reason: null };
  if (parts.length > 2) {
    return { ok: false, emails: [], display: raw, reason: "ambiguous_email_list" };
  }
  const emails = [];
  for (const p of parts) {
    if (!EMAIL_RE.test(p)) {
      return { ok: false, emails: [], display: raw, reason: "malformed_email" };
    }
    emails.push(p);
  }
  return { ok: true, emails, display: emails[0], reason: null };
}

export function normalizePhoneDigits(value) {
  if (value == null || String(value).trim() === "") {
    return { ok: true, digits: null, display: null, reason: null };
  }
  const display = String(value).trim();
  const digits = display.replace(/\D/g, "");
  if (!digits) return { ok: false, digits: null, display, reason: "malformed_phone" };
  if (digits.length === 10) return { ok: true, digits, display, reason: null };
  if (digits.length === 11 && digits.startsWith("1")) {
    return { ok: true, digits: digits.slice(1), display, reason: null };
  }
  if (digits.length >= 12) {
    return { ok: false, digits: null, display, reason: "malformed_phone_too_long" };
  }
  if (digits.length < 7) {
    return { ok: false, digits: null, display, reason: "malformed_phone" };
  }
  return { ok: false, digits: null, display, reason: "malformed_phone" };
}

export function parseAddressParts(address) {
  const raw = String(address ?? "").trim();
  if (!raw) return { raw: null, city: null, state: null, postalCode: null, line1: null };
  // Avoid treating bare market labels as addresses (no comma / no state token).
  const stateMatch = raw.match(/\b([A-Z]{2})\b(?:\s*,?\s*USA)?\s*$/i);
  const state = stateMatch ? stateMatch[1].toUpperCase() : null;
  let city = null;
  if (state) {
    const before = raw.slice(0, stateMatch.index).replace(/,\s*$/, "").trim();
    const parts = before.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 1) city = parts[parts.length - 1] || null;
  }
  const line1 = raw.split(",")[0]?.trim() || raw;
  const postal = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
  return {
    raw,
    city,
    state,
    postalCode: postal ? postal[1] : null,
    line1
  };
}

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

function isColumnHeaderRow(cells) {
  const lower = cells.map((c) => String(c ?? "").trim().toLowerCase());
  return lower.includes("name") && lower.includes("status") && lower.includes("sales executive");
}

function isTitleRow(cells, rowIndex) {
  const vals = cells.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (vals.length !== 1) return false;
  return /^account master list$/i.test(vals[0]) || (rowIndex === 0 && vals[0].length < 40);
}

function matchKnownSection(text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  for (const section of KNOWN_SECTIONS) {
    if (t === section) return section;
    if (section === "KBD Accounts" && /^kbd accounts/i.test(t)) return "KBD Accounts";
  }
  // Soft match long single-cell section titles
  if (/protected accounts/i.test(t)) return "Cabinet Dealer Protected Accounts";
  if (/madison prospect/i.test(t)) return "Madison Prospect List";
  if (/retired|closed|do not contact/i.test(t)) return "Retired/Closed/Do Not Contact Accounts";
  if (/marketing resources/i.test(t)) return "Marketing Resources";
  if (/^vendors$/i.test(t)) return "Vendors";
  return null;
}

function isSectionHeaderRow(cells) {
  const vals = cells.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (vals.length !== 1) return false;
  if (/^new account$/i.test(vals[0])) return false;
  return Boolean(matchKnownSection(vals[0])) || vals[0].length <= 80;
}

function cell(row, idx) {
  return row[idx] == null ? "" : String(row[idx]);
}

function scrubForbiddenKeys(value, pathBits = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) scrubForbiddenKeys(value[i], pathBits.concat(String(i)));
    return;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELD_VARIANTS.includes(key)) {
      throw new AccountDirectoryError(
        "forbidden_field_leak",
        `Forbidden field "${key}" must not appear in reconciliation outputs.`,
        500
      );
    }
    scrubForbiddenKeys(value[key], pathBits.concat(key));
  }
}

/**
 * @param {Buffer|string} input bytes or filesystem path
 */
export function readMasterListWorkbook(input) {
  const bytes = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheetName =
    workbook.SheetNames.find((n) => n.trim().toLowerCase() === MASTER_LIST_SHEET) ||
    workbook.SheetNames[0];
  if (!sheetName) {
    throw new AccountDirectoryError("sheet_missing", "Workbook has no sheets.", 400);
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  return { workbook, sheetName, matrix, bytes };
}

/**
 * Extract usable organization rows + profile aggregates.
 * @param {Buffer|string} input
 * @param {{ workbookFileName?: string }} [meta]
 */
export function extractMasterListRows(input, meta = {}) {
  const { sheetName, matrix } = readMasterListWorkbook(input);
  /** @type {any[]} */
  const rows = [];
  /** @type {Record<string, number>} */
  const sectionCounts = {};
  /** @type {Record<string, number>} */
  const statusCounts = {};
  /** @type {Record<string, number>} */
  const excludedCounts = {
    title: 0,
    section_header: 0,
    column_header: 0,
    empty: 0,
    new_account: 0,
    marketing_resources: 0,
    summary: 0
  };

  let currentSection = null;
  let inMarketing = false;
  let inVendors = false;

  for (let i = 0; i < matrix.length; i++) {
    const sourceRow = i + 1;
    const cells = Array.isArray(matrix[i]) ? matrix[i] : [];
    const vals = cells.map((c) => String(c ?? "").trim()).filter(Boolean);

    if (vals.length === 0) {
      excludedCounts.empty += 1;
      continue;
    }
    if (isTitleRow(cells, i)) {
      excludedCounts.title += 1;
      continue;
    }
    if (isColumnHeaderRow(cells)) {
      excludedCounts.column_header += 1;
      continue;
    }

    const sectionHit = vals.length === 1 ? matchKnownSection(vals[0]) : null;
    if (sectionHit || (vals.length === 1 && isSectionHeaderRow(cells))) {
      const sectionName = sectionHit || vals[0];
      currentSection = sectionName;
      inMarketing = /marketing resources/i.test(sectionName);
      inVendors = /^vendors$/i.test(sectionName);
      excludedCounts.section_header += 1;
      sectionCounts[sectionName] = sectionCounts[sectionName] || 0;
      continue;
    }

    if (/^new account$/i.test(vals[0]) && vals.length <= 2) {
      excludedCounts.new_account += 1;
      continue;
    }

    // Formula/summary-ish rows: single numeric-looking total cells without a name-like first col
    if (vals.length <= 2 && /^total|^sum|^count/i.test(vals[0] || "")) {
      excludedCounts.summary += 1;
      continue;
    }

    if (inMarketing || /marketing resources/i.test(String(currentSection || ""))) {
      excludedCounts.marketing_resources += 1;
      continue;
    }

    const name = cell(cells, 0).trim();
    if (!name) {
      excludedCounts.empty += 1;
      continue;
    }

    const status = cell(cells, 2).trim();
    const emailRaw = cell(cells, 5).trim();
    const phoneRaw = cell(cells, 4).trim();
    const addressRaw = cell(cells, 9).trim();
    const emailNorm = normalizeEmail(emailRaw);
    const phoneNorm = normalizePhoneDigits(phoneRaw);
    const address = parseAddressParts(addressRaw);

    const row = {
      sourceRow,
      sourceSection: currentSection,
      displayName: name,
      salesExecutive: cell(cells, 1).trim() || null,
      status: status || null,
      keyContact: cell(cells, 3).trim() || null,
      phone: phoneNorm.display,
      phoneDigits: phoneNorm.digits,
      phoneOk: phoneNorm.ok,
      phoneReason: phoneNorm.reason,
      email: emailNorm.display,
      emails: emailNorm.emails,
      emailOk: emailNorm.ok,
      emailReason: emailNorm.reason,
      market: cell(cells, 8).trim() || null,
      address: address.raw,
      addressCity: address.city,
      addressState: address.state,
      addressPostalCode: address.postalCode,
      addressLine1: address.line1,
      branch: cell(cells, 10).trim() || null,
      accountType: cell(cells, 11).trim() || null,
      normalizedName: normalizeOrgMatchKey(name),
      isVendorSection: inVendors || /^vendors$/i.test(String(currentSection || "")),
      isClosedSection: /retired|closed|do not contact/i.test(String(currentSection || "")),
      workbookFileName: meta.workbookFileName || null,
      sheetName
    };

    // Ensure forbidden activity/financial columns never land on the row object
    rows.push(row);
    sectionCounts[currentSection || "(none)"] = (sectionCounts[currentSection || "(none)"] || 0) + 1;
    const statusKey = status || "(blank)";
    statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
  }

  const nameOwners = new Map();
  for (const row of rows) {
    const key = row.normalizedName;
    const list = nameOwners.get(key) || [];
    list.push(row.sourceRow);
    nameOwners.set(key, list);
  }
  const duplicateNames = [];
  for (const [normalizedName, sourceRows] of nameOwners) {
    if (sourceRows.length > 1) {
      duplicateNames.push({ normalizedName, sourceRows, count: sourceRows.length });
    }
  }

  const uniqueNames = nameOwners.size;
  const profile = {
    sheetName,
    totalRows: matrix.length,
    usableRows: rows.length,
    uniqueNames,
    duplicateNameGroups: duplicateNames.length,
    duplicateNames: duplicateNames.map((d) => ({
      normalizedName: d.normalizedName,
      count: d.count,
      sourceRows: d.sourceRows
    })),
    sectionCounts,
    statusCounts,
    excludedCounts,
    knownSections: KNOWN_SECTIONS,
    workbookFileName: meta.workbookFileName || null
  };

  scrubForbiddenKeys(profile);
  scrubForbiddenKeys(rows);
  return { rows, profile };
}

export function profileMasterListWorkbook(input, meta = {}) {
  return extractMasterListRows(input, meta).profile;
}

export function buildMasterListFingerprint(row) {
  const material = [
    normalizeOrgMatchKey(row.displayName),
    String(row.sourceSection || "").trim().toLowerCase(),
    String(row.status || "").trim().toLowerCase(),
    String(row.email || "").trim().toLowerCase(),
    String(row.phoneDigits || "")
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
}

/**
 * Bounded bulk directory index for matching.
 * @param {any} store
 * @param {string} organizationId
 */
export async function buildDirectoryMatchIndex(store, organizationId) {
  const [{ items: accounts }, contacts, locations, aliases, links] = await Promise.all([
    store.listAccounts(organizationId, {
      statusIn: null,
      includeArchived: true,
      search: null,
      limit: 5000,
      offset: 0
    }),
    store.listContactsForOrganization(organizationId),
    store.listLocationsForOrganization(organizationId),
    store.listAliasesForOrganization(organizationId),
    store.listExternalLinksForOrganization(organizationId)
  ]);

  /** @type {Map<string, any[]>} */
  const byName = new Map();
  /** @type {Map<string, any[]>} */
  const byAlias = new Map();
  /** @type {Map<string, any[]>} */
  const byEmail = new Map();
  /** @type {Map<string, any[]>} */
  const byPhone = new Map();
  /** @type {Map<string, any[]>} */
  const byAddress = new Map();
  /** @type {Map<string, any>} */
  const byId = new Map();

  const contactsByAccount = groupBy(contacts, (c) => c.accountId);
  const locationsByAccount = groupBy(locations, (l) => l.accountId);
  const aliasesByAccount = groupBy(aliases, (a) => a.accountId);
  const linksByAccount = groupBy(links, (l) => l.accountId);

  for (const account of accounts) {
    const c = contactsByAccount.get(account.id) || [];
    const l = locationsByAccount.get(account.id) || [];
    const al = aliasesByAccount.get(account.id) || [];
    const lk = linksByAccount.get(account.id) || [];
    const qbLinked = lk.some(
      (x) => x.isActive && x.externalSystem === "quickbooks_desktop"
    );
    const entry = {
      account,
      contacts: c,
      locations: l,
      aliases: al,
      links: lk,
      quickbooksLinked: qbLinked
    };
    byId.set(account.id, entry);

    pushMap(byName, normalizeOrgMatchKey(account.displayName), entry);
    if (account.legalName) pushMap(byName, normalizeOrgMatchKey(account.legalName), entry);

    for (const alias of al) {
      if (alias.isActive === false) continue;
      pushMap(byAlias, normalizeOrgMatchKey(alias.aliasValue), entry);
      if (alias.normalizedMatchValue) {
        pushMap(byAlias, String(alias.normalizedMatchValue).toLowerCase(), entry);
      }
    }
    for (const contact of c) {
      if (contact.email) pushMap(byEmail, String(contact.email).trim().toLowerCase(), entry);
      const phone = normalizePhoneDigits(contact.phoneNormalized || contact.phone);
      if (phone.ok && phone.digits) pushMap(byPhone, phone.digits, entry);
    }
    for (const loc of l) {
      const key = [normalizeOrgMatchKey(loc.city), String(loc.state || "").toUpperCase()]
        .filter(Boolean)
        .join("|");
      if (key.includes("|")) pushMap(byAddress, key, entry);
      if (loc.sourceAddressRaw) {
        pushMap(byAddress, normalizeOrgMatchKey(loc.sourceAddressRaw), entry);
      }
    }
  }

  return { byId, byName, byAlias, byEmail, byPhone, byAddress, accounts, contacts, locations, aliases, links };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(keyFn(row));
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function pushMap(map, key, value) {
  if (!key) return;
  const list = map.get(key);
  if (list) {
    if (!list.includes(value)) list.push(value);
  } else map.set(key, [value]);
}

function uniqueEntries(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const id = item.account?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function fuzzyNameOnlyClose(a, b) {
  if (!a || !b || a === b) return false;
  // Very light containment check — never enough alone to auto-merge.
  if (a.length < 6 || b.length < 6) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * @param {any} row extracted workbook row
 * @param {any} index directory match index
 * @param {{ workbookNameCounts?: Map<string, number> }} [ctx]
 */
export function classifyMasterListRow(row, index, ctx = {}) {
  const reasons = [];
  const fingerprint = buildMasterListFingerprint(row);

  if (!row.normalizedName) {
    return baseClassification(row, fingerprint, {
      classification: "invalid_record",
      confidence: "none",
      proposedAction: "skip",
      reviewReason: "missing_organization_name",
      reasons: ["missing_organization_name"]
    });
  }

  if (row.isVendorSection) {
    return baseClassification(row, fingerprint, {
      classification: "vendor_hold",
      confidence: "high",
      proposedAction: "hold_vendor",
      reviewReason: "vendor_section",
      reasons: ["vendor_section"]
    });
  }

  const nameCount = ctx.workbookNameCounts?.get(row.normalizedName) || 1;
  if (nameCount > 1) {
    return baseClassification(row, fingerprint, {
      classification: "duplicate_within_workbook",
      confidence: "high",
      proposedAction: "review",
      reviewReason: "duplicate_workbook_name",
      reasons: ["duplicate_workbook_name"]
    });
  }

  if (!row.emailOk && row.emailReason) reasons.push(row.emailReason);
  if (!row.phoneOk && row.phoneReason) reasons.push(row.phoneReason);

  const status = String(row.status || "").trim();
  if (!status) reasons.push("blank_organization_status");
  if (SPECIAL_STATUS_RE.test(status)) reasons.push("special_relationship_status");

  const nameHits = uniqueEntries(index.byName.get(row.normalizedName) || []);
  const aliasHits = uniqueEntries(index.byAlias.get(row.normalizedName) || []);
  const emailHits = [];
  for (const email of row.emails || []) {
    emailHits.push(...(index.byEmail.get(email) || []));
  }
  const uniqEmail = uniqueEntries(emailHits);
  const phoneHits = row.phoneDigits
    ? uniqueEntries(index.byPhone.get(row.phoneDigits) || [])
    : [];
  const addressKey =
    row.addressCity && row.addressState
      ? `${normalizeOrgMatchKey(row.addressCity)}|${String(row.addressState).toUpperCase()}`
      : null;
  const addressHits = addressKey ? uniqueEntries(index.byAddress.get(addressKey) || []) : [];

  /** @type {Map<string, { entry: any, signals: Set<string> }>} */
  const scored = new Map();
  function addHits(hits, signal) {
    for (const entry of hits) {
      const id = entry.account.id;
      const cur = scored.get(id) || { entry, signals: new Set() };
      cur.signals.add(signal);
      scored.set(id, cur);
    }
  }
  addHits(nameHits, "exact_normalized_name");
  addHits(aliasHits, "alias_match");
  addHits(uniqEmail, "exact_email");
  addHits(phoneHits, "exact_phone");
  addHits(addressHits, "city_state");

  // Contact-name + org-name support
  if (row.keyContact) {
    const contactKey = normalizeOrgMatchKey(row.keyContact);
    for (const entry of nameHits) {
      const hasContact = (entry.contacts || []).some(
        (c) => normalizeOrgMatchKey(c.displayName) === contactKey
      );
      if (hasContact) addHits([entry], "name_plus_contact");
    }
  }

  const candidates = [...scored.values()];

  if (candidates.length > 1) {
    return baseClassification(row, fingerprint, {
      classification: "probable_match_review",
      confidence: "medium",
      proposedAction: "review",
      reviewReason: "multiple_existing_matches",
      reasons: [...reasons, "multiple_existing_matches"],
      matches: candidates.map((c) => summarizeMatch(c))
    });
  }

  if (candidates.length === 1) {
    const only = candidates[0];
    const signals = [...only.signals];
    reasons.push(...signals);
    const strong =
      signals.includes("exact_normalized_name") ||
      signals.includes("alias_match") ||
      signals.includes("exact_email") ||
      (signals.includes("exact_phone") && signals.includes("city_state")) ||
      signals.includes("name_plus_contact");

    const enrichment = buildEnrichmentProposal(row, only.entry);
    if (strong) {
      const exactName = signals.includes("exact_normalized_name") || signals.includes("alias_match");
      return baseClassification(row, fingerprint, {
        classification: exactName && signals.length === 1 ? "exact_existing" : "high_confidence_match",
        confidence: "high",
        proposedAction: enrichment.hasWork ? "enrich_existing" : "retain_existing",
        reviewReason: null,
        reasons,
        matches: [summarizeMatch(only)],
        enrichment
      });
    }
    return baseClassification(row, fingerprint, {
      classification: "probable_match_review",
      confidence: "medium",
      proposedAction: "review",
      reviewReason: "weak_or_conflicting_signals",
      reasons,
      matches: [summarizeMatch(only)],
      enrichment
    });
  }

  if (candidates.length === 0) {
    // Fuzzy-name-only scan (review only — never auto-merge)
    const fuzzy = [];
    for (const [norm, entries] of index.byName) {
      if (fuzzyNameOnlyClose(norm, row.normalizedName)) {
        for (const entry of uniqueEntries(entries)) fuzzy.push(entry);
      }
    }
    if (fuzzy.length) {
      return baseClassification(row, fingerprint, {
        classification: "probable_match_review",
        confidence: "low",
        proposedAction: "review",
        reviewReason: "fuzzy_name_only",
        reasons: [...reasons, "fuzzy_name_only"],
        matches: fuzzy.slice(0, 5).map((entry) =>
          summarizeMatch({ entry, signals: new Set(["fuzzy_name"]) })
        )
      });
    }

    if (!row.emailOk && row.emailReason) {
      return baseClassification(row, fingerprint, {
        classification: "invalid_record",
        confidence: "low",
        proposedAction: "review",
        reviewReason: row.emailReason,
        reasons
      });
    }
    if (!row.phoneOk && row.phoneReason && row.phone) {
      return baseClassification(row, fingerprint, {
        classification: "invalid_record",
        confidence: "low",
        proposedAction: "review",
        reviewReason: row.phoneReason,
        reasons
      });
    }

    // Closed / retired mapping before special-relationship holds
    if (row.isClosedSection || CLOSED_STATUS_RE.test(status)) {
      return baseClassification(row, fingerprint, {
        classification: "closed_or_archived_candidate",
        confidence: "medium",
        proposedAction: "create_archived_candidate",
        reviewReason: null,
        reasons: [...reasons, "closed_or_archived_mapping"],
        createPlan: buildCreatePlan(row, "archived")
      });
    }

    if (SPECIAL_STATUS_RE.test(status) || reasons.includes("special_relationship_status")) {
      return baseClassification(row, fingerprint, {
        classification: "special_relationship_review",
        confidence: "medium",
        proposedAction: "review",
        reviewReason: "special_relationship_status",
        reasons
      });
    }

    const mappedStatus = mapUnmatchedStatus(status);
    if (!mappedStatus) {
      return baseClassification(row, fingerprint, {
        classification: "special_relationship_review",
        confidence: "low",
        proposedAction: "review",
        reviewReason: "unmapped_status",
        reasons: [...reasons, "unmapped_status"]
      });
    }

    return baseClassification(row, fingerprint, {
      classification: "unmatched_create_candidate",
      confidence: "high",
      proposedAction: mappedStatus === "prospect" ? "create_prospect" : "create_account",
      reviewReason: null,
      reasons: [...reasons, "unmatched"],
      createPlan: buildCreatePlan(row, mappedStatus)
    });
  }

  // unreachable
  return baseClassification(row, fingerprint, {
    classification: "invalid_record",
    confidence: "none",
    proposedAction: "skip",
    reviewReason: "unclassified",
    reasons
  });
}

function mapUnmatchedStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "lead") return "prospect";
  if (CLOSED_STATUS_RE.test(s)) return "archived";
  return null;
}

function summarizeMatch(scored) {
  const account = scored.entry.account;
  return {
    accountId: account.id,
    displayName: account.displayName,
    status: account.archivedAt ? "archived" : account.status,
    quickbooksLinked: Boolean(scored.entry.quickbooksLinked),
    signals: [...scored.signals]
  };
}

function buildEnrichmentProposal(row, entry) {
  const proposals = [];
  const conflicts = [];
  const activeContacts = (entry.contacts || []).filter((c) => c.isActive !== false);
  const primaryContact =
    activeContacts.find((c) => c.isPrimaryEstimating) || activeContacts[0] || null;
  const activeLocations = (entry.locations || []).filter((l) => l.isActive !== false);
  const primaryLoc =
    activeLocations.find((l) => l.isPrimaryAccountLocation) || activeLocations[0] || null;

  if (!primaryContact && (row.keyContact || row.email || row.phone)) {
    proposals.push({
      type: "add_contact",
      displayName: row.keyContact || row.displayName,
      email: row.emailOk ? row.email : null,
      phone: row.phoneOk ? row.phone : null
    });
  } else if (primaryContact) {
    if (row.emailOk && row.email && !primaryContact.email) {
      proposals.push({ type: "add_contact_email", contactId: primaryContact.id, email: row.email });
    } else if (
      row.emailOk &&
      row.email &&
      primaryContact.email &&
      String(primaryContact.email).toLowerCase() !== row.email
    ) {
      conflicts.push({ type: "email_conflict", existing: "(present)", workbook: "(present)" });
    }
    if (row.phoneOk && row.phone && !primaryContact.phone) {
      proposals.push({ type: "add_contact_phone", contactId: primaryContact.id, phone: row.phone });
    } else if (row.phoneOk && row.phone && primaryContact.phone) {
      const existingDigits = normalizePhoneDigits(primaryContact.phone).digits;
      if (existingDigits && row.phoneDigits && existingDigits !== row.phoneDigits) {
        conflicts.push({ type: "phone_conflict" });
      }
    }
  }

  if (!primaryLoc && row.address) {
    proposals.push({
      type: "add_location",
      sourceAddressRaw: row.address,
      city: row.addressCity,
      state: row.addressState,
      postalCode: row.addressPostalCode,
      line1: row.addressLine1
    });
  } else if (primaryLoc && row.addressCity && primaryLoc.city) {
    if (
      normalizeOrgMatchKey(primaryLoc.city) !== normalizeOrgMatchKey(row.addressCity) &&
      row.addressState &&
      String(primaryLoc.state || "").toUpperCase() === String(row.addressState).toUpperCase()
    ) {
      conflicts.push({ type: "address_conflict" });
    }
  }

  const existingNorm = normalizeOrgMatchKey(entry.account.displayName);
  if (row.normalizedName && row.normalizedName !== existingNorm) {
    const aliasExists = (entry.aliases || []).some(
      (a) => normalizeOrgMatchKey(a.aliasValue) === row.normalizedName
    );
    if (!aliasExists) {
      proposals.push({ type: "add_alias", alias: row.displayName, source: MASTER_LIST_SOURCE });
    }
  }

  // Classification fields intentionally NOT proposed for DB write (schema gap).
  return {
    hasWork: proposals.length > 0,
    hasConflicts: conflicts.length > 0,
    proposals,
    conflicts,
    classificationFieldsHeld: {
      salesExecutive: row.salesExecutive,
      branch: row.branch,
      market: row.market,
      accountType: row.accountType,
      sourceSection: row.sourceSection
    }
  };
}

function buildCreatePlan(row, status) {
  const hasContact = Boolean(row.keyContact || (row.emailOk && row.email) || (row.phoneOk && row.phone));
  const hasLocation = Boolean(row.address);
  return {
    displayName: row.displayName,
    status,
    source: MASTER_LIST_SOURCE,
    fingerprint: buildMasterListFingerprint(row),
    contact: hasContact
      ? {
          displayName: row.keyContact || row.displayName,
          email: row.emailOk ? row.email : null,
          phone: row.phoneOk ? row.phone : null
        }
      : null,
    location: hasLocation
      ? {
          sourceAddressRaw: row.address,
          city: row.addressCity,
          state: row.addressState,
          postalCode: row.addressPostalCode,
          line1: row.addressLine1
        }
      : null,
    classificationFieldsHeld: {
      salesExecutive: row.salesExecutive,
      branch: row.branch,
      market: row.market,
      accountType: row.accountType,
      sourceSection: row.sourceSection
    }
  };
}

function baseClassification(row, fingerprint, partial) {
  const match = partial.matches?.[0] || null;
  return {
    sourceRow: row.sourceRow,
    sourceSection: row.sourceSection,
    workbookDisplayName: row.displayName,
    workbookStatus: row.status,
    fingerprint,
    matchedAccountId: match?.accountId || null,
    existingDisplayName: match?.displayName || null,
    quickbooksLinked: match ? Boolean(match.quickbooksLinked) : false,
    matchClassification: partial.classification,
    matchConfidence: partial.confidence,
    matchReasons: partial.reasons || [],
    proposedAction: partial.proposedAction,
    reviewReason: partial.reviewReason,
    matches: partial.matches || [],
    enrichment: partial.enrichment || null,
    createPlan: partial.createPlan || null
  };
}

/**
 * Classify all extracted rows against a directory index.
 */
export function reconcileExtractedRows(rows, index) {
  const workbookNameCounts = new Map();
  for (const row of rows) {
    workbookNameCounts.set(row.normalizedName, (workbookNameCounts.get(row.normalizedName) || 0) + 1);
  }
  return rows.map((row) => classifyMasterListRow(row, index, { workbookNameCounts }));
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function classificationsToMatchReportCsv(classifications) {
  const header = [
    "sourceRow",
    "sourceSection",
    "workbookDisplayName",
    "workbookStatus",
    "matchedAccountId",
    "existingDisplayName",
    "quickbooksLinked",
    "matchClassification",
    "matchConfidence",
    "matchReasons",
    "proposedAction",
    "reviewReason"
  ];
  const lines = [header.join(",")];
  for (const c of classifications) {
    lines.push(
      [
        c.sourceRow,
        c.sourceSection,
        c.workbookDisplayName,
        c.workbookStatus,
        c.matchedAccountId,
        c.existingDisplayName,
        c.quickbooksLinked ? "yes" : "no",
        c.matchClassification,
        c.matchConfidence,
        (c.matchReasons || []).join("|"),
        c.proposedAction,
        c.reviewReason
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  const text = lines.join("\n") + "\n";
  for (const forbidden of FORBIDDEN_COLUMNS) {
    if (text.toLowerCase().includes(forbidden.toLowerCase()) && !header.join(",").includes("Status")) {
      // Status is allowed; forbidden columns must not appear as headers/content labels
    }
  }
  // Header must not include forbidden column names
  for (const forbidden of FORBIDDEN_COLUMNS) {
    if (header.includes(forbidden)) {
      throw new AccountDirectoryError("forbidden_field_leak", `CSV header includes ${forbidden}`, 500);
    }
  }
  return text;
}

function summarizeClassifications(classifications) {
  /** @type {Record<string, number>} */
  const byClass = {};
  let enrichment = 0;
  let createActive = 0;
  let createProspect = 0;
  let archivedCandidate = 0;
  let vendorHold = 0;
  let specialReview = 0;
  let duplicate = 0;
  let exactExisting = 0;
  let highConfidence = 0;
  let probableReview = 0;
  let qbPreservedMatches = 0;

  for (const c of classifications) {
    byClass[c.matchClassification] = (byClass[c.matchClassification] || 0) + 1;
    if (c.matchClassification === "exact_existing") exactExisting += 1;
    if (c.matchClassification === "high_confidence_match") highConfidence += 1;
    if (c.matchClassification === "probable_match_review") probableReview += 1;
    if (c.proposedAction === "enrich_existing") enrichment += 1;
    if (c.proposedAction === "create_account") createActive += 1;
    if (c.proposedAction === "create_prospect") createProspect += 1;
    if (c.matchClassification === "closed_or_archived_candidate") archivedCandidate += 1;
    if (c.matchClassification === "vendor_hold") vendorHold += 1;
    if (c.matchClassification === "special_relationship_review") specialReview += 1;
    if (c.matchClassification === "duplicate_within_workbook") duplicate += 1;
    if (c.matchedAccountId && c.quickbooksLinked) qbPreservedMatches += 1;
  }

  return {
    byClass,
    exactExisting,
    highConfidence,
    probableReview,
    enrichment,
    createActive,
    createProspect,
    archivedCandidate,
    vendorHold,
    specialReview,
    duplicate,
    qbPreservedMatches,
    totalClassified: classifications.length
  };
}

/**
 * Dry-run or prepare reconciliation artifacts.
 */
export async function runMasterListReconcile(args) {
  const {
    store,
    organizationId,
    inputPath,
    workbookBytes,
    expectedUsableRows,
    expectedUniqueNames,
    outputDir,
    repoRoot,
    allowTestPaths = false,
    dryRun = true
  } = args;

  if (!dryRun) {
    throw new AccountDirectoryError(
      "use_apply_path",
      "runMasterListReconcile is dry-run only. Use runMasterListApply for writes.",
      400
    );
  }
  if (!organizationId) {
    throw new AccountDirectoryError("organization_required", "Organization ID is required.", 400);
  }

  let resolvedInput = null;
  let bytes = workbookBytes;
  let fileName = args.workbookFileName || "workbook.xlsx";
  if (inputPath) {
    resolvedInput = assertAllowedMasterListInputPath(inputPath, { allowTestPaths, repoRoot });
    bytes = fs.readFileSync(resolvedInput);
    fileName = path.basename(resolvedInput);
  }
  if (!bytes) {
    throw new AccountDirectoryError("input_required", "Workbook input is required.", 400);
  }

  const beforeStats = typeof store.__stats === "function" ? store.__stats() : null;
  const { rows, profile } = extractMasterListRows(bytes, { workbookFileName: fileName });

  if (expectedUsableRows != null && Number(expectedUsableRows) !== profile.usableRows) {
    throw new AccountDirectoryError(
      "expected_usable_rows_mismatch",
      `Usable rows ${profile.usableRows} != expected ${expectedUsableRows}.`,
      400
    );
  }
  if (expectedUniqueNames != null && Number(expectedUniqueNames) !== profile.uniqueNames) {
    throw new AccountDirectoryError(
      "expected_unique_names_mismatch",
      `Unique names ${profile.uniqueNames} != expected ${expectedUniqueNames}.`,
      400
    );
  }

  const index = await buildDirectoryMatchIndex(store, organizationId);
  const classifications = reconcileExtractedRows(rows, index);
  const summary = summarizeClassifications(classifications);

  const createCandidates = classifications
    .filter((c) =>
      ["unmatched_create_candidate", "closed_or_archived_candidate"].includes(c.matchClassification)
    )
    .map((c) => ({
      sourceRow: c.sourceRow,
      classification: c.matchClassification,
      proposedAction: c.proposedAction,
      createPlan: c.createPlan
    }));

  const enrichmentCandidates = classifications
    .filter((c) => c.proposedAction === "enrich_existing" && c.enrichment?.hasWork)
    .map((c) => ({
      sourceRow: c.sourceRow,
      matchedAccountId: c.matchedAccountId,
      quickbooksLinked: c.quickbooksLinked,
      enrichment: {
        proposals: c.enrichment.proposals,
        conflicts: c.enrichment.conflicts
        // classificationFieldsHeld intentionally omitted from enrichment write candidates
      }
    }));

  const reviewRows = classifications.filter((c) =>
    [
      "probable_match_review",
      "duplicate_within_workbook",
      "invalid_record",
      "vendor_hold",
      "special_relationship_review"
    ].includes(c.matchClassification)
  );

  const outDir =
    outputDir ||
    path.resolve(repoRoot || process.cwd(), "local-imports/account-directory/master-list/output");
  fs.mkdirSync(outDir, { recursive: true });

  const dryRunDoc = {
    mode: "dry-run",
    generatedAt: new Date().toISOString(),
    organizationId,
    input: resolvedInput ? path.basename(resolvedInput) : fileName,
    profile: {
      totalRows: profile.totalRows,
      usableRows: profile.usableRows,
      uniqueNames: profile.uniqueNames,
      duplicateNameGroups: profile.duplicateNameGroups,
      sectionCounts: profile.sectionCounts,
      statusCounts: profile.statusCounts,
      excludedCounts: profile.excludedCounts
    },
    summary,
    databaseWrites: 0,
    notes: [
      "No QuickBooks links created or modified.",
      "Classification fields held in artifacts only (schema gap).",
      "Apply requires approved artifact + confirmation phrase."
    ]
  };

  scrubForbiddenKeys(dryRunDoc);
  scrubForbiddenKeys(createCandidates);
  scrubForbiddenKeys(enrichmentCandidates);

  const paths = {
    profile: path.join(outDir, "master-list-profile.json"),
    matchReport: path.join(outDir, "master-list-match-report.csv"),
    review: path.join(outDir, "master-list-review.csv"),
    createCandidates: path.join(outDir, "master-list-create-candidates.json"),
    enrichmentCandidates: path.join(outDir, "master-list-enrichment-candidates.json"),
    dryRun: path.join(outDir, "master-list-dry-run.json")
  };

  fs.writeFileSync(paths.profile, JSON.stringify(profile, null, 2));
  fs.writeFileSync(paths.matchReport, classificationsToMatchReportCsv(classifications));
  fs.writeFileSync(paths.review, classificationsToMatchReportCsv(reviewRows));
  fs.writeFileSync(paths.createCandidates, JSON.stringify(createCandidates, null, 2));
  fs.writeFileSync(paths.enrichmentCandidates, JSON.stringify(enrichmentCandidates, null, 2));
  fs.writeFileSync(paths.dryRun, JSON.stringify(dryRunDoc, null, 2));

  const afterStats = typeof store.__stats === "function" ? store.__stats() : null;
  if (beforeStats && afterStats) {
    for (const key of Object.keys(beforeStats)) {
      if (beforeStats[key] !== afterStats[key]) {
        throw new AccountDirectoryError(
          "dry_run_wrote_data",
          "Dry-run mutated the Account Directory store.",
          500
        );
      }
    }
  }

  return {
    profile,
    summary,
    classifications,
    paths,
    databaseWrites: 0,
    consoleSummary: formatReconcileConsoleSummary(dryRunDoc)
  };
}

export function formatReconcileConsoleSummary(doc) {
  const s = doc.summary || {};
  return [
    `mode: ${doc.mode}`,
    `usableRows: ${doc.profile?.usableRows}`,
    `uniqueNames: ${doc.profile?.uniqueNames}`,
    `exactExisting: ${s.exactExisting}`,
    `highConfidence: ${s.highConfidence}`,
    `probableReview: ${s.probableReview}`,
    `enrichment: ${s.enrichment}`,
    `createActive: ${s.createActive}`,
    `createProspect: ${s.createProspect}`,
    `archivedCandidate: ${s.archivedCandidate}`,
    `vendorHold: ${s.vendorHold}`,
    `specialReview: ${s.specialReview}`,
    `duplicate: ${s.duplicate}`,
    `qbPreservedMatches: ${s.qbPreservedMatches}`,
    `databaseWrites: ${doc.databaseWrites ?? 0}`
  ].join("\n");
}

/**
 * Gated apply from an approved create-candidates artifact.
 * Does not modify QuickBooks links. Idempotent via account_master_list fingerprints.
 */
export async function runMasterListApply(args) {
  const {
    store,
    service,
    organizationId,
    actorUserId,
    role = "admin",
    approvedArtifactPath,
    confirmPhrase,
    expectedUsableRows,
    recheckProduction = true,
    outputDir,
    repoRoot
  } = args;

  if (String(confirmPhrase || "") !== APPLY_CONFIRM_PHRASE) {
    throw new AccountDirectoryError(
      "confirm_phrase_required",
      `Apply requires confirm phrase: ${APPLY_CONFIRM_PHRASE}`,
      400
    );
  }
  if (!organizationId || !actorUserId) {
    throw new AccountDirectoryError(
      "apply_identity_required",
      "organizationId and actorUserId are required.",
      400
    );
  }
  if (!approvedArtifactPath) {
    throw new AccountDirectoryError(
      "approved_artifact_required",
      "Pass --approved-artifact pointing at master-list-create-candidates.json",
      400
    );
  }

  const artifactResolved = path.resolve(approvedArtifactPath);
  const candidates = JSON.parse(fs.readFileSync(artifactResolved, "utf8"));
  if (!Array.isArray(candidates)) {
    throw new AccountDirectoryError("invalid_artifact", "Approved artifact must be a JSON array.", 400);
  }
  if (expectedUsableRows != null && candidates.length > Number(expectedUsableRows)) {
    throw new AccountDirectoryError(
      "artifact_count_suspicious",
      "Create-candidate count exceeds expected usable rows.",
      400
    );
  }

  const importRunId = crypto.randomUUID();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let dbWrites = 0;
  /** @type {any[]} */
  const results = [];

  for (const item of candidates) {
    const plan = item.createPlan;
    if (!plan?.fingerprint || !plan.displayName) {
      failed += 1;
      results.push({ outcome: "failed", code: "invalid_create_plan", sourceRow: item.sourceRow });
      continue;
    }

    if (recheckProduction) {
      const existingLinks = await store.listActiveExternalLinksByExternalId(
        organizationId,
        MASTER_LIST_EXTERNAL_SYSTEM,
        plan.fingerprint
      );
      if (existingLinks.length >= 1) {
        skipped += 1;
        results.push({
          outcome: "skipped_existing",
          accountId: existingLinks[0].accountId,
          fingerprint: plan.fingerprint,
          sourceRow: item.sourceRow
        });
        continue;
      }

      // Never create if exact name already matches a QB-linked account
      const index = await buildDirectoryMatchIndex(store, organizationId);
      const nameHits = uniqueEntries(index.byName.get(normalizeOrgMatchKey(plan.displayName)) || []);
      if (nameHits.some((h) => h.quickbooksLinked)) {
        skipped += 1;
        results.push({
          outcome: "skipped_qb_linked_match",
          accountId: nameHits.find((h) => h.quickbooksLinked).account.id,
          sourceRow: item.sourceRow
        });
        continue;
      }
    }

    let createdAccountId = null;
    try {
      const status = plan.status === "archived" ? "active" : plan.status;
      const account = await service.createAccount({
        organizationId,
        role,
        actorUserId,
        requestId: importRunId,
        payload: {
          displayName: plan.displayName,
          status: status === "prospect" ? "prospect" : "active",
          source: MASTER_LIST_SOURCE,
          primaryContactName: plan.contact?.displayName,
          primaryEmail: plan.contact?.email,
          primaryPhone: plan.contact?.phone,
          city: plan.location?.city,
          state: plan.location?.state,
          postalCode: plan.location?.postalCode,
          line1: plan.location?.line1,
          sourceAddressRaw: plan.location?.sourceAddressRaw
        },
        asProspect: plan.status === "prospect"
      });
      createdAccountId = account.id;
      dbWrites += 1;
      created += 1;

      if (plan.status === "archived") {
        await service.archiveAccount({
          organizationId,
          role,
          actorUserId,
          requestId: importRunId,
          accountId: account.id,
          rowVersion: account.rowVersion
        });
        dbWrites += 1;
      }

      const linkResult = await store.insertExternalLink({
        organizationId,
        accountId: account.id,
        externalSystem: MASTER_LIST_EXTERNAL_SYSTEM,
        externalId: plan.fingerprint,
        externalDisplayName: plan.displayName,
        sourceSnapshotDate: null,
        linkedBy: actorUserId
      });
      if (!linkResult.ok) {
        throw new AccountDirectoryError(
          linkResult.code || "link_failed",
          "Could not write master-list fingerprint link.",
          409
        );
      }
      dbWrites += 1;

      await store.insertAuditEvent({
        organizationId,
        accountId: account.id,
        entityType: "account",
        entityId: account.id,
        action: "master_list_import_account",
        actorUserId,
        changedFields: ["displayName", "source", "masterListFingerprint"],
        newValues: {
          source: MASTER_LIST_SOURCE,
          externalSystem: MASTER_LIST_EXTERNAL_SYSTEM,
          fingerprint: plan.fingerprint,
          importRunId
        },
        requestId: importRunId
      });
      dbWrites += 1;

      results.push({
        outcome: "created",
        accountId: account.id,
        fingerprint: plan.fingerprint,
        sourceRow: item.sourceRow
      });
    } catch (e) {
      failed += 1;
      results.push({
        outcome: "failed",
        code: e?.code || "apply_failed",
        sourceRow: item.sourceRow,
        message: String(e?.message || e).slice(0, 200)
      });
      if (createdAccountId) {
        try {
          const orphan = await store.getAccount(organizationId, createdAccountId);
          if (orphan && !orphan.archivedAt) {
            await store.updateAccount(organizationId, createdAccountId, {
              status: "archived",
              archivedAt: new Date().toISOString(),
              archivedBy: actorUserId,
              updatedBy: actorUserId
            });
            dbWrites += 1;
          }
        } catch {
          /* compensation best-effort */
        }
      }
    }
  }

  const receipt = {
    mode: "apply",
    generatedAt: new Date().toISOString(),
    organizationId,
    importRunId,
    created,
    skipped,
    failed,
    databaseWrites: dbWrites,
    quickbooksLinksChanged: 0,
    results: results.map((r) => ({
      outcome: r.outcome,
      accountId: r.accountId || null,
      fingerprint: r.fingerprint || null,
      sourceRow: r.sourceRow,
      code: r.code || null
    }))
  };

  const outDir =
    outputDir ||
    path.resolve(repoRoot || process.cwd(), "local-imports/account-directory/master-list/output");
  fs.mkdirSync(outDir, { recursive: true });
  const receiptPath = path.join(outDir, "master-list-apply-receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  return { ...receipt, receiptPath };
}
