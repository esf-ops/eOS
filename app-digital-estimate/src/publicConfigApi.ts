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

/**
 * UI kill-switch for ConfigurationView.
 * Exact "false" forces the read-only summary. Unset or any other value allows
 * configure mode when the public session returns an active configuration envelope.
 * Never grants access by itself — server flags + active envelope still required.
 */
export function configurationUiEnabled(): boolean {
  return String(import.meta.env.VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED ?? "").trim() !== "false";
}

export function reviewUiEnabled(): boolean {
  return String(import.meta.env.VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED ?? "").trim() === "true";
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
  imageAssetRef?: string | null;
  materialId?: string | null;
  roomKey?: string | null;
  availabilityState: string;
  customerPriceTreatment: string;
  minQty: number;
  maxQty: number | null;
  defaultQty: number;
  selectable: boolean;
  includedInBaseline?: boolean;
};

export type CustomerMaterial = {
  materialId: string;
  displayName: string;
  imageAssetPath?: string | null;
  imageFullPath?: string | null;
  collectionLabel?: string | null;
  colorFamily?: string | null;
  patternType?: string | null;
  pricingGroupLabel?: string | null;
  customerVisible?: boolean;
  roomKey?: string | null;
  optionKey?: string | null;
  includedInBaseline?: boolean;
  isDefault?: boolean;
  selectable?: boolean;
};

export type ConfigurationState = {
  lifecycle: string;
  message?: string | null;
  estimate?: PublicEstimate | null;
  session?: { id: string; status: string; rowVersion: number; expiresAt?: string | null } | null;
  configuration?: {
    envelopeId: string;
    envelopeVersion: number;
    materialCatalogContract?: string | null;
    pricingValidThrough?: string | null;
    lockedScopeNotice?: string;
    sourceProject?: {
      customerName?: string | null;
      projectName?: string | null;
      projectAddress?: string | null;
      phone?: string | null;
      email?: string | null;
    };
    customerInfoDraft?: {
      customerName?: string;
      projectName?: string;
      phone?: string;
      email?: string;
      projectAddress?: string;
    } | null;
    roomLabelDrafts?: Record<string, string>;
    rooms?: Array<{
      roomKey: string;
      displayName: string;
      sourceDisplayName?: string;
      baselineMaterialLabel?: string;
      baselineColorLabel?: string | null;
      measurementsLocked?: boolean;
      measurementStatus?: string | null;
      countertopIncluded?: boolean;
      backsplashIncluded?: boolean;
      backsplashHeightMode?: string | null;
      customerMayEditLabel?: boolean;
      locked?: boolean;
    }>;
    groups?: Array<{ id: string; groupKey: string; displayLabel: string; required?: boolean }>;
    options?: ConfigOption[];
    materials?: CustomerMaterial[];
    currentSelections?: Record<string, number>;
    roomNotes?: Record<string, string>;
    projectNote?: string | null;
    latestCalculation?: {
      baselineDisplayTotal?: number;
      configuredDisplayTotal?: number;
      displayDelta?: number;
      rooms?: Array<{
        roomKey?: string;
        displayName?: string;
        selectedMaterialLabel?: string;
        chargeableCounterSf?: number;
      }>;
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
  let res: Response;
  try {
    res = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch {
    const err = new Error("Estimate unavailable") as Error & {
      status?: number;
      diagnosticCode?: string;
    };
    err.diagnosticCode = "DE-EXCHANGE-NETWORK";
    throw err;
  }
  if (!res.ok) {
    let diagnosticCode = "DE-EXCHANGE-404";
    try {
      const body = (await res.json()) as { diagnosticCode?: string; code?: string };
      if (body?.diagnosticCode === "DE-ORIGIN") diagnosticCode = "DE-ORIGIN";
      else if (body?.code === "origin_rejected" || body?.code === "origin_not_configured") {
        diagnosticCode = "DE-ORIGIN";
      } else if (res.status === 404 || res.status === 403) {
        diagnosticCode = "DE-EXCHANGE-404";
      } else {
        diagnosticCode = "DE-STATE";
      }
    } catch {
      /* ignore body parse */
    }
    const err = new Error("Estimate unavailable") as Error & {
      status?: number;
      diagnosticCode?: string;
    };
    err.status = res.status;
    err.diagnosticCode = diagnosticCode;
    throw err;
  }
  const setCookiePresent = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie().length > 0
    : Boolean(res.headers.get("set-cookie"));
  // Browsers hide Set-Cookie from JS; absence here is not conclusive. Prefer body shape.
  const body = (await res.json()) as ConfigurationState & { ok?: boolean };
  if (!body || (body.ok === false)) {
    const err = new Error("Estimate unavailable") as Error & { diagnosticCode?: string };
    err.diagnosticCode = "DE-STATE";
    throw err;
  }
  if (!body.estimate && body.lifecycle !== "active") {
    // Baseline-only sessions still carry estimate when publication-only.
    // Missing both estimate and configuration is a state/render failure.
    if (!body.configuration) {
      const err = new Error("Estimate unavailable") as Error & { diagnosticCode?: string };
      err.diagnosticCode = setCookiePresent ? "DE-STATE" : "DE-COOKIE";
      throw err;
    }
  }
  return body as ConfigurationState;
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

export async function fetchConfiguration(): Promise<ConfigurationState> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}/api/public-digital-estimate/v2/configuration`, {
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
  customerInfoDraft?: {
    customerName?: string;
    projectName?: string;
    phone?: string;
    email?: string;
    projectAddress?: string;
  } | null;
  roomLabelDrafts?: Record<string, string> | null;
  roomNotes?: Record<string, string> | null;
  projectNote?: string | null;
}): Promise<{
  ok: boolean;
  session?: { rowVersion: number };
  calculation?: ConfigurationState["configuration"] extends infer C
    ? C extends { latestCalculation?: infer L }
      ? L
      : unknown
    : unknown;
  customerInfoDraft?: unknown;
  roomLabelDrafts?: Record<string, string>;
  roomNotes?: Record<string, string>;
  projectNote?: string | null;
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

export async function recalculateConfiguration(payload: {
  items: Array<{ optionKey: string; quantity: number }>;
  expectedRowVersion: number;
  idempotencyKey: string;
}): ReturnType<typeof saveConfigurationSelections> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}/api/public-digital-estimate/v2/recalculate`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = "Unable to update estimate";
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
  return (await res.json()) as Awaited<ReturnType<typeof saveConfigurationSelections>>;
}

export type CustomerReviewRequest = {
  requestReference: string;
  status: string;
  statusLabel: string;
  requestedAt: string;
  pricingValidThrough?: string | null;
  baselineDisplayTotal?: number | null;
  configuredDisplayTotal?: number | null;
  displayDelta?: number | null;
  selectedOptions?: Array<{ optionKey?: string; displayLabel?: string; quantity?: number }>;
  customerNote?: string | null;
  nonAcceptanceNotice?: string;
  currentSelectionsDifferFromSubmitted?: boolean;
  emailSent?: boolean;
};

export async function submitReviewRequest(payload: {
  expectedRowVersion: number;
  expectedSelectionHash?: string;
  idempotencyKey: string;
  customerNote?: string;
}): Promise<{ ok: boolean; reused?: boolean; reviewRequest: CustomerReviewRequest; disclaimer?: string }> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}/api/public-digital-estimate/v2/review-requests`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = "Unable to send for review";
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
    reused?: boolean;
    reviewRequest: CustomerReviewRequest;
    disclaimer?: string;
  };
}

export async function fetchCurrentReviewRequest(): Promise<{
  ok: boolean;
  reviewRequest: CustomerReviewRequest | null;
}> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}/api/public-digital-estimate/v2/review-requests/current`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const err = new Error("Estimate unavailable");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as { ok: boolean; reviewRequest: CustomerReviewRequest | null };
}

