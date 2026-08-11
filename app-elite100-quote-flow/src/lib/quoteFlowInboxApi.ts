/**
 * Quote Flow Inbox API — org/actor never sent from the browser.
 */
import { ApiError, apiFetchBlob, apiGet, apiPost } from "./api";

export type QuoteFlowAttachment = {
  attachmentKey: string | null;
  filename: string;
  contentType: string | null;
  sizeBytes?: number | null;
  support: string | null;
  supportLabel?: string | null;
  detectionReason?: string | null;
  supportedForTakeoff: boolean;
  canMarkAsPlan: boolean;
  previewSupported?: boolean;
  isInline?: boolean;
  likelyInlineImage?: boolean;
  action: string;
};

export type QuoteFlowTakeoffStatus = {
  key: string;
  label: string;
  takeoffJobId: string | null;
};

export type QuoteFlowProgress = {
  percent: number | null;
  stageKey: string;
  stageLabel: string;
  isError: boolean;
  isComplete: boolean;
  approximate?: boolean;
  indeterminate?: boolean;
};

export type QuoteFlowInboxGroup = {
  key: string;
  label: string;
  sortOrder?: number;
};

export type QuoteFlowNextAction = {
  key: string;
  label: string;
};

export type QuoteFlowTakeoffTimelineStep = {
  key: string;
  label: string;
  at?: string | null;
  tone?: string;
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
  sender: string | QuoteFlowPersonRef | null;
  senderLabel?: string | null;
  customerLabel?: string | null;
  customerDisplay?: string | null;
  accountLabel?: string | null;
  projectLabel?: string | null;
  requestTitle?: string | null;
  subject: string;
  bodyPreview: string | null;
  intakeCaseId: string | null;
  estimateId: string | null;
  planSelectionRequired: boolean;
  attachmentCount?: number;
  bestPlanCandidate?: {
    attachmentKey: string | null;
    filename: string;
    contentType?: string | null;
    detectionReason?: string | null;
  } | null;
  attachments: QuoteFlowAttachment[];
  takeoffStatus: QuoteFlowTakeoffStatus;
  takeoffStatusLabel?: string | null;
  takeoffJobId: string | null;
  takeoffProgress?: QuoteFlowProgress;
  progress?: QuoteFlowProgress;
  takeoffStartedAt?: string | null;
  takeoffUpdatedAt?: string | null;
  takeoffElapsedSeconds?: number | null;
  takeoffErrorCode?: string | null;
  takeoffErrorMessageSafe?: string | null;
  takeoffFailureStage?: string | null;
  takeoffFailedAt?: string | null;
  takeoffPlanFilename?: string | null;
  queueItemKey?: string | null;
  isStaleProcessing?: boolean;
  isLongRunning?: boolean;
  staleLabel?: string | null;
  takeoffTimeline?: QuoteFlowTakeoffTimelineStep[];
  group?: QuoteFlowInboxGroup;
  nextAction?: QuoteFlowNextAction;
  nextRecommendedAction?: QuoteFlowNextAction;
  canStartTakeoff?: boolean;
  canRetryTakeoff?: boolean;
  alreadyScoped: boolean;
  opened?: boolean;
  dismissed?: boolean;
  isActiveTakeoff?: boolean;
  viewQueue?: boolean;
  viewEstimates?: boolean;
  queueHint: string | null;
};

