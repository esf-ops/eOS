export function backendBase(): string {
  return String(import.meta.env.VITE_BACKEND_URL || "http://localhost:3001")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function apiFetch(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
  const base = backendBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const body = await parseJson(res);
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && body !== null && "error" in body
        ? String((body as { error?: unknown }).error ?? res.statusText)
        : res.statusText;
    throw new ApiError(res.status, msg || "Request failed", body);
  }
  return body;
}

export function apiGet(path: string, token: string) {
  return apiFetch(path, token, { method: "GET" });
}

export function apiPost(path: string, token: string, json?: unknown, init: RequestInit = {}) {
  return apiFetch(path, token, {
    ...init,
    method: "POST",
    body: json !== undefined ? JSON.stringify(json) : undefined,
    headers: init.headers
  });
}

/**
 * Authenticated binary fetch against VITE_BACKEND_URL (not the SPA origin).
 * Used for staff attachment preview/download — never returns provider URLs.
 */
export async function apiFetchBlob(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<{ blob: Blob; contentType: string; filename: string | null; status: number }> {
  const base = backendBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, method: init.method || "GET", headers, cache: "no-store" });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const msg =
      body && typeof body === "object" && body !== null && "error" in body
        ? String((body as { error?: unknown }).error ?? res.statusText)
        : res.statusText || "Request failed";
    throw new ApiError(res.status, msg || "Request failed", body);
  }
  const blob = await res.blob();
  const contentType = res.headers.get("content-type") || blob.type || "application/octet-stream";
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  return {
    blob,
    contentType,
    filename: match ? match[1] : null,
    status: res.status
  };
}
