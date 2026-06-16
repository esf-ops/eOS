/**
 * AI Takeoff Lab — lightweight authenticated API helpers.
 * Mirrors the @quote-lib/api pattern used in Internal Estimate and Quote Library.
 * organizationId is never sent from the client — derived server-side from auth.
 */
import { backendBaseUrl } from "./config";

export class LabApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "LabApiError";
    this.status = status;
    this.body = body;
  }
}

function joinUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${backendBaseUrl()}${p}`;
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new LabApiError(msg || `HTTP ${res.status}`, res.status, json ?? text);
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
