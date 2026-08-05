import { apiFetch, apiGet } from "./api";

export type QuoteFlowScopeSummary = {
  roomCount: number;
  pieceCount: number;
  excludedPieceCount?: number;
  countertopSf?: number;
  backsplashSf?: number;
  openEdgeLf?: number;
  label: string;
};

export type QuoteFlowScopeSource = {
  key: string;
  label: string;
};

export type QuoteFlowEstimateListItem = {
  estimateId: string | null;
  intakeCaseId: string | null;
  takeoffJobId: string | null;
  estimateName?: string | null;
  displayName?: string | null;
  customerName: string | null;
  accountName: string | null;
  projectName: string | null;
  subject?: string | null;
  planFilename?: string | null;
  scopeSource?: QuoteFlowScopeSource;
  scopeSummary: QuoteFlowScopeSummary;
  status: { key: string; label: string; nextAction?: string };
  nextAction?: string | null;
  updatedAt: string | null;
  createdAt?: string | null;
  commercialStatus?: string | null;
};

export type QuoteFlowScopePiece = {
  id?: string;
  name?: string;
  pieceType?: string;
  lengthIn?: number;
  depthIn?: number;
  quantity?: number;
  included?: boolean;
  excluded?: boolean;
  finishedEdge?: Record<string, unknown>;
  finishedEdgeLf?: number;
  openEdgeLf?: number;
  exposedEdgeLf?: number;
  includeBacksplash?: boolean;
  [key: string]: unknown;
};

export type QuoteFlowScopeRoom = {
  id?: string;
  name?: string;
  roomType?: string;
  included?: boolean;
  pieces?: QuoteFlowScopePiece[];
  includeBacksplash?: boolean;
  backsplashHeightMode?: string;
  backsplashMeasuredLengthIn?: number;
  backsplashHeightIn?: number;
  backsplashNotes?: string;
  openEdgeMeasurementMode?: string;
  openEdgeLf?: number;
  [key: string]: unknown;
};

export type QuoteFlowEstimateDetail = QuoteFlowEstimateListItem & {
  scope: {
    rooms: QuoteFlowScopeRoom[];
    addOns?: Record<string, unknown>;
    projectName?: string | null;
    quoteFlowEstimateName?: string | null;
    source?: string | null;
    planFilename?: string | null;
  };
  revision?: number | null;
  sourceTakeoffResultId?: string | null;
};

export async function fetchQuoteFlowEstimates(token: string) {
  return apiGet("/api/elite100-quote-flow/estimates", token) as Promise<{
    ok: boolean;
    items: QuoteFlowEstimateListItem[];
    total?: number;
  }>;
}

export async function fetchQuoteFlowEstimateDetail(token: string, estimateId: string) {
  return apiGet(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}`,
    token
  ) as Promise<{
    ok: boolean;
    estimate: QuoteFlowEstimateDetail;
  }>;
}

export async function patchQuoteFlowEstimateScope(
  token: string,
  estimateId: string,
  scope: {
    rooms: QuoteFlowScopeRoom[];
    addOns?: Record<string, unknown>;
    projectName?: string;
    estimateName?: string;
    quoteFlowEstimateName?: string;
  }
) {
  return apiFetch(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/scope`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ scope })
    }
  ) as Promise<{
    ok: boolean;
    estimate: QuoteFlowEstimateDetail;
    message?: string;
    reused?: boolean;
    sideEffects?: Record<string, boolean>;
  }>;
}

