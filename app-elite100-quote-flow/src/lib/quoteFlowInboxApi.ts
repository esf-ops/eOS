/**
 * Quote Flow Inbox API — org/actor never sent from the browser.
 */
import { apiGet, apiPost } from "./api";

export type QuoteFlowAttachment = {
  attachmentKey: string | null;
  filename: string;
  contentType: string | null;
  support: string | null;
  supportedForTakeoff: boolean;
  canMarkAsPlan: boolean;
  action: string;
};

export type QuoteFlowTakeoffStatus = {
  key: string;
  label: string;
  takeoffJobId: string | null;
};

/** Production Shared Inbox may still send this object before presenter normalization. */
export type QuoteFlowPersonRef = {
  displayName?: string | null;
  safeAddressLabel?: string | null;
  emailPresent?: boolean;
};

export type QuoteFlowInboxItem = {
  messageKey: string | null;
  receivedAt: string | null;
  /** Display string after presenter/normalize; may historically be a person object. */
  sender: string | QuoteFlowPersonRef | null;
  senderLabel?: string | null;
  customerLabel?: string | null;
  accountLabel?: string | null;
  projectLabel?: string | null;
  subject: string;
  bodyPreview: string | null;
  intakeCaseId: string | null;
  estimateId: string | null;
  planSelectionRequired: boolean;
  attachments: QuoteFlowAttachment[];
  takeoffStatus: QuoteFlowTakeoffStatus;
  takeoffJobId: string | null;
  alreadyScoped: boolean;
  queueHint: string | null;
};

export async function fetchQuoteFlowInbox(
  token: string,
  query: Record<string, string | number | undefined> = {}
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return apiGet(`/api/elite100-quote-flow/inbox${qs ? `?${qs}` : ""}`, token) as Promise<{
    ok: boolean;
    items: QuoteFlowInboxItem[];
    total?: number;
    mailboxDisplay?: string | null;
  }>;
}

export async function fetchQuoteFlowInboxMessage(token: string, messageKey: string) {
  return apiGet(
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}`,
    token
  ) as Promise<{ ok: boolean; item: QuoteFlowInboxItem }>;
}

export async function startQuoteFlowTakeoff(
  token: string,
  messageKey: string,
  opts: {
    attachmentKey: string;
    manualPlanOverride?: boolean;
    idempotencyKey?: string;
  }
) {
  const headers: Record<string, string> = {};
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const manual = opts.manualPlanOverride === true;
  return apiPost(
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}/start-takeoff`,
    token,
    {
      confirm: true,
      attachmentKey: opts.attachmentKey,
      manualPlanOverride: manual,
      markAsPlan: manual,
      idempotencyKey: opts.idempotencyKey || undefined
    },
    { headers }
  ) as Promise<{
    ok: boolean;
    takeoffJobId: string | null;
    intakeCaseId: string | null;
    created: boolean;
    reused: boolean;
    message?: string;
    item?: QuoteFlowInboxItem | null;
    sideEffects?: Record<string, boolean>;
  }>;
}
