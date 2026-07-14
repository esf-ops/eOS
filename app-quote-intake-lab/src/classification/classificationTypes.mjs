/**
 * Lab-owned classification / extraction contracts (Phase 3).
 * No live AI. No production coupling.
 */

/** @typedef {"new_quote_request"|"quote_revision"|"quote_question"|"project_information_update"|"not_quote_related"|"unclear"} MessageIntent */

/** @typedef {"elite_100_candidate"|"non_elite_100_candidate"|"program_unknown"|"manual_review_required"} WorkflowEligibility */

/** @typedef {"not_checked"|"simulated_match"|"simulated_no_match"|"needs_human_review"} CatalogValidationState */

/** @typedef {"subject"|"body"|"sender"|"recipient"|"attachment_filename"|"manual_correction"} EvidenceSourceType */

/** @typedef {"quote_blocking"|"estimator_review"|"helpful_but_not_blocking"} MissingSeverity */

/** @typedef {"unreviewed"|"corrected"|"accepted"|"rejected"|"superseded"} ClassificationReviewState */

export const MESSAGE_INTENTS = Object.freeze([
  "new_quote_request",
  "quote_revision",
  "quote_question",
  "project_information_update",
  "not_quote_related",
  "unclear"
]);

export const WORKFLOW_ELIGIBILITIES = Object.freeze([
  "elite_100_candidate",
  "non_elite_100_candidate",
  "program_unknown",
  "manual_review_required"
]);

export const CATALOG_VALIDATION_STATES = Object.freeze([
  "not_checked",
  "simulated_match",
  "simulated_no_match",
  "needs_human_review"
]);

export const EXTRACTED_FIELD_KEYS = Object.freeze([
  "customerAccount",
  "projectName",
  "projectAddress",
  "requestedColorText",
  "elite100OrPriceGroupText",
  "sinkCutoutCount",
  "edgeProfile",
  "backsplashDescription",
  "statedSquareFootage",
  "requestedTurnaround",
  "salespersonMailbox",
  "customerNotes",
  "revisionReference",
  "contactPhone"
]);

export const FIELD_LABELS = Object.freeze({
  customerAccount: "Customer / account",
  projectName: "Project name",
  projectAddress: "Project address",
  requestedColorText: "Requested color text",
  elite100OrPriceGroupText: "Elite 100 / price-group text",
  sinkCutoutCount: "Sink cutout count",
  edgeProfile: "Edge profile",
  backsplashDescription: "Backsplash description",
  statedSquareFootage: "Stated total square footage",
  requestedTurnaround: "Requested turnaround / date",
  salespersonMailbox: "Salesperson / mailbox",
  customerNotes: "Customer notes",
  revisionReference: "Revision reference",
  contactPhone: "Contact phone"
});

export const MISSING_ITEM_KEYS = Object.freeze([
  "readable_plan_attachment",
  "requested_color_or_price_group",
  "total_sf_or_measurements",
  "sink_cutout_count",
  "edge_profile",
  "customer_account",
  "project_name",
  "project_address",
  "sender_contact"
]);

export const PROVIDER_NAME_SIMULATED = "SimulatedIntakeIntelligenceProvider";
export const PROVIDER_VERSION_SIMULATED = "sim-1.0.0";
export const PROVIDER_MODE_SIMULATED = "simulated";

export const PROVIDER_NAME_LIVE = "LiveGeminiIntakeIntelligenceProvider";
export const PROVIDER_VERSION_LIVE = "live-gemini-1.0.0";
export const PROVIDER_MODE_LIVE = "live";
