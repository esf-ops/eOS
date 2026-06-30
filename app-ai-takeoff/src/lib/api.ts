/**
 * AI Takeoff Lab — lightweight authenticated API helpers.
 * Mirrors the @quote-lib/api pattern used in Internal Estimate and Quote Library.
 * organizationId is never sent from the client — derived server-side from auth.
 */
import { backendBaseUrl } from "./config";

export class LabApiError extends Error {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  constructor(message: string, status: number, body: unknown, headers: Record<string, string> = {}) {
    super(message);
    this.name = "LabApiError";
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

function responseHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function joinUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${backendBaseUrl()}${p}`;
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  const headers = responseHeaders(res);
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new LabApiError(msg || `HTTP ${res.status}`, res.status, json ?? text, headers);
  }
  return json;
}

export async function labApiGet(path: string, token: string): Promise<unknown> {
  const t = token.trim();
  if (!t) throw new LabApiError("Sign in required", 401, null);
  return parseResponse(
    await fetch(joinUrl(path), { headers: { authorization: `Bearer ${t}` } })
  );
}

export async function labApiPost(path: string, token: string, body: unknown): Promise<unknown> {
  const t = token.trim();
  if (!t) throw new LabApiError("Sign in required", 401, null);
  return parseResponse(
    await fetch(joinUrl(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t}`,
      },
      body: JSON.stringify(body),
    })
  );
}

/** PUT without auth header — for signed Supabase Storage upload URLs. */
export async function storagePut(signedUrl: string, file: File): Promise<void> {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.text()).slice(0, 120) || detail; } catch { /* ignore */ }
    throw new LabApiError(`Storage upload failed: ${detail}`, res.status, null);
  }
}

export interface TakeoffProcessingStatus {
  asyncStatus: string | null;
  phase: string | null;
  phaseLabel: string | null;
  pageProgress: { current: number; total: number } | null;
  runId: string | null;
  mode: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  error: string | null;
  attempt: number | null;
}

export interface TakeoffJobListItem {
  takeoffJobId: string;
  quoteFileId: string | null;
  originalFilename: string | null;
  status: string;
  reviewStatus: string;
  sourceType: string | null;
  modelProvider: string | null;
  modelVersion: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  latestResultId: string | null;
  latestResultCreatedAt: string | null;
  hasNormalizedTakeoffJson: boolean;
  resultCount: number;
  resultSummary: {
    computedCountertopSf: number;
    computedBacksplashSf: number;
    warningCount: number;
    errorCount: number;
  } | null;
  approvalStatus?: string;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  canApprove?: boolean;
  processing?: TakeoffProcessingStatus;
  errorMessage?: string | null;
}

export interface ListTakeoffJobsResponse {
  ok: boolean;
  jobs: TakeoffJobListItem[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
}

export interface ListTakeoffJobsQuery {
  status?: string;
  review_status?: string;
  limit?: number;
  offset?: number;
}

/** List org takeoff jobs (newest first). Organization is resolved server-side. */
export async function listTakeoffJobs(
  token: string,
  query: ListTakeoffJobsQuery = {}
): Promise<ListTakeoffJobsResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.review_status) params.set("review_status", query.review_status);
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.offset != null) params.set("offset", String(query.offset));
  const qs = params.toString();
  const path = qs ? `/api/takeoff-jobs?${qs}` : "/api/takeoff-jobs";
  return labApiGet(path, token) as Promise<ListTakeoffJobsResponse>;
}

export interface SaveTakeoffCorrectionResponse {
  ok: boolean;
  takeoffJobId: string;
  correctionId: string;
  savedAt: string;
  reviewStatus: string;
  approvalStatus?: string;
  canApprove?: boolean;
  summary: {
    countertopExactSf: number;
    backsplashExactSf: number;
  };
}

export interface ApproveTakeoffJobResponse {
  ok: boolean;
  takeoffJobId: string;
  approvedAt: string;
  approvedByUserId: string | null;
  reviewStatus: string;
  approvalStatus?: string;
  canApprove: boolean;
  summary: {
    countertopExactSf: number;
    backsplashExactSf: number;
  };
}

/** Save estimator corrections with audit metadata (resets approval to needs_review). */
export async function saveTakeoffCorrection(
  token: string,
  takeoffJobId: string,
  body: {
    takeoffResult: unknown;
    correctionNotes?: string | null;
    baseResultId?: string | null;
    reviewState?: unknown;
  }
): Promise<SaveTakeoffCorrectionResponse> {
  return labApiPost(
    `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/corrections`,
    token,
    body
  ) as Promise<SaveTakeoffCorrectionResponse>;
}

/** Approve the latest reviewed takeoff after server validation + QA gate. Does not create a quote. */
export async function approveTakeoffJob(
  token: string,
  takeoffJobId: string,
  body?: {
    takeoffResult?: unknown;
    reviewState?: unknown;
    dimensionEvidence?: unknown;
  }
): Promise<ApproveTakeoffJobResponse> {
  return labApiPost(
    `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/approve`,
    token,
    body ?? {}
  ) as Promise<ApproveTakeoffJobResponse>;
}

