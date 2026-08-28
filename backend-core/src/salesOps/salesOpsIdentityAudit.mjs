/**
 * Exact Account Directory identity proof for Sales Ops.
 * Permanent links are exact IDs only. Name/fuzzy matching never attaches identity.
 */

import { SALES_OPS_MONDAY_EXTERNAL_SYSTEM, mondayExternalId } from "./salesOpsConstants.js";

export const MORAWARE_EXTERNAL_SYSTEM = "moraware";
export const QUICKBOOKS_EXTERNAL_SYSTEM = "quickbooks_desktop";

function idSet() {
  return new Map();
}

function addLink(map, externalId, accountId) {
  const ext = String(externalId ?? "").trim();
  const acc = String(accountId ?? "").trim();
  if (!ext || !acc) return;
  if (!map.has(ext)) map.set(ext, new Set());
  map.get(ext).add(acc);
}

function addAccountLink(map, accountId, externalId) {
  const acc = String(accountId ?? "").trim();
  const ext = String(externalId ?? "").trim();
  if (!acc || !ext) return;
  if (!map.has(acc)) map.set(acc, new Set());
  map.get(acc).add(ext);
}

function duplicateExternalCount(byExternal) {
  let n = 0;
  for (const set of byExternal.values()) {
    if (set.size > 1) n += 1;
  }
  return n;
}

/**
 * @param {{
 *   salesOpsAccounts: Array<{ id: string, mondayBoardId?: string, mondayItemId?: string, accountDirectoryAccountId?: string|null }>,
 *   mondayLinks: Array<{ externalId?: string, accountId: string, mondayItemId?: string, boardId?: string }>,
 *   morawareLinks: Array<{ externalId: string, accountId: string }>,
 *   quickbooksLinks: Array<{ externalId: string, accountId: string }>
 * }} input
 */
export function summarizeExactIdentity(input) {
  const accounts = Array.isArray(input?.salesOpsAccounts) ? input.salesOpsAccounts : [];
  const mondayByExternal = idSet();
  const mondayByAccount = idSet();
  for (const link of input?.mondayLinks || []) {
    const ext =
      String(link.externalId || "").trim() ||
      (link.boardId && link.mondayItemId ? mondayExternalId(link.boardId, link.mondayItemId) : "");
    addLink(mondayByExternal, ext, link.accountId);
    addAccountLink(mondayByAccount, link.accountId, ext);
  }
  const morawareByExternal = idSet();
  const morawareByAccount = idSet();
  for (const link of input?.morawareLinks || []) {
    addLink(morawareByExternal, link.externalId, link.accountId);
    addAccountLink(morawareByAccount, link.accountId, link.externalId);
  }
  const qbByExternal = idSet();
  const qbByAccount = idSet();
  for (const link of input?.quickbooksLinks || []) {
    addLink(qbByExternal, link.externalId, link.accountId);
    addAccountLink(qbByAccount, link.accountId, link.externalId);
  }

  let directoryLinked = 0;
  let unlinked = 0;
  let conflicted = 0;
  let morawareLinked = 0;
  let quickbooksLinked = 0;
  const adIds = new Set();

  for (const account of accounts) {
    const mondayKey = mondayExternalId(account.mondayBoardId, account.mondayItemId);
    const mondayMatches = mondayByExternal.get(mondayKey) || new Set();
    const projectedAd = String(account.accountDirectoryAccountId || "").trim();
    let canonicalAd = "";
    if (mondayMatches.size === 1) {
      canonicalAd = [...mondayMatches][0];
      if (projectedAd && projectedAd !== canonicalAd) conflicted += 1;
      else directoryLinked += 1;
    } else if (mondayMatches.size > 1) {
      conflicted += 1;
    } else if (projectedAd) {
      conflicted += 1;
    } else {
      unlinked += 1;
    }
    if (canonicalAd) {
      adIds.add(canonicalAd);
      if ((morawareByAccount.get(canonicalAd) || new Set()).size > 0) morawareLinked += 1;
      if ((qbByAccount.get(canonicalAd) || new Set()).size > 0) quickbooksLinked += 1;
    }
  }

  let multiMorawareAccounts = 0;
  for (const ad of adIds) {
    if ((morawareByAccount.get(ad) || new Set()).size > 1) multiMorawareAccounts += 1;
  }

  return {
    salesOpsAccountsTotal: accounts.length,
    accountDirectoryLinked: directoryLinked,
    unlinked,
    conflicted,
    morawareLinked,
    multiMorawareAccounts,
    quickbooksLinked,
    duplicateMondayExternalIds: duplicateExternalCount(mondayByExternal),
    duplicateMorawareExternalIds: duplicateExternalCount(morawareByExternal),
    duplicateQuickbooksExternalIds: duplicateExternalCount(qbByExternal),
    linkingMethod: "exact_external_id_only",
    externalSystems: {
      monday: SALES_OPS_MONDAY_EXTERNAL_SYSTEM,
      moraware: MORAWARE_EXTERNAL_SYSTEM,
      quickbooks: QUICKBOOKS_EXTERNAL_SYSTEM
    }
  };
}

export function exactMorawareIdsForAccount(links, accountDirectoryAccountId) {
  const id = String(accountDirectoryAccountId || "").trim();
  if (!id) return [];
  const out = [];
  for (const link of links || []) {
    if (String(link.accountId) === id && String(link.externalId || "").trim()) {
      out.push(String(link.externalId));
    }
  }
  return [...new Set(out)].sort();
}
