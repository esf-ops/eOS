import {
  PROVIDER_MODE_SIMULATED,
  PROVIDER_NAME_SIMULATED,
  PROVIDER_VERSION_SIMULATED
} from "./classificationTypes.mjs";
import { evidenceFromFilename, evidenceFromMatch, makeExtractedField } from "./evidence.mjs";
import { evaluateMissingInformation, missingKeysForCase } from "./missingInformation.mjs";

/** Synthetic catalog aliases for simulated_match only — not production Elite 100. */
const SIMULATED_ELITE_COLORS = Object.freeze([
  "calacatta mira",
  "statuario mist",
  "concrete ash",
  "carrara frost"
]);

/**
 * Deterministic, rule-based IntakeIntelligenceProvider.
 * Clearly simulated — never claims visual attachment reading or live AI.
 */
export class SimulatedIntakeIntelligenceProvider {
  get name() {
    return PROVIDER_NAME_SIMULATED;
  }

  get mode() {
    return PROVIDER_MODE_SIMULATED;
  }

  get version() {
    return PROVIDER_VERSION_SIMULATED;
  }

  /**
   * @param {import("./buildClassificationRequest.mjs").buildClassificationRequest extends Function ? any : never} request
   */
  async classify(request) {
    const startedAt = new Date().toISOString();
    const subject = String(request.subject ?? "");
    const body = String(request.textBody ?? "");
    const corpus = `${subject}\n${body}`;
    const warnings = [];

    const intentPack = classifyIntent(corpus, subject, body);
    const eliteClaim = detectElite100Claim(corpus);
    const fields = extractFields(request, corpus, subject, body, warnings);
    const fieldsByKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    const colorField = fieldsByKey.requestedColorText;
    const catalogValidation = simulatedCatalogValidation(colorField);

    let workflowEligibility = intentPack.eligibility;
    if (intentPack.intent === "not_quote_related") {
      workflowEligibility = "program_unknown";
    } else if (intentPack.intent === "unclear") {
      workflowEligibility = "manual_review_required";
    } else if (detectNonEliteMaterial(corpus)) {
      workflowEligibility = "non_elite_100_candidate";
    } else if (eliteClaim.claimed || (colorField && !colorField.unknown)) {
      workflowEligibility = "elite_100_candidate";
    } else if (workflowEligibility !== "manual_review_required") {
      workflowEligibility = "program_unknown";
    }

    const missingInformation = evaluateMissingInformation({
      fieldsByKey,
      attachments: request.attachments ?? [],
      from: request.from
    });

    for (const a of request.attachments ?? []) {
      warnings.push(
        `Attachment “${a.filename}” metadata only — contents not read (no OCR / takeoff).`
      );
    }

    const suggestedStatus = suggestStatus(intentPack.intent, workflowEligibility);
    const overallConfidence = clamp01(intentPack.confidence * (intentPack.intent === "unclear" ? 0.7 : 0.95));

    const result = {
      intent: intentPack.intent,
      intentConfidence: intentPack.confidence,
      intentReason: intentPack.reason,
      workflowEligibility,
      senderClaimsElite100: eliteClaim.claimed,
      senderElite100Evidence: eliteClaim.evidence,
      catalogValidationState: catalogValidation.state,
      catalogValidationNote: catalogValidation.note,
      overallConfidence,
      confidenceReason: `Deterministic simulated rules (${PROVIDER_VERSION_SIMULATED}); not live AI.`,
      uncertaintyFlags: intentPack.uncertaintyFlags,
      fields,
      missingInformation,
      missingKeys: missingKeysForCase(missingInformation),
      warnings: unique(warnings),
      suggestedStatus,
      provider: {
        name: this.name,
        mode: this.mode,
        version: this.version
      }
    };

    return {
      startedAt,
      completedAt: new Date().toISOString(),
      result
    };
  }
}