export type PublicEstimateAccess = {
  status: "active" | "pricing_expired" | string;
  pricingValidThrough?: string | null;
  expiresAt?: string | null;
};

export type PublicEstimateResponse = {
  ok: true;
  estimate: PublicEstimate;
  access: PublicEstimateAccess;
};

/**
 * Shared public access contract for reusable customer links.
 * GET /api/public-digital-estimate/v1/:token — does not consume the token.
 */
export async function fetchPublicEstimateByToken(token: string): Promise<PublicEstimateResponse> {
  const base = apiBaseUrl();
  const res = await fetch(
    `${base}/api/public-digital-estimate/v1/${encodeURIComponent(token)}`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    const err = new Error("unavailable") as Error & { status?: number; diagnosticCode?: string };
    err.status = res.status;
    err.diagnosticCode = res.status === 410 ? "DE-ACCESS-GONE" : "DE-PUBLIC-404";
    throw err;
  }
  const body = (await res.json()) as {
    ok?: boolean;
    estimate?: PublicEstimate;
    access?: PublicEstimateAccess;
  };
  if (!body.ok || !body.estimate) throw new Error("unavailable");
  return {
    ok: true,
    estimate: body.estimate,
    access: body.access || {
      status: "active",
      pricingValidThrough: body.estimate.pricingValidThrough ?? null,
    },
  };
}

/** @deprecated Prefer fetchPublicEstimateByToken — kept for older call sites. */
export async function fetchLegacyPathEstimate(token: string): Promise<PublicEstimate> {
  const body = await fetchPublicEstimateByToken(token);
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
