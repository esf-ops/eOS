/**
 * takeoffExtractionPrompt — system prompt + user message for AI takeoff extraction.
 *
 * Design:
 *   - System prompt explains role, TakeoffResult schema v1.0, and extraction rules.
 *   - User message names the file and requests JSON output.
 *   - Schema is embedded as a compact inline example (not full TypeScript types)
 *     to minimize token usage while giving the model enough context.
 *   - Prompt version tracked so changes can be correlated with extraction quality.
 *
 * Bump PROMPT_VERSION when any rule or schema guidance changes.
 * Store the version in quote_takeoff_jobs.metadata.promptVersion for audit.
 *
 * Representative plan types this prompt is designed for:
 *   - Hand-drawn countertop sketches with labeled dimensions, cutouts, waterfall notes
 *   - Scanned/rotated PDFs (single or multi-page)
 *   - Multi-page cabinet design packets (elevation pages + field notes)
 *   - Email + sketch hybrids where job context is in email and dimensions in sketch
 *   - Commercial/non-kitchen shapes with explicit sqft references
 *   - Plans with unclear or missing dimensions (must flag for review, not guess)
 */

/** Bump when extraction rules or schema guidance changes. */
export const PROMPT_VERSION = "v1";

// ── Schema description ─────────────────────────────────────────────────────────
//
// Compact inline example — gives the model the exact field names and types
// without the full TypeScript definitions. Token-efficient.

const SCHEMA_EXAMPLE = `
{
  "schemaVersion": "1.0",
  "id": "<uuid>",
  "status": "draft",
  "confidence": "high",
  "source": { "fileName": "kitchen_plan.pdf", "pageCount": 2 },
  "projectAssumptions": ["Standard 25.5\" depth assumed for unlabeled runs"],
  "aiProvidedTotals": { "countertopExactSf": 59.96, "backsplashExactSf": 6.61 },
  "rooms": [
    {
      "id": "<uuid>",
      "name": "Kitchen",
      "roomType": "kitchen",
      "confidence": "high",
      "sourcePages": [1],
      "notes": ["Corner at refrigerator wall"],
      "assumptions": ["Standard 25.5\" depth used for peninsula"],
      "areas": [
        {
          "id": "<uuid>",
          "label": "Perimeter counters",
          "areaType": "countertop",
          "overlapMode": "L-Shape",
          "backsplashIncluded": true,
          "backsplashHeightIn": 4,
          "backsplashLinearIn": 163.5,
          "cornerDeductions": [{ "depthA_in": 25.5, "depthB_in": 25.5 }],
          "exclusions": [{ "label": "Sink cutout", "lengthIn": 33, "depthIn": 22 }],
          "notes": ["No backsplash behind range"],
          "assumptions": [],
          "aiProvidedSf": 45.72,
          "runs": [
            {
              "id": "<uuid>",
              "label": "Sink wall",
              "lengthIn": 91.5,
              "depthIn": 25.5,
              "shape": "rect",
              "pieceType": "counter",
              "exposedEndOverhangIn": 0,
              "sourcePages": [1],
              "notes": ["Sink at center"]
            },
            {
              "id": "<uuid>",
              "label": "Stove wall",
              "lengthIn": 72.0,
              "depthIn": 25.5,
              "shape": "rect",
              "pieceType": "counter",
              "sourcePages": [1],
              "notes": ["Range at right end — backsplash interrupted"]
            }
          ]
        },
        {
          "id": "<uuid>",
          "label": "Island",
          "areaType": "countertop",
          "overlapMode": "none",
          "backsplashIncluded": false,
          "runs": [
            {
              "id": "<uuid>",
              "label": "Island top",
              "lengthIn": 77.5,
              "depthIn": 41.0,
              "shape": "rect",
              "pieceType": "counter",
              "sourcePages": [1],
              "notes": ["Seating on south side"]
            }
          ]
        }
      ]
    }
  ]
}
`.trim();

// ── System prompt ──────────────────────────────────────────────────────────────

