import {
  CATALOG_VALIDATION_STATES,
  EXTRACTED_FIELD_KEYS,
  MESSAGE_INTENTS,
  WORKFLOW_ELIGIBILITIES
} from "../src/classification/classificationTypes.mjs";

const SUGGESTED_STATUSES = new Set([
  "qil_intake_review",
  "qil_manual_review",
  "qil_not_quote",
  "qil_not_elite_100"
]);

const SOURCE_TYPES = new Set([
  "subject",
  "body",
  "sender",
  "recipient",
  "attachment_filename",
  "manual_correction"
]);

const MISSING_SEVERITIES = new Set(["quote_blocking", "estimator_review", "helpful_but_not_blocking"]);

/**
 * Validate + sanitize a model JSON payload into IntakeClassificationResult.
 * @param {unknown} raw
 * @param {object} request
 * @param {{ providerName: string, providerMode: string, providerVersion: string }} providerMeta
 */
export function validateAndNormalizeClassificationResult(raw, request, providerMeta) {
  const warnings = [];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    const err = new Error("Classification result must be a JSON object.");
    err.code = "INVALID_RESULT";
    err.statusCode = 422;
    throw err;
  }

  /** @type {any} */
  const input = raw;

  const intent = asEnum(input.intent, MESSAGE_INTENTS, "unclear", warnings, "intent");
  const workflowEligibility = asEnum(
    input.workflowEligibility,
    WORKFLOW_ELIGIBILITIES,
    "manual_review_required",
    warnings,
    "workflowEligibility"
  );
  const catalogValidationState = asEnum(
    input.catalogValidationState,
    CATALOG_VALIDATION_STATES,
    "not_checked",
    warnings,
    "catalogValidationState"
  );
  let suggestedStatus = asEnum(
    input.suggestedStatus,
    [...SUGGESTED_STATUSES],
    "qil_manual_review",
    warnings,
    "suggestedStatus"
  );

  // Coerce status from intent/eligibility if contradictory
  if (intent === "not_quote_related") suggestedStatus = "qil_not_quote";
  else if (workflowEligibility === "non_elite_100_candidate") suggestedStatus = "qil_not_elite_100";
  else if (intent === "unclear" || workflowEligibility === "manual_review_required") {
    if (suggestedStatus === "qil_intake_review") suggestedStatus = "qil_manual_review";
  }

  const sourceMap = buildSourceMap(request);
  const fieldsIn = Array.isArray(input.fields) ? input.fields : [];
  const byKey = new Map();
  for (const f of fieldsIn) {
    if (f && typeof f === "object" && EXTRACTED_FIELD_KEYS.includes(f.key)) {
      byKey.set(f.key, f);
    } else if (f?.key) {
      warnings.push(`Dropped unsupported field key: ${f.key}`);
    }
  }

  const fields = EXTRACTED_FIELD_KEYS.map((key) =>
    normalizeField(byKey.get(key), key, sourceMap, warnings)
  );

  // Strip forbidden product claims
  for (const w of flattenStrings(input.warnings)) {
    if (/price|pricing|takeoff|ocr|visually|opened the (pdf|file)|square footage was calculated/i.test(w)) {
      warnings.push("Stripped provider warning that claimed pricing/takeoff/OCR/attachment inspection.");
      continue;
    }
    warnings.push(w);
  }

  const missingInformation = normalizeMissing(input.missingInformation, warnings);
  const missingKeys = missingInformation.filter((m) => !m.resolved).map((m) => m.key);

  // Reject pricing-like keys if somehow present in raw
  for (const k of Object.keys(input)) {
    if (/price|pricing|takeoff|sf_calc|calculatedSquare/i.test(k)) {
      warnings.push(`Ignored unsupported top-level key: ${k}`);
    }
  }

  const overallConfidence = clamp01(input.overallConfidence, 0.4);
  const intentConfidence = clamp01(input.intentConfidence, overallConfidence);

  return {
    result: {
      intent,
      intentConfidence,
      intentReason: String(input.intentReason ?? "Model intent classification.").slice(0, 500),
      workflowEligibility,
      senderClaimsElite100: Boolean(input.senderClaimsElite100),
      senderElite100Evidence: null,
      catalogValidationState,
      catalogValidationNote: String(
        input.catalogValidationNote ??
          "Non-authoritative catalog state — not production Elite 100 validation."
      ).slice(0, 500),
      overallConfidence,
      confidenceReason: String(
        input.confidenceReason ?? "Live model classification; estimator review required."
      ).slice(0, 500),
      uncertaintyFlags: flattenStrings(input.uncertaintyFlags).slice(0, 20),
      fields,
      missingInformation,
      missingKeys,
      warnings: unique(warnings).slice(0, 40),
      suggestedStatus,
      provider: {
        name: providerMeta.providerName,
        mode: providerMeta.providerMode,
        version: providerMeta.providerVersion
      }
    },
    validationWarnings: unique(warnings)
  };
}

function normalizeField(raw, key, sourceMap, warnings) {
  if (!raw || typeof raw !== "object") {
    return unknownField(key);
  }
  let value = raw.value ?? null;
  let unknown = raw.unknown === true || value == null || value === "";
  if (key === "sinkCutoutCount" || key === "statedSquareFootage") {
    if (value != null && value !== "") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        warnings.push(`Field ${key}: non-numeric value cleared.`);
        value = null;
        unknown = true;
      } else {
        value = n;
      }
    }
  }

  let evidence = null;
  if (!unknown) {
    evidence = validateEvidence(raw.evidence, sourceMap, warnings, key);
    if (!evidence) {
      const rejected = safeRejectedSummary(value);
      const rejectedSuffix = rejected ? ` Rejected: ${rejected}.` : "";
      warnings.push(`Field ${key}: evidence invalid — value marked unknown.${rejectedSuffix}`);
      return unknownField(key, String(raw.confidenceReason ?? ""));
    }
  }

  return {
    key,
    value: unknown ? null : value,
    unknown,
    confidence: unknown ? null : clamp01(raw.confidence, evidence?.confidence ?? 0.5),
    confidenceReason: unknown
      ? "No valid supporting evidence in permitted sources."
      : String(raw.confidenceReason ?? "Model extraction.").slice(0, 300),
    evidence: unknown ? null : evidence,
    humanReviewState: "unreviewed",
    inferredWithoutEvidence: false
  };
}

