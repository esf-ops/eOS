import { config } from "./config";

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(method: "GET" | "POST", path: string, token: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!token && !config.preview) throw new ApiError("Missing session access token", 401);
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${config.backendBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(`Brain is not reachable at ${config.backendBaseUrl}.`, 0);
  }
  if (res.status === 401) throw new ApiError("Session expired. Please sign in again.", 401);
  if (res.status === 403) throw new ApiError("You do not have access to Estimate Builder.", 403);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const msg = json && typeof json === "object" && "error" in json ? String((json as { error?: unknown }).error) : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, json);
  }
  return json as T;
}

export const apiGet = <T>(path: string, token: string, signal?: AbortSignal) => request<T>("GET", path, token, undefined, signal);

/** Authenticated binary download (e.g. proposal PDF). */
export async function apiGetBlob(path: string, token: string): Promise<Blob> {
  if (!token) throw new ApiError("Missing session access token", 401);
  let res: Response;
  try {
    res = await fetch(`${config.backendBaseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError(`Brain is not reachable at ${config.backendBaseUrl}.`, 0);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: unknown };
      if (json?.error) msg = String(json.error);
    } catch {
      // non-JSON body
    }
    throw new ApiError(msg, res.status);
  }
  return res.blob();
}
export const apiPost = <T>(path: string, token: string, body: unknown, signal?: AbortSignal) =>
  request<T>("POST", path, token, body, signal);
