/**
 * One configuration-session cookie is shared by every Digital Estimate link open in a browser,
 * so the cookie alone does not prove which estimate the customer is looking at: opening a second
 * link replaces it. Mutations carry the session id the page exchanged; a mismatch means the page
 * is showing a different estimate than the cookie now points to.
 *
 * @param {{ id?: string|null }|null|undefined} session  Session resolved from the cookie.
 * @param {object|null|undefined} body                   Request body.
 * @param {{ required?: boolean }} [opts]
 * @returns {null | "session_binding_missing" | "session_mismatch"}
 */
export function checkConfigurationSessionBinding(session, body, opts = {}) {
  const raw = body?.expectedSessionId ?? body?.expected_session_id;
  const expected = typeof raw === "string" ? raw.trim() : "";
  if (!expected) return opts.required ? "session_binding_missing" : null;
  if (!session?.id || String(session.id) !== expected) return "session_mismatch";
  return null;
}

export const SESSION_MISMATCH_MESSAGE =
  "This estimate was opened in another tab or window. Refresh this page to continue.";