export type QuoteFlowInboxStats = {
  newUnopened?: number;
  needsAction: number;
  activeTakeoffs: number;
  readyForReview: number;
  scopeSet: number;
  dismissed?: number;
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
    groups?: {
      needs_action: QuoteFlowInboxItem[];
      active: QuoteFlowInboxItem[];
      ready_for_review?: QuoteFlowInboxItem[];
      completed: QuoteFlowInboxItem[];
      dismissed?: QuoteFlowInboxItem[];
    };
    stats?: QuoteFlowInboxStats;
    total?: number;
    mailboxDisplay?: string | null;
    triage?: {
      openedIsMailboxUnread?: boolean;
      openedIsQuoteFlowLocal?: boolean;
      dismissDeletesEmail?: boolean;
    };
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
    attachmentKey?: string;
    attachmentKeys?: string[];
    manualPlanOverride?: boolean;
    idempotencyKey?: string;
    startFresh?: boolean;
  }
) {
  const headers: Record<string, string> = {};
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const keys =
    Array.isArray(opts.attachmentKeys) && opts.attachmentKeys.length
      ? opts.attachmentKeys.map((k) => String(k || "").trim()).filter(Boolean)
      : opts.attachmentKey
        ? [String(opts.attachmentKey).trim()].filter(Boolean)
        : [];
  const manual = opts.manualPlanOverride === true;
  return apiPost(
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}/start-takeoff`,
    token,
    {
      confirm: true,
      attachmentKey: keys[0] || undefined,
      attachmentKeys: keys,
      manualPlanOverride: manual,
      markAsPlan: manual,
      startFresh: opts.startFresh !== false,
      idempotencyKey: opts.idempotencyKey || undefined
    },
    { headers }
  ) as Promise<{
    ok: boolean;
    takeoffJobId: string | null;
    intakeCaseId: string | null;
    created: boolean;
    reused: boolean;
    alreadyRunning?: boolean;
    message?: string;
    packetMerged?: boolean;
    packetFilename?: string | null;
    attachmentKeys?: string[];
    item?: QuoteFlowInboxItem | null;
    sideEffects?: Record<string, boolean>;
  }>;
}

/** Staff-only authenticated attachment preview path (encode keys; pair with apiFetchBlob). */
export function quoteFlowAttachmentPreviewUrl(messageKey: string, attachmentKey: string) {
  return `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}/attachments/${encodeURIComponent(attachmentKey)}/preview`;
}

export function quoteFlowAttachmentDownloadUrl(messageKey: string, attachmentKey: string) {
  return `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}/attachments/${encodeURIComponent(attachmentKey)}/download`;
}

function safeAttachmentLoadMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return "You do not have access to this attachment.";
    }
    if (err.status === 404) {
      return "Attachment could not be loaded.";
    }
    if (err.status === 415) {
      return "Preview unavailable for this file type. Use Download if needed.";
    }
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return "Attachment bytes unavailable from mailbox provider.";
    }
    if (err.message && !/failed to fetch|networkerror/i.test(err.message)) {
      return err.message;
    }
    return `Preview route returned ${err.status}.`;
  }
  return fallback;
}

/** Staff-only: stream attachment bytes from backend-core (never SPA-relative). */
export async function fetchQuoteFlowAttachmentPreview(
  token: string,
  messageKey: string,
  attachmentKey: string
) {
  try {
    return await apiFetchBlob(quoteFlowAttachmentPreviewUrl(messageKey, attachmentKey), token);
  } catch (e) {
    if (!(e instanceof ApiError)) {
      throw new ApiError(0, "Attachment could not be loaded.", null);
    }
    throw new ApiError(
      e.status,
      safeAttachmentLoadMessage(e, "Attachment could not be loaded."),
      e.body
    );
  }
}

export async function fetchQuoteFlowAttachmentDownload(
  token: string,
  messageKey: string,
  attachmentKey: string
) {
  try {
    return await apiFetchBlob(quoteFlowAttachmentDownloadUrl(messageKey, attachmentKey), token);
  } catch (e) {
    if (!(e instanceof ApiError)) {
      throw new ApiError(0, "Download unavailable for this attachment.", null);
    }
    throw new ApiError(
      e.status,
      safeAttachmentLoadMessage(e, "Download unavailable for this attachment."),
      e.body
    );
  }
}

export async function dismissQuoteFlowInboxMessage(token: string, messageKey: string) {
  return apiPost(
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}/dismiss`,
    token,
    {}
  ) as Promise<{
    ok: boolean;
    dismissed: boolean;
    messageKey: string;
    emailDeleted: boolean;
    mailboxMutated: boolean;
    takeoffCancelled?: boolean;
    activeTakeoffHidden?: boolean;
    message?: string;
  }>;
}

export async function restoreQuoteFlowInboxMessage(token: string, messageKey: string) {
  return apiPost(
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}/restore`,
    token,
    {}
  ) as Promise<{
    ok: boolean;
    restored: boolean;
    messageKey: string;
    emailDeleted: boolean;
    mailboxMutated: boolean;
    item?: QuoteFlowInboxItem | null;
    message?: string;
  }>;
}

export async function markQuoteFlowInboxOpened(token: string, messageKey: string) {
  return apiPost(
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(messageKey)}/opened`,
    token,
    {}
  ) as Promise<{
    ok: boolean;
    opened: boolean;
    mailboxMutated: boolean;
    item?: QuoteFlowInboxItem | null;
  }>;
}
