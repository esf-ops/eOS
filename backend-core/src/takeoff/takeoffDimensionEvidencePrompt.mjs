/**
 * takeoffDimensionEvidencePrompt — system prompt + user message for the dimension
 * evidence extraction pass (v5.5 three-step extraction).
 *
 * Purpose:
 *   A focused second pass (after page inventory, before full TakeoffResult generation)
 *   that extracts every labeled dimension as a typed evidence item. The resulting
 *   DimensionEvidence table is passed into the final TakeoffResult extraction so the
 *   extraction model builds runs directly from the pre-identified dimensions rather
 *   than re-reading the whole plan from scratch. This prevents the model from missing
 *   or "shrinking" major countertop pieces across runs.
 *
 * Key rules:
 *   - Sink/cooktop/faucet cutouts go in the cutouts[] array — NOT in dimensions[].
 *   - No sqft calculation in this pass.
 *   - No TakeoffResult produced in this pass.
 *   - depthIn may be null when only a single linear dimension is visible.
 *
 * Bump EVIDENCE_PROMPT_VERSION when extraction rules or schema changes.
 */

/** Bump when dimension evidence extraction rules or schema change. */
export const EVIDENCE_PROMPT_VERSION = "v1";

// ── Schema description ─────────────────────────────────────────────────────────

const EVIDENCE_SCHEMA_EXAMPLE = `
{
  "schemaVersion": "1.0",
  "sourcePages": [1],
  "dimensions": [
    {
      "id": "dim-1",
      "pageNumber": 1,
      "label": "Island top",
      "rawText": "108 x 56",
      "lengthIn": 108,
      "depthIn": 56,
      "confidence": "high",
      "category": "countertop_run",
      "interpretationNotes": []
    },
    {
      "id": "dim-2",
      "pageNumber": 1,
      "label": "Sink wall",
      "rawText": "91 1/2\\"",
      "lengthIn": 91.5,
      "depthIn": null,
      "confidence": "high",
      "category": "countertop_run",
      "interpretationNotes": ["Depth not labeled — standard counter depth will be assumed by estimator"]
    },
    {
      "id": "dim-3",
      "pageNumber": 1,
      "label": "Backsplash reference total",
      "rawText": "8.52 sf B/S",
      "lengthIn": null,
      "depthIn": null,
      "confidence": "medium",
      "category": "backsplash",
      "interpretationNotes": ["Reference total only — structured linear inches not visible"]
    }
  ],
  "notes": [
    {
      "pageNumber": 1,
      "text": "4\\" B/S standard",
      "category": "backsplash",
      "confidence": "high"
    },
    {
      "pageNumber": 1,
      "text": "No B/S behind range",
      "category": "backsplash",
      "confidence": "high"
    }
  ],
  "cutouts": [
    {
      "pageNumber": 1,
      "type": "sink",
      "label": "Sink cutout",
      "confidence": "high",
      "notes": ["Shown in center of sink wall"]
    }
  ],
  "uncertainItems": [
    "Peninsula depth not labeled — could be 25.5\\" or 42\\""
  ],
  "reviewRequired": true
}
`.trim();

// ── System prompt ──────────────────────────────────────────────────────────────

