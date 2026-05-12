import { config } from "./config";

export function joinBackendUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = config.backendBaseUrl.replace(/\/+$/, "").replace(/\/api$/i, "");
  return `${base}${p}`;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiPostJson(path: string, token: string, body: unknown): Promise<unknown> {
  const t = String(token || "").trim();
  if (!t) throw new ApiError("Sign in required for live API", 401, null);
  const url = joinBackendUrl(path);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${t}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new ApiError(msg || `HTTP ${res.status}`, res.status, json ?? text);
  }
  return json;
}
