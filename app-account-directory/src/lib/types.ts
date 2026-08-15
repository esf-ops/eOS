export type AccountTab = "accounts" | "prospects" | "needs_review" | "archived";

export type AccountStatus = "active" | "prospect" | "needs_review" | "archived" | string;

export type AccountListItem = {
  id: string;
  name: string;
  displayName?: string;
  legalName?: string | null;
  primaryContact?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  status: AccountStatus;
  quickbooksLinked?: boolean;
  qbEnrichment?: {
    code?: "linked" | "not_linked" | "suggested_match" | "needs_review" | string;
    label?: string;
    suggestionId?: string | null;
    suggestionStatus?: string | null;
  };
  qbEnrichmentLabel?: string | null;
  qbEnrichmentCode?: string | null;
  updatedAt?: string | null;
  rowVersion?: number | null;
  source?: string | null;
  hasPrimaryContact?: boolean | null;
  hasPrimaryLocation?: boolean | null;
  hasAliases?: boolean | null;
  financialIntel?: {
    openAr?: number | null;
    overdue?: boolean;
    collectionAttention?: string | null;
    financiallyActive?: boolean;
  } | null;
};

export type AccountContact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  isPrimary?: boolean;
};

export type AccountLocation = {
  id: string;
  label?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  isPrimary?: boolean;
};

export type AccountAlias = {
  id: string;
  alias: string;
  source?: string | null;
};

export type ExternalLink = {
  id: string;
  system: string;
  externalId?: string;
  externalDisplayName?: string | null;
  sourceSnapshotDate?: string | null;
  linkedAt?: string | null;
  linkedBy?: string | null;
  isActive?: boolean;
  url?: string | null;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor?: string | null;
  action: string;
  detail?: string | null;
};

export type AccountDetail = AccountListItem & {
  notes?: string | null;
  contacts?: AccountContact[];
  locations?: AccountLocation[];
  aliases?: AccountAlias[];
  externalLinks?: ExternalLink[];
  auditHistory?: AuditEntry[];
};

export type AccountDirectoryPermissions = {
  canView?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canArchive?: boolean;
  canRestore?: boolean;
  canLinkQuickBooks?: boolean;
};

export type AccountSummary = {
  total: number;
  active: number;
  prospects: number;
  needsReview: number;
  archived: number;
  quickbooksLinked: number;
  qbSuggestedMatch?: number;
  qbNeedsReview?: number;
  missingPrimaryContact: number;
  missingPrimaryLocation: number;
};

export type AccountSummaryResponse = {
  ok?: boolean;
  summary?: AccountSummary;
};

export type AccountListParams = {
  tab?: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  linked?: string;
  missingContact?: string;
  missingLocation?: string;
  qbEnrichment?: string;
  intelligence?: string;
};

export type AccountListResponse = {
  ok?: boolean;
  items?: AccountListItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
};

export type AccountDetailResponse = {
  ok?: boolean;
  account?: AccountDetail;
};

export type AccountFinancialActivityItem = {
  type: "invoice" | "payment" | "sales_order" | "estimate" | string;
  date?: string | null;
  referenceNumber?: string | null;
  customerName?: string | null;
  amount?: number | null;
};

