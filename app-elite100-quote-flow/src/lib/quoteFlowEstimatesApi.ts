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
