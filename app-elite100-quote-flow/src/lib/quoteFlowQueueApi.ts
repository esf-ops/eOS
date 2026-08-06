import { apiGet, apiPost } from "./api";
import type { QuoteFlowScopeRoom } from "./quoteFlowEstimatesApi";

export type QuoteFlowQueueItem = {
  takeoffJobId: string | null;
  intakeCaseId: string | null;
  estimateId: string | null;
  messageKey?: string | null;
  queueItemKey?: string | null;
  customerName: string | null;
  projectName: string | null;
  customerDisplay?: string | null;
  projectDisplay?: string | null;
  requestTitle?: string | null;
  defaultEstimateName?: string | null;
  estimateName?: string | null;
  senderLabel?: string | null;
  planFilename?: string | null;
  planLabel?: string | null;
  receivedAt?: string | null;
  returnedAt?: string | null;
  startedAt?: string | null;
  workflowStatus?: string;
  status: { key: string; label: string };
  group?: { key: string; label: string; sortOrder?: number };
  nextAction?: { key: string; label: string };
  summary?: {
    roomCount?: number | null;
    pieceCount?: number | null;
    totalSf?: number | null;
    label?: string | null;
  };
  failureReason?: string | null;
  alreadyScoped: boolean;
  reviewReady: boolean;
  archived?: boolean;
  archivedAt?: string | null;
  recentProcessing?: boolean;
  canCreateManualScope?: boolean;
  canReviewTakeoff?: boolean;
  rowAction?: string | null;
  action: string | null;
  actionLabel: string | null;
};

export type QuoteFlowQueueStats = {
  readyForReview: number;
  manualScopeNeeded: number;
  processing: number;
  failed: number;
  total: number;
};

export type QuoteFlowSetScopeResult = {
  ok: boolean;
  estimateId: string;
  intakeCaseId: string | null;
  takeoffJobId: string | null;
  projectName?: string | null;
  estimateName?: string | null;
  message?: string;
  alreadyScoped?: boolean;
  reused?: boolean;
  created?: boolean;
  sideEffects?: Record<string, boolean>;
};

export async function fetchQuoteFlowQueue(
  token: string,
  query: Record<string, string | number | undefined> = {}
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return apiGet(`/api/elite100-quote-flow/queue${qs ? `?${qs}` : ""}`, token) as Promise<{
    ok: boolean;
    items: QuoteFlowQueueItem[];
    groups?: {
      ready: QuoteFlowQueueItem[];
      manual: QuoteFlowQueueItem[];
      processing: QuoteFlowQueueItem[];
      failed: QuoteFlowQueueItem[];
    };
    stats?: QuoteFlowQueueStats;
    total?: number;
  }>;
}

export async function fetchQuoteFlowQueueDetail(token: string, takeoffJobId: string) {
  return apiGet(
    `/api/elite100-quote-flow/queue/${encodeURIComponent(takeoffJobId)}`,
    token
  ) as Promise<{
    ok: boolean;
    item: QuoteFlowQueueItem;
    review: Record<string, unknown>;
  }>;
}

export async function setQuoteFlowScope(
  token: string,
  takeoffJobId: string,
  opts: {
    confirm?: boolean;
    projectName?: string;
    estimateName?: string;
    takeoffResult?: unknown;
    reviewState?: unknown;
  } = {}
) {
  return apiPost(
    `/api/elite100-quote-flow/queue/${encodeURIComponent(takeoffJobId)}/set-scope`,
    token,
    {
      confirm: opts.confirm !== false,
      projectName: opts.projectName || opts.estimateName || undefined,
      estimateName: opts.estimateName || opts.projectName || undefined,
      takeoffResult: opts.takeoffResult || undefined,
      reviewState: opts.reviewState || undefined
    }
  ) as Promise<QuoteFlowSetScopeResult>;
}

export async function setQuoteFlowManualScope(
  token: string,
  takeoffJobId: string,
  opts: {
    confirm?: boolean;
    rooms: QuoteFlowScopeRoom[];
    projectName?: string;
    estimateName?: string;
  }
) {
  return apiPost(
    `/api/elite100-quote-flow/queue/${encodeURIComponent(takeoffJobId)}/set-manual-scope`,
    token,
    {
      confirm: opts.confirm !== false,
      rooms: opts.rooms,
      projectName: opts.projectName || opts.estimateName || undefined,
      estimateName: opts.estimateName || opts.projectName || undefined
    }
  ) as Promise<QuoteFlowSetScopeResult>;
}

export type QuoteFlowQueueArchiveResult = {
  ok: boolean;
  archived?: boolean;
  restored?: boolean;
  queueItemKey: string;
  archivedAt?: string;
  takeoffCancelled?: boolean;
  takeoffDeleted?: boolean;
  intakeDeleted?: boolean;
  estimateDeleted?: boolean;
  emailDeleted?: boolean;
  sideEffects?: Record<string, boolean>;
};

export async function archiveQuoteFlowQueueItem(token: string, queueItemKey: string) {
  return apiPost(
    `/api/elite100-quote-flow/queue/${encodeURIComponent(queueItemKey)}/archive`,
    token,
    {}
  ) as Promise<QuoteFlowQueueArchiveResult>;
}

export async function restoreQuoteFlowQueueItem(token: string, queueItemKey: string) {
  return apiPost(
    `/api/elite100-quote-flow/queue/${encodeURIComponent(queueItemKey)}/restore`,
    token,
    {}
  ) as Promise<QuoteFlowQueueArchiveResult>;
}
