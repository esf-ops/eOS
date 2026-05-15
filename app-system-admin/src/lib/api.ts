import { config } from "./config";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type ApiFetchOptions = {
  token: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Default `no-store` avoids cached Brain responses tied to another Origin/session. */
  cache?: RequestCache;
};

export async function apiFetch(path: string, options: ApiFetchOptions) {
  const token = String(options?.token ?? "").trim();
  if (!token) throw new ApiError("Missing session access token", 401, null);

  const method = options?.method || "GET";
  const headers: Record<string, string> = {
    ...(options?.headers || {}),
    authorization: `Bearer ${token}`
  };

  let body: string | undefined;
  if (options?.body !== undefined) {
    headers["content-type"] = headers["content-type"] || "application/json";
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const res = await fetch(`${config.backendBaseUrl}${path}`, {
    method,
    headers,
    body,
    cache: options.cache ?? "no-store"
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore non-JSON
  }

  if (res.status === 401) throw new ApiError("Session expired. Please sign in again.", 401, json ?? text);
  if (res.status === 403) throw new ApiError("Forbidden.", 403, json ?? text);
  if (!res.ok) {
    const jo = json as { error?: string; message?: string } | null;
    const piece = jo?.message ?? jo?.error;
    const msg = piece != null && String(piece).trim() ? String(piece) : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, json ?? text);
  }

  return json ?? text;
}
