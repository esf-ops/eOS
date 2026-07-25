/**
 * Safe estimator-facing identity display fallbacks (AUDIT identity / Unknown cleanup).
 * Display-only — never writes snapshots, AD, publications, or intake fields.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  return String(value ?? "").trim();
}

/**
 * True when a label looks like a raw id (UUID / truncated stub) — never primary UI.
 * @param {string} value
 */
export function looksLikeRawIdLabel(value) {
  const s = trimStr(value);
  if (!s) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^user\s+[0-9a-f-]{6,}/i.test(s)) return true;
  if (/^[0-9a-f]{8,}\.?\.?\.?$/i.test(s) && s.length <= 40) return true;
  return false;
}

/**
 * Customer display fallback (queue / Command Center).
 * Order:
 * 1. Estimate identity snapshot display name
 * 2. Linked Account Directory safe display name (batched enrichment)
 * 3. Intake-extracted customer/company name
 * 4. Safe sender display name (contextual — not canonical)
 * 5. "Customer not identified"
 *
 * Email is never used as the primary label.
 *
 * @param {object} input
 * @returns {{ label: string, source: string }}
 */
export function resolveCustomerDisplayLabel(input = {}) {
  const snap =
    input.customerIdentitySnapshot && typeof input.customerIdentitySnapshot === "object"
      ? input.customerIdentitySnapshot
      : null;
  const fromSnap =
    trimStr(snap?.accountDisplayName) ||
    trimStr(snap?.companyName) ||
    trimStr(snap?.displayName) ||
    trimStr(snap?.contactName);
  if (fromSnap && !looksLikeRawIdLabel(fromSnap)) {
    return { label: fromSnap, source: "estimate_snapshot" };
  }

  const fromAd = trimStr(input.accountDirectoryDisplayName || input.accountDisplayName);
  if (fromAd && !looksLikeRawIdLabel(fromAd)) {
    return { label: fromAd, source: "account_directory" };
  }

  const fromIntake =
    trimStr(input.intakeCustomerName) ||
    trimStr(input.extractedCustomerName) ||
    trimStr(input.customerName);
  // Avoid treating our own previous fallback as a real name.
  if (
    fromIntake &&
    !looksLikeRawIdLabel(fromIntake) &&
    fromIntake !== "Unknown" &&
    fromIntake !== "Unknown customer" &&
    fromIntake !== "Customer not identified" &&
    !fromIntake.includes("@")
  ) {
    return { label: fromIntake, source: "intake" };
  }

  const sender = trimStr(input.senderDisplayName || input.senderLabel);
  if (
    sender &&
    !looksLikeRawIdLabel(sender) &&
    !sender.includes("@") &&
    sender.toLowerCase() !== "unknown"
  ) {
    return { label: sender, source: "sender_context" };
  }

  return { label: "Customer not identified", source: "fallback" };
}

/**
 * Project display fallback.
 * 1. Estimate scope project name
 * 2. Intake-extracted project name
 * 3. "Project not named"
 *
 * @param {object} input
 * @returns {{ label: string, source: string }}
 */
export function resolveProjectDisplayLabel(input = {}) {
  const fromScope = trimStr(input.projectName || input.scopeProjectName);
  if (
    fromScope &&
    !looksLikeRawIdLabel(fromScope) &&
    fromScope.toLowerCase() !== "unknown" &&
    fromScope !== "Project not named"
  ) {
    return { label: fromScope, source: "estimate_scope" };
  }
  const fromIntake = trimStr(input.intakeProjectName || input.extractedProjectName);
  if (fromIntake && !looksLikeRawIdLabel(fromIntake) && fromIntake.toLowerCase() !== "unknown") {
    return { label: fromIntake, source: "intake" };
  }
  return { label: "Project not named", source: "fallback" };
}

/**
 * Estimator assignment label.
 * @param {object} input
 * @returns {{ label: string, source: string }}
 */
export function resolveEstimatorDisplayLabel(input = {}) {
  const raw = trimStr(input.assignedEstimatorLabel || input.assignedUser);
  if (!raw || raw === "Unassigned" || looksLikeRawIdLabel(raw)) {
    return { label: "Unassigned", source: "fallback" };
  }
  return { label: raw, source: "assignment" };
}
