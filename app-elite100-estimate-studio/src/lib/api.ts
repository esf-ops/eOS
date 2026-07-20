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

export function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = String((e as { name?: string }).name || "");
  const message = String((e as { message?: string }).message || "");
  return name === "AbortError" || /aborted|abort/i.test(message);
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

export type ApiFetchOptions = RequestInit & {
  /** Client-side overall timeout (ms). AbortSignal.timeout when available. */
  timeoutMs?: number;
};

export async function apiFetch(
  path: string,
  token: string,
  init: ApiFetchOptions = {}
): Promise<unknown> {
  const base = backendBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const { timeoutMs, signal: outerSignal, ...rest } = init;
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs != null && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const res = await fetch(url, {
      ...rest,
      headers,
      cache: "no-store",
      signal: controller.signal
    });
    const body = await parseJson(res);
    if (!res.ok) {
      const msg =
        body && typeof body === "object" && body !== null && "error" in body
          ? String((body as { error?: unknown }).error ?? res.statusText)
          : res.statusText;
      throw new ApiError(res.status, msg || "Request failed", body);
    }
    return body;
  } catch (e) {
    if (isAbortError(e) && timeoutMs != null && timeoutMs > 0 && !outerSignal?.aborted) {
      throw new ApiError(504, "Request timed out", {
        code: "DE-PUBLISH-TIMEOUT",
        error: "Request timed out"
      });
    }
    throw e;
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
  }
}

export function apiGet(path: string, token: string, init: ApiFetchOptions = {}) {
  return apiFetch(path, token, { ...init, method: "GET" });
}

export function apiPost(path: string, token: string, payload: unknown, init: ApiFetchOptions = {}) {
  return apiFetch(path, token, { ...init, method: "POST", body: JSON.stringify(payload) });
}

export function apiPatch(path: string, token: string, payload: unknown, init: ApiFetchOptions = {}) {
  return apiFetch(path, token, { ...init, method: "PATCH", body: JSON.stringify(payload) });
}

export function apiPut(path: string, token: string, payload: unknown, init: ApiFetchOptions = {}) {
  return apiFetch(path, token, { ...init, method: "PUT", body: JSON.stringify(payload) });
}

export function apiDelete(path: string, token: string, init: ApiFetchOptions = {}) {
  return apiFetch(path, token, { ...init, method: "DELETE" });
}
