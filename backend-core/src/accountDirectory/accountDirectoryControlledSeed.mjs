/**
 * Controlled Account Directory seed import — clean dry-run candidates only.
 *
 * Modes: dry-run (zero writes), apply (explicit confirm), verify (read-only).
 * Never imports review CSV, workbook XLSX, or child QB jobs.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";

export const EXTERNAL_SYSTEM = "quickbooks_desktop";
export const SEED_SOURCE = "quickbooks_workbook_seed";
export const ALLOWED_STATUSES = Object.freeze(["active", "prospect", "inactive", "needs_review"]);

export const FORBIDDEN_FIELD_NAMES = Object.freeze([
  "Lifetime Sales",
  "Sales Last 365 Days",
  "Open A/R",
  "QB Total Balance",
  "Invoice Count",
  "Last Invoice Date",
  "Terms",
  "Tax Code",
  "Preferred Payment",
  "Preferred Delivery",
  "CRM Account",
  "CRM Status",
  "CRM Last Contact",
  "CRM Next Contact",
  "CRM Email",
  "CRM Phone",
  "CRM Key Contact",
  "CRM Branch",
  "CRM Market",
  "Notes",
  "Ship Address",
  "Project Custom Field",
  "Parent Account",
  "QB Customer/Job Records",
  "raw_payload",
  "rawWorkbookRow",
  "financial",
  "lifetimeSales",
  "openAr",
  "childProject",
  "childJob",
  "qbJobListId",
  "quickbooksFullName"
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string} inputPath
 * @param {{ allowTestPaths?: boolean, repoRoot?: string }} [opts]
 */
export function assertAllowedSeedInputPath(inputPath, opts = {}) {
  const resolved = path.resolve(inputPath);
  const base = path.basename(resolved).toLowerCase();
  if (base.includes("review") || base.endsWith(".csv")) {
    throw new AccountDirectoryError(
      "review_input_forbidden",
      "Review CSV / review files cannot be imported. Use account-directory-seed.json only.",
      400
    );
  }
  if (base.endsWith(".xlsx") || base.endsWith(".xls")) {
    throw new AccountDirectoryError(
      "workbook_input_forbidden",
      "Excel workbook cannot be imported directly. Use the dry-run seed JSON.",
      400
    );
  }
  if (!base.endsWith(".json")) {
    throw new AccountDirectoryError("invalid_input_type", "Seed input must be a .json file.", 400);
  }

  if (opts.allowTestPaths) return resolved;

  const repoRoot = path.resolve(opts.repoRoot || process.cwd());
  const allowedRoot = path.resolve(repoRoot, "local-imports", "account-directory");
  if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
    throw new AccountDirectoryError(
      "input_path_forbidden",
      "Seed input must live under local-imports/account-directory/ (gitignored).",
      400
    );
  }
  return resolved;
}

/**
 * Recursively collect object keys (string keys only).
 * @param {unknown} value
 * @param {Set<string>} out
 */
function collectKeys(value, out = new Set()) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    out.add(k);
    collectKeys(v, out);
  }
  return out;
}

/**
 * @param {unknown} candidate
 * @param {number} index
 */
