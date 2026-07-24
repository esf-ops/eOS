/**
 * Frozen customer identity snapshot for Internal Estimate ↔ Account Directory.
 * Pure helpers — no DB, no secrets, no QuickBooks IDs.
 */

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

/** Forbidden keys that must never appear in a persisted snapshot. */
export const FORBIDDEN_IDENTITY_SNAPSHOT_KEYS = Object.freeze([
  "externalId",
  "external_id",
  "quickbooksListId",
  "qbListId",
  "raw_payload",
  "rawWorkbookRow",
  "balanceDue",
  "lifetimeSales",
  "openAr",
  "financial"
]);

/**
 * Build a safe frozen snapshot from Account Directory detail + selections.
 * @param {{
 *   account: Record<string, unknown>,
 *   contact?: Record<string, unknown> | null,
 *   location?: Record<string, unknown> | null,
 *   snapshotAt?: string
 * }} input
 */
export function buildCustomerIdentitySnapshot(input) {
  const account = input?.account && typeof input.account === "object" ? input.account : null;
  if (!account) return null;
  const accountId = str(account.id ?? account.accountId);
  if (!accountId || !isUuid(accountId)) return null;

  const contact = input.contact && typeof input.contact === "object" ? input.contact : null;
  const location = input.location && typeof input.location === "object" ? input.location : null;

  const snapshot = {
    accountId,
    contactId: contact ? str(contact.id) : null,
    locationId: location ? str(location.id) : null,
    accountDisplayName: str(account.displayName ?? account.name ?? account.accountDisplayName),
    legalName: str(account.legalName),
    accountStatus: str(account.status ?? account.accountStatus) || "active",
    quickbooksLinked: Boolean(account.quickbooksLinked),
    contactDisplayName: contact
      ? str(contact.displayName ?? contact.name ?? contact.contactDisplayName)
      : null,
    contactEmail: contact ? str(contact.email ?? contact.contactEmail) : null,
    contactPhone: contact ? str(contact.phone ?? contact.contactPhone) : null,
    locationLabel: location ? str(location.label ?? location.locationLabel) : null,
    addressLine1: location ? str(location.line1 ?? location.addressLine1) : null,
    addressLine2: location ? str(location.line2 ?? location.addressLine2) : null,
    city: location ? str(location.city) : null,
    state: location ? str(location.state) : null,
    postalCode: location ? str(location.postalCode ?? location.zip) : null,
    snapshotAt: str(input.snapshotAt) || new Date().toISOString()
  };

  assertSafeIdentitySnapshot(snapshot);
  return snapshot;
}

/**
 * Normalize a client-provided snapshot (strip unknowns / forbidden).
 * @param {unknown} raw
 */
export function normalizeCustomerIdentitySnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  /** @type {Record<string, unknown>} */
  const o = /** @type {any} */ (raw);
  const accountId = str(o.accountId ?? o.account_id);
  if (!accountId || !isUuid(accountId)) return null;

  const snapshot = {
    accountId,
    contactId: str(o.contactId ?? o.contact_id),
    locationId: str(o.locationId ?? o.location_id),
    accountDisplayName: str(o.accountDisplayName ?? o.account_display_name),
    legalName: str(o.legalName ?? o.legal_name),
    accountStatus: str(o.accountStatus ?? o.account_status) || "active",
    quickbooksLinked: Boolean(o.quickbooksLinked ?? o.quickbooks_linked),
    contactDisplayName: str(o.contactDisplayName ?? o.contact_display_name),
    contactEmail: str(o.contactEmail ?? o.contact_email),
    contactPhone: str(o.contactPhone ?? o.contact_phone),
    locationLabel: str(o.locationLabel ?? o.location_label),
    addressLine1: str(o.addressLine1 ?? o.address_line1),
    addressLine2: str(o.addressLine2 ?? o.address_line2),
    city: str(o.city),
    state: str(o.state),
    postalCode: str(o.postalCode ?? o.postal_code ?? o.zip),
    snapshotAt: str(o.snapshotAt ?? o.snapshot_at) || new Date().toISOString()
  };
  assertSafeIdentitySnapshot(snapshot);
  return snapshot;
}

/**
 * @param {Record<string, unknown>} snapshot
 */
export function assertSafeIdentitySnapshot(snapshot) {
  for (const key of Object.keys(snapshot || {})) {
    if (FORBIDDEN_IDENTITY_SNAPSHOT_KEYS.includes(key)) {
      throw new Error(`customer_identity_snapshot must not include ${key}`);
    }
  }
  const json = JSON.stringify(snapshot);
  for (const bad of ["qbListId", "ListID", "raw_payload", "lifetimeSales"]) {
    if (json.includes(bad)) {
      throw new Error(`customer_identity_snapshot contains forbidden content (${bad})`);
    }
  }
}

/**
 * Map snapshot → legacy header / job_info fields for backward-compatible display.
 * @param {Record<string, unknown> | null} snapshot
 */
export function legacyFieldsFromIdentitySnapshot(snapshot) {
  if (!snapshot) {
    return {
      account_name: null,
      customer_name: null,
      customer_email: null,
      customer_phone: null,
      job_info: null
    };
  }
  const accountName = str(snapshot.accountDisplayName);
  const contactName = str(snapshot.contactDisplayName);
  return {
    account_name: accountName,
    customer_name: contactName || accountName,
    customer_email: str(snapshot.contactEmail),
    customer_phone: str(snapshot.contactPhone),
    job_info: {
      account: accountName,
      account_contact_email: str(snapshot.contactEmail),
      account_contact_phone: str(snapshot.contactPhone)
    }
  };
}

