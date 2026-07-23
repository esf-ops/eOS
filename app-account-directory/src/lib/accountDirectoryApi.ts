import { apiGet, apiPatch, apiPost } from "./api";
import type {
  AccountDetailResponse,
  AccountListResponse,
  AccountTab,
  AddAliasPayload,
  AddContactPayload,
  AddLocationPayload,
  CreateAccountPayload,
  PermissionsResponse,
  UpdateAccountPayload
} from "./types";

const BASE = "/api/account-directory";

function qs(params: Record<string, string | undefined>): string {
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

export async function listAccounts(
  token: string,
  opts: { tab: AccountTab; search?: string; status?: string }
) {
  return (await apiGet(
    `${BASE}/accounts${qs({ tab: opts.tab, search: opts.search, status: opts.status })}`,
    token
  )) as AccountListResponse;
}

export async function getAccount(token: string, accountId: string) {
  return (await apiGet(`${BASE}/accounts/${encodeURIComponent(accountId)}`, token)) as AccountDetailResponse;
}

export async function createAccount(token: string, payload: CreateAccountPayload) {
  return (await apiPost(`${BASE}/accounts`, token, payload)) as AccountDetailResponse;
}

export async function createProspect(token: string, payload: CreateAccountPayload) {
  return (await apiPost(`${BASE}/prospects`, token, payload)) as AccountDetailResponse;
}

export async function updateAccount(token: string, accountId: string, payload: UpdateAccountPayload) {
  return (await apiPatch(`${BASE}/accounts/${encodeURIComponent(accountId)}`, token, payload)) as AccountDetailResponse;
}

export async function addContact(token: string, accountId: string, payload: AddContactPayload) {
  return (await apiPost(`${BASE}/accounts/${encodeURIComponent(accountId)}/contacts`, token, payload)) as AccountDetailResponse;
}

export async function addLocation(token: string, accountId: string, payload: AddLocationPayload) {
  return (await apiPost(`${BASE}/accounts/${encodeURIComponent(accountId)}/locations`, token, payload)) as AccountDetailResponse;
}

export async function addAlias(token: string, accountId: string, payload: AddAliasPayload) {
  return (await apiPost(`${BASE}/accounts/${encodeURIComponent(accountId)}/aliases`, token, payload)) as AccountDetailResponse;
}

export async function archiveAccount(token: string, accountId: string) {
  return (await apiPost(`${BASE}/accounts/${encodeURIComponent(accountId)}/archive`, token)) as AccountDetailResponse;
}

export async function restoreAccount(token: string, accountId: string) {
  return (await apiPost(`${BASE}/accounts/${encodeURIComponent(accountId)}/restore`, token)) as AccountDetailResponse;
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