export type QuoteFlowCustomLineItem = {
  id?: string;
  label: string;
  type: "charge" | "credit" | "note";
  visibility: "customer" | "internal";
  quantity?: number;
  unitAmount?: number;
  amount?: number;
  taxable?: boolean;
  category?: string;
  note?: string;
  sortOrder?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type QuoteFlowCustomLineSummary = {
  customerFacingChargesTotal?: number;
  customerFacingCreditsTotal?: number;
  internalOnlyChargesTotal?: number;
  internalOnlyCreditsTotal?: number;
  noteOnlyCount?: number;
  netCustomAdjustment?: number;
};

export type QuoteFlowEdgeStatus = {
  openEdgeLf?: number;
  profileSelected?: boolean;
  profileToken?: string | null;
  profileLabel?: string | null;
  profileDisplay?: string;
  chargeStatus?: "none" | "pending" | "included" | "charged";
  chargeLabel?: string | null;
  edgeAmount?: number | null;
  edgeLfPriced?: number | null;
};

export type QuoteFlowEditablePricing = {
  pricingBasis?: string;
  materialGroup?: string;
  materialGroupLabel?: string;
  accountAdjustment?: {
    active?: boolean;
    percentage?: number;
    reason?: string;
    source?: string;
    readOnly?: boolean;
    available?: boolean;
    spahnTrusted?: boolean;
  };
  estimateWideAdjustment?: {
    active?: boolean;
    percentage?: number;
    reason?: string;
    source?: string;
    editable?: boolean;
  };
  internalMarkupPercent?: number;
  internalMarkupEditable?: boolean;
  internalMarkupPlaceholder?: string | null;
  allowedPricingBases?: string[];
  allowedMaterialGroups?: string[];
  allowedInternalMarkupPercents?: number[];
};

export type QuoteFlowPricingResult = {
  available?: boolean;
  calculatedAt?: string | null;
  pricingVersion?: number | null;
  pricingEngine?: string | null;
  estimatedTotal?: number | null;
  exactInternalTotal?: number | null;
  customerDisplayTotal?: number | null;
  openEdgeAmount?: number | null;
  edgeStatus?: QuoteFlowEdgeStatus | null;
  customLineItems?: {
    customerFacing?: QuoteFlowCustomLineItem[];
    internalOnly?: QuoteFlowCustomLineItem[];
    summary?: QuoteFlowCustomLineSummary;
  };
  linePreview?: Array<{ label: string; amount: number | null }>;
  breakdown?: {
    measuredStoneSf?: number | null;
    billedStoneSf?: number | null;
    materialRatePerSf?: number | null;
    edgeLf?: number | null;
    openEdgeAmount?: number | null;
    pricingBasis?: string | null;
    materialGroup?: string | null;
  };
  warnings?: Array<{ code?: string | null; message?: string }>;
  unresolvedItems?: Array<{ code?: string | null; message?: string }>;
};

export type QuoteFlowPricingPayload = {
  ok?: boolean;
  estimateId?: string;
  revision?: number | null;
  status?: string | null;
  scopeSummary?: QuoteFlowScopeSummary;
  editablePricing?: QuoteFlowEditablePricing;
  customLineItems?: QuoteFlowCustomLineItem[];
  customLineSummary?: QuoteFlowCustomLineSummary;
  edgeStatus?: QuoteFlowEdgeStatus | null;
  lastCalculation?: QuoteFlowPricingResult | null;
  blockers?: string[];
  calculationNotes?: string[];
  staleReason?: string | null;
  pricingStale?: boolean;
  scopeChangedSinceCalculation?: boolean;
  message?: string;
  persisted?: boolean;
  sideEffects?: Record<string, boolean>;
};

export type QuoteFlowPricingDraftBody = {
  pricingBasis?: string;
  materialGroup?: string;
  estimateWideAdjustment?: QuoteFlowEditablePricing["estimateWideAdjustment"];
  internalMarkupPercent?: number;
  customLineItems?: QuoteFlowCustomLineItem[];
};

export async function fetchQuoteFlowEstimatePricing(token: string, estimateId: string) {
  return apiGet(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/pricing`,
    token
  ) as Promise<QuoteFlowPricingPayload>;
}

export async function patchQuoteFlowEstimatePricing(
  token: string,
  estimateId: string,
  pricing: QuoteFlowPricingDraftBody
) {
  return apiFetch(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/pricing`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ pricing })
    }
  ) as Promise<QuoteFlowPricingPayload>;
}

export async function calculateQuoteFlowEstimatePricing(
  token: string,
  estimateId: string,
  pricing?: QuoteFlowPricingDraftBody
) {
  return apiFetch(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/pricing/calculate`,
    token,
    {
      method: "POST",
      body: JSON.stringify(pricing ? { pricing } : {})
    }
  ) as Promise<QuoteFlowPricingPayload>;
}

export type QuoteFlowReviewChecklistItem = {
  id: string;
  label: string;
  severity: "passed" | "warning" | "blocker";
  detail?: string | null;
  passed?: boolean;
};

export type QuoteFlowReviewSummary = {
  estimateName?: string | null;
  source?: { key?: string; label?: string } | null;
  rooms?: number;
  pieces?: number;
  countertopSf?: number;
  backsplashSf?: number;
  openEdgeLf?: number;
  pricingBasis?: string | null;
  priceGroup?: string | null;
  priceGroupLabel?: string | null;
  customerEstimateTotal?: number | null;
  customerFacingAdjustments?: number;
  customerFacingChargesTotal?: number;
  customerFacingCreditsTotal?: number;
  internalOnlyAdjustments?: number;
  internalOnlyChargesTotal?: number;
  internalOnlyCreditsTotal?: number;
  exactInternalTotal?: number | null;
  calculatedAt?: string | null;
  edgeStatus?: QuoteFlowEdgeStatus | null;
};

export type QuoteFlowReviewPayload = {
  ok?: boolean;
  estimateId?: string;
  revision?: number | null;
  status?: string | null;
  reviewStatus?: { key: string; label: string };
  canApprove?: boolean;
  checklist?: QuoteFlowReviewChecklistItem[];
  blockers?: string[];
  warnings?: string[];
  reviewSummary?: QuoteFlowReviewSummary;
  approval?: {
    approvedAt?: string | null;
    approvedByUserId?: string | null;
    calculationFingerprint?: string | null;
    customerDisplayTotal?: number | null;
    exactInternalTotal?: number | null;
  } | null;
  reReviewRequired?: boolean;
  reReviewMessage?: string | null;
  message?: string;
  reused?: boolean;
  sideEffects?: Record<string, boolean>;
};

export async function fetchQuoteFlowEstimateReview(token: string, estimateId: string) {
  return apiGet(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/review`,
    token
  ) as Promise<QuoteFlowReviewPayload>;
}

export async function approveQuoteFlowEstimateReview(token: string, estimateId: string) {
  return apiFetch(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/review/approve`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ confirm: true })
    }
  ) as Promise<QuoteFlowReviewPayload>;
}

export async function reopenQuoteFlowEstimateReview(token: string, estimateId: string) {
  return apiFetch(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/review/reopen`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ confirm: true })
    }
  ) as Promise<QuoteFlowReviewPayload>;
}