/** Create Internal Estimate draft from approved takeoff. */
export async function importInternalEstimateFromTakeoff(
  token: string,
  takeoffJobId: string,
  options?: { betaImportConfirmed?: boolean }
): Promise<{ ok: boolean; quoteId: string; quote_number: string; takeoffJobId: string }> {
  return labApiPost("/api/internal-quotes/import-from-takeoff", token, {
    takeoffJobId,
    betaImportConfirmed: options?.betaImportConfirmed ?? false,
  }) as Promise<{
    ok: boolean;
    quoteId: string;
    quote_number: string;
    takeoffJobId: string;
  }>;
}

export async function recordTakeoffReviewStarted(token: string, takeoffJobId: string): Promise<void> {
  await labApiPost(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/review-started`, token, {});
}

export async function recordTakeoffImportCancelled(
  token: string,
  takeoffJobId: string,
  reason?: string
): Promise<void> {
  await labApiPost(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/import-cancelled`, token, {
    reason: reason ?? null,
  });
}

export async function submitTakeoffFeedback(
  token: string,
  takeoffJobId: string,
  body: import("./takeoffBeta").TakeoffFeedbackPayload
): Promise<{ ok: boolean }> {
  return labApiPost(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/feedback`, token, body) as Promise<{
    ok: boolean;
  }>;
}

export async function submitTakeoffIssueReport(
  token: string,
  takeoffJobId: string,
  body: import("./takeoffBeta").TakeoffIssueReportPayload
): Promise<{ ok: boolean }> {
  return labApiPost(`/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/issue-report`, token, body) as Promise<{
    ok: boolean;
  }>;
}

export async function fetchTakeoffBetaQaSummary(
  token: string,
  limit = 25
): Promise<{ ok: boolean; rows: import("./takeoffBeta").TakeoffBetaQaRow[] }> {
  return labApiGet(`/api/takeoff-beta/qa-summary?limit=${encodeURIComponent(String(limit))}`, token) as Promise<{
    ok: boolean;
    rows: import("./takeoffBeta").TakeoffBetaQaRow[];
  }>;
}

export interface StartTakeoffProcessingResponse {
  ok: boolean;
  accepted?: boolean;
  takeoffJobId: string;
  status: string;
  reviewStatus?: string;
  resultRowId?: string | null;
  processing?: TakeoffProcessingStatus;
  mode?: string;
  message?: string;
  code?: string;
}

/** Start async takeoff processing (Phase E). Poll GET /api/takeoff-jobs/:id for status. */
export async function startTakeoffProcessing(
  token: string,
  takeoffJobId: string
): Promise<StartTakeoffProcessingResponse> {
  return labApiPost(
    `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/process`,
    token,
    {}
  ) as Promise<StartTakeoffProcessingResponse>;
}

export interface GenerateAiTakeoffDraftSyncResponse {
  ok: boolean;
  accepted?: false;
  takeoffJobId: string;
  normalizedTakeoffJson?: unknown;
  promptVersion?: string | null;
  modelUsed?: string | null;
  resultRowId?: string | null;
  summary?: object | null;
  pageInventory?: object | null;
  dimensionEvidence?: object | null;
  exayardRawCaptured?: boolean;
  exayardWorkflow?: object | null;
  exayardStatus?: string;
  retryAfterAt?: string | null;
  retryAfterSeconds?: number | null;
  message?: string | null;
  assessmentId?: string | null;
  canResumeExayard?: boolean;
}

export interface GenerateAiTakeoffDraftAsyncResponse {
  ok: boolean;
  accepted: true;
  takeoffJobId: string;
  runId: string;
  status: string;
  processing?: TakeoffProcessingStatus;
  mode?: string;
  message?: string;
}

export type GenerateAiTakeoffDraftResponse =
  | GenerateAiTakeoffDraftSyncResponse
  | GenerateAiTakeoffDraftAsyncResponse;

/**
 * Start AI takeoff generation. Returns sync result (200) or async accepted payload (202).
 * On network failure throws LabApiError with response headers when available.
 */
export async function generateAiTakeoffDraft(
  token: string,
  takeoffJobId: string
): Promise<GenerateAiTakeoffDraftResponse> {
  const t = token.trim();
  if (!t) throw new LabApiError("Sign in required", 401, null);

  const path = `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/generate-ai-draft`;
  let res: Response;
  try {
    res = await fetch(joinUrl(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({}),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw e;
    }
    throw e;
  }

  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  const headers = responseHeaders(res);

  if (res.status === 202) {
    return json as GenerateAiTakeoffDraftAsyncResponse;
  }

  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new LabApiError(msg || `HTTP ${res.status}`, res.status, json ?? text, headers);
  }

  return json as GenerateAiTakeoffDraftSyncResponse;
}
