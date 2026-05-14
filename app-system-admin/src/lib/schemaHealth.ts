import { config } from "./config";

/** Mounted at `/api/admin/...` and `/api/system-admin/...` in `systemAdminUserManagement.js`. */
export const SCHEMA_HEALTH_PATH = "/api/system-admin/user-management/schema-health";

export type SchemaHealthResp = {
  ok?: boolean;
  tables?: Record<string, boolean>;
  missing?: string[];
};

export type SchemaHealthFetchResult =
  | { outcome: "ok"; data: SchemaHealthResp; url: string }
  | { outcome: "http_error"; httpStatus: number; url: string; detail: string }
  | { outcome: "network_error"; message: string; url: string }
  | { outcome: "invalid_body"; url: string; detail: string };

export async function fetchSchemaHealth(accessToken: string): Promise<SchemaHealthFetchResult> {
  const url = `${config.backendBaseUrl}${SCHEMA_HEALTH_PATH}`;
  const token = accessToken.trim();

  if (import.meta.env.DEV) {
    console.info("[system-admin] schema-health", { path: SCHEMA_HEALTH_PATH, url, hasToken: Boolean(token) });
  }

  if (!token) {
    return { outcome: "http_error", httpStatus: 0, url, detail: "Missing bearer token" };
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    });

    if (import.meta.env.DEV) {
      console.info("[system-admin] schema-health", { path: SCHEMA_HEALTH_PATH, httpStatus: res.status, ok: res.ok });
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      if (!res.ok) {
        return { outcome: "http_error", httpStatus: res.status, url, detail: text.slice(0, 240) || `HTTP ${res.status}` };
      }
      return { outcome: "invalid_body", url, detail: "Response was not valid JSON" };
    }

    if (!res.ok) {
      const jo = json as { error?: string } | null;
      const detail = jo?.error ? String(jo.error) : text.slice(0, 240) || `HTTP ${res.status}`;
      if (import.meta.env.DEV) {
        console.warn("[system-admin] schema-health error body", { httpStatus: res.status, detail });
      }
      return { outcome: "http_error", httpStatus: res.status, url, detail };
    }

    const data = json as SchemaHealthResp;
    if (!data || typeof data.tables !== "object" || data.tables === null) {
      return { outcome: "invalid_body", url, detail: "Response missing tables object" };
    }

    return { outcome: "ok", data, url };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (import.meta.env.DEV) {
      console.warn("[system-admin] schema-health network/cors error", message);
    }
    return { outcome: "network_error", message, url };
  }
}
