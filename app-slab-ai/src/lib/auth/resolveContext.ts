import type { SlabAIAuthContext } from "@/lib/ai/executionContext";

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function isProductionRuntime(): boolean {
  return env("NODE_ENV") === "production" || env("VERCEL_ENV") === "production";
}

export function brainBaseUrl(): string {
  const raw = env("BACKEND_URL") || env("NEXT_PUBLIC_BACKEND_URL") || "http://localhost:3001";
  return raw.trim().replace(/\/+$/, "").replace(/\/api$/i, "");
}

/**
 * Development-only auth bypass. Never activates in production.
 * Distinct from AI_MOCK_MODE.
 */
export function tryDevAuthBypass(): SlabAIAuthContext | null {
  const flag = env("SLAB_AI_DEV_AUTH_BYPASS");
  const enabled = flag === "1" || flag.toLowerCase() === "true";
  if (!enabled) return null;
  if (isProductionRuntime()) {
    throw Object.assign(new Error("SLAB_AI_DEV_AUTH_BYPASS is not allowed in production."), {
      code: "DEV_BYPASS_FORBIDDEN",
      status: 500,
    });
  }
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000099",
    role: "admin",
    displayName: "DEV BYPASS USER",
    head: "slab_ai",
    accessToken: null,
    authMode: "dev_bypass",
  };
}

/**
 * Resolve authenticated slab_ai context via Brain.
 * Brain is the permission authority (requireAuth + requireHeadAccess("slab_ai")).
 */
export async function resolveSlabAiAuth(accessToken: string | null): Promise<SlabAIAuthContext> {
  const bypass = tryDevAuthBypass();
  if (bypass) return bypass;

  if (!accessToken) {
    throw Object.assign(new Error("Sign in required to use slabOS AI Studio."), {
      code: "UNAUTHENTICATED",
      status: 401,
    });
  }

  const base = brainBaseUrl();
  const res = await fetch(`${base}/api/slab-ai/context`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    throw Object.assign(new Error("Session expired or invalid. Please sign in again."), {
      code: "UNAUTHENTICATED",
      status: 401,
    });
  }
  if (res.status === 403) {
    throw Object.assign(new Error("You do not have access to slabOS AI Studio."), {
      code: "FORBIDDEN",
      status: 403,
    });
  }
  if (!res.ok) {
    throw Object.assign(new Error("Unable to verify AI Studio access."), {
      code: "AUTH_UNAVAILABLE",
      status: 503,
    });
  }

  const data = (await res.json()) as {
    ok?: boolean;
    userId?: string;
    organizationId?: string | null;
    role?: string;
    displayName?: string | null;
    head?: string;
  };

  if (!data.ok || !data.userId) {
    throw Object.assign(new Error("Invalid AI Studio context response."), {
      code: "AUTH_UNAVAILABLE",
      status: 503,
    });
  }

  return {
    userId: String(data.userId),
    organizationId: data.organizationId ? String(data.organizationId) : null,
    role: String(data.role || "viewer"),
    displayName: data.displayName ?? null,
    head: "slab_ai",
    accessToken,
    authMode: "brain",
  };
}

export async function brainFetch(
  path: string,
  auth: SlabAIAuthContext,
  init: RequestInit = {}
): Promise<Response> {
  if (auth.authMode === "dev_bypass") {
    // Local memory fallbacks are handled by callers for history when Brain unavailable.
    throw Object.assign(new Error("Brain call skipped in auth bypass mode"), {
      code: "DEV_BYPASS",
      status: 503,
    });
  }
  if (!auth.accessToken) {
    throw Object.assign(new Error("Missing access token"), { code: "UNAUTHENTICATED", status: 401 });
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${auth.accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${brainBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
