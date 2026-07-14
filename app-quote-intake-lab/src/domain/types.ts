/** Lab-owned domain types for Quote Intake Lab. */

export type QuoteIntakeStatus =
  | "qil_received"
  | "qil_classifying"
  | "qil_intake_review"
  | "qil_manual_review"
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
  /** Phase 1 fixtures are simulated; Phase 2 imports are local-only. */
  simulated: boolean;
  sizeBytes?: number;
  contentHash?: string;
  localOnly?: boolean;
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

export type QuoteIntakeImportMeta = {
  sourceType: "manual_eml" | "manual_paste";
  dedupeKey: string;
  dedupeStrategy: "message_id" | "content_hash";
  messageId: string | null;
  messageContentHash: string;
  parserWarnings: string[];
  rawSourcePreserved: boolean;
  originalFilename: string | null;
  textBody: string;
  to: Array<{ name: string | null; email: string }>;
  cc: Array<{ name: string | null; email: string }>;
  replyTo: { name: string | null; email: string } | null;
  thread: {
    conversationId: string | null;
    inReplyTo: string | null;
    references: string[];
    threadKey: string;
  };
  importTimestamp: string;
  importActor: string;
  htmlPresent: boolean;
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
  proposedSquareFootage: number | null;
  sinkCutoutCount: number | null;
  edgeProfile: string | null;
  backsplashScope: string | null;
  missingInformation: readonly string[];
  aiConfidence: number | null;
  takeoffState: string;
  quotePreviewState: string;
  unreadActivityCount: number;
  internalNotes: string;
  dataSource: "fixture" | "imported";
  simulatedLabels: readonly string[];
  events: readonly QuoteIntakeEvent[];
  nextAction?: string;
  relatedCaseId?: string;
  elapsedTurnaroundLabel?: string;
  importMeta?: QuoteIntakeImportMeta;
  /** Phase 3 classification pointer fields (merged from overlay when present). */
  latestClassificationRunId?: string | null;
  acceptedSnapshotId?: string | null;
  /** Phase 3.1.1 provenance overlay — never inferred from confidence alone. */
  classificationProviderMode?: "simulated" | "live" | string | null;
  classificationReviewState?: "unreviewed" | "corrected" | "accepted" | "superseded" | string | null;
  /** Phase 4B.1 takeoff overlay — measured SF never overwrites email stated SF. */
  statedSquareFootage?: number | null;
  measuredCountertopSquareFootage?: number | null;
  measuredBacksplashSquareFootage?: number | null;
  measuredFullHeightBacksplashSquareFootage?: number | null;
  measuredCombinedSquareFootage?: number | null;
  providerProposedSquareFootage?: number | null;
  takeoffVariance?: number | null;
  takeoffSinkCutoutCount?: number | null;
  latestTakeoffRunId?: string | null;
  latestTakeoffState?: string | null;
  takeoffProviderMode?: string | null;
  takeoffWarningCounts?: {
    informational: number;
    estimator_review: number;
    approval_blocking: number;
    total: number;
  } | null;
  takeoffUpdatedAt?: string | null;
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

export interface QuoteIntakeRepository {
  listCases(filter?: QuoteIntakeFilter): Promise<QuoteIntakeCase[]>;
  getCase(id: string): Promise<QuoteIntakeCase | null>;
  getStatusCounts(filter?: QuoteIntakeFilter): Promise<QuoteIntakeStatusCounts>;
  listSalespeople(): Promise<string[]>;
  listEstimators(): Promise<string[]>;
  getAsOf(): string;
  ready?: () => Promise<unknown>;
  countImported?: () => Promise<number>;
  previewImport?: (source: unknown) => Promise<unknown>;
  confirmImport?: (message: unknown) => Promise<unknown>;
  getAttachmentBytes?: (caseId: string, attachmentId: string) => Promise<Uint8Array | null>;
  clearImported?: () => Promise<void>;
  runClassification?: (
    caseId: string,
    opts?: { actorLabel?: string; providerMode?: "simulated" | "live" | string }
  ) => Promise<unknown>;
  applyClassificationCorrections?: (
    caseId: string,
    runId: string,
    corrections: unknown[],
    opts?: unknown
  ) => Promise<unknown>;
  acceptClassification?: (caseId: string, runId: string, opts?: unknown) => Promise<unknown>;
  listClassificationRuns?: (caseId: string) => Promise<unknown[]>;
  getClassificationRun?: (runId: string) => Promise<unknown>;
  getAcceptedSnapshot?: (caseId: string) => Promise<unknown>;
  runTakeoff?: (
    caseId: string,
    opts?: {
      selectedAttachmentId: string;
      actorLabel?: string;
      scenarioId?: string;
      transmissionAcknowledgmentPlaceholder?: boolean;
    }
  ) => Promise<unknown>;
  listTakeoffRuns?: (caseId: string) => Promise<unknown[]>;
  getTakeoffRun?: (runId: string) => Promise<unknown>;
  getLatestTakeoffRun?: (caseId: string) => Promise<unknown>;
  getTakeoffOverlay?: (caseId: string) => Promise<unknown>;
  listTakeoffAuditEvents?: (caseId: string) => Promise<unknown[]>;
}
