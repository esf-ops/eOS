import { config } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path: string, token: string): Promise<unknown> {
  if (!token) throw new ApiError("Missing session access token", 401);
  const url = `${config.backendBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new ApiError(`Brain is not reachable at ${config.backendBaseUrl} (${String((e as Error)?.message ?? e)}).`, 0);
  }
  if (res.status === 401) throw new ApiError("Session expired. Please sign in again.", 401);
  if (res.status === 403) throw new ApiError("You do not have access to this head.", 403);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const msg = json && typeof json === "object" && "error" in json ? String((json as { error?: unknown }).error) : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return json ?? text;
}