export function validateSeedCandidate(candidate, index) {
  const reasons = [];
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, reasons: ["invalid_candidate_shape"], index };
  }

  const keys = collectKeys(candidate);
  for (const forbidden of FORBIDDEN_FIELD_NAMES) {
    if (keys.has(forbidden)) reasons.push(`forbidden_field:${forbidden}`);
  }

  const account = candidate.proposedAccount;
  const contact = candidate.proposedPrimaryContact;
  const location = candidate.proposedPrimaryLocation;
  const link = candidate.externalLink;
  const meta = candidate.importMetadata;

  if (!account || typeof account !== "object") reasons.push("missing_proposed_account");
  const displayName = String(account?.displayName ?? "").trim();
  if (!displayName) reasons.push("missing_display_name");

  const status = String(account?.status ?? "active").trim();
  if (!ALLOWED_STATUSES.includes(status)) reasons.push("invalid_status");

  const source = String(account?.source ?? "").trim();
  if (source && source !== SEED_SOURCE) reasons.push("invalid_source");

  if (!link || typeof link !== "object") reasons.push("missing_external_link");
  const externalSystem = String(link?.externalSystem ?? "").trim();
  if (externalSystem !== EXTERNAL_SYSTEM) reasons.push("invalid_external_system");
  const externalId = String(link?.externalId ?? "").trim();
  if (!externalId) reasons.push("missing_external_id");

  // Child / project markers
  if (link?.parentAccount || link?.qbJobListId || account?.parentAccount) {
    reasons.push("child_project_fields");
  }
  if (typeof link?.externalDisplayName === "string" && link.externalDisplayName.includes(":")) {
    // Colon in QB full name often means child — display name on root may still be fine;
    // only flag if QuickBooks Full Name style field present
  }
  if (keys.has("Parent Account") || keys.has("QuickBooks Full Name") || keys.has("Record Name")) {
    reasons.push("child_project_fields");
  }

  if (contact?.email != null && String(contact.email).trim()) {
    if (!EMAIL_RE.test(String(contact.email).trim())) reasons.push("invalid_primary_email");
  }

  if (meta && meta.sourceNeedsReview === true) {
    reasons.push("source_flagged_needs_review");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    index,
    displayName: displayName || null,
    externalId: externalId || null,
    status,
    source: SEED_SOURCE
  };
}

/**
 * @param {unknown[]} candidates
 * @param {{ expectedCount: number }} opts
 */
export function validateSeedFile(candidates, opts) {
  if (!Array.isArray(candidates)) {
    throw new AccountDirectoryError("invalid_seed_shape", "Seed file must be a JSON array.", 400);
  }
  const expected = Number(opts.expectedCount);
  if (!Number.isInteger(expected) || expected <= 0) {
    throw new AccountDirectoryError("expected_count_required", "--expected-count must be a positive integer.", 400);
  }
  if (candidates.length !== expected) {
    throw new AccountDirectoryError(
      "expected_count_mismatch",
      `Seed candidate count ${candidates.length} does not equal expected-count ${expected}.`,
      400
    );
  }

  const validated = [];
  const invalid = [];
  const idOwners = new Map();

  for (let i = 0; i < candidates.length; i++) {
    const result = validateSeedCandidate(candidates[i], i);
    if (!result.ok) {
      invalid.push(result);
      continue;
    }
    const owners = idOwners.get(result.externalId) || [];
    owners.push(i);
    idOwners.set(result.externalId, owners);
    validated.push({ index: i, candidate: candidates[i], meta: result });
  }

  const duplicateExternalIds = [];
  for (const [externalId, owners] of idOwners) {
    if (owners.length > 1) {
      duplicateExternalIds.push({ externalId, indexes: owners });
    }
  }
  if (duplicateExternalIds.length) {
    throw new AccountDirectoryError(
      "duplicate_external_ids_in_seed",
      `Seed contains ${duplicateExternalIds.length} duplicate QuickBooks external ID(s).`,
      400,
      { duplicateCount: duplicateExternalIds.length }
    );
  }

  if (invalid.length) {
    throw new AccountDirectoryError(
      "seed_validation_failed",
      `${invalid.length} candidate(s) failed validation before any writes.`,
      400,
      { invalidCount: invalid.length, sampleReasons: invalid.slice(0, 5).map((r) => r.reasons) }
    );
  }

  return { validated, invalid, candidateCount: candidates.length };
}

/**
 * Map seed candidate → service create + link payloads.
 * @param {any} candidate
 */
