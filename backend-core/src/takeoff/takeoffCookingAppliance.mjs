/**
 * Cooking-appliance classification for AI Takeoff.
 *
 * Cooktop → continuous countertop + cooktop cutout (fabrication).
 * Free-standing / slide-in range → interrupted countertop, NO cooktop cutout,
 * separate pieces on each side of the appliance gap.
 * Unknown → estimator review required; never silently treat as cooktop.
 */

export const COOKING_APPLIANCE_TYPES = Object.freeze([
  Object.freeze({
    type: "cooktop",
    label: "Cooktop",
    createsCooktopCutout: true,
    interruptsCountertop: false
  }),
  Object.freeze({
    type: "freestanding_range",
    label: "Free-standing range",
    createsCooktopCutout: false,
    interruptsCountertop: true
  }),
  Object.freeze({
    type: "slide_in_range",
    label: "Slide-in range",
    createsCooktopCutout: false,
    interruptsCountertop: true
  }),
  Object.freeze({
    type: "unknown_cooking_appliance",
    label: "Unknown cooking appliance",
    createsCooktopCutout: false,
    interruptsCountertop: null,
    reviewRequired: true
  }),
  Object.freeze({
    type: "not_applicable",
    label: "Not applicable",
    createsCooktopCutout: false,
    interruptsCountertop: false
  })
]);

const TYPE_SET = new Set(COOKING_APPLIANCE_TYPES.map((t) => t.type));
const BY_TYPE = new Map(COOKING_APPLIANCE_TYPES.map((t) => [t.type, t]));

/** Legacy freeform keys that historically collapsed incorrectly to cooktop. */
const RANGE_LEGACY_KEYS = new Set([
  "range",
  "stove",
  "freestanding_range",
  "free_standing_range",
  "freestanding",
  "free-standing",
  "slide_in_range",
  "slide-in",
  "slidein",
  "slide_in"
]);

export function cookingApplianceTypeLabel(type) {
  return BY_TYPE.get(String(type))?.label ?? String(type || "");
}

export function isCookingApplianceType(type) {
  return TYPE_SET.has(String(type || ""));
}

export function cookingApplianceInterruptsCountertop(type) {
  const meta = BY_TYPE.get(String(type || ""));
  return meta?.interruptsCountertop === true;
}

export function cookingApplianceCreatesCooktopCutout(type) {
  return BY_TYPE.get(String(type || ""))?.createsCooktopCutout === true;
}

export function cookingApplianceNeedsReview(appliance) {
  if (!appliance || typeof appliance !== "object") return false;
  if (appliance.reviewRequired === true) return true;
  if (appliance.type === "unknown_cooking_appliance") return true;
  if (appliance.confidence === "low" && cookingApplianceInterruptsCountertop(appliance.type)) {
    return appliance.widthIn == null;
  }
  return false;
}

/**
 * Normalize a cookingAppliance blob on a run/piece.
 * @param {unknown} value
 */
