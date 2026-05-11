import { config } from "./config";

export function joinBackendUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = String(config.backendBaseUrl ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  if (!base && typeof window !== "undefined") {
    return `${window.location.origin}${p}`;
  }
  if (!base) {
    return `http://localhost:3001${p}`;
  }
  return `${base}${p}`;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  attemptedUrl?: string;
  /** Request path passed to apiFetch, e.g. `/api/sales/performance-intelligence` */
  path?: string;
  constructor(message: string, status: number, body: unknown, attemptedUrl?: string, path?: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.attemptedUrl = attemptedUrl;
    this.path = path;
  }
}

function networkFailureMessage(joinErr: string, attemptedUrl: string) {
  return `Backend is not reachable. Attempted ${attemptedUrl}. (${joinErr})`;
}

type ApiFetchOptions = {
  token: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiFetch(path: string, options: ApiFetchOptions) {
  const token = String(options?.token ?? "").trim();
  if (!token) {
    throw new ApiError("Missing session access token", 401, null, joinBackendUrl(path), path);
  }

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
    throw new ApiError(networkFailureMessage(msg, attemptedUrl), 0, { cause: msg }, attemptedUrl, path);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON
  }

  if (res.status === 401)
    throw new ApiError("Session expired. Please sign in again.", 401, json ?? text, attemptedUrl, path);
  if (res.status === 403)
    throw new ApiError("You do not have access to the Sales Head.", 403, json ?? text, attemptedUrl, path);

  if (!res.ok) {
    let msg =
      typeof json === "object" &&
      json &&
      "error" in json &&
      String((json as { error?: string }).error || "")
        ? String((json as { error?: string }).error)
        : `HTTP ${res.status}`;
    if (res.status === 404) {
      msg = [
        `${method} ${path} failed: HTTP 404`,
        `URL: ${attemptedUrl}`,
        msg !== `HTTP ${res.status}` ? `Server message: ${msg}` : null,
        "If this is a Sales API route, confirm backend-core registers it and restart `npm run eos:server`.",
        "In dev, ensure Vite proxies `/api` (see app-sales/vite.config.ts) or set VITE_BACKEND_URL=http://localhost:3001."
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (res.status >= 500) {
      msg = [`${method} ${path} failed: HTTP ${res.status}`, `URL: ${attemptedUrl}`, msg].join("\n");
    }
    throw new ApiError(msg, res.status, json ?? text, attemptedUrl, path);
  }

  return json ?? text;
}
