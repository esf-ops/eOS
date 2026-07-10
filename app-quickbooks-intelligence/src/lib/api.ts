import { config } from "./config";

export function joinBackendUrl(path: string) {
  const base = config.backendBaseUrl.replace(/\/+$/, "").replace(/\/api$/i, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  /** Resolved request URL (for network failures and debugging). */
  attemptedUrl?: string;
  constructor(message: string, status: number, body: unknown, attemptedUrl?: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.attemptedUrl = attemptedUrl;
  }
}

function networkFailureMessage(joinErr: string, attemptedUrl: string) {
  const base = config.backendBaseUrl;
  return `Backend is not reachable at ${base}. Attempted ${attemptedUrl}. (${joinErr}) Confirm backend-core is running (e.g. npm run eos:server) and this browser origin is allowed by CORS (GET ${base}/api/debug/cors).`;
}

type ApiFetchOptions = {
  token: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
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

  const attemptedUrl = joinBackendUrl(path);
  let res: Response;
  try {
    res = await fetch(attemptedUrl, { method, headers, body });
  } catch (e: unknown) {
    const msg = String((e as Error)?.message || e);
    throw new ApiError(networkFailureMessage(msg, attemptedUrl), 0, { cause: msg }, attemptedUrl);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore non-JSON
  }

  if (res.status === 401)
    throw new ApiError("Session expired. Please sign in again.", 401, json ?? text);
  if (res.status === 403)
    throw new ApiError("You do not have access to this head.", 403, json ?? text);

  if (!res.ok) {
    const msg =
      typeof json === "object" &&
      json &&
      "error" in json &&
      String((json as { error?: string }).error || "")
        ? String((json as { error?: string }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, json ?? text);
  }

  return json ?? text;
}
