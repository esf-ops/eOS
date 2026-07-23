/**
 * Shared Account Directory create/edit draft helpers (runtime).
 * Canonical account name field: displayName
 */

export function emptyAccountWriteDraft() {
  return {
    displayName: "",
    primaryEmail: "",
    primaryPhone: "",
    city: "",
    state: ""
  };
}

export function validateAccountDisplayName(raw) {
  const displayName = String(raw ?? "").trim();
  if (!displayName) return "Account name is required.";
  return null;
}

export function serializeAccountWritePayload(draft, extras = {}) {
  const displayName = String(draft?.displayName ?? "").trim();
  const payload = { displayName };

  const primaryEmail = String(draft?.primaryEmail ?? "").trim();
  if (primaryEmail) payload.primaryEmail = primaryEmail;

  const primaryPhone = String(draft?.primaryPhone ?? "").trim();
  if (primaryPhone) payload.primaryPhone = primaryPhone;

  const city = String(draft?.city ?? "").trim();
  if (city) payload.city = city;

  const state = String(draft?.state ?? "").trim();
  if (state) payload.state = state;

  if (extras?.rowVersion != null) payload.rowVersion = extras.rowVersion;

  return payload;
}

export function draftFromAccountDetail(detail) {
  return {
    displayName: String(detail?.displayName ?? detail?.name ?? "").trim(),
    primaryEmail: String(detail?.primaryEmail ?? ""),
    primaryPhone: String(detail?.primaryPhone ?? ""),
    city: String(detail?.city ?? ""),
    state: String(detail?.state ?? "")
  };
}
