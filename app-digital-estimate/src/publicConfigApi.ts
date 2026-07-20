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
  /** Optional role from API (backsplash, sink, faucet, …); else derived from optionKey prefix. */
  role?: string | null;
  availabilityText?: string | null;
  productId?: string | null;
  variantId?: string | null;
  pieceKey?: string | null;
  pieceDisplayName?: string | null;
  sourceKind?: string | null;
  visibleSellPrice?: number | null;
  visibleDelta?: number | null;
  priceEffectLabel?: string | null;
  accessoryKind?: string | null;
  compatibleFamilyIds?: string[];
  /** stock | special_order from Product Catalog (customer-safe). */
  catalogAvailability?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  finish?: string | null;
  sku?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  imageStatus?: string | null;
  imageMatchType?: string | null;
  variants?: ConfigProductVariant[];
};

export type ConfigProductVariant = {
  variantId: string;
  sku?: string | null;
  displayName?: string | null;
  finish?: string | null;
  color?: string | null;
  availability?: string | null;
  availabilityText?: string | null;
  optionKey?: string | null;
  imageUrl?: string | null;
};

/** Customer-safe catalog product from configuration envelope / API — never invent client-side. */
export type ConfigProduct = {
  productId: string;
  category: string;
  subcategory?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  sku?: string | null;
  displayName: string;
  description?: string | null;
  finish?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  imageStatus?: string | null;
  imageMatchType?: string | null;
  availability?: string | null;
  availabilityText?: string | null;
  customerVisible?: boolean;
  active?: boolean;
  roomEligibility?: string[];
  optionKey?: string | null;
  variants?: ConfigProductVariant[];
  pricingTreatment?: string | null;
  visibleSellPrice?: number | null;
  visibleDelta?: number | null;
};

export type ProductDraft = {
  source: "none" | "customer_provided" | "esf" | string;
  optionKey?: string | null;
  productId?: string | null;
  variantId?: string | null;
  variantSku?: string | null;
  manufacturer?: string;
  model?: string;
  finish?: string;
  notes?: string;
  displayLabel?: string | null;
  availability?: string | null;
  /** Customer-provided faucet hole count (optional; missing → structured requirement). */
  holeCount?: string | number | null;
};

export type RoomProductDrafts = {
  sink?: ProductDraft | null;
  faucet?: ProductDraft | null;
  accessories?: ProductDraft[];
};

export type BacksplashDraft = {
  mode: "none" | "standard_4in" | "full_height" | "custom_height" | string;
  optionKey?: string | null;
  /** Preferred API field */
  requestedHeightInches?: number | null;
  /** @deprecated alias — prefer requestedHeightInches */
  customHeightIn?: number | null;
  note?: string;
};

export type MissingInformationRequirement = {
  code: string;
  roomKey?: string;
  message: string;
  customerCopy: string;
  severity?: "info" | "review";
  blocksSave?: boolean;
};

