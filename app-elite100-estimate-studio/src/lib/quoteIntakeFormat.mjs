import { labelQuoteIntakePriority, labelQuoteIntakeStatus } from "./quoteIntakeStatusLabels.mjs";

const UNKNOWN = "Unknown";

export function safeText(value, fallback = UNKNOWN) {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

export function caseCustomerProjectLabel(c) {
  const customer = String(c?.customerName ?? c?.customer ?? "").trim();
  const project = String(c?.projectName ?? c?.project ?? "").trim();
  if (customer && project) return `${customer} · ${project}`;
  if (customer) return customer;
  if (project) return project;
  return UNKNOWN;
}

export function caseSenderLabel(c) {
  const name = String(c?.senderName ?? "").trim();
  const email = String(c?.senderEmail ?? "").trim();
  if (name && email) return `${name} <${email}>`;
  if (name) return name;
  if (email) return email;
  const hash = String(c?.sourceMessage?.fromAddressHash ?? "").trim();
  if (hash) return `Sender hash ${hash.slice(0, 10)}…`;
  return UNKNOWN;
}

export function caseReceivedAt(c) {
  const raw = c?.receivedAt ?? c?.createdAt ?? null;
  return raw ? String(raw) : null;
}

export function formatReceivedAt(iso) {
  if (!iso) return UNKNOWN;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  try {
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

export function formatAge(iso, nowMs = Date.now()) {
  if (!iso) return UNKNOWN;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return UNKNOWN;
  const mins = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function casePriorityLabel(c) {
  return labelQuoteIntakePriority(c?.priority);
}

export function caseStatusLabel(c) {
  return labelQuoteIntakeStatus(c?.status);
}

export function caseEstimatorLabel(c) {
  const name = String(c?.assignedEstimatorName ?? c?.assignedEstimator ?? "").trim();
  if (name) return name;
  const id = String(c?.assignedEstimatorUserId ?? "").trim();
  if (id) return `User ${id.slice(0, 8)}…`;
  return "Unassigned";
}

export function caseEligibilityLabel(c) {
  const elite = c?.elite100Eligible;
  if (elite === true) return "Elite 100 eligible";
  if (elite === false) return "Not Elite 100";
  const state = String(c?.classificationState ?? "").trim();
  if (state) return state.replace(/_/g, " ");
  if (c?.status === "qil_not_elite_100") return "Not Elite 100";
  return UNKNOWN;
}

export function formatBytes(n) {
  if (n == null || !Number.isFinite(n)) return UNKNOWN;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function stripHtmlToText(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attachmentLooksLikePdf(a) {
  const mime = String(a?.mimeType ?? "").toLowerCase();
  const name = String(a?.safeFilename ?? a?.name ?? "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

/** Attachment presence summary for queue rows. */
export function caseAttachmentStatusLabel(c) {
  const atts = Array.isArray(c?.attachments) ? c.attachments : [];
  if (!atts.length) return "None";
  return `${atts.length} file${atts.length === 1 ? "" : "s"}`;
}

/**
 * Supported PDF indicator from case metadata only.
 * Explicit no_supported_pdf reason wins over filename/mime heuristics.
 */
export function caseSupportedPdfLabel(c) {
  const reasons = [
    ...(Array.isArray(c?.missingInformation) ? c.missingInformation : []),
    ...(Array.isArray(c?.manualReviewReasons) ? c.manualReviewReasons : [])
  ].map(String);
  if (reasons.includes("no_supported_pdf")) return "No";
  const atts = Array.isArray(c?.attachments) ? c.attachments : [];
  if (!atts.length) return "—";
  if (atts.some(attachmentIsSupportedPdf)) return "Yes";
  return "No";
}

const ATTACHMENT_REASON_LABELS = {
  no_attachments: "No attachments",
  only_inline_images: "Only inline images / signatures",
  pdf_nested_in_forwarded_item: "PDF nested in a forwarded email",
  unsupported_attachment_type: "Unsupported attachment type"
};

const ATTACHMENT_RETRIEVAL_LABELS = {
  pending: "Ready to open",
  not_applicable: "—",
  retrieved: "Retrieved",
  failed: "Retrieval failed",
  unavailable: "Bytes unavailable"
};

/** Is a stored attachment record a supported direct PDF (mirrors server rules)? */
export function attachmentIsSupportedPdf(a) {
  if (!a) return false;
  if (a.support === "direct_pdf") return true;
  if (a.support && a.support !== "direct_pdf") return false;
  if (a.isInline) return false;
  if (String(a.kind) === "item") return false;
  return attachmentLooksLikePdf(a);
}

/** Customer-safe support label for an attachment row. */
export function attachmentSupportLabel(a) {
  if (attachmentIsSupportedPdf(a)) return "Supported PDF";
  if (a?.isInline || a?.support === "inline_ignored") return "Inline (ignored)";
  if (a?.support === "unsupported_item" || String(a?.kind) === "item") {
    return "Forwarded email item";
  }
  return "Unsupported";
}

export function attachmentReasonLabel(reason) {
  const r = String(reason ?? "").trim();
  if (!r) return "";
  return ATTACHMENT_REASON_LABELS[r] || r.replace(/_/g, " ");
}

export function attachmentRetrievalLabel(a) {
  const s = String(a?.retrievalState ?? "").trim();
  if (!s) return attachmentIsSupportedPdf(a) ? "Ready to open" : "—";
  return ATTACHMENT_RETRIEVAL_LABELS[s] || s.replace(/_/g, " ");
}

export function caseMissingInfoLabel(c) {
  const missing = Array.isArray(c?.missingInformation)
    ? c.missingInformation.map(String).filter(Boolean)
    : [];
  if (!missing.length) return "—";
  return missing.slice(0, 3).join(", ");
}
