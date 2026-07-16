/**
 * DE.2E public Digital Estimate configuration helpers (browser-safe).
 * Never stores tokens in browser web storage.
 */

export function parseTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/e\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Fragment token: /e#<rawToken> or /e/#<rawToken> */
export function parseTokenFromHash(hash: string): string | null {
  const raw = String(hash || "").replace(/^#/, "").trim();
  if (!raw) return null;
  // Support both "#token" and "#/token" and accidental "token=..."
  const cleaned = raw.replace(/^\//, "").replace(/^token=/i, "");
  if (cleaned.length < 20 || cleaned.length > 256) return null;
  return cleaned;
}

export function configurationUiEnabled(): boolean {
  return String(import.meta.env.VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED ?? "").trim() === "true";
}

export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_BACKEND_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : "";
}

export function clearFragmentFromUrl(): void {
  try {
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", url || "/e");
  } catch {
    /* ignore */
  }
}

export type PublicEstimate = {
  documentTitle: string;
  quoteNumber: string | null;
  revisionLabel: string | null;
  revisionNumber: number | null;
  publishedAt: string | null;
  pricingValidThrough: string | null;
  project: {
    customerName: string | null;
    projectName: string | null;
    projectAddress: string | null;
  };
  rooms: Array<{
    name: string | null;
    summaryLines: string[];
    materialLabel: string | null;
    colorLabel: string | null;
  }>;
  lineItems: Array<{ label: string | null; amount: number | null }>;
  totals: {
    estimatedProjectTotal: number | null;
    currency: string;
    rounding: string;
  };
  notes: string[];
  disclosures: { version: string | null; text: string | null };
};

export type ConfigOption = {
  id: string;
  optionKey: string;
  groupId: string;
  displayLabel: string;
  description?: string | null;
  availabilityState: string;
  customerPriceTreatment: string;
  minQty: number;
  maxQty: number | null;
  defaultQty: number;
  selectable: boolean;
  includedInBaseline?: boolean;
};

export type ConfigurationState = {
  lifecycle: string;
  message?: string | null;
  estimate?: PublicEstimate | null;
  session?: { id: string; status: string; rowVersion: number; expiresAt?: string | null } | null;
  configuration?: {
    envelopeId: string;
    envelopeVersion: number;
    pricingValidThrough?: string | null;
    lockedScopeNotice?: string;
    rooms?: Array<{ roomKey: string; displayName: string; baselineMaterialLabel?: string; locked?: boolean }>;
    groups?: Array<{ id: string; groupKey: string; displayLabel: string; required?: boolean }>;
    options?: ConfigOption[];
    currentSelections?: Record<string, number>;
    latestCalculation?: {
      baselineDisplayTotal?: number;
      configuredDisplayTotal?: number;
      displayDelta?: number;
      totals?: {
        baselineDisplayTotal?: number;
        configuredDisplayTotal?: number;
        displayDelta?: number;
      };
      pricingValidThrough?: string | null;
    } | null;
    baselineDisplayTotal?: number | null;
  } | null;
};

export async function exchangeFragmentToken(token: string): Promise<ConfigurationState> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = new Error("Estimate unavailable");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as ConfigurationState;
}

export async function resumeConfigurationSession(): Promise<ConfigurationState> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const err = new Error("Estimate unavailable");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as ConfigurationState;
}

export async function saveConfigurationSelections(payload: {
  items: Array<{ optionKey: string; quantity: number }>;
  expectedRowVersion: number;
  idempotencyKey: string;
}): Promise<{
  ok: boolean;
  session?: { rowVersion: number };
  calculation?: ConfigurationState["configuration"] extends infer C
    ? C extends { latestCalculation?: infer L }
      ? L
      : unknown
    : unknown;
}> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = "Unable to save";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    const err = new Error(message);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as {
    ok: boolean;
    session?: { rowVersion: number };
    calculation?: unknown;
  };
}

export async function fetchLegacyPathEstimate(token: string): Promise<PublicEstimate> {
  const base = apiBaseUrl();
  const res = await fetch(
    `${base}/api/public-digital-estimate/v1/${encodeURIComponent(token)}`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error("unavailable");
  const body = (await res.json()) as { ok?: boolean; estimate?: PublicEstimate };
  if (!body.ok || !body.estimate) throw new Error("unavailable");
  return body.estimate;
}

export function formatCurrency(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function calcTotals(calc: ConfigurationState["configuration"] extends infer C
  ? C extends { latestCalculation?: infer L }
    ? L
    : null
  : null): {
  baseline: number | null;
  configured: number | null;
  delta: number | null;
} {
  if (!calc || typeof calc !== "object") return { baseline: null, configured: null, delta: null };
  const c = calc as {
    baselineDisplayTotal?: number;
    configuredDisplayTotal?: number;
    displayDelta?: number;
    totals?: {
      baselineDisplayTotal?: number;
      configuredDisplayTotal?: number;
      displayDelta?: number;
    };
  };
  const baseline = c.totals?.baselineDisplayTotal ?? c.baselineDisplayTotal ?? null;
  const configured = c.totals?.configuredDisplayTotal ?? c.configuredDisplayTotal ?? null;
  const delta =
    c.totals?.displayDelta ??
    c.displayDelta ??
    (c as { displayTotalDelta?: number }).displayTotalDelta ??
    null;
  return { baseline, configured, delta };
}
