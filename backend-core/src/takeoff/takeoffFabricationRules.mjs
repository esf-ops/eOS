/**
 * takeoffFabricationRules — deterministic stone-fabrication rules engine (v6.2).
 *
 * Pure function: no I/O, no DB calls, no AI calls, no pricing logic.
 * Safe to import in both Node.js (backend) and browser (via @takeoff-core alias).
 *
 * Purpose:
 *   Evaluate a TakeoffResult against known stone-fabrication business rules.
 *   Emit structured findings ("rule findings") that the validator, QA gate, and UI
 *   can consume to surface actionable estimator guidance.
 *
 * Core principle (v6.2):
 *   - Written reference totals (e.g. "50 sq' no b/s") are comparison evidence only.
 *   - They are NOT calculation authority.
 *   - The model must never force geometry to match a written total.
 *   - Estimator-reviewed structured runs are the source of truth.
 *   - eliteOS recompute is always authoritative.
 *
 * Finding shape:
 *   { code, level, message, path, recommendedAction, source: "fabrication_rule", ruleId }
 *
 * @module takeoffFabricationRules
 */

// ── Finding level constants ────────────────────────────────────────────────────

export const FABRICATION_RULE_LEVEL = Object.freeze({
  INFO:    "info",
  WARNING: "warning",
  ERROR:   "error",
});

// ── Fabrication rule codes ─────────────────────────────────────────────────────

export const FABRICATION_RULE_CODE = Object.freeze({
  /** AI forced geometry to match a written reference total (e.g. "to reconcile with 50"). */
  REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET:       "REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET",

  /** Plan says no backsplash and all areas correctly have 0 backsplash — confirmed. */
  NO_BACKSPLASH_CONFIRMED:                       "NO_BACKSPLASH_CONFIRMED",

  /** No-backsplash note exists but some area still has backsplashLinearIn > 0 or a splash run. */
  BACKSPLASH_SCOPE_CONFLICT:                     "BACKSPLASH_SCOPE_CONFLICT",

  /** Sink/cooktop/faucet cutout appears in area.exclusions[], reducing material sf. */
  CUTOUT_DEDUCTED_FROM_MATERIAL:                 "CUTOUT_DEDUCTED_FROM_MATERIAL",

  /** Assembly notes indicate a piece was duplicated without visible geometry evidence. */
  INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED:      "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED",

  /** L/U-shape corner deduction exists but the supporting run is excluded or missing. */
  CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG: "CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG",

  /** Nonstandard depth (island/peninsula/bar/desk/waterfall) is confirmed by evidence. */
  NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE:      "NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE",

  /** Nonstandard depth (island/peninsula/bar/desk/waterfall) has no evidence support. */
  NONSTANDARD_DEPTH_UNSUPPORTED:                 "NONSTANDARD_DEPTH_UNSUPPORTED",
});

// ── Regex patterns ─────────────────────────────────────────────────────────────

/** Assembly note / assumption language that indicates the AI tried to reconcile to a reference total. */
const REF_TOTAL_RECONCILE_RE = /\b(to\s+reconcile\s+with|aligns?\s+with\s+reference\s+total|to\s+match\s+\d+|adjusted\s+to\s+reach|sized\s+to\s+reach|modified\s+to\s+reach|corrected\s+to\s+\d+|reconciled?\s+to|forced?\s+to\s+match)\b/i;

/** No-backsplash indicators in text. */
const NO_BACKSPLASH_RE = /\bno\s*[-/]?\s*(?:b\/s|b\.s\.|backsplash|bsp|back\s*splash)\b/i;

