import { apiGet, apiPost } from "./api";

export type QuoteFlowQueueItem = {
  takeoffJobId: string | null;
  intakeCaseId: string | null;
  estimateId: string | null;
  customerName: string | null;
  projectName: string | null;
  workflowStatus?: string;
  status: { key: string; label: string };
  alreadyScoped: boolean;
  reviewReady: boolean;
  action: string | null;
  actionLabel: string | null;
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
  opts: { confirm?: boolean } = {}
) {
  return apiPost(
    `/api/elite100-quote-flow/queue/${encodeURIComponent(takeoffJobId)}/set-scope`,
    token,
    { confirm: opts.confirm !== false }
  ) as Promise<{
    ok: boolean;
    estimateId: string;
    intakeCaseId: string | null;
    takeoffJobId: string;
    message?: string;
    alreadyScoped?: boolean;
    reused?: boolean;
    created?: boolean;
    sideEffects?: Record<string, boolean>;
  }>;
}