export type CustomerMaterial = {
  materialId: string;
  displayName: string;
  imageAssetPath?: string | null;
  imageFullPath?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  imageStatus?: string | null;
  textureFallbackStatus?: string | null;
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
    /** Optional customer-safe catalog products from API (sinks/faucets/etc.). Never invent client-side. */
    products?: ConfigProduct[];
    /** Persisted plumbing drafts (manufacturer/model/variant) — server key customerProductDrafts */
    customerProductDrafts?: Record<string, RoomProductDrafts>;
    /** @deprecated prefer customerProductDrafts */
    productDrafts?: Record<string, RoomProductDrafts>;
    backsplashDrafts?: Record<string, BacksplashDraft>;
    missingInformationRequirements?: MissingInformationRequirement[];
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
  // Browsers hide Set-Cookie from JS; absence here is not conclusive. Prefer body shape.
  const body = (await res.json()) as ConfigurationState & {
    ok?: boolean;
    sessionCookie?: { established?: boolean };
  };
  if (!body || body.ok === false) {
    const err = new Error("Estimate unavailable") as Error & { diagnosticCode?: string };
    err.diagnosticCode = "DE-STATE";
    throw err;
  }
  if (!body.estimate && body.lifecycle !== "active") {
    if (!body.configuration) {
      const err = new Error("Estimate unavailable") as Error & { diagnosticCode?: string };
      err.diagnosticCode = "DE-STATE";
      throw err;
    }
  }

  // Verify the browser stored/sends the session cookie (separate request = serverless reality).
  // One soft check only — failure is nonfatal here; save path re-exchanges once.
  try {
    const verify = await fetch(`${base}/api/public-digital-estimate/v2/session`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (verify.ok) {
      const verified = (await verify.json()) as ConfigurationState;
      if (verified?.lifecycle === "active" && verified.configuration) {
        return verified;
      }
    }
  } catch {
    /* keep exchange body */
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

export type ConfigurationSaveError = Error & {
  status?: number;
  code?: string;
  stage?: string;
  diagnosticCode?: string;
  /** True when the estimate link/session is gone (revoked/expired/unavailable). */
  lifecycleFatal?: boolean;
};

/**
 * Classify a failed selections/review response.
 * Save/network failures must not be treated as full estimate unavailability.
 * Fatal only for explicit publication lifecycle codes — never for bare 404 or
 * message text containing "unavailable".
 */
export function classifyConfigurationMutationError(
  status: number,
  body: {
    error?: string;
    code?: string;
    stage?: string;
    diagnosticCode?: string;
    recoverable?: boolean;
    lifecycleFatal?: boolean;
  } | null,
): Pick<ConfigurationSaveError, "code" | "stage" | "diagnosticCode" | "lifecycleFatal"> & {
  message: string;
} {
  const code = String(body?.code || "").trim();
  const stage = String(body?.stage || "").trim();
  const diagnosticCode = String(body?.diagnosticCode || "").trim();
  const message = String(body?.error || "").trim() || "Unable to save";

  const FATAL_CODES = new Set([
    "publication_revoked",
    "publication_expired",
    "publication_unavailable",
    "publication_superseded",
  ]);

  if (body?.lifecycleFatal === true || FATAL_CODES.has(code) || status === 410) {
    return {
      message: message || "This estimate is unavailable.",
      code: code || "publication_unavailable",
      stage: stage || "lifecycle",
      diagnosticCode: diagnosticCode || "DE-EXCHANGE-404",
      lifecycleFatal: true,
    };
  }

  if (
    code === "session_required" ||
    code === "session_not_found" ||
    code === "session_invalid" ||
    diagnosticCode === "DE-COOKIE" ||
    status === 401
  ) {
    return {
      message: message === "Estimate unavailable" ? "Please refresh and try again" : message,
      code: code || "session_required",
      stage: stage || "session",
      diagnosticCode: diagnosticCode || "DE-COOKIE",
      lifecycleFatal: false,
    };
  }

  if (
    code === "unknown_option" ||
    code === "invalid_selection" ||
    code === "option_not_allowed" ||
    code === "unresolved_product" ||
    code === "forbidden_caller_authority" ||
    code === "idempotency_required" ||
    code === "concurrency_required" ||
    code === "configuration_unavailable" ||
    code === "persistence_failed" ||
    code === "no_current_review_request"
  ) {
    return {
      message:
        code === "invalid_selection" || code === "unknown_option" || code === "option_not_allowed"
          ? message || "That selection is unavailable. Please choose another option."
          : message || "That selection is unavailable",
      code,
      stage: stage || "selection",
      diagnosticCode:
        diagnosticCode ||
        (code === "option_not_allowed" || code === "invalid_selection" || code === "unknown_option"
          ? "DE-OPTION-NOT-ALLOWED"
          : "DE-SAVE"),
      lifecycleFatal: false,
    };
  }

  if (code === "row_version_conflict" || code === "stale_configuration" || status === 409) {
    return {
      message: message || "Please refresh and try again",
      code: code || "stale_configuration",
      stage: stage || "selection",
      diagnosticCode: diagnosticCode || "DE-CONFIGURATION-STALE",
      lifecycleFatal: false,
    };
  }

  // Bare 404 / selection-stage unavailable / HTML route miss — keep configure UI.
  return {
    message:
      status === 404 && !body
        ? "Unable to save right now. Please try again."
        : message || "Unable to save right now. Please try again.",
    code: code || (status === 404 ? "save_route_or_server" : "save_failed"),
    stage: stage || "selection",
    diagnosticCode: diagnosticCode || "DE-SAVE",
    lifecycleFatal: false,
  };
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
  customerProductDrafts?: Record<string, RoomProductDrafts> | null;
  /** @deprecated prefer customerProductDrafts */
  productDrafts?: Record<string, RoomProductDrafts> | null;
  backsplashDrafts?: Record<string, BacksplashDraft> | null;
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
  customerProductDrafts?: Record<string, RoomProductDrafts>;
  productDrafts?: Record<string, RoomProductDrafts>;
  backsplashDrafts?: Record<string, BacksplashDraft>;
  missingInformationRequirements?: MissingInformationRequirement[];
}> {
  const base = apiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/api/public-digital-estimate/v2/selections`, {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    const err = new Error("Unable to save right now. Please try again.") as ConfigurationSaveError;
    err.status = 0;
    err.code = "network_failure";
    err.stage = "selection";
    err.diagnosticCode = "DE-EXCHANGE-NETWORK";
    err.lifecycleFatal = false;
    throw err;
  }
  if (!res.ok) {
    let body: { error?: string; code?: string; stage?: string; diagnosticCode?: string } | null =
      null;
    try {
      body = (await res.json()) as {
        error?: string;
        code?: string;
        stage?: string;
        diagnosticCode?: string;
      };
    } catch {
      body = null;
    }
    const classified = classifyConfigurationMutationError(res.status, body);
    const err = new Error(classified.message) as ConfigurationSaveError;
    err.status = res.status;
    err.code = classified.code;
    err.stage = classified.stage;
    err.diagnosticCode = classified.diagnosticCode;
    err.lifecycleFatal = classified.lifecycleFatal;
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
  let res: Response;
  try {
    res = await fetch(`${base}/api/public-digital-estimate/v2/recalculate`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    const err = new Error("Unable to update estimate") as ConfigurationSaveError;
    err.status = 0;
    err.code = "network_failure";
    err.lifecycleFatal = false;
    throw err;
  }
  if (!res.ok) {
    let body: { error?: string; code?: string; stage?: string; diagnosticCode?: string } | null =
      null;
    try {
      body = (await res.json()) as {
        error?: string;
        code?: string;
        stage?: string;
        diagnosticCode?: string;
      };
    } catch {
      body = null;
    }
    const classified = classifyConfigurationMutationError(res.status, body);
    const err = new Error(classified.message || "Unable to update estimate") as ConfigurationSaveError;
    err.status = res.status;
    err.code = classified.code;
    err.stage = classified.stage;
    err.diagnosticCode = classified.diagnosticCode;
    err.lifecycleFatal = classified.lifecycleFatal;
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
  let res: Response;
  try {
    res = await fetch(`${base}/api/public-digital-estimate/v2/review-requests`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    const err = new Error("Unable to send for review") as ConfigurationSaveError;
    err.status = 0;
    err.code = "network_failure";
    err.lifecycleFatal = false;
    throw err;
  }
  if (!res.ok) {
    let body: { error?: string; code?: string; stage?: string; diagnosticCode?: string } | null =
      null;
    try {
      body = (await res.json()) as {
        error?: string;
        code?: string;
        stage?: string;
        diagnosticCode?: string;
      };
    } catch {
      body = null;
    }
    const classified = classifyConfigurationMutationError(res.status, body);
    const err = new Error(classified.message || "Unable to send for review") as ConfigurationSaveError;
    err.status = res.status;
    err.code = classified.code;
    err.stage = classified.stage;
    err.diagnosticCode = classified.diagnosticCode;
    err.lifecycleFatal = classified.lifecycleFatal;
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
  try {
    const res = await fetch(`${base}/api/public-digital-estimate/v2/review-requests/current`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // Never treat missing/current-review errors as estimate lifecycle failure.
      return { ok: true, reviewRequest: null };
    }
    const body = (await res.json()) as { ok?: boolean; reviewRequest?: CustomerReviewRequest | null };
    return { ok: true, reviewRequest: body.reviewRequest ?? null };
  } catch {
    return { ok: true, reviewRequest: null };
  }
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
