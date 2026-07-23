/**
 * Shared Account Directory create/edit draft helpers.
 * Canonical account name field: displayName (API + form state).
 */

export type AccountWriteDraft = {
  displayName: string;
  primaryEmail: string;
  primaryPhone: string;
  city: string;
  state: string;
};

export type CreateAccountInput = {
  displayName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  city?: string;
  state?: string;
  rowVersion?: number;
};

export {
  emptyAccountWriteDraft,
  validateAccountDisplayName,
  serializeAccountWritePayload,
  draftFromAccountDetail
} from "./accountDirectoryForm.mjs";