export type AccountFinancials = {
  status: "ok" | "stale" | "unlinked" | "unavailable" | string;
  linked?: boolean;
  asOfDate?: string | null;
  refreshedAt?: string | null;
  warnings?: string[];
  summary?: {
    openAr?: number | null;
    openInvoiceCount?: number | null;
    invoicedYtd?: number | null;
    collectedYtd?: number | null;
    salesOrdersYtd?: number | null;
    quotedYtd?: number | null;
  };
  lastInvoice?: {
    date?: string | null;
    referenceNumber?: string | null;
    amount?: number | null;
    customerName?: string | null;
  } | null;
  lastPayment?: {
    date?: string | null;
    referenceNumber?: string | null;
    amount?: number | null;
    customerName?: string | null;
  } | null;
  daysSinceLastPayment?: number | null;
  oldestOpenInvoice?: {
    date?: string | null;
    referenceNumber?: string | null;
    originalAmount?: number | null;
    balance?: number | null;
    customerName?: string | null;
    ageDays?: number | null;
  } | null;
  oldestOverdueInvoice?: {
    date?: string | null;
    dueDate?: string | null;
    referenceNumber?: string | null;
    originalAmount?: number | null;
    balance?: number | null;
    customerName?: string | null;
    daysOverdue?: number | null;
  } | null;
  paymentTerms?: string | null;
  overdueBalance?: number | null;
  overdueInvoiceCount?: number | null;
  aging?: {
    current?: { balance?: number; count?: number };
    days1to30?: { balance?: number; count?: number };
    days31to60?: { balance?: number; count?: number };
    days61to90?: { balance?: number; count?: number };
    days90Plus?: { balance?: number; count?: number };
    unknown?: { balance?: number; count?: number };
  } | null;
  collectionAttention?: {
    code?: "current" | "watch" | "attention" | "priority" | "unknown" | string;
    label?: string;
    reason?: string;
  } | null;
  recentActivity?: AccountFinancialActivityItem[];
  openInvoices?: AccountInvoicePage;
  monthlyTrend?: AccountTrend;
  coverage?: {
    workerCoverageStartDate?: string | null;
    workerCoverageEndDate?: string | null;
    latestSyncStatus?: string | null;
  };
};

export type AccountInvoiceRow = {
  invoice_date?: string | null;
  due_date?: string | null;
  reference_number?: string | null;
  original_amount?: number | null;
  open_amount?: number | null;
  days_overdue?: number | null;
  status?: string;
  customer_name?: string | null;
};

export type AccountInvoicePage = {
  status?: string;
  items?: AccountInvoiceRow[];
  pagination?: { page?: number; limit?: number; has_more?: boolean };
  notes?: string | null;
};

export type AccountTrendPoint = {
  month: string;
  invoiced?: number;
  collected?: number;
  sales_orders?: number;
  quoted?: number;
};

export type AccountTrend = {
  status?: string;
  period?: string;
  start?: string | null;
  end?: string | null;
  notes?: string | null;
  points?: AccountTrendPoint[];
};

export type AccountHealthSignal = {
  code: string;
  severity: string;
  label: string;
  detail: string;
  target: string;
};

export type AccountRelationship = {
  health?: {
    state?: string;
    label?: string;
    reason?: string | null;
    signals: AccountHealthSignal[];
  };
  estimates: {
    internal: { state: string; notes?: string | null; items: Array<{ quote_number?: string | null; status?: string | null; amount?: number | null; updated_at?: string | null }> };
    studio: { state: string; notes?: string | null; items: Array<{ name?: string | null; status?: string | null; updated_at?: string | null }> };
  };
  jobs: { state: string; notes?: string | null };
  quoteFlow?: { state: string; notes?: string | null };
};

export type AccountTimelineItem = {
  id: string;
  at?: string | null;
  family?: string;
  type?: string;
  source?: string;
  title?: string;
  detail?: string | null;
  amount?: number | null;
};

export type AccountTimelineResponse = {
  ok?: boolean;
  items?: AccountTimelineItem[];
  pagination?: { page?: number; limit?: number; has_more?: boolean };
};

export type AccountFinancialsResponse = {
  ok?: boolean;
  financials?: AccountFinancials;
};

export type AccountTrendResponse = {
  ok?: boolean;
  trend?: AccountTrend;
};

export type AccountRelationshipResponse = {
  ok?: boolean;
  relationship?: AccountRelationship;
};

export type PermissionsResponse = {
  ok?: boolean;
  permissions?: AccountDirectoryPermissions;
};

export type CreateAccountPayload = {
  displayName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  city?: string;
  state?: string;
  rowVersion?: number;
};

export type UpdateAccountPayload = Partial<CreateAccountPayload> & {
  status?: AccountStatus;
  rowVersion?: number;
};

export type AddContactPayload = {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
};

export type AddLocationPayload = {
  label?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  isPrimary?: boolean;
};

export type AddAliasPayload = {
  alias: string;
  source?: string;
};
