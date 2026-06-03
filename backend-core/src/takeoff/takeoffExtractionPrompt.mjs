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

/**
 * Bump when extraction rules or schema guidance changes.
 * v3: user message includes page inventory context (recommended pages,
 *     pre-classified dimensions/notes) when a prior inventory pass succeeded.
 * v4: user message also includes dimension evidence table (pre-extracted labeled
 *     dimensions, notes, cutouts). Extraction model builds runs directly from the
 *     evidence table rather than re-reading the whole plan.
 * v5: user message also includes referenceTotals from dimension evidence (visible
 *     estimator sqft callouts). Extraction model uses them for aiProvidedTotals and
 *     adds review notes when structured run totals differ from visible references.
 * v6: evidence-first traceability rules added. Every run must cite its evidence via
 *     assemblyNotes + optional lengthEvidenceId/depthEvidenceId. Model must not
 *     silently resolve conflicts or invent dimensions unsupported by evidence.
 *     requiresEstimatorReview added to run schema.
 */
export const PROMPT_VERSION = "v6";

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
              "notes": ["Sink at center"],
              "lengthEvidenceId": "dim-001",
              "assemblyNotes": "Length from evidence dim-001 'Sink wall 91.5\"'; standard 25.5\" depth assumed.",
              "assemblyConfidence": "high"
            },
            {
              "id": "<uuid>",
              "label": "Stove wall",
              "lengthIn": 72.0,
              "depthIn": 25.5,
              "shape": "rect",
              "pieceType": "counter",
              "sourcePages": [1],
              "notes": ["Range at right end — backsplash interrupted"],
              "lengthEvidenceId": "dim-002",
              "assemblyNotes": "Length from evidence dim-002 'Stove wall 72\"'; standard 25.5\" depth assumed.",
              "assemblyConfidence": "high"
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
              "notes": ["Seating on south side"],
              "lengthEvidenceId": "dim-003",
              "depthEvidenceId": "dim-003",
              "assemblyNotes": "Length 77.5\" and depth 41\" from evidence dim-003 'Island 77.5×41'. Nonstandard depth documented on plan.",
              "assemblyConfidence": "high"
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

EVIDENCE TRACEABILITY (v6) — REQUIRED FOR EVERY RUN
• Every run MUST include assemblyNotes explaining which evidence dimension(s) it used.
  Example: "Length from dim-004 'Sink wall 100\"'; depth 25.5\" assumed (standard)."
• When the dimension evidence table is provided, set lengthEvidenceId to the [id] of the evidence dimension
  used for the run length. Set depthEvidenceId similarly when evidence has an explicit depth.
• Do NOT invent final runs from dimensions not in the evidence table.
• Do NOT silently choose between conflicting evidence dimensions (floor plan vs elevation, for example).
  Instead: set requiresEstimatorReview = true, add an assemblyNotes entry explaining the conflict, and use
  the more conservative (smaller) dimension. Never silently pick the larger dimension.
• Do NOT replace plan-view dimensions with cabinet-width sums unless explicitly justified in assemblyNotes.
• Do NOT apply L-shape/U-shape cornerDeductions unless the layout overlap is explicit and the overlapMode is set.
• Do NOT assume nonstandard depths (>26") — nonstandard depths must come from visible plan evidence and must
  be cited via depthEvidenceId. If the plan has no explicit depth label, use the standard default (25.5"
  counter, 21.5" vanity) and document in assemblyNotes.
• If the correct assembly is genuinely unclear (conflicting evidence, missing dimensions, ambiguous layout):
  set requiresEstimatorReview = true on the affected run, describe the uncertainty in assemblyNotes, and use
  the most defensible dimension. Do NOT force a confident geometry when the plan is ambiguous.
• Set assemblyConfidence = "high" when the run directly matches a single unambiguous evidence dimension.
  Set "medium" when inferring from adjacent dimensions or multiple sources. Set "low" when uncertain.

BACKSPLASH — READ CAREFULLY
• backsplashIncluded: set true whenever any backsplash applies to this area; set false only when the plan or notes explicitly say otherwise.
• backsplashLinearIn: REQUIRED when backsplash is present. Set to the total linear inches of counter wall that receives backsplash (from the run lengths, minus appliance openings and open sides). Do NOT leave unset or at 0 when a backsplash note exists.
• backsplashHeightIn: REQUIRED when backsplashLinearIn > 0. Default is 4 (inches) unless the plan specifies a different height. Always set explicitly.
• CRITICAL: If a plan note, label, or annotation mentions B/S, backsplash, splash, 4" B/S, 4 inch B/S, "std B/S", or similar:
  - Set backsplashIncluded = true on the relevant area.
  - Estimate backsplashLinearIn from the runs that receive backsplash (typically the perimeter/wall runs; exclude islands, open peninsula sides, and appliance gaps).
  - Set backsplashHeightIn = 4 for standard backsplash, or use the height stated in the note.
  - Record the note in the area's notes array.
• If the plan or note says "no B/S", "no backsplash", "n/b/s" → set backsplashIncluded = false, backsplashLinearIn = 0, and add to assumptions: "No backsplash per plan note."
• If the note says "tile on wall", "existing tile", or "customer tile" → set backsplashIncluded = false. Stone backsplash is not required. Add to notes: "Tile on wall — stone backsplash not fabricated." Add to assumptions: "Tile backsplash noted — review required."
• If the plan shows a backsplash sqft total (e.g. "8.52 sq ft B/S", "8.5 sf backsplash") but you cannot determine specific linear inches: record it in aiProvidedTotals.backsplashExactSf and add to projectAssumptions: "Backsplash sqft reference found but linear inches could not be determined — estimator must verify and enter backsplashLinearIn manually." Do NOT leave all areas with backsplashLinearIn = 0 when you also record a positive aiProvidedTotals.backsplashExactSf unless the notes explicitly say no backsplash.
• "full height", "FHB", "full-height backsplash" → pieceType = "fhb" on the backsplash run; use height from counter to upper cabinets if visible, otherwise note "FHB height unknown — review required."
• Open peninsula/island sides: no backsplash unless plan explicitly notes it.
• Range/cooktop/refrigerator openings interrupt backsplash — subtract the appliance opening width from backsplashLinearIn unless the plan says otherwise.
• When you record a backsplash-related assumption or note, also set backsplashIncluded and backsplashLinearIn consistently. Do not leave them unset.

CUTOUTS AND EXCLUSIONS — CRITICAL RULE
• Sink cutouts, cooktop cutouts, and faucet holes are FABRICATION OPERATIONS, not material exclusions.
• Do NOT add sink/cooktop/faucet cutouts to area.exclusions[].
• Record them in area.notes[] or area.cutouts[] (if that field is present) for reference only.
• Do NOT subtract sink/cooktop/cutout area from material square footage.
• area.exclusions[] is ONLY for true missing-material sections: windows in counters, missing slab areas, or explicit gaps where stone is not present.
• If you are unsure whether something is a cutout or a true material exclusion: default to notes[] and add a review flag.

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
• Do NOT return markdown, explanation, or any text outside the JSON.
• Do NOT silently resolve conflicting evidence — use requiresEstimatorReview = true.
• Do NOT omit assemblyNotes from any run — every run must explain its evidence source.
• Do NOT use a dimension from a non-measurement page (email text, spec sheet) as a run length.`;
}

// ── User message ───────────────────────────────────────────────────────────────

/**
 * Build the user message for a specific plan file.
 *
 * When a PageInventory is provided (from the prior classification pass), it is
 * embedded as context so the extraction model knows which pages to focus on and
 * has pre-identified dimension evidence as hints.
 *
 * When a DimensionEvidence is provided (from the prior evidence pass), it is
 * embedded as an authoritative dimension table so the extraction model builds runs
 * directly from pre-identified measurements rather than re-reading the whole plan.
 *
 * @param {{ originalFilename: string, pageCount?: number|null, pageInventory?: object|null, dimensionEvidence?: object|null }} params
 * @returns {string}
 */
export function buildUserMessage({ originalFilename, pageCount, pageInventory, dimensionEvidence }) {
  const pageNote = pageCount > 1
    ? ` This plan has ${pageCount} pages — process all pages and combine rooms.`
    : "";

  const inventorySection = _buildInventoryContextSection(pageInventory);
  const evidenceSection   = _buildEvidenceContextSection(dimensionEvidence);

  return `Plan file: "${originalFilename}"${pageNote}

${inventorySection}${evidenceSection}Extract all countertop and backsplash measurements and return the TakeoffResult JSON object.

Return ONLY the JSON — no other text.`;
}

/**
 * Format dimension evidence into a directive table section for the extraction prompt.
 * When present, the extraction model is instructed to build runs directly from the
 * evidence table rather than re-reading the plan from scratch.
 * Returns empty string when evidence is null or has no dimensions.
 *
 * @param {object|null} evidence
 * @returns {string}
 */
function _buildEvidenceContextSection(evidence) {
  if (!evidence || !Array.isArray(evidence.dimensions)) return "";

  const dims         = evidence.dimensions;
  const notes        = evidence.notes ?? [];
  const cutouts      = evidence.cutouts ?? [];
  const refTotals    = evidence.referenceTotals ?? [];
  const uncertain    = evidence.uncertainItems ?? [];

  const lines = [
    "── DIMENSION EVIDENCE TABLE (from dimension extraction pass) ─────────────────",
    "IMPORTANT: Build TakeoffResult runs primarily from this pre-extracted evidence.",
    "Do NOT invent dimensions that are not in this table.",
    "Do NOT put cutouts/sink/cooktop/faucet in area.exclusions[].",
    "",
  ];

  if (dims.length > 0) {
    lines.push("Extracted dimensions (create one run per dimension where applicable):");
    for (const d of dims) {
      const l = d.lengthIn != null ? `${d.lengthIn}` : "?";
      const dep = d.depthIn != null ? `${d.depthIn}` : "null";
      const rawPart = d.rawText ? ` — raw: "${d.rawText}"` : "";
      const notePart = d.interpretationNotes?.length > 0
        ? ` (${d.interpretationNotes.join("; ")})`
        : "";
      lines.push(
        `  [${d.id ?? "dim"}] ${d.label} · ${l} × ${dep} in · ${d.category ?? "countertop_run"} · ${d.confidence ?? "?"} confidence · page ${d.pageNumber ?? "?"}${rawPart}${notePart}`
      );
    }
    lines.push("");
  } else {
    lines.push("(No dimensions extracted in evidence pass — extract from plan directly.)");
    lines.push("");
  }

  if (notes.length > 0) {
    lines.push("Extracted notes (use to set backsplash/waterfall/edge fields):");
    for (const n of notes) {
      lines.push(`  [${n.category ?? "note"}] "${n.text}" · ${n.confidence ?? "?"} · page ${n.pageNumber ?? "?"}`);
    }
    lines.push("");
  }

  if (cutouts.length > 0) {
    lines.push("Cutouts identified (add to area.notes[] or area.cutouts[], NOT to area.exclusions[]):");
    for (const c of cutouts) {
      lines.push(`  [${c.type ?? "cutout"}] ${c.label} · ${c.confidence ?? "?"} confidence · page ${c.pageNumber ?? "?"}`);
    }
    lines.push("");
  }

  if (refTotals.length > 0) {
    lines.push(
      "── REFERENCE TOTALS (visible estimator sqft callouts) ───────────────────────",
      "These are high-priority reconciliation evidence. Do NOT silently ignore them.",
      "Do NOT force run math to match them by inventing dimensions.",
      "If structured dimensions conflict with a reference total: preserve structured dimensions, add review note.",
      "If noBacksplash=true: set backsplashIncluded=false, backsplashLinearIn=0 UNLESS conflicting note exists.",
      "",
    );
    for (const ref of refTotals) {
      const parts = [];
      if (ref.countertopSf != null) parts.push(`CT ${ref.countertopSf} sf`);
      if (ref.noBacksplash)         parts.push("NO BACKSPLASH");
      if (ref.backsplashSf != null) parts.push(`BS ${ref.backsplashSf} sf`);
      if (ref.combinedSf   != null) parts.push(`combined ${ref.combinedSf} sf`);
      if (ref.backsplashHeightIn != null) parts.push(`BS height ${ref.backsplashHeightIn}"`);
      const pageStr = ref.pageNumber ? ` — page ${ref.pageNumber}` : "";
      const confStr = ref.confidence ? ` (${ref.confidence})` : "";
      lines.push(`  [${ref.id ?? "ref"}] "${ref.rawText}" → ${parts.join(", ") || "reference note"}${pageStr}${confStr}`);
    }
    lines.push("");
    lines.push(
      "Reconciliation instructions:",
      "  1. Add each reference total to projectAssumptions as: 'Visible reference total: [rawText]'.",
      "  2. If countertopSf is present: set aiProvidedTotals.countertopExactSf to that value.",
      "  3. If backsplashSf is present: set aiProvidedTotals.backsplashExactSf to that value.",
      "  4. If noBacksplash is true: do NOT populate any backsplashLinearIn on any area unless there is a conflicting note.",
      "  5. If structured run totals differ significantly from the reference total: add a review note explaining the discrepancy.",
      "─────────────────────────────────────────────────────────────────────────────",
      "",
    );
  }

  if (uncertain.length > 0) {
    lines.push("Uncertain items requiring estimator review (add to projectAssumptions):");
    for (const u of uncertain) {
      lines.push(`  ${u}`);
    }
    lines.push("");
  }

  lines.push(
    "Rules for using this evidence table (v6 — evidence-first):",
    "  1. For each dimension with both lengthIn and depthIn: create a TakeoffRun using those exact values.",
    "  2. For dimensions with depthIn=null: apply standard depth (25.5\" counter / 21.5\" vanity) and add to area.assumptions[].",
    "  3. Group dimensions into rooms/areas based on their labels and categories.",
    "  4. Do NOT add sink/cooktop/faucet to area.exclusions[]. They are fabrication add-ons.",
    "  5. If a required dimension is NOT in this table: add 'MISSING: <description>' to projectAssumptions[].",
    "  6. If your reading of the plan conflicts with evidence above: add a review note explaining the discrepancy.",
    "  7. REQUIRED: Set lengthEvidenceId on every counter run to the [id] of the evidence dimension used.",
    "     If no single evidence dim was used (e.g. standard depth assumption), leave depthEvidenceId unset.",
    "  8. REQUIRED: Set assemblyNotes on every counter run explaining which evidence dimension(s) were used.",
    "     If dimensions are conflicting or unclear, set requiresEstimatorReview = true on that run.",
    "  9. Do NOT silently pick between conflicting dimensions. If floor plan says 34.5\" and elevation says",
    "     25.5\", set requiresEstimatorReview = true, note both values in assemblyNotes, and use the more",
    "     conservative (smaller or more clearly labeled) value.",
    " 10. Do NOT invent dimensions that are not in this evidence table.",
    "─────────────────────────────────────────────────────────────────────────────",
    "",
  );

  return lines.join("\n") + "\n";
}

