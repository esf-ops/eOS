/**
 * Map validator/normalizer warning strings into display records.
 * Does not change classification outcomes — presentation + acceptance gating only.
 */

/**
 * @typedef {{
 *   code: string,
 *   category: string,
 *   stage: "extraction_validation"|"evidence_validation"|"verification"|"normalization"|"model",
 *   severity: "blocking"|"informational",
 *   message: string,
 *   explanation: string,
 *   fieldKey: string|null,
 *   estimatorActionRequired: boolean
 * }} StructuredValidationWarning
 */

/**
 * @param {string} raw
 * @returns {StructuredValidationWarning}
 */
export function structureValidationWarning(raw) {
  const message = String(raw ?? "").trim();
  const fieldKey = extractFieldKey(message);

  // Sanitizer already cleared the value — informational so clean review can continue.
  if (/evidence invalid — value marked unknown/i.test(message)) {
    return make(
      "EVIDENCE_INVALID_CLEARED",
      "evidence",
      "evidence_validation",
      "informational",
      message,
      "A field lacked valid evidence and was cleared to unknown. Confirm remaining fields or correct manually.",
      fieldKey,
      false
    );
  }
  if (/evidence excerpt not found|unsupported evidence sourceType|empty evidence excerpt|attachment evidence not in supplied|source .+ not supplied/i.test(message)) {
    return make(
      "EVIDENCE_INVALID",
      "evidence",
      "evidence_validation",
      "blocking",
      message,
      "Evidence could not be validated against permitted sources. Re-run classification or manually correct the field before accepting.",
      fieldKey,
      true
    );
  }
  if (/Stripped provider warning that claimed pricing|takeoff|OCR|attachment inspection/i.test(message)) {
    return make(
      "UNSUPPORTED_CLAIM_STRIPPED",
      "integrity",
      "normalization",
      "informational",
      message,
      "The model mentioned pricing, takeoff, OCR, or attachment inspection. That claim was stripped; extracted values were not trusted from it.",
      fieldKey,
      false
    );
  }
  if (/Dropped unsupported field key/i.test(message)) {
    const dropped = message.match(/key:\s*([^\s]+)/i)?.[1] ?? null;
    return make(
      "UNSUPPORTED_FIELD_DROPPED",
      "schema",
      "normalization",
      "informational",
      message,
      "An unsupported field key from the model was ignored and not applied.",
      dropped,
      false
    );
  }
  if (/invalid character range/i.test(message)) {
    return make(
      "EVIDENCE_RANGE_COERCED",
      "evidence",
      "evidence_validation",
      "informational",
      message,
      "Evidence excerpt was found in the source, but the model’s character range was corrected. The value remains supported.",
      fieldKey,
      false
    );
  }
  if (/Unknown \w+ .*→/i.test(message)) {
    return make(
      "ENUM_COERCED",
      "schema",
      "normalization",
      "informational",
      message,
      "An enum value from the model was coerced to a safe schema fallback.",
      fieldKey,
      false
    );
  }
  if (/severity coerced/i.test(message)) {
    return make(
      "MISSING_SEVERITY_COERCED",
      "schema",
      "normalization",
      "informational",
      message,
      "A missing-information severity was coerced to a schema-safe value.",
      fieldKey,
      false
    );
  }
  if (/non-numeric value cleared/i.test(message)) {
    return make(
      "FIELD_CLEARED_NON_NUMERIC",
      "schema",
      "extraction_validation",
      "informational",
      message,
      "A non-numeric value was cleared for a numeric field.",
      fieldKey,
      false
    );
  }
  if (/Ignored unsupported top-level key/i.test(message)) {
    return make(
      "UNSUPPORTED_TOP_LEVEL_KEY",
      "schema",
      "normalization",
      "blocking",
      message,
      "The model returned a disallowed top-level key (e.g. pricing/takeoff). Acceptance is blocked until a clean run is produced.",
      null,
      true
    );
  }
  if (/Classification result must be|INVALID_RESULT/i.test(message)) {
    return make(
      "SCHEMA_INTEGRITY",
      "schema",
      "normalization",
      "blocking",
      message,
      "The classification result failed schema integrity checks.",
      null,
      true
    );
  }

  return make(
    "MODEL_OR_VALIDATOR_WARNING",
    "general",
    "model",
    "informational",
    message,
    message,
    fieldKey,
    false
  );
}

/**
 * @param {string[]|StructuredValidationWarning[]|null|undefined} list
 * @returns {StructuredValidationWarning[]}
 */
export function structureValidationWarnings(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return list.map((item) => {
    if (item && typeof item === "object" && item.code && item.message) {
      return {
        code: String(item.code),
        category: String(item.category ?? "general"),
        stage: item.stage ?? "model",
        severity: item.severity === "blocking" ? "blocking" : "informational",
        message: String(item.message),
        explanation: String(item.explanation ?? item.message),
        fieldKey: item.fieldKey ?? null,
        estimatorActionRequired: Boolean(item.estimatorActionRequired)
      };
    }
    return structureValidationWarning(String(item));
  });
}

/**
 * Collect warnings from a persisted run (back-compat with string-only runs).
 * @param {any} run
 */
export function warningsForRun(run) {
  if (!run) return [];
  if (Array.isArray(run.validationWarnings) && run.validationWarnings.length) {
    return structureValidationWarnings(run.validationWarnings);
  }
  const fromVerification = run.result?.verification?.validationWarnings;
  if (Array.isArray(fromVerification) && fromVerification.length) {
    return structureValidationWarnings(fromVerification);
  }
  return structureValidationWarnings(run.warnings ?? run.result?.warnings ?? []);
}

/** @param {StructuredValidationWarning[]} warnings */
export function hasBlockingValidationWarnings(warnings) {
  return structureValidationWarnings(warnings).some((w) => w.severity === "blocking");
}

function extractFieldKey(message) {
  const m = String(message).match(/Field\s+([A-Za-z0-9_]+)/i);
  return m ? m[1] : null;
}

function make(code, category, stage, severity, message, explanation, fieldKey, estimatorActionRequired) {
  return {
    code,
    category,
    stage,
    severity,
    message,
    explanation,
    fieldKey,
    estimatorActionRequired
  };
}
