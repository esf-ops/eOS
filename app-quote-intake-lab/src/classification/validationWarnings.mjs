/**
 * Map validator/normalizer warning strings into field-level display records.
 * Immutable AI warnings are never deleted; resolution state is layered on review.
 */

import { FIELD_LABELS } from "./classificationTypes.mjs";

/**
 * @typedef {{
 *   warningId: string,
 *   code: string,
 *   category: string,
 *   stage: "extraction_validation"|"evidence_validation"|"verification"|"normalization"|"model",
 *   severity: "blocking"|"informational",
 *   message: string,
 *   explanation: string,
 *   fieldKey: string|null,
 *   fieldLabel: string|null,
 *   safeRejectedValueSummary: string|null,
 *   claimedSourceType: string|null,
 *   safeEvidenceExcerpt: string|null,
 *   validationFailureReason: string|null,
 *   blockingState: "blocking"|"informational"|"contract_defect",
 *   resolutionState: "unresolved"|"resolved_by_human_correction"|"resolved_by_marked_unknown"|"resolved_by_cleared"|"not_applicable",
 *   resolutionMethod: string|null,
 *   resolutionActor: string|null,
 *   resolutionAt: string|null,
 *   relatedCorrectionId: string|null,
 *   estimatorActionRequired: boolean,
 *   requiredResolutionAction: string|null
 * }} StructuredValidationWarning
 */

/**
 * @param {string} raw
 * @param {number} [index]
 * @returns {StructuredValidationWarning}
 */