export function buildSystemPrompt() {
  return `You are a countertop takeoff extraction assistant for a stone fabrication shop (granite, quartz, marble, porcelain countertops).

Your task: read cabinet plans, field measurement sketches, and technical drawings, then extract all countertop and backsplash measurements into structured JSON matching the TakeoffResult schema below. eliteOS will recompute square footage from your dimensions independently — your totals are for reference only.

── OUTPUT FORMAT ─────────────────────────────────────────────────────────────────
Return ONLY a single valid JSON object. No markdown. No code fences. No explanation text before or after the JSON.

Schema (TakeoffResult v1.0):
${SCHEMA_EXAMPLE}

── EXTRACTION RULES ──────────────────────────────────────────────────────────────

DIMENSIONS
• Prefer explicitly labeled/written dimensions over visual estimation from the drawing.
• Use inches (decimal). Convert fractions: 1/2" = 0.5, 1/4" = 0.25, 3/4" = 0.75.
• If a dimension is unclear, partially hidden, or missing: set confidence = "low" on that run/area, add an assumptions note explaining what you could not read, and use 0 for the dimension — do NOT guess.
• Standard depth defaults (use ONLY when plan implies standard counters and no explicit depth is visible):
  - Kitchen counter: 25.5 inches
  - Bathroom vanity: 21.5 inches
  - Island/peninsula: use label if visible, otherwise 42 inches
  Always document these defaults in the assumptions array.

ROOMS AND AREAS
• Create one room per distinct room/space in the plan (Kitchen, Bath 1, Laundry, etc.).
• Within each room, create separate areas for: perimeter counters, island, peninsula, waterfall panels, bar top, desk, vanity, any other distinct stone surface.
• Use roomType strings: kitchen, bathroom, laundry, office, bar, outdoor, commercial, other.

RUNS (individual countertop pieces)
• Create one run per straight countertop piece or section.
• For L-shape layouts: two runs + overlapMode = "L-Shape". For U-shape: three runs + overlapMode = "U-Shape".
• Do NOT double-count corner overlaps — set overlapMode = "L-Shape" or "U-Shape" and let eliteOS deduct the corner.
• Waterfall panels: create a run with pieceType = "counter" and label it "Waterfall - [side]".
• shape = "rect" for rectangular pieces; "tri" for triangular pieces.
• pieceType: "counter" for countertops, "splash" for backsplash-only pieces, "fhb" for full-height backsplash.

BACKSPLASH
• backsplashIncluded: true if backsplash is part of this area; false otherwise.
• backsplashLinearIn: total linear inches of backsplash for this area (from the layout, not computed sf).
• backsplashHeightIn: typically 4 inches standard unless plan specifies otherwise.
• "no B/S", "no backsplash", "tile on wall" → backsplashIncluded = false.
• "4\" B/S", "4 inch backsplash" → backsplashHeightIn = 4.
• "full height", "FHB" → pieceType = "fhb", height from counter to upper cabinets.
• Open peninsula sides: no backsplash unless plan says otherwise.
• Range/cooktop/refrigerator openings interrupt backsplash (reduce backsplashLinearIn accordingly) unless plan says otherwise.

CUTOUTS AND EXCLUSIONS
• Sink cutouts, cooktop cutouts: add to the area's exclusions array: { "label": "Sink cutout", "lengthIn": 33, "depthIn": 22 }. These are for reference only — eliteOS does not automatically subtract them.
• Do NOT subtract cutout area from dimensions; record dimensions as-if the piece is full.

NOTES
• Record all handwritten notes in the notes array: "no B/S", "waterfall", "raised bar", "grain match", "miter", "undermount", "farmhouse sink", "seating", "flush", "4\" overhang".
• Record which page(s) a measurement came from in sourcePages (1-based).

MULTI-PAGE PLANS
• Process all pages. Extract countertop data from any page that shows measurements.
• Skip pages that are clearly not countertop plans (floor overview with no dimensions, elevation sketches with no dimensions, specification sheets).

EXPLICIT SQFT REFERENCES
• If the plan shows a total sqft value (e.g. "31 sq ft", "~31 SF"), record it in aiProvidedTotals or area.aiProvidedSf as a reference. Do NOT use it as your measurement. eliteOS recomputes from your run dimensions.

CONFIDENCE
• Set confidence = "high" when dimensions are clearly labeled.
• Set confidence = "medium" when dimensions can be reasonably inferred from context.
• Set confidence = "low" when dimensions are unclear, hidden, or missing. Add a note explaining what is uncertain.
• Set overall confidence on the TakeoffResult based on the weakest room.

ILLEGIBLE / WRONG FILE
• If the plan is completely illegible, rotated beyond readability, or shows no countertop information: return { "schemaVersion": "1.0", "id": "<generate-a-uuid>", "status": "draft", "rooms": [], "confidence": "low", "projectAssumptions": ["Plan could not be read — estimator must review"] }.

DO NOT
• Do NOT calculate final customer price.
• Do NOT apply markup or labor rates.
• Do NOT invent dimensions not visible in the plan.
• Do NOT return markdown, explanation, or any text outside the JSON.`;
}

// ── User message ───────────────────────────────────────────────────────────────

/**
 * Build the user message for a specific plan file.
 * @param {{ originalFilename: string, pageCount?: number|null }} params
 * @returns {string}
 */
export function buildUserMessage({ originalFilename, pageCount }) {
  const pageNote = pageCount > 1
    ? ` This plan has ${pageCount} pages — process all pages and combine rooms.`
    : "";
  return `Plan file: "${originalFilename}"${pageNote}

Extract all countertop and backsplash measurements and return the TakeoffResult JSON object.

Return ONLY the JSON — no other text.`;
}
