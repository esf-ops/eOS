/** Lab-owned domain types for Quote Intake Lab (Phase 1 fixtures). */

export type QuoteIntakeStatus =
  | "qil_received"
  | "qil_classifying"
  | "qil_not_quote"
  | "qil_not_elite_100"
  | "qil_processing_attachments"
  | "qil_takeoff_processing"
  | "qil_needs_information"
  | "qil_needs_manual_takeoff"
  | "qil_ready_for_review"
  | "qil_in_review"
  | "qil_approved_lab_quote"
  | "qil_ready_to_send_lab"
  | "qil_sent_simulated"
  | "qil_failed";

export type QuoteIntakePriority = "low" | "normal" | "high" | "urgent";

export type QuoteIntakeAttachment = {
  id: string;
  filename: string;
  contentType: string;
  /** Phase 1 fixtures are always simulated. */
  simulated: boolean;
};

export type QuoteIntakeEvent = {
  id: string;
  at: string;
  actorType: "system" | "user" | "adapter";
  actorLabel: string;
  eventType: string;
  summary: string;
  before?: unknown;
  after?: unknown;
};

export type QuoteIntakeCase = {
  id: string;
  status: QuoteIntakeStatus;
  priority: QuoteIntakePriority;
  receivedAt: string;
  updatedAt: string;
  senderName: string;
  senderEmail: string;
  recipientMailbox: string;
  assignedSalesperson: string;
  assignedEstimator: string | null;
  customerAccount: string;
  projectName: string;
  projectAddress: string;
  emailSubject: string;
  emailExcerpt: string;
  attachments: readonly QuoteIntakeAttachment[];
  requestedColor: string | null;
  resolvedPriceGroup: string | null;
  /** Simulated proposed sf — not from production takeoff. */
  proposedSquareFootage: number | null;
  sinkCutoutCount: number | null;
  edgeProfile: string | null;
  backsplashScope: string | null;
  missingInformation: readonly string[];
  /** Placeholder 0–1; simulated only. */
  aiConfidence: number | null;
  takeoffState: string;
  quotePreviewState: string;
  unreadActivityCount: number;
  internalNotes: string;
  dataSource: "fixture";
  simulatedLabels: readonly string[];
  events: readonly QuoteIntakeEvent[];
  nextAction?: string;
  relatedCaseId?: string;
  /** Computed by repository using fixture asOf clock. */
  elapsedTurnaroundLabel?: string;
};

export type QuoteIntakeStatusCounts = {
  new: number;
  processing: number;
  ready_for_review: number;
  missing_information: number;
  manual_review: number;
  approved_ready: number;
  sent_simulated: number;
  total: number;
};

export type QuoteIntakeFilter = {
  search?: string;
  status?: string;
  priority?: string;
  salesperson?: string;
  estimator?: string;
  ageBucket?: string;
  missingInfo?: "any" | "has_missing" | "none_missing";
  summaryBucket?: string;
};

/**
 * Future data-provider boundary. Phase 1 uses FixtureQuoteIntakeRepository only.
 * A later ApiQuoteIntakeRepository can implement the same shape against
 * /api/quote-intake-lab/* once routes are mounted.
 */
export interface QuoteIntakeRepository {
  listCases(filter?: QuoteIntakeFilter): Promise<QuoteIntakeCase[]>;
  getCase(id: string): Promise<QuoteIntakeCase | null>;
  getStatusCounts(filter?: QuoteIntakeFilter): Promise<QuoteIntakeStatusCounts>;
  listSalespeople(): Promise<string[]>;
  listEstimators(): Promise<string[]>;
  /** ISO timestamp used for deterministic age calculations. */
  getAsOf(): string;
}