function classifyIntent(corpus, subject, body) {
  const uncertaintyFlags = [];
  const lower = corpus.toLowerCase();

  if (
    /\b(schedule|scheduled|appointment|service call|warranty|invoice|payment|hours of operation)\b/i.test(
      corpus
    ) &&
    !/\b(quote|estimate|pricing|bid)\b/i.test(corpus)
  ) {
    return {
      intent: "not_quote_related",
      confidence: 0.86,
      reason: "Scheduling/service language without quote/estimate keywords.",
      eligibility: "program_unknown",
      uncertaintyFlags
    };
  }

  if (/\b(revision|revise|revised|update (the )?quote|change (the )?quote)\b/i.test(corpus)) {
    return {
      intent: "quote_revision",
      confidence: 0.84,
      reason: "Revision language matched in subject/body.",
      eligibility: "elite_100_candidate",
      uncertaintyFlags
    };
  }

  if (/\b(question about|clarif(?:y|ication)|follow[- ]?up on quote)\b/i.test(corpus) && !/\bneed (an? )?(quote|estimate)\b/i.test(corpus)) {
    return {
      intent: "quote_question",
      confidence: 0.72,
      reason: "Question/clarification language without a new estimate request.",
      eligibility: "program_unknown",
      uncertaintyFlags: ["may_still_need_quote_work"]
    };
  }

  if (/\b(project update|additional information|updated measurements)\b/i.test(corpus) && !/\b(quote|estimate)\b/i.test(corpus)) {
    return {
      intent: "project_information_update",
      confidence: 0.7,
      reason: "Project information update language without explicit quote request.",
      eligibility: "program_unknown",
      uncertaintyFlags
    };
  }

  if (
    /\b(need an? elite 100 estimate|elite 100|need (an? )?(quote|estimate)|please quote|pricing for)\b/i.test(
      corpus
    )
  ) {
    return {
      intent: "new_quote_request",
      confidence: 0.88,
      reason: "Explicit quote/estimate or Elite 100 request language.",
      eligibility: "elite_100_candidate",
      uncertaintyFlags
    };
  }

  if (detectNonEliteMaterial(corpus) && /\b(quote|estimate|pricing|bid)\b/i.test(corpus)) {
    return {
      intent: "new_quote_request",
      confidence: 0.8,
      reason: "Quote language with explicitly custom / non–Elite 100 material signals.",
      eligibility: "non_elite_100_candidate",
      uncertaintyFlags
    };
  }

  if (/\b(quote|estimate)\b/i.test(corpus)) {
    uncertaintyFlags.push("weak_quote_signal");
    return {
      intent: "unclear",
      confidence: 0.45,
      reason: "Quote keyword present but intent ambiguous — manual review.",
      eligibility: "manual_review_required",
      uncertaintyFlags
    };
  }

  uncertaintyFlags.push("no_strong_intent_signal");
  return {
    intent: "unclear",
    confidence: 0.35,
    reason: "No deterministic quote / non-quote signal — manual review.",
    eligibility: "manual_review_required",
    uncertaintyFlags
  };
}

function detectElite100Claim(corpus) {
  const ev = evidenceFromMatch(corpus, "Elite 100", "body", "corpus", "keyword", 0.9);
  if (ev) return { claimed: true, evidence: ev };
  const ev2 = evidenceFromMatch(corpus, "elite100", "body", "corpus", "keyword", 0.85);
  if (ev2) return { claimed: true, evidence: ev2 };
  return { claimed: false, evidence: null };
}

function detectNonEliteMaterial(corpus) {
  return /\b(quartzite|custom (marble|granite|quartz)|exotic marble|leathered granite)\b/i.test(corpus);
}

function suggestStatus(intent, eligibility) {
  if (intent === "not_quote_related") return "qil_not_quote";
  if (eligibility === "non_elite_100_candidate") return "qil_not_elite_100";
  if (intent === "unclear" || eligibility === "manual_review_required") return "qil_manual_review";
  return "qil_intake_review";
}