/**
 * Resolve account linkage fields for persist given save mode + existing row.
 * @param {{
 *   body: Record<string, unknown>,
 *   existingRow?: Record<string, unknown> | null,
 *   saveMode: string
 * }} args
 */
export function resolveIdentityPersistFields({ body, existingRow = null, saveMode }) {
  const mode = String(saveMode || "create").trim();
  const incomingAccountId = str(body.account_directory_account_id ?? body.accountDirectoryAccountId);
  const incomingContactId = str(body.account_directory_contact_id ?? body.accountDirectoryContactId);
  const incomingLocationId = str(
    body.account_directory_location_id ?? body.accountDirectoryLocationId
  );
  const incomingSnapshot = normalizeCustomerIdentitySnapshot(
    body.customer_identity_snapshot ?? body.customerIdentitySnapshot
  );
  const explicitRelink = Boolean(body.explicit_account_relink ?? body.explicitAccountRelink);
  const refreshIdentity = Boolean(body.refresh_customer_identity ?? body.refreshCustomerIdentity);

  const existingAccountId = existingRow ? str(existingRow.account_directory_account_id) : null;
  const existingContactId = existingRow ? str(existingRow.account_directory_contact_id) : null;
  const existingLocationId = existingRow ? str(existingRow.account_directory_location_id) : null;
  const existingSnapshot =
    existingRow?.customer_identity_snapshot && typeof existingRow.customer_identity_snapshot === "object"
      ? normalizeCustomerIdentitySnapshot(existingRow.customer_identity_snapshot)
      : null;

  // Unlinked path
  if (!incomingAccountId && !existingAccountId) {
    return {
      account_directory_account_id: null,
      account_directory_contact_id: null,
      account_directory_location_id: null,
      customer_identity_snapshot: null
    };
  }

  if (mode === "update_existing" && existingRow) {
    // Explicit clear / unlink (Change account → leave unlinked → save)
    if (!incomingAccountId && explicitRelink) {
      return {
        account_directory_account_id: null,
        account_directory_contact_id: null,
        account_directory_location_id: null,
        customer_identity_snapshot: null
      };
    }
    const accountChanging =
      String(existingAccountId || "") !== String(incomingAccountId || "");
    if (accountChanging && !explicitRelink) {
      // Retain prior linkage + snapshot unless explicitly relinking
      return {
        account_directory_account_id: existingAccountId,
        account_directory_contact_id: existingContactId,
        account_directory_location_id: existingLocationId,
        customer_identity_snapshot: existingSnapshot
      };
    }
    if (!refreshIdentity && !accountChanging && existingSnapshot) {
      return {
        account_directory_account_id: incomingAccountId || existingAccountId,
        account_directory_contact_id: incomingContactId || existingContactId,
        account_directory_location_id: incomingLocationId || existingLocationId,
        customer_identity_snapshot: existingSnapshot
      };
    }
    return {
      account_directory_account_id: incomingAccountId,
      account_directory_contact_id: incomingContactId,
      account_directory_location_id: incomingLocationId,
      customer_identity_snapshot: incomingSnapshot || existingSnapshot
    };
  }

  if (mode === "save_revision" && existingRow) {
    if (refreshIdentity) {
      return {
        account_directory_account_id: incomingAccountId || existingAccountId,
        account_directory_contact_id: incomingContactId || existingContactId,
        account_directory_location_id: incomingLocationId || existingLocationId,
        customer_identity_snapshot: incomingSnapshot || existingSnapshot
      };
    }
    // Preserve prior frozen snapshot + IDs by default
    return {
      account_directory_account_id: existingAccountId || incomingAccountId,
      account_directory_contact_id: existingContactId || incomingContactId,
      account_directory_location_id: existingLocationId || incomingLocationId,
      customer_identity_snapshot: existingSnapshot || incomingSnapshot
    };
  }

  // create / save_as_new_quote
  return {
    account_directory_account_id: incomingAccountId,
    account_directory_contact_id: incomingContactId,
    account_directory_location_id: incomingLocationId,
    customer_identity_snapshot: incomingSnapshot
  };
}

/**
 * Prefer frozen snapshot for customer-facing document identity fields.
 * @param {Record<string, unknown>} header
 */
export function documentIdentityFromHeader(header) {
  const snap = normalizeCustomerIdentitySnapshot(header?.customer_identity_snapshot);
  if (snap) {
    return {
      accountName: str(snap.accountDisplayName),
      customerName: str(snap.contactDisplayName) || str(snap.accountDisplayName),
      customerEmail: str(snap.contactEmail),
      customerPhone: str(snap.contactPhone),
      city: str(snap.city),
      state: str(snap.state),
      postalCode: str(snap.postalCode),
      addressLine1: str(snap.addressLine1),
      fromSnapshot: true
    };
  }
  return {
    accountName: str(header?.account_name),
    customerName: str(header?.customer_name),
    customerEmail: str(header?.customer_email),
    customerPhone: str(header?.customer_phone),
    city: str(header?.city),
    state: str(header?.state),
    postalCode: str(header?.zip),
    addressLine1: str(header?.project_address),
    fromSnapshot: false
  };
}

export { isUuid as isAccountDirectoryUuid };
