/**
 * Account Directory write-payload normalization at the HTTP boundary.
 *
 * Canonical field: displayName
 * Deprecated alias: name (accepted only here; prefer displayName when both present)
 */

const MAX_TEXT = 200;
const MAX_NOTES_DISCARD = true; // notes are not an account_directory_accounts column

/**
 * @param {unknown} value
 * @param {number} [max]
 */
export function trimBounded(value, max = MAX_TEXT) {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    return { error: "invalid_type" };
  }
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) return s.slice(0, max);
  return s;
}

/**
 * Resolve canonical displayName from a request body.
 * Prefers displayName over deprecated `name`.
 *
 * @param {Record<string, unknown> | null | undefined} body
 * @returns {{
 *   displayName: string | null,
 *   usedDeprecatedNameAlias: boolean,
 *   typeError: boolean
 * }}
 */
export function resolveDisplayNameFromBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  const hasDisplay = Object.prototype.hasOwnProperty.call(raw, "displayName");
  const hasName = Object.prototype.hasOwnProperty.call(raw, "name");

  let chosen = undefined;
  let usedDeprecatedNameAlias = false;

  if (hasDisplay) {
    chosen = raw.displayName;
  } else if (hasName) {
    chosen = raw.name;
    usedDeprecatedNameAlias = true;
  }

  if (chosen === undefined || chosen === null) {
    return { displayName: null, usedDeprecatedNameAlias, typeError: false };
  }
  if (typeof chosen !== "string" && typeof chosen !== "number") {
    return { displayName: null, usedDeprecatedNameAlias, typeError: true };
  }
  const displayName = String(chosen).trim();
  return {
    displayName: displayName || null,
    usedDeprecatedNameAlias,
    typeError: false
  };
}

/**
 * Normalize create/update account body into the service-domain payload.
 * Drops unsupported `notes` (no account notes column in v1).
 *
 * @param {Record<string, unknown> | null | undefined} body
 * @param {{ requireDisplayName?: boolean }} [opts]
 */
export function normalizeAccountWritePayload(body, opts = {}) {
  const raw = body && typeof body === "object" ? body : {};
  const { displayName, usedDeprecatedNameAlias, typeError } = resolveDisplayNameFromBody(raw);

  if (typeError) {
    return {
      ok: false,
      code: "invalid_display_name_type",
      error: "Account name must be text."
    };
  }

  if (opts.requireDisplayName !== false && !displayName) {
    return {
      ok: false,
      code: "display_name_required",
      error: "Account name is required."
    };
  }

  /** @type {Record<string, unknown>} */
  const payload = {};
  if (displayName != null) payload.displayName = displayName;

  const email = trimBounded(raw.primaryEmail, 320);
  if (email && typeof email === "object" && email.error) {
    return { ok: false, code: "invalid_primary_email_type", error: "Primary email must be text." };
  }
  if (email) payload.primaryEmail = email;

  const phone = trimBounded(raw.primaryPhone, 64);
  if (phone && typeof phone === "object" && phone.error) {
    return { ok: false, code: "invalid_primary_phone_type", error: "Primary phone must be text." };
  }
  if (phone) payload.primaryPhone = phone;

  const city = trimBounded(raw.city, 120);
  if (city && typeof city === "object" && city.error) {
    return { ok: false, code: "invalid_city_type", error: "City must be text." };
  }
  if (city) payload.city = city;

  const state = trimBounded(raw.state, 64);
  if (state && typeof state === "object" && state.error) {
    return { ok: false, code: "invalid_state_type", error: "State must be text." };
  }
  if (state) payload.state = state;

  const line1 = trimBounded(raw.line1 ?? raw.addressLine1, 200);
  if (line1 && typeof line1 === "object" && line1.error) {
    return { ok: false, code: "invalid_line1_type", error: "Address line must be text." };
  }
  if (line1) payload.line1 = line1;

  const postalCode = trimBounded(raw.postalCode, 32);
  if (postalCode && typeof postalCode === "object" && postalCode.error) {
    return { ok: false, code: "invalid_postal_code_type", error: "Postal code must be text." };
  }
  if (postalCode) payload.postalCode = postalCode;

  const legalName = trimBounded(raw.legalName, 200);
  if (legalName && typeof legalName === "object" && legalName.error) {
    return { ok: false, code: "invalid_legal_name_type", error: "Legal name must be text." };
  }
  if (legalName) payload.legalName = legalName;

  if (raw.status != null) payload.status = String(raw.status).trim();
  if (raw.rowVersion != null) payload.rowVersion = Number(raw.rowVersion);
  if (raw.expectedRowVersion != null) payload.expectedRowVersion = Number(raw.expectedRowVersion);
  if (raw.primaryContactName != null) {
    const pc = trimBounded(raw.primaryContactName, 200);
    if (pc && typeof pc !== "object") payload.primaryContactName = pc;
  }

  // Explicitly do not forward notes — not persisted on accounts in v1.
  if (MAX_NOTES_DISCARD && "notes" in raw) {
    /* discarded */
  }

  return {
    ok: true,
    payload,
    usedDeprecatedNameAlias
  };
}
