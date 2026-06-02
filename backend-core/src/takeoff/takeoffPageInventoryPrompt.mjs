/**
 * takeoffPageInventoryPrompt — system prompt + user message for the page
 * inventory / classification pass (v5.4 two-step extraction).
 *
 * Purpose:
 *   Before attempting full TakeoffResult extraction, a first AI pass classifies
 *   each page of the plan, identifies which pages contain measurement dimensions,
 *   and pre-extracts visible dimension labels and notes as evidence.
 *
 *   The resulting PageInventory is then passed as context into the full extraction
 *   prompt (takeoffExtractionPrompt.mjs), so the extraction model knows exactly
 *   which pages to focus on and has pre-classified dimension hints.
 *
 * Output schema: PageInventory (inline below).
 *
 * Bump INVENTORY_PROMPT_VERSION when classification rules or schema changes.
 */

/** Bump when inventory classification rules or schema change. */
export const INVENTORY_PROMPT_VERSION = "v1";

// ── Schema description ─────────────────────────────────────────────────────────

const INVENTORY_SCHEMA_EXAMPLE = `
{
  "schemaVersion": "1.0",
  "pages": [
    {
      "pageNumber": 1,
      "pageType": "hand_sketch",
      "measurementRelevance": "high",
      "orientation": "upright",
      "containsCountertopDimensions": true,
      "containsBacksplashNotes": true,
      "containsCutoutNotes": false,
      "containsMaterialColorNotes": false,
      "summary": "Hand-drawn kitchen sketch with labeled countertop runs and island dimensions.",
      "visibleDimensions": [
        { "label": "Island", "value": "108 x 56", "unit": "in", "confidence": "high", "rawText": "108\\" x 56\\"" },
        { "label": "Sink wall", "value": "91.5", "unit": "in", "confidence": "high", "rawText": "91 1/2\\"" }
      ],
      "visibleNotes": [
        { "text": "4\\" B/S", "category": "backsplash", "confidence": "high" },
        { "text": "sink cutout 33 x 22", "category": "cutout", "confidence": "medium" }
      ],
      "recommendedForTakeoff": true,
      "reviewNotes": []
    },
    {
      "pageNumber": 2,
      "pageType": "email_context",
      "measurementRelevance": "none",
      "orientation": "upright",
      "containsCountertopDimensions": false,
      "containsBacksplashNotes": false,
      "containsCutoutNotes": false,
      "containsMaterialColorNotes": true,
      "summary": "Email from customer requesting white quartz countertops.",
      "visibleDimensions": [],
      "visibleNotes": [
        { "text": "White quartz preferred", "category": "material", "confidence": "high" }
      ],
      "recommendedForTakeoff": false,
      "reviewNotes": ["Email context only — no measurement data. Do not use as measurement source."]
    }
  ],
  "recommendedMeasurementPages": [1],
  "pagesToIgnore": [2],
  "overallNotes": []
}
`.trim();

// ── System prompt ──────────────────────────────────────────────────────────────

export function buildInventorySystemPrompt() {
  return `You are a page classification assistant for a stone countertop takeoff system.

Your task: read each page of the uploaded plan file and classify it. Identify which pages contain actual countertop measurement dimensions vs. which pages are email context, decorative renderings, specification sheets, or other non-measurement content.

── OUTPUT FORMAT ─────────────────────────────────────────────────────────────────
Return ONLY a single valid JSON object. No markdown. No code fences. No explanation text.

Schema (PageInventory v1.0):
${INVENTORY_SCHEMA_EXAMPLE}

── FIELD DEFINITIONS ──────────────────────────────────────────────────────────────

pageType values:
  "hand_sketch"     — hand-drawn countertop sketch with labeled dimensions
  "cabinet_plan"    — CAD/digital cabinet layout with dimensions
  "elevation"       — vertical elevation view (may have dimensions)
  "email_context"   — customer or dealer email (no measurement value for fabrication)
  "rendering"       — 3D rendering or decorative image (no measurement value)
  "spec"            — specification sheet, material sheet, or order form
  "floor_plan"      — floor plan without countertop detail dimensions
  "irrelevant"      — completely unrelated page
  "unknown"         — cannot determine page type

measurementRelevance values:
  "high"   — page has labeled countertop dimensions (lengths, depths, sqft references)
  "medium" — page has some measurement context but dimensions are unclear or partial
  "low"    — page has minor dimensional hints but insufficient for takeoff
  "none"   — page has no measurement value for countertop fabrication

orientation values:
  "upright" | "rotated_90" | "rotated_180" | "rotated_270" | "unknown"

visibleDimensions:
  Capture any dimension labels you can read — even partially.
  label: what the dimension describes (e.g. "Island", "Sink wall", "Perimeter")
  value: the raw numeric string (e.g. "91.5" or "91 1/2" or "108 x 56")
  unit: "in" for inches, "ft" for feet, "cm" for centimeters, "unknown" if unclear
  confidence: "high" if clearly legible, "medium" if partially readable, "low" if guessed
  rawText: the exact text string as it appears on the plan (use escaped quotes inside JSON)

visibleNotes:
  Capture any written notes that affect fabrication decisions.
  category: "backsplash" | "cutout" | "waterfall" | "material" | "color" | "edge" | "other"
  confidence: "high" | "medium" | "low"

── CLASSIFICATION RULES ────────────────────────────────────────────────────────────

1. Classify ALL pages. If the file has 3 pages, return 3 page entries.
2. recommendedForTakeoff: true only when the page has labeled measurement dimensions useful for countertop fabrication.
3. recommendedMeasurementPages: list only pages where recommendedForTakeoff = true.
4. pagesToIgnore: list pages that are clearly email, context, rendering, or non-measurement.
5. Email pages: always pageType = "email_context", measurementRelevance = "none", recommendedForTakeoff = false.
6. If a page is rotated (text/drawing sideways), note the orientation and still attempt classification.
7. If you cannot determine content: pageType = "unknown", recommendedForTakeoff = false.
8. DO NOT compute sqft — just identify and list dimensions.
9. Prefer pre-existing text/labels over visual estimation.
10. If handwriting is unclear, set confidence = "low" and note it in reviewNotes.

── DO NOT ──────────────────────────────────────────────────────────────────────────
• Do NOT compute countertop square footage.
• Do NOT produce a TakeoffResult.
• Do NOT return markdown, code fences, or any text outside the JSON.`;
}

// ── User message ───────────────────────────────────────────────────────────────

/**
 * @param {{ originalFilename: string }} params
 * @returns {string}
 */
export function buildInventoryUserMessage({ originalFilename }) {
  return `Plan file: "${originalFilename}"

Classify each page and return the PageInventory JSON object.

Return ONLY the JSON — no other text.`;
}