/**
 * True when a note declares whole-plan / whole-scope "no stone backsplash".
 * Partial-scope phrasing (e.g. "no backsplash on open peninsula end") is excluded.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function noteDeclaresGlobalNoBacksplash(text) {
  const t = String(text ?? "").trim();
  if (!t || !NO_BACKSPLASH_RE.test(t)) return false;

  // Local exclusion from backsplash scope — backsplash may still exist elsewhere on the plan.
  if (/\bno\s*[-/]?\s*(?:b\/s|b\.s\.|backsplash|bsp|back\s*splash)\s+(?:on|at|along|around|for|near|by)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:open|peninsula|island|end|side|opening).{0,48}\bno\s*[-/]?\s*(?:b\/s|b\.s\.|backsplash|bsp|back\s*splash)\b/i.test(t)) {
    return false;
  }
  if (/\bno\s*[-/]?\s*(?:b\/s|b\.s\.|backsplash|bsp|back\s*splash)\b.{0,48}\b(?:open|peninsula|island|end|side)\b/i.test(t)) {
    return false;
  }
  if (/\bexcluded?\s+from\s+backsplash\b/i.test(t)) {
    return false;
  }
  return true;
}

/** Positive backsplash keyword (to distinguish from "no b/s" context). */
const POSITIVE_BS_RE = /(?:^|[^a-z])(?:b\/s|backsplash|splash)\b/i;

/** Inferred-duplicate language in assembly notes. */
const INFERRED_DUPLICATE_RE = /\b(assumed?\s+duplicate|assumed?\s+two|two\s+identical|to\s+reconcile|identical\s+pieces?|mirror\s+piece|duplicated?\s+for\s+symmetry)\b/i;

/** Cutout keywords — sink/cooktop/faucet/undermount in exclusion labels. */
const CUTOUT_KEYWORDS_RE = /\b(sink|cooktop|faucet|cutout|undermount)\b/i;

/** Nonstandard piece types (depth must come from plan evidence). */
const NONSTANDARD_PIECE_RE = /\b(island|peninsula|raised[\s-]bar|bar[\s-]top|desk|waterfall|specialty)\b/i;

/** Standard kitchen counter depth (25.5") — no evidence required. */
const STANDARD_COUNTER_DEPTH_IN = 25.5;
/** Standard vanity depth (21.5") — no evidence required. */
const STANDARD_VANITY_DEPTH_IN = 21.5;
/** Tolerance for standard depth matching. */
const STANDARD_DEPTH_TOLERANCE_IN = 1;
/** Threshold above which a depth is considered "nonstandard" for wall counters. */
const NONSTANDARD_DEPTH_THRESHOLD_IN = 26;
/** Tolerance for evidence depth matching. */
const DEPTH_EVIDENCE_TOLERANCE_IN = 1;

// ── Finding builder ────────────────────────────────────────────────────────────

/**
 * @param {string} code
 * @param {"info"|"warning"|"error"} level
 * @param {string} message
 * @param {string} [path]
 * @param {string} [recommendedAction]
 * @param {string} [ruleId]
 * @returns {FabricationRuleFinding}
 *
 * @typedef {Object} FabricationRuleFinding
 * @property {string} code
 * @property {"info"|"warning"|"error"} level
 * @property {string} message
 * @property {string} [path]
 * @property {string} [recommendedAction]
 * @property {"fabrication_rule"} source
 * @property {string} [ruleId]
 */