function extractFields(request, corpus, subject, body, warnings) {
  const fields = [];

  fields.push(
    fieldRegex(
      "customerAccount",
      corpus,
      /\b(?:customer|account|for)\s*[:\-]\s*([^\n.]{2,80})/i,
      "regex_customer",
      0.7
    ) ||
      fieldRegex("customerAccount", corpus, /\b([A-Z][\w&' ]+(?: Homes| Remodelers| LLC| Inc\.))\b/, "regex_account_name", 0.55) ||
      makeExtractedField("customerAccount", null, null, null)
  );

  fields.push(
    fieldRegex("projectName", corpus, /\b(?:project|job)\s*[:\-]\s*([^\n.]{2,80})/i, "regex_project", 0.75) ||
      fieldRegex("projectName", subject, /\bfor\s+(.+)$/i, "regex_subject_for", 0.5) ||
      makeExtractedField("projectName", null, null, null)
  );

  fields.push(
    fieldRegex(
      "projectAddress",
      corpus,
      /\b(?:address|site|located at)\s*[:\-]\s*([^\n.]{5,120})/i,
      "regex_address",
      0.72
    ) ||
      fieldRegex(
        "projectAddress",
        corpus,
        /\b(\d{1,5}\s+[A-Za-z0-9 .'-]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct)\b[^\n]*)/i,
        "regex_street",
        0.65
      ) ||
      makeExtractedField("projectAddress", null, null, null)
  );

  const color =
    fieldRegex(
      "requestedColorText",
      corpus,
      /\b(?:color|material|stone)\s*[:\-]\s*([^\n.]{2,60})/i,
      "regex_color",
      0.8
    ) ||
    fieldNamedColor(corpus) ||
    makeExtractedField("requestedColorText", null, null, null);
  fields.push(color);

  fields.push(
    fieldRegex(
      "elite100OrPriceGroupText",
      corpus,
      /\b(Elite 100(?:\s+Group\s+[A-Z])?|price group\s+[A-Z]|Group\s+[A-D]\b)/i,
      "regex_elite_group",
      0.78
    ) || makeExtractedField("elite100OrPriceGroupText", null, null, null)
  );

  const sink = fieldRegex(
    "sinkCutoutCount",
    corpus,
    /\b(\d+)\s*(?:sink(?:\s*cutouts?)?|cutouts?)\b/i,
    "regex_sinks",
    0.82
  );
  if (sink && sink.value != null) {
    const n = Number(sink.value);
    fields.push({
      ...sink,
      value: Number.isFinite(n) ? n : sink.value
    });
  } else {
    const alt = fieldRegex("sinkCutoutCount", corpus, /\bsinks?\s*[:\-]\s*(\d+)\b/i, "regex_sinks_alt", 0.8);
    if (alt && alt.value != null) {
      fields.push({ ...alt, value: Number(alt.value) });
    } else {
      fields.push(makeExtractedField("sinkCutoutCount", null, null, null));
    }
  }

  fields.push(
    fieldRegex(
      "edgeProfile",
      corpus,
      /\b(?:edge(?:\s*profile)?|eased|bullnose|ogee|bevel)\s*[:\-]?\s*(eased|bullnose|ogee|bevel|half bullnose)(?:\s*edge)?\b/i,
      "regex_edge",
      0.8
    ) ||
      fieldRegex("edgeProfile", corpus, /\b(eased edge|bullnose|ogee|bevel edge)\b/i, "regex_edge_phrase", 0.78) ||
      makeExtractedField("edgeProfile", null, null, null)
  );

  fields.push(
    fieldRegex(
      "backsplashDescription",
      corpus,
      /\b(?:backsplash)\s*[:\-]\s*([^\n.]{2,80})/i,
      "regex_backsplash",
      0.75
    ) ||
      fieldRegex("backsplashDescription", corpus, /\b(full[- ]?height backsplash|4["”] backsplash|no backsplash)\b/i, "regex_backsplash_phrase", 0.7) ||
      makeExtractedField("backsplashDescription", null, null, null)
  );

  // Stated SF only — never compute from dimensions
  const sfField = fieldRegex(
    "statedSquareFootage",
    corpus,
    /\b(?:total\s+)?(?:sq(?:uare)?\s*(?:ft|feet)|sf)\s*[:\-]?\s*(\d+(?:\.\d+)?)\b/i,
    "regex_sf",
    0.85
  ) || fieldRegex("statedSquareFootage", corpus, /\b(\d+(?:\.\d+)?)\s*(?:sq(?:uare)?\s*(?:ft|feet)|sf)\b/i, "regex_sf_alt", 0.85);
  if (sfField && sfField.value != null) {
    fields.push({ ...sfField, value: Number(sfField.value) });
  } else {
    if (/\b\d+\s*[x×]\s*\d+\b/i.test(corpus)) {
      warnings.push("Dimension-like tokens found; square footage was not calculated (Phase 3 rule).");
    }
    fields.push(makeExtractedField("statedSquareFootage", null, null, null));
  }

  fields.push(
    fieldRegex(
      "requestedTurnaround",
      corpus,
      /\b(?:needed by|due|turnaround|install(?:ation)?(?:\s*date)?)\s*[:\-]?\s*([^\n.]{2,60})/i,
      "regex_turnaround",
      0.65
    ) || makeExtractedField("requestedTurnaround", null, null, null)
  );

  const mailbox = request.mailbox || request.to?.[0]?.email || null;
  if (mailbox) {
    const ev =
      evidenceFromMatch(corpus, mailbox, "recipient", "to", "mailbox_header", 0.9) ||
      evidenceFromMatch(String(request.to?.map((a) => a.email).join(", ") ?? ""), mailbox, "recipient", "to", "mailbox_header", 0.9);
    fields.push(
      makeExtractedField(
        "salespersonMailbox",
        mailbox,
        ev || {
          sourceType: "recipient",
          sourceId: "mailbox",
          excerpt: mailbox,
          charStart: null,
          charEnd: null,
          extractionMethod: "mailbox_field",
          confidence: 0.9,
          humanConfirmed: false,
          humanCorrected: false
        },
        0.9,
        "Mailbox / To recipient from normalized message."
      )
    );
  } else {
    fields.push(makeExtractedField("salespersonMailbox", null, null, null));
  }

  fields.push(
    fieldRegex("customerNotes", body, /\b(?:notes?|comments?)\s*[:\-]\s*([^\n]{2,200})/i, "regex_notes", 0.55) ||
      makeExtractedField("customerNotes", null, null, null)
  );

  fields.push(
    fieldRegex(
      "revisionReference",
      corpus,
      /\b(?:quote|estimate|case)\s*(?:#|ref(?:erence)?[:\s]*)\s*([A-Za-z0-9-]{4,40})/i,
      "regex_revision_ref",
      0.75
    ) ||
      fieldRegex("revisionReference", corpus, /\b(qil-case-\d+)\b/i, "regex_case_ref", 0.8) ||
      makeExtractedField("revisionReference", null, null, null)
  );

  fields.push(
    fieldRegex(
      "contactPhone",
      corpus,
      /\b(?:phone|tel|call)\s*[:\-]?\s*((?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/i,
      "regex_phone",
      0.8
    ) ||
      fieldRegex("contactPhone", corpus, /\b(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/, "regex_phone_loose", 0.55) ||
      makeExtractedField("contactPhone", null, null, null)
  );

  // Filename-only plan evidence is not a field — handled in missing info
  for (const a of request.attachments ?? []) {
    if (/\bplan\b/i.test(a.filename || "")) {
      warnings.push(
        `Filename “${a.filename}” suggests a plan; simulated provider did not open the file.`
      );
      void evidenceFromFilename(a.filename, "filename_plan_hint", 0.6);
    }
  }

  // Ensure no authoritative price group assignment
  const pg = fields.find((f) => f.key === "elite100OrPriceGroupText");
  if (pg && !pg.unknown) {
    pg.confidenceReason = "Stated text only — not an authoritative price-group assignment.";
    if (/group\s*[a-d]/i.test(String(pg.value))) {
      warnings.push("Price-group-like text extracted as text only; not assigned as production pricing authority.");
    }
  }

  return fields;
}

function fieldRegex(key, haystack, re, method, confidence, sourceType = "body") {
  const text = String(haystack ?? "");
  const m = text.match(re);
  if (!m) return null;
  const raw = (m[1] ?? m[0]).trim();
  if (!raw) return null;
  const evidence =
    evidenceFromMatch(text, m[0], sourceType, "text", method, confidence) ||
    evidenceFromMatch(text, raw, sourceType, "text", method, confidence);
  return makeExtractedField(key, cleanValue(raw), evidence, confidence, `Simulated ${method} match.`);
}

function fieldNamedColor(corpus) {
  for (const name of SIMULATED_ELITE_COLORS) {
    const ev = evidenceFromMatch(corpus, name, "body", "corpus", "simulated_color_alias", 0.77);
    if (ev) {
      return makeExtractedField(
        "requestedColorText",
        titleCase(name),
        ev,
        0.77,
        "Matched simulated color alias (not production catalog authority)."
      );
    }
  }
  return null;
}

function simulatedCatalogValidation(colorField) {
  if (!colorField || colorField.unknown || !colorField.value) {
    return { state: "not_checked", note: "No requested color text to validate." };
  }
  const lower = String(colorField.value).toLowerCase();
  if (SIMULATED_ELITE_COLORS.includes(lower)) {
    return {
      state: "simulated_match",
      note: "Simulated alias match only — not production Elite 100 catalog validation."
    };
  }
  if (/\b(quartzite|custom|exotic)\b/i.test(lower)) {
    return {
      state: "simulated_no_match",
      note: "Simulated non-match for custom/non–Elite signals — not production authority."
    };
  }
  return {
    state: "needs_human_review",
    note: "Color text present; simulated catalog cannot confirm — needs human review."
  };
}

function cleanValue(v) {
  return String(v).replace(/^[:\-\s]+/, "").replace(/\s+/g, " ").trim();
}

function titleCase(s) {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function unique(arr) {
  return [...new Set(arr)];
}

let _provider = null;

export function getSimulatedIntakeIntelligenceProvider() {
  if (!_provider) _provider = new SimulatedIntakeIntelligenceProvider();
  return _provider;
}
