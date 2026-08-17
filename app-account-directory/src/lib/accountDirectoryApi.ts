import { apiGet, apiPatch, apiPost } from "./api";
import type {
  AccountDetailResponse,
  AccountFinancialsResponse,
  AccountListParams,
  AccountListResponse,
  AccountRelationshipResponse,
  AccountSummaryResponse,
  AccountTimelineResponse,
  AccountTrendResponse,
  AccountInvoicePage,
  AccountHistoryTransactionPage,
  AddAliasPayload,
  AddContactPayload,
  AddLocationPayload,
  CreateAccountPayload,
  PermissionsResponse,
  UpdateAccountPayload,
  UpdateContactPayload,
  UpdateLocationPayload,
  AccountInsightsResponse,
  AccountInsightEvidenceResponse,
  MorawareReconciliationResponse
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
      missingLocation: opts.missingLocation,
      qbEnrichment: opts.qbEnrichment,
      intelligence: opts.intelligence
    })}`,
    token
  )) as AccountListResponse;
}

export async function getAccount(token: string, accountId: string, init: RequestInit = {}) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}`,
    token,
    init
  )) as AccountDetailResponse;
}

export async function getAccountFinancials(token: string, accountId: string, init: RequestInit = {}) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/financials`,
    token,
    init
  )) as AccountFinancialsResponse;
}

export async function getAccountFinancialsTrend(
  token: string,
  accountId: string,
  period: string,
  init: RequestInit = {}
) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/financials/trend${qs({ period })}`,
    token,
    init
  )) as AccountTrendResponse;
}

export async function getAccountHistoryTransactions(
  token: string,
  accountId: string,
  opts: { page?: number; limit?: number; type?: string }
) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/financials/transactions${qs({
      page: opts.page,
      limit: opts.limit,
      type: opts.type
    })}`,
    token
  )) as AccountHistoryTransactionPage;
}

export async function getAccountOpenInvoices(
  token: string,
  accountId: string,
  opts: { page?: number; limit?: number }
) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/financials/invoices${qs({
      page: opts.page,
      limit: opts.limit
    })}`,
    token
  )) as AccountInvoicePage;
}

export async function getAccountRelationship(token: string, accountId: string, init: RequestInit = {}) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/relationship`,
    token,
    init
  )) as AccountRelationshipResponse;
}

export async function getAccountTimeline(
  token: string,
  accountId: string,
  opts: { family?: string; page?: number; limit?: number }
) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/timeline${qs({
      family: opts.family,
      page: opts.page,
      limit: opts.limit
    })}`,
    token
  )) as AccountTimelineResponse;
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

export async function updateContact(
  token: string,
  accountId: string,
  contactId: string,
  payload: UpdateContactPayload
) {
  return (await apiPatch(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/contacts/${encodeURIComponent(contactId)}`,
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

export async function updateLocation(
  token: string,
  accountId: string,
  locationId: string,
  payload: UpdateLocationPayload
) {
  return (await apiPatch(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}`,
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

export async function linkMoraware(
  token: string,
  accountId: string,
  payload: { externalId: string; externalDisplayName?: string }
) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/link-moraware`,
    token,
    payload
  )) as AccountDetailResponse;
}

export async function unlinkExternal(token: string, accountId: string, linkId: string) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/external-links/${encodeURIComponent(linkId)}/deactivate`,
    token
  )) as AccountDetailResponse;
}

export async function unlinkMoraware(token: string, accountId: string, linkId: string) {
  return (await apiPost(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/external-links/${encodeURIComponent(linkId)}/deactivate`,
    token,
    { expectedSystem: "moraware" }
  )) as AccountDetailResponse;
}

export async function fetchMorawareReconciliation(
  token: string,
  opts: { classification?: string; linked?: string; search?: string; page?: number; pageSize?: number }
) {
  return (await apiGet(
    `${BASE}/moraware-reconciliation${qs({
      classification: opts.classification,
      linked: opts.linked,
      search: opts.search,
      page: opts.page,
      pageSize: opts.pageSize
    })}`,
    token
  )) as MorawareReconciliationResponse;
}

export async function fetchQbEnrichmentStatus(token: string) {
  return (await apiGet(`${BASE}/qb-enrichment/status`, token)) as {
    ok: boolean;
    feed?: {
      status?: string;
      open_suggestions?: number;
      needs_review?: number;
      conflict?: number;
      reason?: string | null;
    };
  };
}

export async function fetchQbEnrichmentSuggestions(token: string) {
  return (await apiGet(`${BASE}/qb-enrichment/suggestions`, token)) as {
    ok: boolean;
    unavailable?: boolean;
    items?: Array<{
      id: string;
      qbListId: string;
      qbFullName?: string | null;
      qbName?: string | null;
      status: string;
      suggestedAccountId?: string | null;
      rankScore?: number | null;
      candidateAccounts?: Array<{ accountId: string; displayName?: string | null; score?: number }>;
    }>;
  };
}

export async function fetchAccountStatusReview(
  token: string,
  opts: {
    search?: string;
    proposedStatus?: string;
    currentStatus?: string;
    reasonCode?: string;
    category?: string;
    qbState?: string;
    reviewed?: string;
    page?: number;
    pageSize?: number;
  } = {},
  init: RequestInit = {}
) {
  return (await apiGet(
    `${BASE}/status-review${qs({
      search: opts.search,
      proposedStatus: opts.proposedStatus,
      currentStatus: opts.currentStatus,
      reasonCode: opts.reasonCode,
      category: opts.category,
      qbState: opts.qbState,
      reviewed: opts.reviewed,
      page: opts.page,
      pageSize: opts.pageSize
    })}`,
    token,
    init
  )) as import("./types").StatusReviewQueueResponse;
}

export async function decideAccountStatusReview(
  token: string,
  accountId: string,
  payload: {
    decision: "accept_recommendation" | "keep_current" | "mark_needs_review";
    rowVersion?: number | null;
    evidenceFingerprint?: string;
    keepReason?: string;
    note?: string;
  }
) {
  return apiPost(
    `${BASE}/status-review/${encodeURIComponent(accountId)}/decision`,
    token,
    payload
  );
}

export async function getAccountInsights(
  token: string,
  accountId: string,
  period?: string,
  init: RequestInit = {}
) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/insights${qs({ period })}`,
    token,
    init
  )) as AccountInsightsResponse;
}

export async function getAccountInsightEvidence(
  token: string,
  accountId: string,
  insightId: string,
  period?: string
) {
  return (await apiGet(
    `${BASE}/accounts/${encodeURIComponent(accountId)}/insights/${encodeURIComponent(insightId)}/evidence${qs({ period })}`,
    token
  )) as AccountInsightEvidenceResponse;
}
