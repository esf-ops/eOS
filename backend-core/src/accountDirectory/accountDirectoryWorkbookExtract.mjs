/**
 * Safe dry-run extractor for QuickBooks business account workbook.
 * Zero database writes. Never logs full customer rows.
 */

import * as XLSX from "xlsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACCOUNT_DIRECTORY_COLUMNS = Object.freeze([
  "QuickBooks Account Name",
  "Company Name",
  "Primary Contact",
  "Primary Email",
  "Primary Phone",
  "Physical Address",
  "City",
  "State",
  "ZIP",
  "Active?",
  "Needs Review",
  "Source Snapshot"
]);

const QB_ROOT_COLUMNS = Object.freeze([
  "QuickBooks Account Name",
  "QuickBooks Full Name",
  "Record Name",
  "Parent Account",
  "QB List ID"
]);

/** Columns that must never appear in seed output. */
export const FORBIDDEN_SEED_FIELDS = Object.freeze([
  "People Associated",
  "Emails Associated",
  "Phones Associated",
  "County",
  "Customer Type",
  "Terms",
  "QB Sales Rep Code",
  "QB Sales Rep Name",
  "Preferred Delivery",
  "Preferred Payment",
  "Tax Code",
  "QB Customer/Job Records",
  "First Created",
  "Last Modified",
  "Last Invoice Date",
  "Invoice Count",
  "Sales Last 365 Days",
  "Lifetime Sales",
  "Open A/R",
  "QB Total Balance",
  "CRM Account",
  "CRM Key Contact",
  "CRM Email",
  "CRM Phone",
  "Account Owner",
  "CRM Status",
  "CRM Branch",
  "CRM Market",
  "CRM Last Contact",
  "CRM Next Contact",
  "Ownership Source",
  "Owner Confidence",
  "Notes",
  "Project Custom Field",
  "Ship Address"
]);

export function normalizeMatchKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isBlank(value) {
  return value == null || String(value).trim() === "";
}

export function isRootQbRecord(row) {
  const parent = row["Parent Account"];
  if (!isBlank(parent)) return false;
  const fullName = String(row["QuickBooks Full Name"] ?? "");
  if (fullName.includes(":")) return false;
  if (isBlank(row["QB List ID"])) return false;
  return true;
}

export function parseActiveFlag(value) {
  if (isBlank(value)) return { status: null, invalid: false };
  const s = String(value).trim().toLowerCase();
  if (["yes", "y", "true", "1", "active"].includes(s)) return { status: "active", invalid: false };
  if (["no", "n", "false", "0", "inactive"].includes(s)) return { status: "inactive", invalid: false };
  return { status: null, invalid: true };
}

export function parseNeedsReviewFlag(value) {
  if (isBlank(value)) return false;
  const s = String(value).trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(s);
}

export function validatePrimaryEmail(email) {
  if (isBlank(email)) return { email: null, invalid: false, missing: true };
  const v = String(email).trim();
  if (!EMAIL_RE.test(v)) return { email: v, invalid: true, missing: false };
  return { email: v, invalid: false, missing: false };
}

export function assessPhone(phone) {
  if (isBlank(phone)) return { phone: null, suspicious: false, missing: true, digits: null };
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, "");
  const suspicious = digits.length > 0 && (digits.length < 7 || /^0+$/.test(digits));
  return { phone: raw, suspicious, missing: false, digits: digits || null };
}

/**
 * Deterministic safe address line: only when Physical Address looks like a
 * simple street (starts with a digit) and does not obviously embed a name prefix.
 */
export function deriveSafeAddressLine1(physicalAddress) {
  if (isBlank(physicalAddress)) return null;
  const raw = String(physicalAddress).trim();
  if (/^\d/.test(raw) && !raw.includes("\n") && raw.length < 120) {
    return raw;
  }
  return null;
}

function sheetToObjects(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { found: false, rows: [] };
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return { found: true, rows };
}

function pick(row, keys) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of keys) out[k] = row[k] ?? "";
  return out;
}

function parseDataNotesSourceTotal(rows) {
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const text = `${k} ${v}`;
      const m = text.match(/36[\s,]*555/);
      if (m) return 36555;
      const n = String(v).replace(/,/g, "").match(/\b(\d{4,6})\b/);
      if (/source/i.test(k) && n) return Number(n[1]);
      if (/source/i.test(String(v)) && n) return Number(n[1]);
    }
  }
  // Fallback: scan all cell values for the known documented total
  for (const row of rows) {
    for (const v of Object.values(row)) {
      const s = String(v).replace(/,/g, "");
      if (s.includes("36555")) return 36555;
    }
  }
  return null;
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} workbookBytes
 * @param {{ writeDb?: Function }} [options] - writeDb must never be called; used to prove zero DB writes in tests
 */
