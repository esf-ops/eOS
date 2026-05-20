import { readOrgDirectoryConfig } from "./config";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function backendBase(): string {
  const { config, missing } = readOrgDirectoryConfig();
  if (!config) {
    throw new ApiError(0, `Backend URL missing — set ${missing.join(", ")} on this deployment.`, null);
  }
  return config.backendBaseUrl;
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
  const url = `${backendBase()}${path.startsWith("/") ? path : `/${path}`}`;
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