export function normalizeCookingAppliance(value) {
  if (value == null || value === "") return { appliance: null, changed: value != null };
  if (typeof value === "string") {
    const key = value.trim().toLowerCase().replace(/\s+/g, "_");
    if (RANGE_LEGACY_KEYS.has(key) || key === "freestanding_range") {
      return {
        appliance: {
          type: key.includes("slide") ? "slide_in_range" : "freestanding_range",
          confidence: "medium",
          reviewRequired: true,
          source: "legacy"
        },
        changed: true
      };
    }
    if (key === "cooktop" || key === "cook_top") {
      return {
        appliance: { type: "cooktop", confidence: "medium", reviewRequired: false, source: "legacy" },
        changed: true
      };
    }
    if (key === "unknown" || key === "unknown_cooking_appliance") {
      return {
        appliance: {
          type: "unknown_cooking_appliance",
          confidence: "low",
          reviewRequired: true,
          source: "legacy"
        },
        changed: true
      };
    }
    return { appliance: null, changed: true };
  }
  if (typeof value !== "object") return { appliance: null, changed: true };
  const type = String(value.type || "").trim();
  if (!TYPE_SET.has(type) || type === "not_applicable") {
    return { appliance: null, changed: Boolean(value.type) };
  }
  const widthRaw = value.widthIn;
  const widthIn =
    widthRaw == null || widthRaw === ""
      ? null
      : Number.isFinite(Number(widthRaw)) && Number(widthRaw) > 0
        ? Number(widthRaw)
        : null;
  const appliance = {
    type,
    confidence: ["high", "medium", "low"].includes(String(value.confidence))
      ? String(value.confidence)
      : "medium",
    reviewRequired:
      value.reviewRequired === true ||
      type === "unknown_cooking_appliance" ||
      (cookingApplianceInterruptsCountertop(type) && widthIn == null && value.source === "ai_suggested"),
    source: typeof value.source === "string" && value.source ? value.source : "estimator_confirmed",
    ...(widthIn != null ? { widthIn } : {}),
    ...(value.note ? { note: String(value.note).slice(0, 240) } : {})
  };
  return { appliance, changed: false };
}

/**
 * Infer cooking appliance from cutout legacy keys / labels without inventing cooktop.
 * @param {string} rawKey
 */
export function cookingApplianceFromLegacyCutoutKey(rawKey) {
  const key = String(rawKey || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!key) return null;
  if (key === "cooktop" || key === "cook_top" || key === "cook") {
    return {
      type: "cooktop",
      confidence: "medium",
      reviewRequired: false,
      source: "legacy"
    };
  }
  if (RANGE_LEGACY_KEYS.has(key)) {
    const slide = key.includes("slide");
    return {
      type: slide ? "slide_in_range" : "freestanding_range",
      confidence: "low",
      reviewRequired: true,
      source: "legacy",
      note: `Legacy key "${rawKey}" — confirm appliance type`
    };
  }
  return null;
}

/**
 * Apply appliance conversion rules to a run: set cookingAppliance and adjust cutouts.
 * Does not invent piece splits — caller must split/insert gap when interrupting.
 *
 * @param {object} run
 * @param {string} nextType
 * @param {{ widthIn?: number|null, confidence?: string, source?: string, note?: string }} [opts]
 */
export function applyCookingApplianceToRun(run, nextType, opts = {}) {
  const base = run && typeof run === "object" ? { ...run } : {};
  const type = String(nextType || "").trim();
  if (type === "not_applicable" || !type) {
    const cutouts = Array.isArray(base.cutouts) ? [...base.cutouts] : [];
    return {
      ...base,
      cookingAppliance: null,
      cutouts,
      applianceGap: false
    };
  }
  if (!TYPE_SET.has(type)) {
    const err = new Error("Invalid cooking appliance type");
    err.code = "cooking_appliance_invalid";
    throw err;
  }
  const widthIn =
    opts.widthIn == null || opts.widthIn === ""
      ? base.cookingAppliance?.widthIn ?? null
      : Number(opts.widthIn);
  const appliance = {
    type,
    confidence: opts.confidence || "high",
    reviewRequired:
      type === "unknown_cooking_appliance" ||
      (cookingApplianceInterruptsCountertop(type) && !(Number(widthIn) > 0)),
    source: opts.source || "estimator_confirmed",
    ...(Number(widthIn) > 0 ? { widthIn: Number(widthIn) } : {}),
    ...(opts.note ? { note: String(opts.note).slice(0, 240) } : {})
  };

  let cutouts = Array.isArray(base.cutouts) ? base.cutouts.map((c) => ({ ...c })) : [];
  if (cookingApplianceCreatesCooktopCutout(type)) {
    const hasCook = cutouts.some((c) => c.type === "cooktop");
    if (!hasCook) {
      cutouts.push({ type: "cooktop", quantity: 1, source: appliance.source });
    }
  } else {
    cutouts = cutouts.filter((c) => c.type !== "cooktop");
  }

  return {
    ...base,
    cookingAppliance: appliance,
    cutouts,
    applianceGap: cookingApplianceInterruptsCountertop(type) === true,
    backsplashEligible:
      cookingApplianceInterruptsCountertop(type) === true ? false : base.backsplashEligible
  };
}