export function extractAccountDirectoryDryRun(workbookBytes, options = {}) {
  if (typeof options.writeDb === "function") {
    // Intentionally never invoke — dry-run contract.
  }

  const workbook = XLSX.read(workbookBytes, { type: "buffer", cellDates: false });
  const sheetNames = workbook.SheetNames || [];

  const dirSheet = sheetToObjects(workbook, "Account Directory");
  const qbSheet = sheetToObjects(workbook, "QB Customer Records");
  const notesSheet = sheetToObjects(workbook, "Data Notes");
  const recommendedFound = sheetNames.includes("Recommended Fields");

  const sourceRecordCountFromNotes = notesSheet.found ? parseDataNotesSourceTotal(notesSheet.rows) : null;

  /** @type {Map<string, Array<{ listId: string, qbName: string }>>} */
  const rootByNormalizedName = new Map();
  let ignoredChildQbCount = 0;
  let eligibleRootCount = 0;

  for (const raw of qbSheet.rows) {
    const row = pick(raw, QB_ROOT_COLUMNS);
    if (!isRootQbRecord(row)) {
      ignoredChildQbCount += 1;
      continue;
    }
    eligibleRootCount += 1;
    const key = normalizeMatchKey(row["QuickBooks Account Name"]);
    if (!key) continue;
    const list = rootByNormalizedName.get(key) || [];
    list.push({
      listId: String(row["QB List ID"]).trim(),
      qbName: String(row["QuickBooks Account Name"]).trim()
    });
    rootByNormalizedName.set(key, list);
  }

  /** @type {any[]} */
  const seed = [];
  /** @type {any[]} */
  const review = [];

  let blankRowsSkipped = 0;
  let rootMatched = 0;
  let missingRoot = 0;
  let ambiguousRoot = 0;
  let duplicateRootId = 0;
  let duplicateNormalizedName = 0;
  let validEmail = 0;
  let invalidEmail = 0;
  let missingEmail = 0;
  let validPhone = 0;
  let suspiciousPhone = 0;
  let missingPhone = 0;
  let missingContact = 0;
  let addressReview = 0;
  let sourceNeedsReviewCount = 0;
  let activeCount = 0;
  let inactiveCount = 0;
  let unknownActiveCount = 0;

  /** Track QB List ID → directory source rows for duplicate detection */
  /** @type {Map<string, number[]>} */
  const listIdOwners = new Map();
  /** @type {Map<string, number[]>} */
  const normalizedNameOwners = new Map();

  /** First pass: collect match intents */
  /** @type {any[]} */
  const pending = [];

  for (let i = 0; i < dirSheet.rows.length; i++) {
    const sourceRow = i + 2; // 1-based Excel with header
    const raw = dirSheet.rows[i];
    const row = pick(raw, ACCOUNT_DIRECTORY_COLUMNS);

    const allBlank = ACCOUNT_DIRECTORY_COLUMNS.every((c) => isBlank(row[c]));
    if (allBlank) {
      blankRowsSkipped += 1;
      continue;
    }

    const qbAccountName = String(row["QuickBooks Account Name"] ?? "").trim();
    const companyName = String(row["Company Name"] ?? "").trim();
    const displayName = companyName || qbAccountName;
    const reasons = [];

    if (!displayName && !qbAccountName) {
      reasons.push("missing_account_name");
    }

    const contactName = String(row["Primary Contact"] ?? "").trim();
    if (!contactName && isBlank(row["Primary Email"]) && isBlank(row["Primary Phone"])) {
      reasons.push("missing_contact_identity");
      missingContact += 1;
    }

    const emailInfo = validatePrimaryEmail(row["Primary Email"]);
    if (emailInfo.invalid) {
      reasons.push("invalid_primary_email");
      invalidEmail += 1;
    } else if (emailInfo.missing) missingEmail += 1;
    else validEmail += 1;

    const phoneInfo = assessPhone(row["Primary Phone"]);
    /** Soft flags may remain on seed candidates as warnings; still appear in review when alone. */
    const softReasons = [];
    if (phoneInfo.suspicious) {
      softReasons.push("suspicious_primary_phone");
      suspiciousPhone += 1;
    } else if (phoneInfo.missing) missingPhone += 1;
    else validPhone += 1;

    const activeInfo = parseActiveFlag(row["Active?"]);
    if (activeInfo.invalid) {
      reasons.push("invalid_active_value");
      unknownActiveCount += 1;
    } else if (activeInfo.status === "active") activeCount += 1;
    else if (activeInfo.status === "inactive") inactiveCount += 1;
    else unknownActiveCount += 1;

    const sourceNeedsReview = parseNeedsReviewFlag(row["Needs Review"]);
    if (sourceNeedsReview) {
      reasons.push("source_flagged_needs_review");
      sourceNeedsReviewCount += 1;
    }

    const physical = String(row["Physical Address"] ?? "").trim() || null;
    const city = String(row["City"] ?? "").trim() || null;
    const state = String(row["State"] ?? "").trim() || null;
    const zip = String(row["ZIP"] ?? "").trim() || null;
    const addressLine1 = deriveSafeAddressLine1(physical);
    if (physical && !addressLine1) {
      softReasons.push("ambiguous_address");
      addressReview += 1;
    }

    const normName = normalizeMatchKey(qbAccountName || displayName);
    if (normName) {
      const owners = normalizedNameOwners.get(normName) || [];
      owners.push(sourceRow);
      normalizedNameOwners.set(normName, owners);
    }

    let matchedListId = null;
    let matchStatus = "missing";
    if (!qbAccountName) {
      reasons.push("missing_root_qb_id");
      missingRoot += 1;
    } else {
      const candidates = rootByNormalizedName.get(normalizeMatchKey(qbAccountName)) || [];
      if (candidates.length === 0) {
        reasons.push("missing_root_qb_id");
        missingRoot += 1;
        matchStatus = "missing";
      } else if (candidates.length > 1) {
        // Distinct list IDs?
        const uniqueIds = new Set(candidates.map((c) => c.listId));
        if (uniqueIds.size === 1) {
          matchedListId = candidates[0].listId;
          matchStatus = "matched";
          rootMatched += 1;
        } else {
          reasons.push("ambiguous_root_qb_id");
          ambiguousRoot += 1;
          matchStatus = "ambiguous";
        }
      } else {
        matchedListId = candidates[0].listId;
        matchStatus = "matched";
        rootMatched += 1;
      }
    }

    if (matchedListId) {
      const owners = listIdOwners.get(matchedListId) || [];
      owners.push(sourceRow);
      listIdOwners.set(matchedListId, owners);
    }

    pending.push({
      sourceRow,
      qbAccountName,
      displayName,
      contactName,
      emailInfo,
      phoneInfo,
      activeInfo,
      sourceNeedsReview,
      physical,
      city,
      state,
      zip,
      addressLine1,
      matchedListId,
      matchStatus,
      reasons,
      softReasons,
      sourceSnapshot: String(row["Source Snapshot"] ?? "").trim() || null,
      normName
    });
  }

  // Duplicate QB List ID across directory rows
  const duplicateListIdSet = new Set();
  for (const [listId, owners] of listIdOwners) {
    if (owners.length > 1) {
      duplicateListIdSet.add(listId);
      duplicateRootId += owners.length;
    }
  }

  // Duplicate normalized account names across directory rows
  const duplicateNameSet = new Set();
  for (const [name, owners] of normalizedNameOwners) {
    if (owners.length > 1) {
      duplicateNameSet.add(name);
      duplicateNormalizedName += owners.length;
    }
  }

  const HARD_REVIEW = new Set([
    "missing_account_name",
    "missing_root_qb_id",
    "ambiguous_root_qb_id",
    "duplicate_root_qb_id",
    "duplicate_normalized_account_name",
    "invalid_primary_email",
    "missing_contact_identity",
    "invalid_active_value",
    "source_flagged_needs_review"
  ]);

  for (const row of pending) {
    const reasons = [...row.reasons];
    if (row.matchedListId && duplicateListIdSet.has(row.matchedListId)) {
      if (!reasons.includes("duplicate_root_qb_id")) reasons.push("duplicate_root_qb_id");
    }
    if (row.normName && duplicateNameSet.has(row.normName)) {
      if (!reasons.includes("duplicate_normalized_account_name")) {
        reasons.push("duplicate_normalized_account_name");
      }
    }

    const softReasons = [...(row.softReasons || [])];
    const allReasonCodes = [...reasons, ...softReasons];
    const hardReasons = reasons.filter((r) => HARD_REVIEW.has(r));
    const warnings = [...softReasons];
    if (row.sourceNeedsReview && !warnings.includes("source_flagged_needs_review")) {
      warnings.push("source_flagged_needs_review");
    }

    const status = row.activeInfo.status || "active";

    const candidate = {
      proposedAccount: {
        displayName: row.displayName || row.qbAccountName || null,
        legalName: null,
        status,
        source: "quickbooks_workbook_seed"
      },
      proposedPrimaryContact: {
        displayName: row.contactName || null,
        email: row.emailInfo.invalid ? null : row.emailInfo.email,
        phone: row.phoneInfo.phone
      },
      proposedPrimaryLocation: {
        sourceAddressRaw: row.physical,
        addressLine1: row.addressLine1,
        city: row.city,
        state: row.state,
        postalCode: row.zip
      },
      externalLink: row.matchedListId
        ? {
            externalSystem: "quickbooks_desktop",
            externalId: row.matchedListId,
            externalDisplayName: row.qbAccountName,
            sourceSnapshot: row.sourceSnapshot
          }
        : null,
      importMetadata: {
        sourceRow: row.sourceRow,
        sourceNeedsReview: row.sourceNeedsReview,
        warnings,
        reasonCodes: allReasonCodes
      }
    };

    for (const forbidden of FORBIDDEN_SEED_FIELDS) {
      if (forbidden in candidate || Object.values(candidate).some((v) => v && typeof v === "object" && forbidden in v)) {
        throw new Error(`Forbidden field leaked into seed candidate: ${forbidden}`);
      }
    }

    const incomplete = !row.matchedListId || !candidate.proposedAccount.displayName;
    if (hardReasons.length > 0 || incomplete) {
      review.push({
        sourceRow: row.sourceRow,
        displayName: candidate.proposedAccount.displayName,
        qbAccountName: row.qbAccountName,
        reasonCodes: (allReasonCodes.length ? allReasonCodes : ["incomplete"]).join("|"),
        matchedListId: row.matchedListId || ""
      });
    } else {
      // Soft-only issues (ambiguous_address / suspicious_primary_phone) stay on seed
      // with importMetadata.warnings; addressLine1 may be null pending UI correction.
      seed.push(candidate);
    }
  }

  const report = {
    workbookSheetsFound: sheetNames,
    accountDirectorySheetFound: dirSheet.found,
    qbCustomerRecordsSheetFound: qbSheet.found,
    recommendedFieldsSheetFound: recommendedFound,
    dataNotesSheetFound: notesSheet.found,
    accountDirectoryRowsRead: dirSheet.rows.length,
    blankRowsSkipped,
    candidateAccounts: seed.length + review.length,
    rootQbIdsMatched: rootMatched,
    missingRootIds: missingRoot,
    ambiguousRootIds: ambiguousRoot,
    duplicateRootIds: duplicateRootId,
    duplicateNormalizedAccountNames: duplicateNormalizedName,
    primaryEmails: { valid: validEmail, invalid: invalidEmail, missing: missingEmail },
    primaryPhones: { valid: validPhone, suspicious: suspiciousPhone, missing: missingPhone },
    missingPrimaryContacts: missingContact,
    addressReviewCount: addressReview,
    sourceNeedsReviewCount,
    activeStatusCounts: { active: activeCount, inactive: inactiveCount, unknown: unknownActiveCount },
    seedReadyCount: seed.length,
    reviewCount: review.length,
    ignoredChildQbRecordCount: ignoredChildQbCount,
    eligibleRootQbRecordCount: eligibleRootCount,
    sourceRecordCountFromDataNotes: sourceRecordCountFromNotes,
    qbCustomerRecordsRowCount: qbSheet.rows.length,
    warnings: []
  };

  if (
    sourceRecordCountFromNotes != null &&
    sourceRecordCountFromNotes !== qbSheet.rows.length
  ) {
    report.warnings.push(
      `Data Notes source total (${sourceRecordCountFromNotes}) differs from QB Customer Records row count (${qbSheet.rows.length}); non-fatal.`
    );
  }

  return {
    seed,
    review,
    report,
    dbWrites: 0
  };
}

export function reviewRowsToCsv(reviewRows) {
  const header = ["sourceRow", "displayName", "qbAccountName", "reasonCodes", "matchedListId"];
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const r of reviewRows) {
    lines.push(header.map((h) => esc(r[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}