export function structureValidationWarning(raw, index = 0) {
  const message = String(raw ?? "").trim();
  const fieldKey = extractFieldKey(message);
  const claimedSourceType = extractSourceType(message);
  const safeRejectedValueSummary = extractRejectedSummary(message);
  const safeEvidenceExcerpt = extractEvidenceExcerpt(message);
  const validationFailureReason = extractFailureReason(message);
  const fieldLabel = fieldKey ? FIELD_LABELS[fieldKey] ?? fieldKey : null;

  /** @type {StructuredValidationWarning} */
  let base;

  // Sanitizer already cleared the value — informational so clean review can continue.
  if (/evidence invalid — value marked unknown/i.test(message)) {
    base = make(
      "EVIDENCE_INVALID_CLEARED",
      "evidence",
      "evidence_validation",
      "informational",
      message,
      "A field lacked valid evidence and was cleared to unknown. Confirm remaining fields or correct manually.",
      fieldKey,
      false
    );
  } else if (
    /evidence excerpt not found|unsupported evidence sourceType|empty evidence excerpt|attachment evidence not in supplied|source .+ not supplied/i.test(
      message
    )
  ) {
    base = make(
      "EVIDENCE_INVALID",
      "evidence",
      "evidence_validation",
      "blocking",
      message,
      "Evidence could not be validated against permitted sources. Edit the field with a correction note, or mark it unknown. Do not Confirm the AI value.",
      fieldKey,
      true
    );
  } else if (/Stripped provider warning that claimed pricing|takeoff|OCR|attachment inspection/i.test(message)) {
    base = make(
      "UNSUPPORTED_CLAIM_STRIPPED",
      "integrity",
      "normalization",
      "informational",
      message,
      "The model mentioned pricing, takeoff, OCR, or attachment inspection. That claim was stripped; extracted values were not trusted from it.",
      fieldKey,
      false
    );
  } else if (/Dropped unsupported field key/i.test(message)) {
    const dropped = message.match(/key:\s*([^\s]+)/i)?.[1] ?? null;
    base = make(
      "UNSUPPORTED_FIELD_DROPPED",
      "schema",
      "normalization",
      "informational",
      message,
      "An unsupported field key from the model was ignored and not applied.",
      dropped,
      false
    );
  } else if (/invalid character range/i.test(message)) {
    base = make(
      "EVIDENCE_RANGE_COERCED",
      "evidence",
      "evidence_validation",
      "informational",
      message,
      "Evidence excerpt was found in the source, but the model’s character range was corrected. The value remains supported.",
      fieldKey,
      false
    );
  } else if (/Unknown \w+ .*→/i.test(message)) {
    base = make(
      "ENUM_COERCED",
      "schema",
      "normalization",
      "informational",
      message,
      "An enum value from the model was coerced to a safe schema fallback.",
      fieldKey,
      false
    );
  } else if (/severity coerced/i.test(message)) {
    base = make(
      "MISSING_SEVERITY_COERCED",
      "schema",
      "normalization",
      "informational",
      message,
      "A missing-information severity was coerced to a schema-safe value.",
      fieldKey,
      false
    );
  } else if (/non-numeric value cleared/i.test(message)) {
    base = make(
      "FIELD_CLEARED_NON_NUMERIC",
      "schema",
      "extraction_validation",
      "informational",
      message,
      "A non-numeric value was cleared for a numeric field.",
      fieldKey,
      false
    );
  } else if (/Ignored unsupported top-level key/i.test(message)) {
    base = make(
      "UNSUPPORTED_TOP_LEVEL_KEY",
      "schema",
      "normalization",
      "blocking",
      message,
      "The model returned a disallowed top-level key (e.g. pricing/takeoff). Acceptance is blocked until a clean run is produced.",
      null,
      true
    );
  } else if (/Classification result must be|INVALID_RESULT/i.test(message)) {
    base = make(
      "SCHEMA_INTEGRITY",
      "schema",
      "normalization",
      "blocking",
      message,
      "The classification result failed schema integrity checks.",
      null,
      true
    );
  } else {
    base = make(
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

  const warningId = buildWarningId(base.code, fieldKey, index, message);
  const contractDefect = base.severity === "blocking" && !fieldKey;
  const blockingState = contractDefect
    ? "contract_defect"
    : base.severity === "blocking"
      ? "blocking"
      : "informational";

  return {
    ...base,
    warningId,
    fieldLabel: fieldKey ? FIELD_LABELS[fieldKey] ?? fieldKey : fieldLabel,
    safeRejectedValueSummary,
    claimedSourceType,
    safeEvidenceExcerpt,
    validationFailureReason,
    blockingState,
    resolutionState: base.severity === "blocking" ? "unresolved" : "not_applicable",
    resolutionMethod: null,
    resolutionActor: null,
    resolutionAt: null,
    relatedCorrectionId: null,
    requiredResolutionAction:
      base.code === "EVIDENCE_INVALID"
        ? "Edit with correction note, or Mark unknown / Clear (explicit)"
        : base.severity === "blocking" && !fieldKey
          ? "Re-run classification (no field-level resolution available)"
          : null
  };
}

/**
 * @param {string[]|StructuredValidationWarning[]|null|undefined} list
 * @returns {StructuredValidationWarning[]}
 */
export function structureValidationWarnings(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return list.map((item, index) => {
    if (item && typeof item === "object" && item.code && item.message) {
      const fieldKey = item.fieldKey ?? extractFieldKey(item.message) ?? null;
      const warningId =
        item.warningId ?? buildWarningId(item.code, fieldKey, index, String(item.message));
      const severity = item.severity === "blocking" ? "blocking" : "informational";
      const contractDefect = severity === "blocking" && !fieldKey;
      return {
        warningId,
        code: String(item.code),
        category: String(item.category ?? "general"),
        stage: item.stage ?? "model",
        severity,
        message: String(item.message),
        explanation: String(item.explanation ?? item.message),
        fieldKey,
        fieldLabel: fieldKey ? FIELD_LABELS[fieldKey] ?? fieldKey : null,
        safeRejectedValueSummary: item.safeRejectedValueSummary ?? extractRejectedSummary(item.message),
        claimedSourceType: item.claimedSourceType ?? extractSourceType(item.message),
        safeEvidenceExcerpt: item.safeEvidenceExcerpt ?? extractEvidenceExcerpt(item.message),
        validationFailureReason: item.validationFailureReason ?? extractFailureReason(item.message),
        blockingState:
          item.blockingState ??
          (contractDefect ? "contract_defect" : severity === "blocking" ? "blocking" : "informational"),
        resolutionState: item.resolutionState ?? (severity === "blocking" ? "unresolved" : "not_applicable"),
        resolutionMethod: item.resolutionMethod ?? null,
        resolutionActor: item.resolutionActor ?? null,
        resolutionAt: item.resolutionAt ?? null,
        relatedCorrectionId: item.relatedCorrectionId ?? null,
        estimatorActionRequired: Boolean(item.estimatorActionRequired),
        requiredResolutionAction:
          item.requiredResolutionAction ??
          (item.code === "EVIDENCE_INVALID"
            ? "Edit with correction note, or Mark unknown / Clear (explicit)"
            : null)
      };
    }
    return structureValidationWarning(String(item), index);
  });
}

/**
 * Collect warnings from a persisted run (back-compat with string-only runs).
 * Applies reviewed resolution overlay without mutating the original AI warning list.
 * @param {any} run
 * @returns {StructuredValidationWarning[]}
 */
export function warningsForRun(run) {
  if (!run) return [];
  let list;
  if (Array.isArray(run.validationWarnings) && run.validationWarnings.length) {
    list = structureValidationWarnings(run.validationWarnings);
  } else if (Array.isArray(run.result?.verification?.validationWarnings)) {
    list = structureValidationWarnings(run.result.verification.validationWarnings);
  } else {
    list = structureValidationWarnings(run.warnings ?? run.result?.warnings ?? []);
  }
  return applyResolutions(list, run.warningResolutions ?? [], run.corrections ?? []);
}

/**
 * Blocking warnings that still prevent acceptance after reviewed resolutions.
 * @param {any} run
 */
export function activeBlockingWarnings(run) {
  return warningsForRun(run).filter((w) => {
    if (w.severity !== "blocking") return false;
    if (
      w.resolutionState === "resolved_by_human_correction" ||
      w.resolutionState === "resolved_by_marked_unknown" ||
      w.resolutionState === "resolved_by_cleared"
    ) {
      return false;
    }
    return true;
  });
}

/** @param {StructuredValidationWarning[]} warnings */
export function hasBlockingValidationWarnings(warnings) {
  return structureValidationWarnings(warnings).some((w) => w.severity === "blocking");
}

/** @param {any} run */
export function hasActiveBlockingValidationWarnings(run) {
  return activeBlockingWarnings(run).length > 0;
}

/**
 * Whether Confirm is forbidden for a field due to unresolved invalid evidence.
 * @param {any} run
 * @param {string} fieldKey
 */
export function fieldHasUnresolvedInvalidEvidence(run, fieldKey) {
  return warningsForRun(run).some(
    (w) =>
      w.code === "EVIDENCE_INVALID" &&
      w.fieldKey === fieldKey &&
      w.resolutionState === "unresolved"
  );
}

/**
 * Build resolution records from an applied correction for matching evidence warnings.
 * @param {StructuredValidationWarning[]} immutableWarnings
 * @param {{ id: string, fieldKey: string, action: string, actorLabel: string, at: string }} correction
 */
export function resolutionsForCorrection(immutableWarnings, correction) {
  const action = correction.action;
  if (action === "confirm") return [];

  let resolutionState = "resolved_by_human_correction";
  let resolutionMethod = "human_edit";
  if (action === "mark_unknown") {
    resolutionState = "resolved_by_marked_unknown";
    resolutionMethod = "mark_unknown";
  } else if (action === "clear") {
    resolutionState = "resolved_by_cleared";
    resolutionMethod = "clear";
  } else if (action === "edit") {
    resolutionState = "resolved_by_human_correction";
    resolutionMethod = "human_edit";
  } else {
    return [];
  }

  return structureValidationWarnings(immutableWarnings)
    .filter(
      (w) =>
        w.code === "EVIDENCE_INVALID" &&
        w.fieldKey === correction.fieldKey &&
        w.severity === "blocking"
    )
    .map((w) => ({
      warningId: w.warningId,
      fieldKey: w.fieldKey,
      code: w.code,
      resolutionState,
      resolutionMethod,
      resolutionActor: correction.actorLabel,
      resolutionAt: correction.at,
      relatedCorrectionId: correction.id
    }));
}

/**
 * @param {StructuredValidationWarning[]} warnings
 * @param {Array<object>} resolutions
 * @param {Array<object>} corrections
 */
function applyResolutions(warnings, resolutions, corrections) {
  const byId = new Map();
  for (const r of resolutions ?? []) {
    if (r?.warningId) byId.set(r.warningId, r);
  }
  // Fallback: match unresolved EVIDENCE_INVALID by fieldKey to latest resolving correction
  const correctionsByField = new Map();
  for (const c of corrections ?? []) {
    if (!c?.fieldKey) continue;
    if (c.action === "confirm") continue;
    correctionsByField.set(c.fieldKey, c);
  }

  return warnings.map((w) => {
    const direct = byId.get(w.warningId);
    if (direct) {
      return {
        ...w,
        resolutionState: direct.resolutionState,
        resolutionMethod: direct.resolutionMethod ?? null,
        resolutionActor: direct.resolutionActor ?? null,
        resolutionAt: direct.resolutionAt ?? null,
        relatedCorrectionId: direct.relatedCorrectionId ?? null,
        estimatorActionRequired: false,
        requiredResolutionAction: null
      };
    }
    if (w.code === "EVIDENCE_INVALID" && w.fieldKey && w.resolutionState === "unresolved") {
      const c = correctionsByField.get(w.fieldKey);
      if (c && c.action !== "confirm") {
        const synth = resolutionsForCorrection([w], {
          id: c.id,
          fieldKey: c.fieldKey,
          action: c.action,
          actorLabel: c.actorLabel,
          at: c.at
        })[0];
        if (synth) {
          return {
            ...w,
            resolutionState: synth.resolutionState,
            resolutionMethod: synth.resolutionMethod,
            resolutionActor: synth.resolutionActor,
            resolutionAt: synth.resolutionAt,
            relatedCorrectionId: synth.relatedCorrectionId,
            estimatorActionRequired: false,
            requiredResolutionAction: null
          };
        }
      }
    }
    return w;
  });
}

function buildWarningId(code, fieldKey, index, message) {
  const slim = String(message)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 48);
  return `vw-${code}-${fieldKey ?? "nofield"}-${index}-${slim}`;
}

function extractFieldKey(message) {
  const m = String(message).match(/Field\s+([A-Za-z0-9_]+)/i);
  return m ? m[1] : null;
}

function extractSourceType(message) {
  const m = String(message).match(
    /\b(?:in|source)\s+(subject|body|sender|recipient|attachment_filename)\b/i
  );
  if (m) return m[1].toLowerCase();
  if (/attachment evidence/i.test(message)) return "attachment_filename";
  if (/unsupported evidence sourceType/i.test(message)) return "unsupported";
  return null;
}

function extractRejectedSummary(message) {
  const m = String(message).match(/Rejected:\s*(.+?)\.?\s*$/i);
  if (!m) return null;
  return String(m[1]).slice(0, 80);
}

function extractEvidenceExcerpt(message) {
  const m = String(message).match(/Excerpt:\s*"([^"]{1,120})"/i);
  return m ? m[1] : null;
}

function extractFailureReason(message) {
  const msg = String(message);
  if (/evidence excerpt not found/i.test(msg)) return "excerpt_not_found_in_source";
  if (/unsupported evidence sourceType/i.test(msg)) return "unsupported_source_type";
  if (/empty evidence excerpt/i.test(msg)) return "empty_excerpt";
  if (/attachment evidence not in supplied/i.test(msg)) return "attachment_not_in_filenames";
  if (/source .+ not supplied/i.test(msg)) return "source_not_supplied";
  if (/evidence invalid — value marked unknown/i.test(msg)) return "value_cleared_after_invalid_evidence";
  if (/invalid character range/i.test(msg)) return "range_coerced";
  return null;
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
