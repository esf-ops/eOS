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
  /** Kitchen sink cutout count (physical fabrication scope). */
  kitchenSinkCutouts?: number;
  vanityBarSinkCutouts?: number;
  cooktopCutouts?: number;
  outletCutouts?: number;
  cutouts?: Array<{ type?: string; quantity?: number; source?: string }>;
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
  cutoutLines?: Array<{ label: string; amount: number | null; quantity?: number | null }>;
  fabricationAddOns?: Record<string, number | unknown>;
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

export type QuoteFlowDigitalEstimatePayload = {
  ok?: boolean;
  estimateId?: string;
  revision?: number | null;
  status?: string | null;
  publishStatus?: { key: string; label: string };
  canPublish?: boolean;
  checklist?: QuoteFlowReviewChecklistItem[];
  blockers?: string[];
  warnings?: string[];
  publishSummary?: {
    estimateName?: string | null;
    customerEstimateTotal?: number | null;
    customerFacingLineCount?: number;
    internalOnlyLineCount?: number;
    approvedAt?: string | null;
    calculatedAt?: string | null;
  };
  reviewStatus?: { key: string; label: string };
  reReviewRequired?: boolean;
  reReviewMessage?: string | null;
  customerFacingLines?: Array<{
    id?: string;
    label?: string;
    type?: string;
    amount?: number;
    visibility?: string;
  }>;
  internalOnlyLines?: Array<{
    id?: string;
    label?: string;
    type?: string;
    amount?: number;
    visibility?: string;
  }>;
  internalOnlyExcluded?: boolean;
  customerPreview?: {
    customerDisplayTotal?: number | null;
    lineItems?: Array<{ label?: string; amount?: number }>;
    roomCount?: number;
  } | null;
  publication?: {
    publicationId?: string | null;
    customerUrl?: string | null;
    linkStatus?: string | null;
    publishedAt?: string | null;
    status?: string | null;
  } | null;
  customerUrl?: string | null;
  accessToken?: string | null;
  message?: string;
  reused?: boolean;
  sideEffects?: Record<string, boolean>;
};

export async function fetchQuoteFlowDigitalEstimate(token: string, estimateId: string) {
  return apiGet(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/digital-estimate`,
    token
  ) as Promise<QuoteFlowDigitalEstimatePayload>;
}

export async function publishQuoteFlowDigitalEstimate(token: string, estimateId: string) {
  return apiFetch(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/digital-estimate/publish`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ confirm: true })
    }
  ) as Promise<QuoteFlowDigitalEstimatePayload>;
}

export type QuoteFlowActivityTimelineEvent = {
  id?: string;
  type?: string;
  label?: string;
  at?: string | null;
  detail?: string | null;
  tracked?: boolean;
};

export type QuoteFlowActivityPublication = {
  publicationId?: string | null;
  publishedAt?: string | null;
  publishedByUserId?: string | null;
  revisionLabel?: string | null;
  revisionNumber?: number | null;
  status?: string | null;
  state?: string | null;
  customerUrl?: string | null;
  linkStatus?: string | null;
};

export type QuoteFlowActivitySelectionComparisonRow = {
  room?: string | null;
  category?: string;
  publishedSelection?: string;
  customerSelection?: string;
  priceDelta?: number | null;
  status?: string | null;
};

export type QuoteFlowActivitySelectionReview = {
  hasSavedSelections?: boolean;
  lastSavedAt?: string | null;
  reviewRequested?: boolean;
  requiresEliteReview?: boolean;
  selectionOnlySubmitted?: boolean;
  reviewKind?: string | null;
  pricedSelections?: {
    rooms?: Array<{
      roomKey?: string | null;
      roomName?: string | null;
      material?: { label?: string | null; group?: string | null } | null;
      edge?: { label?: string | null } | null;
      backsplash?: { label?: string | null } | null;
      sink?: { label?: string | null } | null;
      faucet?: { label?: string | null } | null;
      accessories?: Array<{ label?: string | null; quantity?: number }>;
      specialty?: Array<{ label?: string | null; quantity?: number }>;
      notes?: string | null;
    }>;
    selectionChangeCount?: number;
    selectionChangeItems?: Array<{ kind?: string; label?: string }>;
  };
  scopeRequests?: {
    count?: number;
    items?: Array<{ kind?: string; label?: string }>;
    projectNote?: string | null;
  };
  totals?: {
    publishedBaselineTotal?: number | null;
    customerEstimateTotal?: number | null;
    difference?: number | null;
  };
  selectionComparison?: {
    rows?: QuoteFlowActivitySelectionComparisonRow[];
    totalDelta?: number | null;
  };
  staffDiagnostics?: Array<{ code?: string; message?: string }>;
};

export type QuoteFlowAcceptanceSummary = {
  id?: string | null;
  acceptedAt?: string | null;
  estimateRevision?: number | null;
  publicationId?: string | null;
  customerDisplayTotal?: number | null;
  publishedBaselineTotal?: number | null;
  difference?: number | null;
  acceptedAsConfigured?: boolean;
  acceptedAsPublished?: boolean;
  selectionSource?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  materialGroup?: string | null;
};

