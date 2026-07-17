/**
 * Normalize a public estimate DTO for safe React rendering.
 *
 * Production v2 responses must expose the inner estimate object. Historical
 * mis-wrapping nested `{ ok, estimate, access }` under `state.estimate`; unwrap
 * that shape so resume still works across deployments. Optional arrays default
 * to []. Authoritative totals that are non-numeric are rejected (never coerced to 0).
 */

import type { PublicEstimate } from "./publicConfigApi";

export class EstimateRenderError extends Error {
  diagnosticCode: string;
  stage: string;

  constructor(diagnosticCode = "DE-RENDER-BASELINE", stage = "baseline") {
    super("Estimate render failed");
    this.name = "EstimateRenderError";
    this.diagnosticCode = diagnosticCode;
    this.stage = stage;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asNullableNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Unwrap accidental v1-style envelope nested under configuration state.estimate.
 */
export function unwrapEstimatePayload(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;
  // Nested wrapper: { ok, estimate, access } mistakenly assigned as estimate
  if (
    isPlainObject(raw.estimate) &&
    (raw.ok === true || "access" in raw) &&
    !("documentTitle" in raw) &&
    !("totals" in raw)
  ) {
    return raw.estimate;
  }
  return raw;
}

/**
 * @returns normalized PublicEstimate
 * @throws EstimateRenderError when required structure is unusable
 */
export function normalizePublicEstimate(raw: unknown): PublicEstimate {
  const unwrapped = unwrapEstimatePayload(raw);
  if (!isPlainObject(unwrapped)) {
    throw new EstimateRenderError("DE-RENDER-BASELINE", "baseline");
  }

  const projectIn = isPlainObject(unwrapped.project) ? unwrapped.project : {};
  const totalsIn = isPlainObject(unwrapped.totals) ? unwrapped.totals : null;
  const disclosuresIn = isPlainObject(unwrapped.disclosures) ? unwrapped.disclosures : {};

  // Totals object is required for authoritative display. Missing object → fail closed.
  // Null estimatedProjectTotal is allowed (shows em dash); non-finite values are not coerced to 0.
  if (!totalsIn) {
    throw new EstimateRenderError("DE-RENDER-BASELINE", "baseline-totals");
  }
  if (
    "estimatedProjectTotal" in totalsIn &&
    totalsIn.estimatedProjectTotal != null &&
    asNullableNumber(totalsIn.estimatedProjectTotal) == null
  ) {
    throw new EstimateRenderError("DE-RENDER-BASELINE", "baseline-totals");
  }

  const roomsRaw = Array.isArray(unwrapped.rooms) ? unwrapped.rooms : [];
  const lineItemsRaw = Array.isArray(unwrapped.lineItems) ? unwrapped.lineItems : [];
  const notesRaw = Array.isArray(unwrapped.notes) ? unwrapped.notes : [];

  return {
    documentTitle: asNullableString(unwrapped.documentTitle) || "Digital Estimate",
    quoteNumber: asNullableString(unwrapped.quoteNumber),
    revisionLabel: asNullableString(unwrapped.revisionLabel),
    revisionNumber: asNullableNumber(unwrapped.revisionNumber),
    publishedAt: asNullableString(unwrapped.publishedAt),
    pricingValidThrough: asNullableString(unwrapped.pricingValidThrough),
    project: {
      customerName: asNullableString(projectIn.customerName),
      projectName: asNullableString(projectIn.projectName),
      projectAddress: asNullableString(projectIn.projectAddress)
    },
    rooms: roomsRaw.map((room) => {
      const r = isPlainObject(room) ? room : {};
      return {
        name: asNullableString(r.name),
        summaryLines: Array.isArray(r.summaryLines)
          ? r.summaryLines.map((s) => asNullableString(s)).filter((s): s is string => Boolean(s))
          : [],
        materialLabel: asNullableString(r.materialLabel),
        colorLabel: asNullableString(r.colorLabel)
      };
    }),
    lineItems: lineItemsRaw.map((item) => {
      const l = isPlainObject(item) ? item : {};
      return {
        label: asNullableString(l.label),
        amount: asNullableNumber(l.amount)
      };
    }),
    totals: {
      estimatedProjectTotal: asNullableNumber(totalsIn.estimatedProjectTotal),
      currency: asNullableString(totalsIn.currency) || "USD",
      rounding: asNullableString(totalsIn.rounding) || "integer_usd"
    },
    notes: notesRaw.map((n) => asNullableString(n)).filter((n): n is string => Boolean(n)),
    disclosures: {
      version: asNullableString(disclosuresIn.version),
      text: asNullableString(disclosuresIn.text)
    }
  };
}