export function candidateToWritePayloads(candidate) {
  const account = candidate.proposedAccount || {};
  const contact = candidate.proposedPrimaryContact || {};
  const location = candidate.proposedPrimaryLocation || {};
  const link = candidate.externalLink || {};

  const contactName = String(contact.displayName ?? "").trim();
  const email = contact.email != null ? String(contact.email).trim() : "";
  const phone = contact.phone != null ? String(contact.phone).trim() : "";
  const hasContact = Boolean(contactName || email || phone);

  const city = location.city != null ? String(location.city).trim() : "";
  const state = location.state != null ? String(location.state).trim() : "";
  const postalCode = location.postalCode != null ? String(location.postalCode).trim() : "";
  const line1 = location.addressLine1 != null ? String(location.addressLine1).trim() : "";
  const sourceAddressRaw =
    location.sourceAddressRaw != null ? String(location.sourceAddressRaw).trim() : "";
  const hasLocation = Boolean(city || state || postalCode || line1 || sourceAddressRaw);

  /** @type {Record<string, unknown>} */
  const createPayload = {
    displayName: String(account.displayName).trim(),
    legalName: account.legalName != null ? String(account.legalName).trim() || null : null,
    status: String(account.status || "active").trim(),
    source: SEED_SOURCE
  };
  if (hasContact) {
    if (contactName) createPayload.primaryContactName = contactName;
    if (email) createPayload.primaryEmail = email;
    if (phone) createPayload.primaryPhone = phone;
  }
  if (hasLocation) {
    if (line1) createPayload.line1 = line1;
    if (city) createPayload.city = city;
    if (state) createPayload.state = state;
    if (postalCode) createPayload.postalCode = postalCode;
    if (sourceAddressRaw) createPayload.sourceAddressRaw = sourceAddressRaw;
  }

  const linkPayload = {
    externalId: String(link.externalId).trim(),
    externalDisplayName: link.externalDisplayName
      ? String(link.externalDisplayName).trim()
      : null,
    sourceSnapshot: link.sourceSnapshot ? String(link.sourceSnapshot).trim() : null
  };

  return {
    createPayload,
    linkPayload,
    wouldCreateContact: hasContact,
    wouldCreateLocation: hasLocation
  };
}

/**
 * @param {{
 *   store: any,
 *   service: any,
 *   organizationId: string,
 *   actorUserId: string,
 *   role?: string,
 *   candidates: any[],
 *   expectedCount: number,
 *   mode: "dry-run" | "apply",
 *   importRunId?: string,
 *   writeDb?: boolean
 * }} args
 */