/**
 * Plan-source classification for correction telemetry (aggregated from page inventory).
 * Does not assume CAD is worse — capture only.
 */
export const PLAN_SOURCE_CLASSES = Object.freeze([
  "cad_cabinet_plan",
  "architectural_plan",
  "hand_drawn_sketch",
  "image_photo",
  "unknown"
]);

/**
 * @param {object|null|undefined} pageInventory
 * @returns {{ planSourceClass: string, pageTypeCounts: Record<string, number>, recommendedPageTypes: string[] }}
 */
export function classifyTakeoffPlanSource(pageInventory) {
  const pages = Array.isArray(pageInventory?.pages) ? pageInventory.pages : [];
  /** @type {Record<string, number>} */
  const pageTypeCounts = {};
  const recommended = [];
  for (const p of pages) {
    const t = String(p?.pageType || "unknown");
    pageTypeCounts[t] = (pageTypeCounts[t] || 0) + 1;
    if (p?.recommendedForTakeoff) recommended.push(t);
  }
  const sample = recommended.length ? recommended : Object.keys(pageTypeCounts);
  let planSourceClass = "unknown";
  if (sample.some((t) => t === "hand_sketch")) planSourceClass = "hand_drawn_sketch";
  else if (sample.some((t) => t === "cabinet_plan" || t === "rendering")) {
    planSourceClass = "cad_cabinet_plan";
  } else if (sample.some((t) => t === "floor_plan" || t === "elevation")) {
    planSourceClass = "architectural_plan";
  } else if (sample.some((t) => t === "irrelevant" || t === "spec")) {
    planSourceClass = "unknown";
  }
  // Photo/image: inventory may use unknown with low relevance — leave unknown unless explicit.
  return { planSourceClass, pageTypeCounts, recommendedPageTypes: recommended };
}

/**
 * Build a correction event for takeoff telemetry.
 * @param {string} op
 * @param {object} [detail]
 */
export function buildTakeoffCorrectionEvent(op, detail = {}) {
  return {
    op: String(op || "unknown"),
    at: new Date().toISOString(),
    ...detail
  };
}

