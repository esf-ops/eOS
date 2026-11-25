function backendBase(): string {
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

export function apiPost(path: string, token: string, body?: unknown) {
  return apiFetch(path, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Unauthenticated GET for public share pages. */
export async function publicGet(path: string): Promise<unknown> {
  const res = await fetch(`${backendBase()}${path}`, { cache: "no-store", referrerPolicy: "no-referrer" });
  const body = await parseJson(res);
  if (!res.ok) throw new ApiError(res.status, res.statusText || "Request failed", body);
  return body;
}
