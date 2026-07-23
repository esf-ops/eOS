export type AccountTab = "accounts" | "prospects" | "needs_review" | "archived";

export type AccountStatus = "active" | "prospect" | "needs_review" | "archived" | string;

export type AccountListItem = {
  id: string;
  name: string;
  primaryContact?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  city?: string | null;
  state?: string | null;
  status: AccountStatus;
  quickbooksLinked?: boolean;
  updatedAt?: string | null;
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
  externalId: string;
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

export type AccountListResponse = {
  ok?: boolean;
  items?: AccountListItem[];
  total?: number;
};

export type AccountDetailResponse = {
  ok?: boolean;
  account?: AccountDetail;
};

export type PermissionsResponse = {
  ok?: boolean;
  permissions?: AccountDirectoryPermissions;
};

export type CreateAccountPayload = {
  name: string;
  primaryEmail?: string;
  primaryPhone?: string;
  city?: string;
  state?: string;
  notes?: string;
};

export type UpdateAccountPayload = Partial<CreateAccountPayload> & {
  status?: AccountStatus;
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
