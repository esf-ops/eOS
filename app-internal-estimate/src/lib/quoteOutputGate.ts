/**
 * Gate customer-facing Internal Estimate output on persisted quote identity.
 */

export const UNSAVED_QUOTE_OUTPUT_MESSAGE =
  "Save this quote before printing, emailing, or sending it. This prevents quotes from being lost and ensures a quote number is assigned.";

export type CustomerOutputGateInput = {
  sessionToken?: string | null;
  quoteHeaderId?: string | null;
  quoteNumber?: string | null;
  hydratedIsCurrentRevision?: boolean | null;
  revisionDirty?: boolean;
  revisionNoteDraft?: string;
  submitBusy?: boolean;
  restoreBusy?: boolean;
};

/**
 * Returns a user-visible block reason, or null when print/email/delivery may proceed.
 */
export function getCustomerOutputBlockReason(input: CustomerOutputGateInput): string | null {
  if (!input.sessionToken) return "Sign in to print or email customer estimates.";
  if (input.submitBusy || input.restoreBusy) return "Save in progress…";
  if (!input.quoteHeaderId) return UNSAVED_QUOTE_OUTPUT_MESSAGE;
  if (!String(input.quoteNumber ?? "").trim()) return UNSAVED_QUOTE_OUTPUT_MESSAGE;
  if (input.hydratedIsCurrentRevision === null) return "Loading quote metadata…";
  if (input.hydratedIsCurrentRevision === false) {
    return "This revision is read-only. Open or restore the latest revision before printing or emailing.";
  }
  if (input.revisionDirty || Boolean(String(input.revisionNoteDraft ?? "").trim())) {
    return "Save your changes before printing or emailing the estimate.";
  }
  return null;
}

/** True when the block can be cleared by saving the quote first. */
export function canSaveBeforeCustomerOutput(blockReason: string | null): boolean {
  if (!blockReason) return false;
  if (blockReason === UNSAVED_QUOTE_OUTPUT_MESSAGE) return true;
  if (blockReason.startsWith("Save your changes")) return true;
  return false;
}
