/**
 * Account Directory selection helpers for Internal Estimate (pure, testable).
 */

/**
 * @param {Record<string, unknown> | null | undefined} snapshot
 * @param {Record<string, unknown> | null | undefined} liveAccount
 */
export function liveAccountDiffersFromSnapshot(snapshot, liveAccount) {
  if (!snapshot || !liveAccount) return false;
  const snapName = String(snapshot.accountDisplayName ?? "").trim().toLowerCase();
  const liveName = String(liveAccount.displayName ?? liveAccount.name ?? "")
    .trim()
    .toLowerCase();
  if (snapName && liveName && snapName !== liveName) return true;
  const snapStatus = String(snapshot.accountStatus ?? "").trim().toLowerCase();
  const liveStatus = String(liveAccount.status ?? "").trim().toLowerCase();
  if (snapStatus && liveStatus && snapStatus !== liveStatus) return true;
  return false;
}

/**
 * Apply a draft snapshot into free-text Job Info fields (account/contact).
 * Project/jobsite fields are intentionally not overwritten.
 * @param {Record<string, unknown> | null} snapshot
 */
export function jobInfoFieldsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      accountName: "",
      accountPhone: "",
      accountEmail: "",
      customerName: "",
      phone: "",
      email: ""
    };
  }
  const accountName = String(snapshot.accountDisplayName ?? "").trim();
  const contactName = String(snapshot.contactDisplayName ?? "").trim();
  return {
    accountName,
    accountPhone: String(snapshot.contactPhone ?? "").trim(),
    accountEmail: String(snapshot.contactEmail ?? "").trim(),
    customerName: contactName || accountName,
    phone: String(snapshot.contactPhone ?? "").trim(),
    email: String(snapshot.contactEmail ?? "").trim()
  };
}

/**
 * Build save payload identity fields from working draft state.
 */
export function buildIdentitySaveFields(state) {
  const accountId = String(state?.accountId ?? "").trim() || null;
  if (!accountId) {
    return {
      account_directory_account_id: null,
      account_directory_contact_id: null,
      account_directory_location_id: null,
      customer_identity_snapshot: null,
      explicit_account_relink: false,
      refresh_customer_identity: false
    };
  }
  return {
    account_directory_account_id: accountId,
    account_directory_contact_id: String(state?.contactId ?? "").trim() || null,
    account_directory_location_id: String(state?.locationId ?? "").trim() || null,
    customer_identity_snapshot: state?.snapshot ?? null,
    explicit_account_relink: Boolean(state?.explicitRelink),
    refresh_customer_identity: Boolean(state?.refreshIdentity)
  };
}