export async function runControlledSeedImport(args) {
  const {
    store,
    service,
    organizationId,
    actorUserId,
    role = "admin",
    candidates,
    expectedCount,
    mode
  } = args;

  if (!organizationId) {
    throw new AccountDirectoryError("organization_required", "Organization ID is required.", 400);
  }
  if (!actorUserId) {
    throw new AccountDirectoryError("actor_required", "Actor user ID is required for audit attribution.", 400);
  }

  const importRunId = args.importRunId || randomUUID();
  const startedAt = new Date().toISOString();
  const { validated } = validateSeedFile(candidates, { expectedCount });

  let wouldCreate = 0;
  let wouldSkipExisting = 0;
  let externalLinkConflicts = 0;
  let contactsWouldCreate = 0;
  let locationsWouldCreate = 0;

  let createdAccounts = 0;
  let skippedExisting = 0;
  let failed = 0;
  let contactsCreated = 0;
  let locationsCreated = 0;
  let externalLinksCreated = 0;
  let auditEventsCreated = 0;
  /** @type {any[]} */
  const results = [];
  /** @type {any[]} */
  const failures = [];

  const apply = mode === "apply";
  let dbWrites = 0;

  for (const item of validated) {
    const { candidate, index, meta } = item;
    const payloads = candidateToWritePayloads(candidate);
    const externalId = payloads.linkPayload.externalId;

    const existingLinks = await store.listActiveExternalLinksByExternalId(
      organizationId,
      EXTERNAL_SYSTEM,
      externalId
    );

    if (existingLinks.length > 1) {
      externalLinkConflicts += 1;
      failed += 1;
      const failure = {
        index,
        externalId,
        code: "external_link_conflict",
        accountIds: existingLinks.map((l) => l.accountId)
      };
      failures.push(failure);
      results.push({ ...failure, outcome: "failed" });
      continue;
    }

    if (existingLinks.length === 1) {
      wouldSkipExisting += 1;
      skippedExisting += 1;
      results.push({
        index,
        externalId,
        accountId: existingLinks[0].accountId,
        outcome: "skipped_existing"
      });
      continue;
    }

    wouldCreate += 1;
    if (payloads.wouldCreateContact) contactsWouldCreate += 1;
    if (payloads.wouldCreateLocation) locationsWouldCreate += 1;

    if (!apply) {
      results.push({
        index,
        externalId,
        outcome: "would_create",
        wouldCreateContact: payloads.wouldCreateContact,
        wouldCreateLocation: payloads.wouldCreateLocation
      });
      continue;
    }

    let createdAccountId = null;
    try {
      const account = await service.createAccount({
        organizationId,
        role,
        actorUserId,
        requestId: importRunId,
        payload: payloads.createPayload,
        asProspect: payloads.createPayload.status === "prospect"
      });
      createdAccountId = account.id;
      dbWrites += 1;
      createdAccounts += 1;
      if (payloads.wouldCreateContact) contactsCreated += 1;
      if (payloads.wouldCreateLocation) locationsCreated += 1;

      await service.linkQuickBooks({
        organizationId,
        role,
        actorUserId,
        requestId: importRunId,
        accountId: account.id,
        payload: payloads.linkPayload
      });
      dbWrites += 1;
      externalLinksCreated += 1;

      await store.insertAuditEvent({
        organizationId,
        accountId: account.id,
        entityType: "account",
        entityId: account.id,
        action: "seed_import_account",
        actorUserId,
        changedFields: ["displayName", "externalLink"],
        newValues: {
          source: SEED_SOURCE,
          externalSystem: EXTERNAL_SYSTEM,
          externalId,
          importRunId
        },
        requestId: importRunId
      });
      dbWrites += 1;
      auditEventsCreated += 1;

      results.push({
        index,
        externalId,
        accountId: account.id,
        outcome: "created",
        displayName: meta.displayName
      });
    } catch (e) {
      failed += 1;
      const code = e?.code || "import_failed";
      failures.push({
        index,
        externalId,
        code,
        message: String(e?.message || e).slice(0, 200)
      });
      results.push({
        index,
        externalId,
        outcome: "failed",
        code
      });

      // Compensation: archive orphan account if link/audit failed after create
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
            await store.insertAuditEvent({
              organizationId,
              accountId: createdAccountId,
              entityType: "account",
              entityId: createdAccountId,
              action: "seed_import_compensate_archive",
              actorUserId,
              changedFields: ["status"],
              newValues: { reason: code, importRunId },
              requestId: importRunId
            });
            dbWrites += 1;
          }
        } catch {
          /* compensation best-effort */
        }
      }
    }
  }

  const completedAt = new Date().toISOString();
  const summary = {
    mode,
    importRunId,
    organizationId,
    actorUserId,
    startedAt,
    completedAt,
    candidatesRead: candidates.length,
    candidatesValid: validated.length,
    candidatesInvalid: 0,
    wouldCreate: apply ? createdAccounts : wouldCreate,
    wouldSkipExisting: apply ? skippedExisting : wouldSkipExisting,
    externalLinkConflicts,
    contactsThatWouldBeCreated: apply ? contactsCreated : contactsWouldCreate,
    locationsThatWouldBeCreated: apply ? locationsCreated : locationsWouldCreate,
    createdAccounts: apply ? createdAccounts : 0,
    skippedExisting,
    failed,
    contactsCreated: apply ? contactsCreated : 0,
    locationsCreated: apply ? locationsCreated : 0,
    externalLinksCreated: apply ? externalLinksCreated : 0,
    auditEventsCreated: apply ? auditEventsCreated : 0,
    databaseWrites: apply ? dbWrites : 0,
    validationFailures: 0,
    forbiddenFieldFailures: 0
  };

  return { summary, results, failures };
}

/**
 * Read-only verification against store + seed external IDs.
 */
