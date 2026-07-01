export type QuoteDeliveryPdfAttachment = {
  generated?: boolean;
  skipped?: boolean;
  filename?: string | null;
  byteLength?: number;
  reason?: string;
};

export type QuoteDeliveryCapabilities = {
  sendEnabled?: boolean;
  dryRun?: boolean;
  blocked?: boolean;
  forceRecipient?: string | null;
  pdfEnabled?: boolean;
  pdfAttachment?: QuoteDeliveryPdfAttachment | null;
};

/** Primary delivery-mode message driven by backend capability flags. */
export function describeQuoteDeliverySendMode(res: QuoteDeliveryCapabilities | null): string {
  if (!res) {
    return "Click Preview to load delivery settings from the server.";
  }
  if (res.forceRecipient) {
    return `Test mode: all emails are redirected to ${res.forceRecipient}. Intended recipients are logged.`;
  }
  if (res.sendEnabled === false || res.dryRun) {
    return "Email sending is in dry-run mode for this environment. No customer email will be sent.";
  }
  return "This estimate will be emailed to the selected recipients. The customer-facing PDF is attached when available.";
}

/** PDF-only warning — separate from send capability. Returns null when no PDF warning is needed. */
export function describeQuoteDeliveryPdfWarning(res: QuoteDeliveryCapabilities | null): string | null {
  if (!res) return null;
  if (res.pdfEnabled === false) {
    return "PDF attachment is disabled on the server. Email can still be sent without an attachment.";
  }
  const pdf = res.pdfAttachment;
  if (!pdf) return null;
  if (pdf.generated && pdf.filename) return null;
  if (pdf.reason === "no_print_snapshot") {
    return "PDF unavailable — this quote has no saved print snapshot. Save or update the estimate again.";
  }
  if (pdf.reason === "print_snapshot_reconciliation_mismatch") {
    return "PDF unavailable — saved print snapshot does not match customer display total.";
  }
  if (pdf.reason === "pdf_disabled") {
    return "PDF attachment is disabled on the server.";
  }
  if (pdf.reason === "pdf_render_failed") {
    return "PDF could not be generated on the server — email can still be sent without attachment.";
  }
  if (pdf.skipped) {
    return pdf.reason ? `PDF not attached (${pdf.reason}).` : "PDF not attached for this quote.";
  }
  return null;
}

export function quoteDeliverySendButtonLabel(
  res: QuoteDeliveryCapabilities | null,
  sendBusy: boolean
): string {
  if (sendBusy) return "Sending…";
  if (!res || res.sendEnabled === false || res.dryRun) return "Send (dry run)";
  return "Send estimate";
}

export function quoteDeliverySendSuccessMessage(res: QuoteDeliveryCapabilities): string {
  if (res.blocked || res.dryRun || res.sendEnabled === false) {
    return "Dry run complete — no email was sent.";
  }
  if (res.forceRecipient) {
    return `Estimate email sent to test recipient ${res.forceRecipient}. Intended recipients were logged.`;
  }
  return "Estimate email sent.";
}

export function isQuoteDeliveryLiveSend(res: QuoteDeliveryCapabilities | null): boolean {
  return Boolean(res && res.sendEnabled !== false && !res.dryRun);
}
