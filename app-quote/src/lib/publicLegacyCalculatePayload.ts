/**
 * Public quote wizard → POST /api/public-quote/calculate (and submit) body shape.
 * Backend `computePublicConsumerEstimatesByGroup` only fills `estimates_by_group` for the
 * **legacy** area path. It explicitly returns empty tiers when `engine === "rooms"` and
 * `rooms.length > 0` (room-by-room public comparison not implemented server-side).
 *
 * Keep `engine: "legacy"` and omit `rooms` for live public estimates.
 */

export type PublicLegacyCalcAddOns = Record<string, number | string>;

export type PublicLegacyCalculateBody = {
  quoteSource: string;
  materialGroup: string;
  areas: { countertopSqft: number; backsplashSqft: number };
  addOns: PublicLegacyCalcAddOns;
  engine: "legacy";
  retailMarkupPercent: number;
  retailMethod: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  project_type?: string;
  project_address?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** Optional mirror of tear-out intent; math still uses addOns.tearout. */
  tearOut?: boolean;
};

/**
 * Build the JSON body for public calculate/submit (legacy areas only — no `rooms`, no room engine).
 */
export function buildPublicLegacyCalculateBody(params: {
  materialGroup: string;
  countertopSqft: number;
  backsplashSqft: number;
  addOns: PublicLegacyCalcAddOns;
  retailMarkupPercent: number;
  retailMethod: string;
  tearOut?: boolean;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  project_type?: string;
  project_address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): PublicLegacyCalculateBody {
  return {
    quoteSource: "public_retail",
    materialGroup: params.materialGroup,
    areas: {
      countertopSqft: params.countertopSqft,
      backsplashSqft: params.backsplashSqft
    },
    addOns: params.addOns,
    engine: "legacy",
    retailMarkupPercent: params.retailMarkupPercent,
    retailMethod: params.retailMethod,
    customer_name: params.customer_name,
    customer_email: params.customer_email,
    customer_phone: params.customer_phone,
    project_type: params.project_type,
    project_address: params.project_address,
    city: params.city,
    state: params.state,
    zip: params.zip,
    ...(params.tearOut !== undefined ? { tearOut: params.tearOut } : {})
  };
}

/**
 * Returns human-readable issues if the payload would trigger the server room-engine guard
 * (empty `estimates_by_group` on live calculate). Use in dev or tests.
 */
export function publicLegacyCalculatePayloadIssues(payload: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const engine = String(payload.engine ?? "");
  const rooms = payload.rooms;
  if (engine === "rooms") errs.push('engine must be "legacy" for public live estimates (not "rooms").');
  if (Array.isArray(rooms) && rooms.length > 0) {
    errs.push("rooms must be omitted or empty for public live estimates — use areas only.");
  }
  return errs;
}
