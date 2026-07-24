/**
 * Bounded Account Directory lookup for Internal Estimate (head slug: quote).
 * Does NOT require Account Directory head access — only Internal Estimate access.
 * Prospect create still requires Account Directory EDIT capability on the role.
 */

import {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  roleHasCapability
} from "../accountDirectory/accountDirectoryAuth.mjs";
import { resolveAccountDirectoryStore } from "../accountDirectory/accountDirectoryApi.js";
import { createAccountDirectoryService } from "../accountDirectory/accountDirectoryService.mjs";
import { AccountDirectoryError } from "../accountDirectory/accountDirectoryErrors.mjs";
import { buildCustomerIdentitySnapshot } from "./customerIdentitySnapshot.mjs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

function actorRole(req) {
  return req?.user?.role ?? req?.eosProfile?.role ?? req?.profile?.role ?? null;
}

function actorUserId(req) {
  return req?.user?.id ? String(req.user.id) : null;
}

/**
 * @param {{ getSupabase: Function, store?: any }} deps
 */
export function getAccountDirectoryServiceForEstimate(deps) {
  const store = resolveAccountDirectoryStore(deps);
  return createAccountDirectoryService({ store, getSupabase: deps.getSupabase });
}

/**
 * Safe list item for estimate combobox — no raw QB IDs / audit / financials.
 * @param {Record<string, unknown>} item
 */
export function toEstimateLookupItem(item) {
  return {
    id: item.id,
    displayName: item.displayName ?? item.name ?? null,
    legalName: item.legalName ?? null,
    status: item.status ?? null,
    primaryContact: item.primaryContact ?? null,
    primaryEmail: item.primaryEmail ?? null,
    primaryPhone: item.primaryPhone ?? null,
    city: item.city ?? null,
    state: item.state ?? null,
    postalCode: item.postalCode ?? null,
    quickbooksLinked: Boolean(item.quickbooksLinked),
    hasPrimaryContact: Boolean(item.hasPrimaryContact),
    hasPrimaryLocation: Boolean(item.hasPrimaryLocation),
    hasAliases: Boolean(item.hasAliases)
  };
}

/**
 * @param {{
 *   service: any,
 *   organizationId: string,
 *   role: string | null,
 *   search: string,
 *   limit?: number
 * }} args
 */
export async function lookupAccountsForEstimate(args) {
  const limit = Math.min(Math.max(Number(args.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const listed = await args.service.listAccounts({
    organizationId: args.organizationId,
    role: args.role || "estimator",
    tab: "accounts",
    search: String(args.search || "").trim() || null,
    page: 1,
    pageSize: limit,
    sort: "name_asc",
    // Exclude archived from normal selectable results
    status: null
  });
  // Defensive filter — tab already excludes archived, but status filter chips may vary
  const items = (listed.items || [])
    .filter((i) => String(i.status || "").toLowerCase() !== "archived")
    .map(toEstimateLookupItem);

  // Also search prospects tab when query present (bounded)
  let prospectItems = [];
  if (String(args.search || "").trim()) {
    const prospects = await args.service.listAccounts({
      organizationId: args.organizationId,
      role: args.role || "estimator",
      tab: "prospects",
      search: String(args.search).trim(),
      page: 1,
      pageSize: Math.min(10, limit),
      sort: "name_asc"
    });
    prospectItems = (prospects.items || []).map(toEstimateLookupItem);
  }

  const byId = new Map();
  for (const item of [...items, ...prospectItems]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return {
    items: Array.from(byId.values()).slice(0, limit),
    total: byId.size
  };
}

/**
 * Detail for contact/location picker after account selection.
 */
export async function loadAccountForEstimateSelection(args) {
  const detail = await args.service.getAccount({
    organizationId: args.organizationId,
    role: args.role || "estimator",
    accountId: args.accountId
  });
  const contacts = (detail.contacts || [])
    .filter((c) => c.isActive !== false)
    .map((c) => ({
      id: c.id,
      displayName: c.displayName || c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      role: c.role ?? null,
      isPrimary: Boolean(c.isPrimary)
    }));
  const locations = (detail.locations || [])
    .filter((l) => l.isActive !== false)
    .map((l) => ({
      id: l.id,
      label: l.label ?? null,
      line1: l.line1 ?? null,
      line2: l.line2 ?? null,
      city: l.city ?? null,
      state: l.state ?? null,
      postalCode: l.postalCode ?? null,
      isPrimary: Boolean(l.isPrimary)
    }));

  const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0] || null;
  const primaryLocation = locations.find((l) => l.isPrimary) || locations[0] || null;

  const account = {
    id: detail.id,
    displayName: detail.displayName || detail.name,
    legalName: detail.legalName ?? null,
    status: detail.status,
    quickbooksLinked: Boolean(detail.quickbooksLinked)
  };

  return {
    account,
    contacts,
    locations,
    primaryContact,
    primaryLocation,
    draftSnapshot: buildCustomerIdentitySnapshot({
      account: { ...account, quickbooksLinked: account.quickbooksLinked },
      contact: primaryContact,
      location: primaryLocation
    })
  };
}

/**
 * Create a minimal prospect via Account Directory service (EDIT capability required).
 */
export async function createProspectForEstimate(args) {
  const role = args.role;
  if (!roleHasCapability(role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT)) {
    throw new AccountDirectoryError(
      "forbidden",
      "You do not have permission to create Account Directory prospects. Ask an admin or open Account Directory with edit access.",
      403
    );
  }
  const displayName = String(args.payload?.displayName ?? args.payload?.name ?? "").trim();
  if (!displayName) {
    throw new AccountDirectoryError("display_name_required", "Account name is required.", 400);
  }
  const created = await args.service.createAccount({
    organizationId: args.organizationId,
    role,
    actorUserId: args.actorUserId,
    requestId: args.requestId ?? null,
    asProspect: true,
    payload: {
      displayName,
      primaryContactName: args.payload?.primaryContactName || args.payload?.contactName || null,
      primaryEmail: args.payload?.primaryEmail || args.payload?.email || null,
      primaryPhone: args.payload?.primaryPhone || args.payload?.phone || null,
      city: args.payload?.city || null,
      state: args.payload?.state || null,
      postalCode: args.payload?.postalCode || null,
      line1: args.payload?.line1 || null,
      source: "estimate_studio_prospect"
    }
  });
  return loadAccountForEstimateSelection({
    service: args.service,
    organizationId: args.organizationId,
    role,
    accountId: created.id
  });
}

export { actorRole, actorUserId, ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability };
