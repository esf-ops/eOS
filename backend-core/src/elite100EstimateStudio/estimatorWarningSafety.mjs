/**
 * Split calculator/adapter warnings into estimator-safe vs internal diagnostics.
 * Internal diagnostics stay in logs/tests — never in the normal estimator UI.
 */

const INTERNAL_ADAPTER_CODES = new Set([
  "adapter_edge_lf_single_room_assignment",
  "adapter_miter_single_room_assignment",
  "adapter_addon_room_assignment_ambiguous",
  "adapter_scope_adjustments_not_translated",
  "adapter_edge_adjustment_not_translated",
  "adapter_edge_override_not_translated",
  "adapter_percent_discount_not_translated"
]);

const INTERNAL_MESSAGE_PATTERNS = [
  /\bopts\./i,
  /\bedgeRoomId\b/i,
  /\broomAssignments\b/i,
  /\bqty-(sink|bar|cook|outlet)\b/i,
  /\btakeoff-[a-z0-9_-]+/i,
  /\bthe adapter assigned\b/i,
  /\bPass opts\./i,
  /\bnew calculator'?s? Scope contract\b/i,
  /\bnot translated\b/i,
  /\bcamelCase\b/i
];

function codeOf(w) {
  if (!w || typeof w !== "object") return "";
  return String(w.code || "").trim();
}

function messageOf(w) {
  if (typeof w === "string") return w.trim();
  if (w && typeof w === "object") return String(w.message || "").trim();
  return "";
}

/**
 * @param {unknown} message
 */
export function looksLikeInternalDiagnosticMessage(message) {
  const msg = String(message || "");
  if (!msg) return false;
  return INTERNAL_MESSAGE_PATTERNS.some((re) => re.test(msg));
}

/**
 * @param {Array<object|string>|null|undefined} warnings
 * @returns {{
 *   estimatorWarnings: Array<{ code: string|null, message: string }>,
 *   internalDiagnostics: Array<{ code: string|null, message: string }>
 * }}
 */
export function partitionEstimatorWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : [];
  /** @type {Array<{ code: string|null, message: string }>} */
  const estimatorWarnings = [];
  /** @type {Array<{ code: string|null, message: string }>} */
  const internalDiagnostics = [];

  for (const w of list) {
    const code = codeOf(w) || null;
    const message = messageOf(w) || "Warning";
    const entry = { code, message };

    // Adapter assignment notices are success-path diagnostics once a room was chosen.
    // Keep them internal — do not nag the estimator when pricing already applied.
    if (code && INTERNAL_ADAPTER_CODES.has(code)) {
      internalDiagnostics.push(entry);
      continue;
    }

    if (looksLikeInternalDiagnosticMessage(message)) {
      internalDiagnostics.push(entry);
      continue;
    }

    estimatorWarnings.push(entry);
  }

  return { estimatorWarnings, internalDiagnostics };
}