/**
 * Format page inventory into a guidance section for the extraction prompt.
 * Returns empty string when inventory is null or has no pages.
 *
 * @param {object|null} inventory
 * @returns {string}
 */
function _buildInventoryContextSection(inventory) {
  if (!inventory || !Array.isArray(inventory.pages) || inventory.pages.length === 0) {
    return "";
  }

  const recPages     = inventory.recommendedMeasurementPages ?? [];
  const ignoredPages = inventory.pagesToIgnore ?? [];

  const lines = [
    "── PAGE INVENTORY CONTEXT (from prior classification pass) ──────────────────",
  ];

  if (recPages.length > 0) {
    lines.push(`Recommended measurement page(s): ${recPages.join(", ")}`);
  }
  if (ignoredPages.length > 0) {
    lines.push(`Pages to ignore (email/context only, no measurements): ${ignoredPages.join(", ")}`);
  }

  // Emit visible dimensions from recommended pages as evidence hints.
  const dimLines  = [];
  const noteLines = [];
  for (const page of inventory.pages) {
    if (!page.recommendedForTakeoff) continue;
    const pNum = page.pageNumber;
    for (const dim of page.visibleDimensions ?? []) {
      dimLines.push(
        `  Page ${pNum} · ${dim.label}: ${dim.value}${dim.unit ? " " + dim.unit : ""} (${dim.confidence} confidence, raw: "${dim.rawText ?? dim.value}")`
      );
    }
    for (const note of page.visibleNotes ?? []) {
      noteLines.push(
        `  Page ${pNum} · [${note.category}] "${note.text}" (${note.confidence} confidence)`
      );
    }
  }

  if (dimLines.length > 0) {
    lines.push("Pre-classified visible dimensions (use as evidence, verify against the plan):");
    lines.push(...dimLines);
  }
  if (noteLines.length > 0) {
    lines.push("Pre-classified visible notes:");
    lines.push(...noteLines);
  }

  lines.push(
    "Instructions for using this context:",
    "  - Focus measurement extraction on the recommended page(s) listed above.",
    "  - Do NOT treat email/context pages as measurement sources.",
    "  - Use the pre-classified dimensions as hints — confirm against the actual drawing.",
    "  - If your extraction for a dimension differs from the hint, add a review note.",
    "  - Still return a complete TakeoffResult; do not truncate rooms or runs.",
    "─────────────────────────────────────────────────────────────────────────────",
    "",
  );

  return lines.join("\n") + "\n";
}