export async function runControlledSeedVerify(args) {
  const { store, organizationId, candidates, expectedCount, receipt } = args;
  const { validated } = validateSeedFile(candidates, { expectedCount });
  const seedIds = validated.map((v) => v.meta.externalId);

  const links = await store.listAllActiveExternalLinks(organizationId, EXTERNAL_SYSTEM);
  const byExternalId = new Map();
  for (const link of links) {
    const list = byExternalId.get(link.externalId) || [];
    list.push(link);
    byExternalId.set(link.externalId, list);
  }

  let missingLinks = 0;
  let duplicateLinks = 0;
  let wrongOrg = 0;
  /** Only check IDs that receipt says were created/skipped — or all seed IDs if no receipt */
  const checkIds = receipt?.createdExternalIds?.length
    ? receipt.createdExternalIds
    : seedIds;

  for (const externalId of checkIds) {
    const found = byExternalId.get(externalId) || [];
    if (found.length === 0) missingLinks += 1;
    else if (found.length > 1) duplicateLinks += 1;
    else if (found[0].organizationId !== organizationId) wrongOrg += 1;
  }

  // Ensure no seed ID maps to >1
  for (const externalId of seedIds) {
    const found = byExternalId.get(externalId) || [];
    if (found.length > 1) duplicateLinks += 1;
  }

  const accountCount = await store.countAccounts(organizationId);
  const contactCount = await store.countContacts(organizationId);
  const locationCount = await store.countLocations(organizationId);
  const linkCount = await store.countActiveExternalLinks(organizationId, EXTERNAL_SYSTEM);

  const issues = [];
  if (missingLinks) issues.push({ code: "missing_links", count: missingLinks });
  if (duplicateLinks) issues.push({ code: "duplicate_links", count: duplicateLinks });
  if (wrongOrg) issues.push({ code: "wrong_organization", count: wrongOrg });

  if (receipt) {
    if (receipt.createdAccounts != null && accountCount < receipt.createdAccounts) {
      issues.push({
        code: "account_count_below_receipt",
        expectedAtLeast: receipt.createdAccounts,
        actual: accountCount
      });
    }
  }

  return {
    ok: issues.length === 0,
    databaseWrites: 0,
    organizationId,
    seedCandidateCount: seedIds.length,
    activeQuickBooksLinks: linkCount,
    accountCount,
    contactCount,
    locationCount,
    missingLinks,
    duplicateLinks,
    wrongOrg,
    issues
  };
}

/**
 * Load seed JSON from disk after path checks.
 */
export function loadSeedCandidates(inputPath, opts = {}) {
  const resolved = assertAllowedSeedInputPath(inputPath, opts);
  if (!fs.existsSync(resolved)) {
    throw new AccountDirectoryError("missing_input", `Seed file not found: ${resolved}`, 400);
  }
  const raw = fs.readFileSync(resolved, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccountDirectoryError("invalid_json", "Seed file is not valid JSON.", 400);
  }
  return { resolved, candidates: parsed };
}

/**
 * Safe console summary — never dump customer rows.
 */
export function formatImportConsoleSummary(summary) {
  const lines = [
    `mode: ${summary.mode}`,
    `candidatesRead: ${summary.candidatesRead}`,
    `candidatesValid: ${summary.candidatesValid}`,
    `wouldCreate: ${summary.wouldCreate}`,
    `wouldSkipExisting: ${summary.wouldSkipExisting}`,
    `externalLinkConflicts: ${summary.externalLinkConflicts}`,
    `contacts: ${summary.contactsThatWouldBeCreated ?? summary.contactsCreated}`,
    `locations: ${summary.locationsThatWouldBeCreated ?? summary.locationsCreated}`,
    `createdAccounts: ${summary.createdAccounts}`,
    `skippedExisting: ${summary.skippedExisting}`,
    `failed: ${summary.failed}`,
    `externalLinksCreated: ${summary.externalLinksCreated}`,
    `auditEventsCreated: ${summary.auditEventsCreated}`,
    `databaseWrites: ${summary.databaseWrites}`,
    `organizationId: ${summary.organizationId}`,
    `importRunId: ${summary.importRunId}`
  ];
  return lines.join("\n");
}

export function supabaseHostFromUrl(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return "(invalid-supabase-url)";
  }
}
