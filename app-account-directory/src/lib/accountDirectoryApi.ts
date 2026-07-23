import { apiGet, apiPatch, apiPost } from "./api";
import type {
  AccountDetailResponse,
  AccountListParams,
  AccountListResponse,
  AccountSummaryResponse,
  AddAliasPayload,
  AddContactPayload,
  AddLocationPayload,
  CreateAccountPayload,
  PermissionsResponse,
  UpdateAccountPayload
} from "./types";

const BASE = "/api/account-directory";

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = String(value ?? "").trim();
    if (v) search.set(key, v);
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}

export async function fetchAccountDirectoryPermissions(token: string) {
  return (await apiGet(`${BASE}/permissions`, token)) as PermissionsResponse;
}

export async function fetchAccountDirectorySummary(token: string) {
  return (await apiGet(`${BASE}/summary`, token)) as AccountSummaryResponse;
}

export async function listAccounts(token: string, opts: AccountListParams) {
  return (await apiGet(
    `${BASE}/accounts${qs({
      tab: opts.tab,
      search: opts.search,
      status: opts.status,
      page: opts.page,
      pageSize: opts.pageSize,
      sort: opts.sort,
      linked: opts.linked,
      missingContact: opts.missingContact,
      missingLocation: opts.missingLocation
    })}`,
    token
  )) as AccountListResponse;
}

export async function getAccount(token: string, accountId: string) {
  return (await apiGet(`${BASE}/accounts/${encodeURIComponent(accountId)}`, token)) as AccountDetailResponse;
}

export async function createAccount(token: string, payload: CreateAccountPayload) {
  const body: CreateAccountPayload = {
    displayName: String(payload.displayName ?? "").trim(),
    ...(payload.primaryEmail ? { primaryEmail: payload.primaryEmail } : {}),
    ...(payload.primaryPhone ? { primaryPhone: payload.primaryPhone } : {}),
    ...(payload.city ? { city: payload.city } : {}),
    ...(payload.state ? { state: payload.state } : {})
  };
  return (await apiPost(`${BASE}/accounts`, token, body)) as AccountDetailResponse;
}

export async function createProspect(token: string, payload: CreateAccountPayload) {
  const body: CreateAccountPayload = {
    displayName: String(payload.displayName ?? "").trim(),
    ...(payload.primaryEmail ? { primaryEmail: payload.primaryEmail } : {}),
    ...(payload.primaryPhone ? { primaryPhone: payload.primaryPhone } : {}),
    ...(payload.city ? { city: payload.city } : {}),
    ...(payload.state ? { state: payload.state } : {})
  };
  return (await apiPost(`${BASE}/prospects`, token, body)) as AccountDetailResponse;
}

export async function updateAccount(token: string, accountId: string, payload: UpdateAccountPayload) {
  const body: UpdateAccountPayload = {};
  if (payload.displayName != null) body.displayName = String(payload.displayName).trim();
  if (payload.primaryEmail !== undefined) {
    const v = String(payload.primaryEmail ?? "").trim();
    if (v) body.primaryEmail = v;
  }
  if (payload.primaryPhone !== undefined) {
    const v = String(payload.primaryPhone ?? "").trim();
    if (v) body.primaryPhone = v;
  }
  if (payload.city !== undefined) {
    const v = String(payload.city ?? "").trim();
    if (v) body.city = v;
  }
  if (payload.state !== undefined) {
    const v = String(payload.state ?? "").trim();
    if (v) body.state = v;
  }
  if (payload.status != null) body.status = payload.status;
  if (payload.rowVersion != null) body.rowVersion = payload.rowVersion;
  return (await apiPatch(`${BASE}/accounts/${encodeURIComponent(accountId)}`, token, body)) as AccountDetailResponse;
}

export async function addContact(token: string, accountId: string, payload: AddContactPayload) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/contacts`,
    token,
    payload
  )) as AccountDetailResponse;
}

export async function addLocation(token: string, accountId: string, payload: AddLocationPayload) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/locations`,
    token,
    payload
  )) as AccountDetailResponse;
}

export async function addAlias(token: string, accountId: string, payload: AddAliasPayload) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/aliases`,
    token,
    payload
  )) as AccountDetailResponse;
}

export async function archiveAccount(token: string, accountId: string) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/archive`,
    token
  )) as AccountDetailResponse;
}

export async function restoreAccount(token: string, accountId: string) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/restore`,
    token
  )) as AccountDetailResponse;
}

export async function linkQuickBooks(
  token: string,
  accountId: string,
  payload: { externalId: string; externalDisplayName?: string }
) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/link-quickbooks`,
    token,
    payload
  )) as AccountDetailResponse;
}
