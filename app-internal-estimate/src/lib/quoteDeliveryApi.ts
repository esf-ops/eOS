import { apiPostJson } from "@quote-lib/api";

export type DeliveryRecipient = {
  email: string;
  type: "to" | "cc";
};

export type QuoteDeliveryEmailPayload = {
  recipients: DeliveryRecipient[];
  subject?: string;
};

export type QuoteDeliveryResponse = {
  ok: boolean;
  dryRun?: boolean;
  blocked?: boolean;
  sendEnabled?: boolean;
  quoteId?: string;
  quoteNumber?: string | null;
  revisionLabel?: string | null;
  revisionNumber?: number | null;
  customerDisplayTotal?: number | null;
  subject?: string;
  recipients?: DeliveryRecipient[];
  htmlPreview?: string;
  textPreview?: string;
  pdfAttachment?: {
    generated?: boolean;
    skipped?: boolean;
    filename?: string | null;
    byteLength?: number;
    reason?: string;
  };
  warnings?: string[];
  deliveryLogId?: string | null;
  deliveryLogSkipped?: boolean;
  setupWarning?: string | null;
  error?: string;
};

/** Split comma/semicolon-separated addresses into normalized list. */
export function parseEmailList(raw: string): string[] {
  return String(raw || "")
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function buildRecipientsPayload(toRaw: string, ccRaw: string): DeliveryRecipient[] {
  const recipients: DeliveryRecipient[] = [];
  for (const email of parseEmailList(toRaw)) {
    recipients.push({ email, type: "to" });
  }
  for (const email of parseEmailList(ccRaw)) {
    recipients.push({ email, type: "cc" });
  }
  return recipients;
}

export async function previewEstimateEmail(
  quoteId: string,
  token: string,
  payload: QuoteDeliveryEmailPayload
): Promise<QuoteDeliveryResponse> {
  const raw = (await apiPostJson(
    `/api/quote-delivery/quotes/${encodeURIComponent(quoteId)}/preview`,
    token,
    payload
  )) as QuoteDeliveryResponse;
  return raw;
}

export async function sendEstimateEmail(
  quoteId: string,
  token: string,
  payload: QuoteDeliveryEmailPayload
): Promise<QuoteDeliveryResponse> {
  const raw = (await apiPostJson(
    `/api/quote-delivery/quotes/${encodeURIComponent(quoteId)}/send`,
    token,
    payload
  )) as QuoteDeliveryResponse;
  return raw;
}
