/** Client DTOs matching `/api/quote-intake/*` responses (Phase 6P.3). */

export type QuoteIntakeSourceMessageDto = {
  internetMessageId?: string;
  contentHash?: string;
  graphImmutableMessageId?: string;
  fromAddressHash?: string;
};

export type QuoteIntakeAttachmentDto = {
  id: string;
  sha256: string;
  mimeType?: string;
  sizeBytes?: number;
  safeFilename?: string;
};

export type QuoteIntakeCaseDto = {
  id: string;
  organizationId?: string;
  status: string;
  sourceMessage?: QuoteIntakeSourceMessageDto;
  attachments?: QuoteIntakeAttachmentDto[];
  createdAt: string;
  updatedAt?: string;
  createdByUserId?: string | null;
  /** Optional fields when present from API / future enrichment */
  priority?: string | null;
  receivedAt?: string | null;
  sourceType?: string | null;
  classificationState?: string | null;
  assignedEstimatorUserId?: string | null;
  assignedEstimatorName?: string | null;
  assignedEstimator?: string | null;
  customerName?: string | null;
  customer?: string | null;
  projectName?: string | null;
  project?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  bodyText?: string | null;
  elite100Eligible?: boolean | null;
  missingInformation?: string[] | null;
  manualReviewReasons?: string[] | null;
};

export type QuoteIntakeAutomationDecisionDto = {
  id: string;
  organizationId?: string;
  intakeCaseId: string;
  path: string;
  reasonCodes: string[];
  wouldStartTakeoff: boolean;
  createdAt: string;
  actorType: string;
  actorUserId?: string | null;
  note?: string;
};

export type QuoteIntakeAuditEventDto = {
  id: string;
  organizationId?: string;
  intakeCaseId: string;
  eventType: string;
  createdAt: string;
  actorType: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

export type QuoteIntakeTakeoffLinkDto = {
  id: string;
  organizationId?: string;
  intakeCaseId: string;
  takeoffJobId: string | null;
  sourceAttachmentId?: string;
  attachmentSha256?: string;
  relationshipStatus: string;
  initiationMode: string;
  automationDecisionId?: string | null;
  idempotencyKey: string;
  createdAt: string;
  actorType?: string;
  createdBy?: string | null;
};

export type QuoteIntakeSafeConfig = {
  phase?: string;
  quoteIntakeApiEnabled?: boolean;
  repositoryMode?: string;
  graphEnabled?: boolean;
  mailboxSyncEnabled?: boolean;
  graphConfigured?: boolean;
  graphPreviewLimit?: number;
  graphImportLimit?: number;
  mailboxDisplay?: string | null;
  automaticTakeoffEnabled?: boolean;
  takeoffInvocationEnabled?: boolean;
  realPlanTransmissionEnabled?: boolean;
  ieImportEnabled?: boolean;
  quoteLibraryPromotionEnabled?: boolean;
  outboundEmailEnabled?: boolean;
  pilotAllowlistConfigured?: boolean;
};

export type QuoteIntakeQueueFilter = {
  search: string;
  status: string;
  priority: string;
  summaryBucket: string;
};

export const EMPTY_QUEUE_FILTER: QuoteIntakeQueueFilter = {
  search: "",
  status: "",
  priority: "",
  summaryBucket: ""
};