function validateEvidence(ev, sourceMap, warnings, fieldKey) {
  if (!ev || typeof ev !== "object") return null;
  const sourceType = String(ev.sourceType ?? "");
  const safeExcerpt =
    ev.excerpt != null && String(ev.excerpt).trim()
      ? ` Excerpt: "${String(ev.excerpt).replace(/\s+/g, " ").trim().slice(0, 80)}".`
      : "";
  if (!SOURCE_TYPES.has(sourceType) || sourceType === "manual_correction") {
    warnings.push(`Field ${fieldKey}: unsupported evidence sourceType.${safeExcerpt}`);
    return null;
  }
  if (sourceType === "attachment_filename") {
    const names = sourceMap.attachmentFilenames;
    const excerpt = String(ev.excerpt ?? ev.sourceId ?? "");
    const hit = names.find((n) => n.toLowerCase() === excerpt.toLowerCase() || excerpt.includes(n));
    if (!hit && !names.some((n) => String(ev.sourceId ?? "").includes(n))) {
      warnings.push(`Field ${fieldKey}: attachment evidence not in supplied filenames.${safeExcerpt}`);
      return null;
    }
    return {
      sourceType,
      sourceId: String(ev.sourceId ?? hit ?? excerpt).slice(0, 200),
      excerpt: String(excerpt || hit).slice(0, 160),
      charStart: null,
      charEnd: null,
      extractionMethod: String(ev.extractionMethod ?? "model").slice(0, 80),
      confidence: clamp01(ev.confidence, 0.55),
      humanConfirmed: false,
      humanCorrected: false
    };
  }

  const hay = sourceMap[sourceType];
  if (hay == null) {
    warnings.push(`Field ${fieldKey}: source ${sourceType} not supplied.${safeExcerpt}`);
    return null;
  }
  const excerpt = String(ev.excerpt ?? "").trim();
  if (!excerpt) {
    warnings.push(`Field ${fieldKey}: empty evidence excerpt.`);
    return null;
  }
  const idx = hay.toLowerCase().indexOf(excerpt.toLowerCase());
  if (idx < 0) {
    warnings.push(
      `Field ${fieldKey}: evidence excerpt not found in ${sourceType}. Excerpt: "${excerpt.slice(0, 80)}".`
    );
    return null;
  }
  let charStart = Number.isFinite(ev.charStart) ? Number(ev.charStart) : idx;
  let charEnd = Number.isFinite(ev.charEnd) ? Number(ev.charEnd) : idx + excerpt.length;
  if (charStart < 0 || charEnd > hay.length || charEnd <= charStart) {
    warnings.push(`Field ${fieldKey}: invalid character range — coerced from excerpt location.`);
    charStart = idx;
    charEnd = idx + excerpt.length;
  }

  return {
    sourceType,
    sourceId: String(ev.sourceId ?? sourceType).slice(0, 200),
    excerpt: excerpt.slice(0, 160),
    charStart,
    charEnd,
    extractionMethod: String(ev.extractionMethod ?? "model").slice(0, 80),
    confidence: clamp01(ev.confidence, 0.55),
    humanConfirmed: false,
    humanCorrected: false
  };
}

function normalizeMissing(list, warnings) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const severity = MISSING_SEVERITIES.has(m.severity) ? m.severity : "estimator_review";
    if (!MISSING_SEVERITIES.has(m.severity)) warnings.push(`Missing item severity coerced for ${m.key}`);
    out.push({
      key: String(m.key ?? "unknown").slice(0, 80),
      severity,
      label: String(m.label ?? m.key ?? "Missing item").slice(0, 120),
      detail: String(m.detail ?? "").slice(0, 400),
      resolved: Boolean(m.resolved)
    });
  }
  return out.slice(0, 40);
}

function buildSourceMap(request) {
  return {
    subject: String(request.subject ?? ""),
    body: String(request.textBody ?? ""),
    sender: `${request.from?.name ?? ""} <${request.from?.email ?? ""}>`,
    recipient: [
      ...(request.to ?? []).map((a) => `${a.name ?? ""} <${a.email ?? ""}>`),
      request.mailbox ? String(request.mailbox) : ""
    ].join("; "),
    attachmentFilenames: (request.attachments ?? []).map((a) => String(a.filename ?? ""))
  };
}

function unknownField(key, reason = "") {
  return {
    key,
    value: null,
    unknown: true,
    confidence: null,
    confidenceReason: reason || "No supporting evidence in permitted sources.",
    evidence: null,
    humanReviewState: "unreviewed",
    inferredWithoutEvidence: false
  };
}

function asEnum(value, allowed, fallback, warnings, label) {
  const v = String(value ?? "");
  if (allowed.includes(v)) return v;
  warnings.push(`Unknown ${label} "${v}" → ${fallback}`);
  return fallback;
}

function clamp01(n, fallback = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

/** Safe, truncated rejected-value summary for warning text (no raw email dump). */
function safeRejectedSummary(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}

function flattenStrings(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").slice(0, 300)).filter(Boolean);
}

function unique(arr) {
  return [...new Set(arr)];
}