export function buildEvidenceSystemPrompt() {
  return `You are a dimension extraction assistant for a stone countertop fabrication shop.

Your task: read the plan file and extract every labeled dimension, fabrication note, and cutout callout into a structured evidence table. You are NOT building the final countertop layout in this pass — you are just cataloging the raw measurements and notes so an estimator can verify them before the takeoff is assembled.

── OUTPUT FORMAT ─────────────────────────────────────────────────────────────────
Return ONLY a single valid JSON object. No markdown. No code fences. No explanation.

Schema (DimensionEvidence v1.0):
${EVIDENCE_SCHEMA_EXAMPLE}

── FIELD DEFINITIONS ────────────────────────────────────────────────────────────

dimension.category values:
  "countertop_run"  — a straight countertop piece, perimeter counter, or wall run
  "island"          — an island or peninsula top
  "backsplash"      — a backsplash-specific dimension or sqft reference
  "waterfall"       — a waterfall side panel
  "cabinet"         — a cabinet dimension (not a countertop; note but do not use for sqft)
  "unknown"         — cannot determine what this dimension refers to

dimension.lengthIn and depthIn:
  Use decimal inches. Convert fractions: 1/2" = 0.5, 1/4" = 0.25, 3/4" = 0.75.
  Set to null when the value is not visible or cannot be read.
  When a label shows "108 x 56" interpret as lengthIn=108, depthIn=56.
  When only a single number is shown (e.g. "91 1/2""), set lengthIn to that value, depthIn to null.

note.category values:
  "backsplash" | "cutout" | "material_color" | "waterfall" | "edge" | "other"

cutout.type values:
  "sink" | "cooktop" | "faucet" | "other"

── EXTRACTION RULES ─────────────────────────────────────────────────────────────

DIMENSIONS — EXTRACT ALL OF THEM
1. Extract EVERY labeled dimension from the recommended measurement pages, no matter how small.
2. Do not skip a dimension because you are unsure about its purpose — include it as category "unknown" with a note.
3. If a label says "108 x 56" extract both: lengthIn=108, depthIn=56.
4. If a label shows "91 1/2"" extract: lengthIn=91.5, depthIn=null.
5. If you see a reference total (e.g. "31 sf CT", "8.52 sf B/S"), capture it as a dimension with lengthIn=null, depthIn=null and note the sqft reference in interpretationNotes.
6. For ambiguous handwriting: use your best reading, set confidence="low", add the ambiguity to interpretationNotes.
7. Do NOT invent dimensions. Do NOT apply standard depths here — record as-seen.

CUTOUTS — SEPARATE FROM DIMENSIONS
1. Sink cutouts, cooktop cutouts, faucet holes, and other opening callouts go in cutouts[] array.
2. Do NOT put cutouts in dimensions[].
3. Cutouts are fabrication operations, NOT material exclusions. They do not reduce material sf.
4. Common cutout indicators: "sink", "cooktop", "faucet", "cutout", "C/O", "undermount", symbol indicating an opening.

NOTES — CAPTURE ALL FABRICATION NOTES
1. Capture ALL annotation notes: "4\\" B/S", "no B/S", "FHB", "waterfall", "miter", "grain match", "tile on wall", "customer tile", "farmhouse sink", "seating overhang", etc.
2. Include any notes about backsplash, material, color, edge profile, or customer instructions.
3. Assign category based on primary subject.

UNCERTAIN ITEMS
1. If you see something that might be a dimension but cannot read it: add to uncertainItems[] as a description.
2. If any critical measurement is missing or ambiguous: set reviewRequired=true.

PAGES
1. Only extract from pages marked as recommended measurement pages (see user message).
2. If no recommended pages are specified: extract from all pages.
3. Set sourcePages to the page numbers you extracted from.

DO NOT
• Do NOT compute countertop square footage.
• Do NOT produce a TakeoffResult.
• Do NOT put sink/cooktop/faucet cutouts in dimensions[].
• Do NOT apply standard depth assumptions — record what you see.
• Do NOT return markdown or any text outside the JSON.`;
}

// ── User message ───────────────────────────────────────────────────────────────

/**
 * Build the user message for dimension evidence extraction.
 * Includes page inventory context to focus on recommended pages.
 *
 * @param {{ originalFilename: string, pageInventory?: object|null }} params
 * @returns {string}
 */
export function buildEvidenceUserMessage({ originalFilename, pageInventory }) {
  const recPages = (pageInventory?.recommendedMeasurementPages ?? []);
  const ignoredPages = (pageInventory?.pagesToIgnore ?? []);

  let pageContext = "";
  if (recPages.length > 0) {
    pageContext += `\nExtract dimensions from page(s): ${recPages.join(", ")} only.`;
  }
  if (ignoredPages.length > 0) {
    pageContext += `\nDo NOT extract from page(s): ${ignoredPages.join(", ")} (email/context pages — no measurement value).`;
  }
  if (recPages.length === 0 && ignoredPages.length === 0) {
    pageContext = "\nExtract dimensions from all pages.";
  }

  return `Plan file: "${originalFilename}"${pageContext}

Extract every labeled dimension, note, and cutout from the measurement page(s) above.
Return the DimensionEvidence JSON object.

Return ONLY the JSON — no other text.`;
}