function finding(code, level, message, path, recommendedAction, ruleId) {
  const f = { code, level, message, source: "fabrication_rule" };
  if (path) f.path = path;
  if (recommendedAction) f.recommendedAction = recommendedAction;
  if (ruleId) f.ruleId = ruleId;
  return f;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Collect all note/assumption strings from a TakeoffResult tree.
 */
function gatherAllNotes(takeoffResult) {
  return [
    ...(takeoffResult.projectAssumptions ?? []),
    ...(takeoffResult.rooms ?? []).flatMap((r) => [
      ...(r.notes ?? []),
      ...(r.assumptions ?? []),
      ...(r.areas ?? []).flatMap((a) => [
        ...(a.notes ?? []),
        ...(a.assumptions ?? []),
        ...(a.runs ?? []).flatMap((rn) => [
          ...(rn.notes ?? []),
          ...(rn.assemblyNotes ? [rn.assemblyNotes] : []),
        ]),
      ]),
    ]),
  ].map(String);
}

/**
 * Collect all run assembly notes from a TakeoffResult tree.
 * Returns items with context: { text, runLabel, runId, path }.
 */
function gatherRunAssemblyNotes(takeoffResult) {
  const out = [];
  for (let ri = 0; ri < (takeoffResult?.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      for (let xi = 0; xi < (area?.runs ?? []).length; xi++) {
        const run = area.runs[xi];
        if (run.assemblyNotes) {
          out.push({
            text: String(run.assemblyNotes),
            runLabel: run.label,
            runId: run.id,
            path: `rooms[${ri}].areas[${ai}].runs[${xi}].assemblyNotes`,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Collect all TakeoffRun objects with context.
 */
function flattenRuns(takeoffResult) {
  const out = [];
  for (let ri = 0; ri < (takeoffResult?.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      for (let xi = 0; xi < (area?.runs ?? []).length; xi++) {
        out.push({
          run: area.runs[xi],
          area,
          areaPath: `rooms[${ri}].areas[${ai}]`,
          runPath: `rooms[${ri}].areas[${ai}].runs[${xi}]`,
        });
      }
    }
  }
  return out;
}

/**
 * Return true if a depth is "standard" and exempt from evidence checks.
 */
function isStandardDepth(depthIn) {
  const d = Number(depthIn);
  return (
    Math.abs(d - STANDARD_COUNTER_DEPTH_IN) <= STANDARD_DEPTH_TOLERANCE_IN ||
    Math.abs(d - STANDARD_VANITY_DEPTH_IN) <= STANDARD_DEPTH_TOLERANCE_IN
  );
}

/**
 * Check whether a given depth has supporting evidence in the dimension evidence table.
 * Matches by depthIn within DEPTH_EVIDENCE_TOLERANCE_IN, OR by depthEvidenceId on the run.
 *
 * @param {object} run
 * @param {object|null} dimensionEvidence
 * @returns {{ hasEvidenceSupport: boolean, evidenceDim: object|null }}
 */
export function classifyDepthEvidence(run, dimensionEvidence) {
  // If run directly cites a depthEvidenceId, that is evidence support.
  if (run.depthEvidenceId) {
    // Verify the ID exists in evidence (if evidence is provided).
    if (dimensionEvidence?.dimensions) {
      const dim = dimensionEvidence.dimensions.find(
        (d) => (d.id ?? d.label) === run.depthEvidenceId
      );
      if (dim) {
        return { hasEvidenceSupport: true, evidenceDim: dim };
      }
    } else {
      // depthEvidenceId set but no evidence table — treat as evidence-supported (reviewer asserted it).
      return { hasEvidenceSupport: true, evidenceDim: null };
    }
  }

  // Check evidence table for a dimension with matching depthIn.
  if (dimensionEvidence?.dimensions) {
    const d = Number(run.depthIn);
    const match = dimensionEvidence.dimensions.find(
      (dim) => dim.depthIn != null && Math.abs(Number(dim.depthIn) - d) <= DEPTH_EVIDENCE_TOLERANCE_IN
    );
    if (match) {
      return { hasEvidenceSupport: true, evidenceDim: match };
    }
  }

  // No evidence found.
  return { hasEvidenceSupport: false, evidenceDim: null };
}

/**
 * Determine whether a corner deduction in the given area should be applied,
 * given a set of excluded run IDs.
 *
 * Returns false when any run in the area is excluded AND the area has cornerDeductions,
 * because the deduction was predicated on both legs being present.
 *
 * @param {object} area
 * @param {Set<string>} excludedRunIds
 * @returns {boolean}
 */
export function shouldApplyCornerDeduction(area, excludedRunIds) {
  if (!(area.cornerDeductions?.length > 0)) return true; // no deductions to check
  if (!excludedRunIds || excludedRunIds.size === 0) return true; // nothing excluded
  for (const run of (area.runs ?? [])) {
    if (excludedRunIds.has(run.id)) return false;
  }
  return true;
}

// ── Rule A: Reference total used as geometry target ────────────────────────────

/**
 * Rule A — Reference totals are comparison-only.
 *
 * Emits REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET when assembly notes or project
 * assumptions contain language indicating the AI forced geometry to match a
 * written reference total.
 *
 * @param {object} takeoffResult
 * @returns {FabricationRuleFinding[]}
 */
export function classifyReferenceTotalUsage(takeoffResult) {
  const findings = [];

  // Check project-level assumptions first.
  for (const text of (takeoffResult.projectAssumptions ?? [])) {
    if (REF_TOTAL_RECONCILE_RE.test(String(text))) {
      findings.push(finding(
        FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET,
        FABRICATION_RULE_LEVEL.WARNING,
        `Project assumption appears to reconcile geometry toward a written reference total: "${text.slice(0, 120)}". ` +
        `Written reference totals are comparison evidence only — they must not be used to size or add geometry.`,
        "projectAssumptions",
        "Remove or revise assumptions that force geometry to match a written total. Compute from visible dimensions only.",
        "rule-a-ref-total"
      ));
    }
  }

  // Check run assembly notes.
  for (const { text, runLabel, path } of gatherRunAssemblyNotes(takeoffResult)) {
    if (REF_TOTAL_RECONCILE_RE.test(text)) {
      findings.push(finding(
        FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET,
        FABRICATION_RULE_LEVEL.WARNING,
        `Run "${runLabel}" assembly notes indicate geometry was forced to match a reference total: "${text.slice(0, 120)}". ` +
        `Reference totals are evidence for comparison, not calculation authority. ` +
        `Dimensions must come from visible geometry — not from arithmetic that targets a written total.`,
        path,
        "Verify the run's dimensions against the visible plan geometry, not the written reference total.",
        "rule-a-ref-total"
      ));
    }
  }

  return findings;
}

// ── Rule B: No-backsplash rules ────────────────────────────────────────────────

/**
 * Rule B — No-backsplash scope enforcement.
 *
 * Returns:
 *   - NO_BACKSPLASH_CONFIRMED (info) when plan clearly says no backsplash and all areas comply.
 *   - BACKSPLASH_SCOPE_CONFLICT (warning/error) when a no-backsplash note conflicts with
 *     structured backsplash dimensions or positive backsplash runs.
 *
 * @param {object} takeoffResult
 * @param {object|null} dimensionEvidence
 * @returns {FabricationRuleFinding[]}
 */
export function classifyBacksplashRule(takeoffResult, dimensionEvidence = null) {
  const findings = [];

  // Determine if plan indicates no backsplash (whole-plan scope only).
  const noBsFromNotes = gatherAllNotes(takeoffResult).some((t) => noteDeclaresGlobalNoBacksplash(t));

  // Check dimensionEvidence referenceTotals for explicit noBacksplash flag.
  const noBsFromRefTotals = (dimensionEvidence?.referenceTotals ?? []).some(
    (r) => r.noBacksplash === true
  );

  const planSaysNoBacksplash = noBsFromNotes || noBsFromRefTotals;

  if (!planSaysNoBacksplash) return findings;

  // Plan says no backsplash — check for conflicts.
  let hasConflict = false;

  for (let ri = 0; ri < (takeoffResult.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      const areaPath = `rooms[${ri}].areas[${ai}]`;

      // Conflict: backsplashLinearIn > 0 despite no-b/s note.
      if ((area.backsplashLinearIn ?? 0) > 0) {
        hasConflict = true;
        findings.push(finding(
          FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT,
          FABRICATION_RULE_LEVEL.ERROR,
          `Area "${area.label}": backsplashLinearIn = ${area.backsplashLinearIn}" but plan indicates no backsplash. ` +
          `The no-backsplash note must be honored — remove this backsplash dimension.`,
          `${areaPath}.backsplashLinearIn`,
          "Set backsplashLinearIn = 0 and backsplashIncluded = false. The plan explicitly states no stone backsplash.",
          "rule-b-no-bs"
        ));
      }

      // Conflict: any 'splash' or 'fhb' run despite no-b/s note.
      for (let xi = 0; xi < (area.runs ?? []).length; xi++) {
        const run = area.runs[xi];
        const pType = run.pieceType ?? "counter";
        if (pType === "splash" || pType === "fhb") {
          hasConflict = true;
          findings.push(finding(
            FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT,
            FABRICATION_RULE_LEVEL.ERROR,
            `Run "${run.label}" (pieceType: ${pType}) is a backsplash run but plan indicates no backsplash. ` +
            `Remove this run — the plan explicitly states no stone backsplash.`,
            `rooms[${ri}].areas[${ai}].runs[${xi}]`,
            "Remove all backsplash runs. Honor the no-backsplash plan note.",
            "rule-b-no-bs"
          ));
        }
      }
    }
  }

  // Check for conflicting positive backsplash notes on other pages.
  const allNotes = gatherAllNotes(takeoffResult);
  const hasPositiveConflict = allNotes.some((t) => {
    return !noteDeclaresGlobalNoBacksplash(t) && POSITIVE_BS_RE.test(t);
  });

  if (hasPositiveConflict && planSaysNoBacksplash && !hasConflict) {
    findings.push(finding(
      FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT,
      FABRICATION_RULE_LEVEL.WARNING,
      "Plan contains both a no-backsplash note and positive backsplash references. " +
      "Estimator must confirm which scope is correct for this project.",
      "projectAssumptions",
      "Review all plan pages for backsplash scope. Confirm whether any stone backsplash is required.",
      "rule-b-no-bs-conflict"
    ));
  }

  // Positive signal: no-b/s honored and no conflicts.
  if (!hasConflict && !hasPositiveConflict) {
    findings.push(finding(
      FABRICATION_RULE_CODE.NO_BACKSPLASH_CONFIRMED,
      FABRICATION_RULE_LEVEL.INFO,
      noBsFromRefTotals
        ? `Reference note "${(dimensionEvidence.referenceTotals.find((r) => r.noBacksplash)?.rawText ?? "no b/s")}" indicates no stone backsplash — confirmed, all areas have 0 backsplash.`
        : "Plan note indicates no stone backsplash — confirmed, all areas have 0 backsplash.",
      "rooms",
      null,
      "rule-b-no-bs-confirmed"
    ));
  }

  return findings;
}

// ── Rule C: Cutout rules ───────────────────────────────────────────────────────

/**
 * Rule C — Cutouts must not reduce material square footage.
 *
 * Emits CUTOUT_DEDUCTED_FROM_MATERIAL for any exclusion labeled as a
 * sink/cooktop/faucet/cutout/undermount — these are fabrication operations,
 * not material deductions.
 *
 * @param {object} takeoffResult
 * @returns {FabricationRuleFinding[]}
 */
export function classifyCutoutRule(takeoffResult) {
  const findings = [];

  for (let ri = 0; ri < (takeoffResult.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      const areaPath = `rooms[${ri}].areas[${ai}]`;
      for (const excl of (area.exclusions ?? [])) {
        if (CUTOUT_KEYWORDS_RE.test(String(excl.label ?? ""))) {
          findings.push(finding(
            FABRICATION_RULE_CODE.CUTOUT_DEDUCTED_FROM_MATERIAL,
            FABRICATION_RULE_LEVEL.ERROR,
            `Area "${area.label}": exclusion "${excl.label}" is a fabrication cutout (sink / cooktop / faucet / undermount). ` +
            `Cutouts are fabrication operations — they must NOT reduce material square footage. ` +
            `This incorrectly reduces the countertop sf and will undersize the material order.`,
            `${areaPath}.exclusions`,
            "Remove from exclusions[]. Record in area.cutouts[] or area.notes[] as a fabrication note only.",
            "rule-c-cutout"
          ));
        }
      }
    }
  }

  return findings;
}

// ── Rule D: Inferred duplicate pieces ─────────────────────────────────────────

/**
 * Rule D — No duplicate/inferred pieces without explicit geometry evidence.
 *
 * Emits INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED when assembly notes or
 * project assumptions indicate a piece was duplicated without explicit
 * plan geometry (e.g. "2 STOVE" text alone is not geometry evidence).
 *
 * @param {object} takeoffResult
 * @returns {FabricationRuleFinding[]}
 */
export function classifyInferredPieceRule(takeoffResult) {
  const findings = [];

  // Project-level assumptions.
  for (const text of (takeoffResult.projectAssumptions ?? [])) {
    if (INFERRED_DUPLICATE_RE.test(String(text))) {
      findings.push(finding(
        FABRICATION_RULE_CODE.INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED,
        FABRICATION_RULE_LEVEL.WARNING,
        `Project assumption indicates a piece was inferred or duplicated without explicit geometry: "${String(text).slice(0, 120)}". ` +
        `Do not duplicate a piece from ambiguous text unless it is visibly drawn and dimensioned on the plan.`,
        "projectAssumptions",
        "Verify the plan shows two distinct dimensioned pieces before including both. " +
        "If ambiguous (e.g. '2 STOVE' label), use only one piece or mark requiresEstimatorReview.",
        "rule-d-inferred-dup"
      ));
    }
  }

  // Per-run assembly notes.
  for (const { text, runLabel, path } of gatherRunAssemblyNotes(takeoffResult)) {
    if (INFERRED_DUPLICATE_RE.test(text)) {
      findings.push(finding(
        FABRICATION_RULE_CODE.INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED,
        FABRICATION_RULE_LEVEL.WARNING,
        `Run "${runLabel}" was assumed/inferred without explicit geometry evidence: "${text.slice(0, 120)}". ` +
        `Estimator must verify this piece is visibly drawn and dimensioned on the plan.`,
        path,
        "Confirm the piece is explicitly shown on the plan before including it. " +
        "If only a text label like '2 STOVE' exists without geometry, mark requiresEstimatorReview.",
        "rule-d-inferred-dup"
      ));
    }
  }

  return findings;
}

// ── Rule E: Corner deduction with excluded/missing leg ────────────────────────

/**
 * Rule E — Corner deductions must only apply when both overlapping legs are present.
 *
 * Emits CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG when an area has
 * cornerDeductions but one or more of its runs are excluded in the review state.
 *
 * @param {object} takeoffResult
 * @param {{ excludedRunIds?: Set<string> } | null} reviewState
 * @returns {FabricationRuleFinding[]}
 */
export function classifyCornerDeductionRule(takeoffResult, reviewState = null) {
  const findings = [];
  const excludedRunIds = reviewState?.excludedRunIds ?? new Set();

  for (let ri = 0; ri < (takeoffResult.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      if (!(area.cornerDeductions?.length > 0)) continue;

      const areaPath = `rooms[${ri}].areas[${ai}]`;

      // Check if any run in the area is excluded.
      const hasExcludedRun = (area.runs ?? []).some(
        (run) => excludedRunIds.has(run.id)
      );
      if (hasExcludedRun) {
        findings.push(finding(
          FABRICATION_RULE_CODE.CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG,
          FABRICATION_RULE_LEVEL.WARNING,
          `Area "${area.label}": has ${area.cornerDeductions.length} corner deduction(s) but one or more runs ` +
          `in this area have been excluded from the effective draft. ` +
          `Corner deductions are only valid when both overlapping legs are present. ` +
          `Removing a leg without removing the corner deduction over-reduces the countertop sf.`,
          `${areaPath}.cornerDeductions`,
          "Remove the corner deduction for any leg that has been excluded. " +
          "The effective draft should only include deductions for legs that remain in the calculation.",
          "rule-e-corner-ded"
        ));
        continue;
      }

      // Also check: if overlapMode is not L/U-Shape, the deduction is unsupported.
      // (This duplicates takeoffEvidenceRunReconciliation but produces a fabrication_rule finding.)
      const hasShapeMode = area.overlapMode === "L-Shape" || area.overlapMode === "U-Shape";
      if (!hasShapeMode) {
        findings.push(finding(
          FABRICATION_RULE_CODE.CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG,
          FABRICATION_RULE_LEVEL.WARNING,
          `Area "${area.label}": has cornerDeductions but overlapMode is "${area.overlapMode ?? "none"}". ` +
          `Corner deductions require an explicit L-Shape or U-Shape overlap layout. ` +
          `If dimensions are net (no overlap), do not apply a corner deduction.`,
          `${areaPath}.cornerDeductions`,
          "Set overlapMode to 'L-Shape' or 'U-Shape' if this is a corner layout, or remove the deductions.",
          "rule-e-corner-unsupported"
        ));
      }
    }
  }

  return findings;
}

// ── Rule F: Nonstandard depth evidence ────────────────────────────────────────

/**
 * Rule F — Nonstandard depths must come from visible plan evidence.
 *
 * For runs matching island/peninsula/bar/desk/waterfall/specialty with depth > 26":
 *   - If depth evidence exists → NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE (info)
 *   - If no depth evidence   → NONSTANDARD_DEPTH_UNSUPPORTED (warning)
 *
 * Standard depths (25.5" counter, 21.5" vanity) are exempt.
 *
 * @param {object} takeoffResult
 * @param {object|null} dimensionEvidence
 * @returns {FabricationRuleFinding[]}
 */
export function classifyNonstandardDepth(takeoffResult, dimensionEvidence = null) {
  const findings = [];

  for (const { run, runPath } of flattenRuns(takeoffResult)) {
    const pType = run.pieceType ?? "counter";
    if (pType !== "counter") continue;

    const depthIn = Number(run.depthIn);
    if (depthIn <= NONSTANDARD_DEPTH_THRESHOLD_IN) continue;

    // Standard depth exemption.
    if (isStandardDepth(depthIn)) continue;

    // Only applies to nonstandard piece types.
    if (!NONSTANDARD_PIECE_RE.test(String(run.label ?? ""))) continue;

    // Check for evidence support.
    const { hasEvidenceSupport, evidenceDim } = classifyDepthEvidence(run, dimensionEvidence);

    if (hasEvidenceSupport) {
      findings.push(finding(
        FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE,
        FABRICATION_RULE_LEVEL.INFO,
        `Run "${run.label}": nonstandard depth ${depthIn}" is supported by plan evidence` +
        (evidenceDim ? ` (evidence: "${evidenceDim.label ?? evidenceDim.id}", depth ${evidenceDim.depthIn}")` : " (depthEvidenceId set)") +
        ". Depth verified — no estimator action required.",
        `${runPath}.depthIn`,
        null,
        "rule-f-depth-verified"
      ));
    } else {
      findings.push(finding(
        FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_UNSUPPORTED,
        FABRICATION_RULE_LEVEL.WARNING,
        `Run "${run.label}": depth ${depthIn}" is nonstandard for a standard wall counter (standard = 25.5"). ` +
        `No supporting evidence was found in the dimension evidence table. ` +
        `Island, peninsula, raised bar, desk, and waterfall depths must come from visible plan dimensions.`,
        `${runPath}.depthIn`,
        "Verify this depth is explicitly labeled on the plan before using this takeoff. " +
        "If the depth is visible on the plan, add depthEvidenceId to the run.",
        "rule-f-depth-unsupported"
      ));
    }
  }

  return findings;
}

// ── Main evaluator ─────────────────────────────────────────────────────────────

/**
 * Evaluate a TakeoffResult through all deterministic fabrication rules.
 *
 * @param {{
 *   takeoffResult:         object,          — TakeoffResult (required)
 *   dimensionEvidence?:    object|null,     — DimensionEvidence from evidence pass (optional)
 *   validationDiagnostics?: object|null,    — TakeoffValidationResult (optional, for context)
 *   reviewState?:          {               — estimator review state (optional, for Rule E)
 *     excludedRunIds?: Set<string>
 *   } | null,
 * }} params
 *
 * @returns {{
 *   findings:             FabricationRuleFinding[],
 *   errorCount:           number,
 *   warningCount:         number,
 *   infoCount:            number,
 *   hasErrors:            boolean,
 *   hasWarnings:          boolean,
 * }}
 */
export function evaluateTakeoffFabricationRules({
  takeoffResult,
  dimensionEvidence   = null,
  validationDiagnostics = null,  // reserved for future cross-rule context
  reviewState         = null,
}) {
  const findings = [
    ...classifyReferenceTotalUsage(takeoffResult),
    ...classifyBacksplashRule(takeoffResult, dimensionEvidence),
    ...classifyCutoutRule(takeoffResult),
    ...classifyInferredPieceRule(takeoffResult),
    ...classifyCornerDeductionRule(takeoffResult, reviewState),
    ...classifyNonstandardDepth(takeoffResult, dimensionEvidence),
  ];

  const errorCount   = findings.filter((f) => f.level === FABRICATION_RULE_LEVEL.ERROR).length;
  const warningCount = findings.filter((f) => f.level === FABRICATION_RULE_LEVEL.WARNING).length;
  const infoCount    = findings.filter((f) => f.level === FABRICATION_RULE_LEVEL.INFO).length;

  return {
    findings,
    errorCount,
    warningCount,
    infoCount,
    hasErrors:   errorCount > 0,
    hasWarnings: warningCount > 0,
  };
}