export type QuoteFlowAcceptedReportRoom = {
  roomId?: string | null;
  roomName?: string | null;
  roomType?: string | null;
  material?: string | null;
  priceGroup?: string | null;
  edgeProfile?: string | null;
  countertopMeasuredSf?: number | null;
  countertopRoundedSf?: number | null;
  backsplash?: {
    selected?: boolean;
    heightIn?: number | null;
    measuredSf?: number | null;
    roundedSf?: number | null;
  } | null;
  sink?: string | null;
  sinkCutout?: {
    kitchenSinkQty?: number;
    kitchenSinkCharge?: number | null;
  } | null;
  faucet?: string | null;
  accessories?: Array<{ label?: string | null; quantity?: number }>;
  specialty?: Array<{ label?: string | null; quantity?: number }>;
  customerNote?: string | null;
  roomSubtotal?: number | null;
  pieces?: Array<{
    pieceId?: string | null;
    name?: string | null;
    lengthIn?: number | null;
    depthIn?: number | null;
    quantity?: number | null;
    rawSquareFeet?: number | null;
    roundedSquareFeet?: number | null;
    openEdgeLf?: number | null;
    included?: boolean;
    isBacksplash?: boolean;
  }>;
  customerFacingLines?: Array<{
    label?: string | null;
    amount?: number | null;
    internalOnly?: boolean;
  }>;
  internalOnlyLines?: Array<{
    label?: string | null;
    amount?: number | null;
    internalOnly?: boolean;
  }>;
  roundingCheck?: {
    sumRoundedIncludedCountertopPieces?: number;
    roomCountertopRoundedSf?: number;
    matchesRoomTotal?: boolean;
  };
};

export type QuoteFlowAcceptedReportPayload = {
  ok?: boolean;
  status?: "not_accepted" | "accepted" | string;
  statusLabel?: string;
  acceptance?: QuoteFlowAcceptanceSummary | null;
  report?: {
    purpose?: string;
    header?: {
      estimateName?: string | null;
      customerName?: string | null;
      customerEmail?: string | null;
      intakeCaseId?: string | null;
      acceptedAt?: string | null;
      publicationId?: string | null;
      estimateRevision?: number | null;
      acceptedCustomerTotal?: number | null;
      publishedEstimateTotal?: number | null;
      difference?: number | null;
      selectionSource?: string | null;
      pricingBasis?: string | null;
      priceGroup?: string | null;
      materialSummary?: string | null;
      notice?: string | null;
      quickbooksInvoiceCreated?: boolean;
    };
    rooms?: QuoteFlowAcceptedReportRoom[];
    projectSquareFeet?: {
      countertopMeasuredSf?: number | null;
      countertopRoundedSf?: number | null;
      backsplashRoundedSf?: number | null;
      roundingRule?: string | null;
    };
    lineItems?: {
      customerFacing?: Array<{ label?: string | null; amount?: number | null; internalOnly?: boolean }>;
      internalOnly?: Array<{ label?: string | null; amount?: number | null; internalOnly?: boolean }>;
      notes?: string | null;
    };
    invoicePreparation?: {
      acceptedCustomerTotal?: number | null;
      materialCountertopTotal?: number | null;
      backsplashTotal?: number | null;
      sinkCutoutTotal?: number | null;
      faucetAccessoriesTotal?: number | null;
      customerFacingCustomLineTotal?: number | null;
      materialUseTax?: number | null;
      internalOnlyAdjustmentsTotal?: number | null;
      exactInternalTotal?: number | null;
      suggestedQuickBooksNotes?: string | null;
    };
  } | null;
  sideEffects?: Record<string, boolean>;
};

export type QuoteFlowActivityPayload = {
  ok?: boolean;
  estimateId?: string;
  revision?: number | null;
  intakeCaseId?: string | null;
  estimateName?: string | null;
  summary?: {
    officialStatus?: { key?: string; label?: string };
    reviewStatus?: { key?: string; label?: string };
    publishStatus?: { key?: string; label?: string };
    latestPublication?: QuoteFlowActivityPublication | null;
    customerLinkAvailable?: boolean;
    customerUrl?: string | null;
    customerSelections?: {
      key?: string;
      label?: string;
      detail?: string | null;
      needsStaffReview?: boolean;
    };
    customerSelectedTotal?: number | null;
    publishedCustomerTotal?: number | null;
    customerSelectionDifference?: number | null;
    customerChangesReceived?: boolean;
    needsStaffReview?: boolean;
    acceptanceStatus?: {
      key?: string;
      label?: string;
      acceptedAt?: string | null;
      customerDisplayTotal?: number | null;
      publishedBaselineTotal?: number | null;
      difference?: number | null;
      selectionSource?: string | null;
    };
    needsRereview?: boolean;
    needsRepublish?: boolean;
    workflowState?: string;
  };
  timeline?: QuoteFlowActivityTimelineEvent[];
  publicationHistory?: QuoteFlowActivityPublication[];
  customerSelections?: {
    key?: string;
    label?: string;
    detail?: string | null;
    needsStaffReview?: boolean;
  };
  selectionReview?: QuoteFlowActivitySelectionReview | null;
  acceptance?: QuoteFlowAcceptanceSummary | null;
  acceptedReport?: QuoteFlowAcceptedReportPayload | null;
  unavailableNotes?: string[];
  sideEffects?: Record<string, boolean>;
};

export async function fetchQuoteFlowEstimateActivity(token: string, estimateId: string) {
  return apiGet(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/activity`,
    token
  ) as Promise<QuoteFlowActivityPayload>;
}

export async function fetchQuoteFlowAcceptedReport(token: string, estimateId: string) {
  return apiGet(
    `/api/elite100-quote-flow/estimates/${encodeURIComponent(estimateId)}/accepted-report`,
    token
  ) as Promise<QuoteFlowAcceptedReportPayload>;
}
