/**
 * Elite 100 Estimate Studio — Account Directory lookup (Studio head scope).
 * Reuses Account Directory service + shared snapshot helpers.
 * Do NOT call /api/internal-quotes/account-lookup from the Studio frontend.
 */

import {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  permissionsForRole,
  roleHasCapability
} from "../accountDirectory/accountDirectoryAuth.mjs";
import {
  actorRole,
  actorUserId,
  createProspectForEstimate,
  getAccountDirectoryServiceForEstimate,
  loadAccountForEstimateSelection,
  lookupAccountsForEstimate,
  toEstimateLookupItem
} from "../quotes/internalQuoteAccountLookup.mjs";
import {
  buildCustomerIdentitySnapshot,
  isAccountDirectoryUuid,
  normalizeCustomerIdentitySnapshot,
  resolveIdentityPersistFields
} from "../quotes/customerIdentitySnapshot.mjs";

/**
 * Apply resolved identity columns + sync safe display fields into scope.
 * Never writes Account Directory UUIDs into partnerAccountId.
 *
 * @param {{
 *   body: Record<string, unknown>,
 *   existingRow: Record<string, unknown>,
 *   nextScope: Record<string, unknown>,
 *   saveMode?: string
 * }} args
 */
export function applyStudioAccountDirectoryIdentity({
  body,
  existingRow,
  nextScope,
  saveMode = "update_existing"
}) {
  const identityBody = {
    account_directory_account_id:
      body.accountDirectoryAccountId ??
      body.account_directory_account_id ??
      nextScope.accountDirectoryAccountId ??
      null,
    account_directory_contact_id:
      body.accountDirectoryContactId ??
      body.account_directory_contact_id ??
      nextScope.accountDirectoryContactId ??
      null,
    account_directory_location_id:
      body.accountDirectoryLocationId ??
      body.account_directory_location_id ??
      nextScope.accountDirectoryLocationId ??
      null,
    customer_identity_snapshot:
      body.customerIdentitySnapshot ??
      body.customer_identity_snapshot ??
      nextScope.customerIdentitySnapshot ??
      null,
    explicit_account_relink: Boolean(
      body.explicitAccountRelink ?? body.explicit_account_relink ?? nextScope.explicitAccountRelink
    ),
    refresh_customer_identity: Boolean(
      body.refreshCustomerIdentity ??
        body.refresh_customer_identity ??
        nextScope.refreshCustomerIdentity
    )
  };

  const existingIdentity = {
    account_directory_account_id: existingRow?.accountDirectoryAccountId ?? null,
    account_directory_contact_id: existingRow?.accountDirectoryContactId ?? null,
    account_directory_location_id: existingRow?.accountDirectoryLocationId ?? null,
    customer_identity_snapshot: existingRow?.customerIdentitySnapshot ?? null
  };

  const resolved = resolveIdentityPersistFields({
    body: identityBody,
    existingRow: existingIdentity,
    saveMode
  });

  const snap = normalizeCustomerIdentitySnapshot(resolved.customer_identity_snapshot);
  const scope = { ...nextScope };

  // Strip one-shot flags so they are not persisted into scope_json forever.
  delete scope.explicitAccountRelink;
  delete scope.refreshCustomerIdentity;

  scope.accountDirectoryAccountId = resolved.account_directory_account_id;
  scope.accountDirectoryContactId = resolved.account_directory_contact_id;
  scope.accountDirectoryLocationId = resolved.account_directory_location_id;
  scope.customerIdentitySnapshot = snap;

  // Autofill display fields from frozen snapshot when linked (never touch partnerAccountId).
  if (snap) {
    if (snap.accountDisplayName) scope.customerName = String(snap.accountDisplayName);
    if (snap.contactDisplayName) scope.customerContactName = String(snap.contactDisplayName);
    if (snap.contactEmail) scope.customerEmail = String(snap.contactEmail);
    if (snap.contactPhone) scope.customerPhone = String(snap.contactPhone);
    // Prefer account location as project address only when address was empty or refresh requested.
    const addr = [snap.addressLine1, [snap.city, snap.state].filter(Boolean).join(", "), snap.postalCode]
      .filter(Boolean)
      .join(", ");
    if (addr && (identityBody.refresh_customer_identity || !String(scope.projectAddress || "").trim())) {
      scope.projectAddress = addr;
    }
  } else if (!resolved.account_directory_account_id) {
    scope.accountDirectoryAccountId = null;
    scope.accountDirectoryContactId = null;
    scope.accountDirectoryLocationId = null;
    scope.customerIdentitySnapshot = null;
  }

  // Hard guard: AD account UUID must never land in partner pricing id.
  if (
    scope.partnerAccountId &&
    resolved.account_directory_account_id &&
    String(scope.partnerAccountId) === String(resolved.account_directory_account_id)
  ) {
    scope.partnerAccountId = existingRow?.scope?.partnerAccountId ?? null;
  }

  return {
    scope,
    accountDirectoryAccountId: resolved.account_directory_account_id,
    accountDirectoryContactId: resolved.account_directory_contact_id,
    accountDirectoryLocationId: resolved.account_directory_location_id,
    customerIdentitySnapshot: snap
  };
}

/**
 * Prefer frozen snapshot for queue / staff labels (no live AD fetch).
 * @param {Record<string, unknown>|null|undefined} scope
 * @param {Record<string, unknown>|null|undefined} [rowSnapshot]
 */
export function studioCustomerLabelFromIdentity(scope, rowSnapshot = null) {
  const snap =
    normalizeCustomerIdentitySnapshot(rowSnapshot) ||
    normalizeCustomerIdentitySnapshot(scope?.customerIdentitySnapshot);
  if (snap?.accountDisplayName) return String(snap.accountDisplayName).trim();
  const name = String(scope?.customerName ?? "").trim();
  return name || null;
}

export {
  ACCOUNT_DIRECTORY_CAPABILITIES,
  actorRole,
  actorUserId,
  buildCustomerIdentitySnapshot,
  createProspectForEstimate,
  getAccountDirectoryServiceForEstimate,
  isAccountDirectoryUuid,
  loadAccountForEstimateSelection,
  lookupAccountsForEstimate,
  normalizeCustomerIdentitySnapshot,
  permissionsForRole,
  roleHasCapability,
  toEstimateLookupItem
};