const RANGE_HOOD_RE = /\b(range|vent|exhaust)\s*-?\s*hoods?\b/gi;
const NEGATED_RANGE_RE =
  /\b(not|no|isn'?t|rather than|instead of)\s+(an?\s+)?((slide[\s-]?in|free[\s-]?standing)\s+)?(ranges?|stoves?)\b/gi;
const RANGE_TEXT_RE = /\b(slide[\s-]?in|free[\s-]?standing|stove|ranges?)\b/i;
const COOKTOP_TEXT_RE = /\b(cook[\s-]?tops?|cktp)\b/i;
const EVIDENCE_RANGE_TYPES = new Set(["freestanding_range", "slide_in_range"]);

function runEvidenceText(run) {
  const notes = Array.isArray(run?.notes) ? run.notes.join(" ") : String(run?.notes ?? "");
  return [run?.label, notes, run?.assemblyNotes]
    .filter((v) => typeof v === "string" && v)
    .join(" ")
    .replace(RANGE_HOOD_RE, " ")
    .replace(NEGATED_RANGE_RE, " ");
}

function appendRunNote(run, note) {
  const notes = Array.isArray(run.notes) ? [...run.notes] : run.notes ? [String(run.notes)] : [];
  if (!notes.includes(note)) notes.push(note);
  run.notes = notes;
}

/**
 * Deterministic guard on fresh AI output: a cooktop cutout must be backed by
 * cooktop evidence. Runs whose own text describes a range lose the cutout and
 * become unknown_cooking_appliance (estimator confirms); a range-typed run never
 * keeps a cooktop cutout; unclassified or conflicting cooktops require review.
 * Only for new extractions — never re-run on estimator-reviewed drafts.
 *
 * @param {object|null|undefined} takeoff
 * @param {{ evidenceCookingAppliances?: Array<{type?: string, confidence?: string}> }} [opts]
 * @returns {{ takeoff: object|null|undefined, changed: boolean, corrections: object[] }}
 */
export function reconcileCookingApplianceEvidence(takeoff, opts = {}) {
  if (!takeoff || typeof takeoff !== "object" || !Array.isArray(takeoff.rooms)) {
    return { takeoff, changed: false, corrections: [] };
  }
  const evidenceAppliances = Array.isArray(opts.evidenceCookingAppliances) ? opts.evidenceCookingAppliances : [];
  const evidenceSawRange = evidenceAppliances.some(
    (a) => EVIDENCE_RANGE_TYPES.has(String(a?.type || "")) && a?.confidence !== "low"
  );
  const labeled = (v) => Number(v) > 0;
  const evidenceRangeWidth = evidenceAppliances.some(
    (a) => EVIDENCE_RANGE_TYPES.has(String(a?.type || "")) && labeled(a?.widthIn)
  );
  const evidenceRangeSides = evidenceAppliances.some(
    (a) =>
      EVIDENCE_RANGE_TYPES.has(String(a?.type || "")) &&
      (labeled(a?.leftCounterLengthIn) || labeled(a?.rightCounterLengthIn))
  );
  const base = structuredClone(takeoff);
  const corrections = [];

  const reconcileRun = (run, roomName) => {
    if (!run || typeof run !== "object") return run;
    const cutouts = Array.isArray(run.cutouts) ? run.cutouts : [];
    const hasCooktopCutout = cutouts.some((c) => c?.type === "cooktop");
    const appliance = run.cookingAppliance;
    const type = String(appliance?.type || "");
    const record = (op, next) => {
      corrections.push(
        buildTakeoffCorrectionEvent(op, { room: roomName ?? null, runId: run.id ?? null, label: run.label ?? null })
      );
      return next;
    };

    if (cookingApplianceInterruptsCountertop(type)) {
      let next = run;
      if (hasCooktopCutout) {
        next = applyCookingApplianceToRun(run, type, {
          confidence: appliance.confidence,
          source: appliance.source,
          widthIn: appliance.widthIn,
          note: appliance.note
        });
        next.cookingAppliance.reviewRequired = appliance.reviewRequired === true || next.cookingAppliance.reviewRequired;
        appendRunNote(next, "Cooktop cutout removed — a range interrupts the countertop and gets no cutout.");
        record("range_cooktop_cutout_removed", next);
      }
      if (appliance.source === "estimator_confirmed") return next;
      if (labeled(next.cookingAppliance?.widthIn) && !evidenceRangeWidth) {
        next = { ...next, cookingAppliance: { ...next.cookingAppliance, reviewRequired: true } };
        delete next.cookingAppliance.widthIn;
        next.requiresEstimatorReview = true;
        appendRunNote(next, "Range width is not labeled on the plan — no standard width assumed. Staff must confirm the opening.");
        record("range_width_unlabeled_removed", next);
      }
      if (!evidenceRangeSides) {
        next = { ...next, requiresEstimatorReview: true };
        appendRunNote(next, "Piece lengths beside the range are not labeled on the plan — confirm before approval.");
        record("range_sides_unlabeled", next);
      }
      return next;
    }

    if (!hasCooktopCutout && type !== "cooktop") return run;

    const text = runEvidenceText(run);
    const saysRange = RANGE_TEXT_RE.test(text);
    const saysCooktop = COOKTOP_TEXT_RE.test(text);

    if (saysRange && !saysCooktop) {
      const next = applyCookingApplianceToRun(run, "unknown_cooking_appliance", {
        confidence: "low",
        source: "ai_suggested",
        note: "Plan text describes a range, not a cooktop — confirm type before pricing."
      });
      next.requiresEstimatorReview = true;
      appendRunNote(
        next,
        "Cooktop cutout withheld — plan text describes a range. If it is a slide-in/free-standing range, split this run at the range opening."
      );
      return record("cooktop_reclassified_unknown_range_text", next);
    }

    const unclassified = !appliance || appliance.source === "legacy";
    if (saysRange || unclassified || evidenceSawRange) {
      const next = { ...run, cookingAppliance: { ...(appliance || { type: "cooktop", source: "ai_suggested" }) } };
      next.cookingAppliance.reviewRequired = true;
      next.cookingAppliance.confidence = "low";
      next.requiresEstimatorReview = true;
      const reason = saysRange
        ? "plan text mentions both a cooktop and a range"
        : evidenceSawRange
          ? "the plan evidence identified a range"
          : "the AI did not classify the cooking appliance";
      appendRunNote(next, `Confirm cooktop vs range — ${reason}.`);
      return record("cooktop_review_required", next);
    }
    return run;
  };

  for (const room of base.rooms) {
    if (!room || typeof room !== "object") continue;
    if (Array.isArray(room.runs)) room.runs = room.runs.map((r) => reconcileRun(r, room.name));
    if (Array.isArray(room.pieces)) room.pieces = room.pieces.map((r) => reconcileRun(r, room.name));
    if (Array.isArray(room.areas)) {
      for (const area of room.areas) {
        if (area && Array.isArray(area.runs)) area.runs = area.runs.map((r) => reconcileRun(r, room.name));
      }
    }
  }
  const changed = corrections.length > 0;
  return { takeoff: changed ? base : takeoff, changed, corrections };
}

/**
 * Approval blocker for an included piece, or null. A clearly classified cooktop
 * passes; an unknown or review-flagged appliance needs staff confirmation; a range
 * needs staff to split the piece at the opening or confirm the stone already stops
 * there — a continuous piece across an unresolved range must never be billed.
 * @param {object} run
 * @returns {{ code: string, message: string } | null}
 */
export function cookingApplianceApprovalIssue(run) {
  const appliance = run?.cookingAppliance;
  const type = String(appliance?.type || "");
  if (!type || type === "not_applicable") return null;
  if (cookingApplianceInterruptsCountertop(type)) {
    const confirmed =
      appliance.source === "estimator_confirmed" &&
      (Boolean(run.adjacentApplianceGap) || run.applianceSidesConfirmed === true);
    if (confirmed) return null;
    return {
      code: "COOKING_APPLIANCE_UNRESOLVED",
      message: "range opening not resolved — split the piece at the range or confirm the stone already stops there"
    };
  }
  if (type === "unknown_cooking_appliance" || appliance.reviewRequired === true) {
    return {
      code: "COOKING_APPLIANCE_UNRESOLVED",
      message: "confirm the cooking appliance (cooktop with cutout, or range that splits the piece)"
    };
  }
  return null;
}

export function collectCookingApplianceReviewIssues(run) {
  const issues = [];
  const appliance = run?.cookingAppliance;
  if (!appliance) return issues;
  if (cookingApplianceNeedsReview(appliance)) {
    issues.push({
      code: "COOKING_APPLIANCE_TYPE_NEEDS_CONFIRMATION",
      message: "Cooking appliance detected · Type needs confirmation",
      applianceType: appliance.type || "unknown_cooking_appliance"
    });
  }
  if (
    cookingApplianceInterruptsCountertop(appliance.type) &&
    Array.isArray(run?.cutouts) &&
    run.cutouts.some((c) => c.type === "cooktop")
  ) {
    issues.push({
      code: "RANGE_HAS_COOKTOP_CUTOUT",
      message: "Free-standing/slide-in range should not carry a cooktop cutout."
    });
  }
  return issues;
}
