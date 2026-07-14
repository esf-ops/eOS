/**
 * Lab-owned, versioned takeoff prompts (Phase 4B.4A).
 * Never request chain-of-thought. Never invent dimensions.
 */

export const TAKEOFF_INVENTORY_PROMPT_VERSION = "qil-takeoff-inventory-v1";
export const TAKEOFF_EVIDENCE_PROMPT_VERSION = "qil-takeoff-evidence-v1";
export const TAKEOFF_GEOMETRY_PROMPT_VERSION = "qil-takeoff-geometry-v1";

const COMMON_RULES = `
Rules (mandatory):
- Read ONLY the supplied plan attachment content.
- Extract visible evidence. Never invent missing dimensions.
- Never assume a standard countertop depth unless the plan explicitly labels that assumption — and then flag it as an assumption.
- Clearly flag all assumptions.
- Never calculate pricing or determine material price group.
- Never create quote or customer communication.
- Never call production systems.
- Return structured JSON only (no markdown, no commentary outside JSON).
- Every measurement / piece must link to evidence ids when possible.
- Unknown remains unknown — use null and warnings.
- Do NOT include chain-of-thought or hidden reasoning.
- Do NOT include chargeable, priced, sell, quoteTotal, or Internal Estimate / Quote Library fields.
`.trim();

export const TAKEOFF_INVENTORY_SYSTEM_PROMPT = `
You are a Quote Intake Lab plan inventory assistant for countertop takeoff.
Pass 1 — Plan inventory only.
${COMMON_RULES}

Do NOT calculate final square footage.
Identify whether countertop-relevant content appears present, visible room labels, and whether dimensions appear readable.
`.trim();

export const TAKEOFF_EVIDENCE_SYSTEM_PROMPT = `
You are a Quote Intake Lab dimension evidence extractor for countertop plans.
Pass 2 — Evidence extraction only.
${COMMON_RULES}

Extract visible dimension labels, room labels, countertop / sink / backsplash annotations.
Provide page references and bounding regions or normalized coordinates when supported.
Preserve uncertainty. Do not invent dimensions.
`.trim();

export const TAKEOFF_GEOMETRY_SYSTEM_PROMPT = `
You are a Quote Intake Lab geometry proposal assistant for countertop plans.
Pass 3 — Geometry proposal and verification.
${COMMON_RULES}

Propose rooms and countertop pieces, associate dimensions with pieces, associate sink/cutout and backsplash scope.
Reference extracted evidence. Identify contradictions and missing dimensions.
Return provider-proposed totals ONLY for reconciliation (non-authoritative).
Verify that claims are supported by extracted evidence.
eliteOS (not you) will deterministically calculate authoritative measured SF.
`.trim();

export function buildInventoryUserMessage(meta) {
  return JSON.stringify({
    task: "plan_inventory",
    promptVersion: TAKEOFF_INVENTORY_PROMPT_VERSION,
    caseId: meta.caseId,
    filename: meta.filename,
    mimeType: meta.mimeType,
    contentHash: meta.contentHash,
    maxPages: meta.maxPages,
    requiredJsonSchema: {
      pageCount: "number",
      pages: [{ pageNumber: "number", role: "plan|elevation|schedule|other|unknown", notes: ["string"] }],
      countertopContentPresent: "boolean",
      dimensionsAppearReadable: "boolean",
      roomLabelsVisible: ["string"],
      confidence: "high|medium|low",
      warnings: [{ code: "string", message: "string", severity: "informational|estimator_review|approval_blocking" }]
    }
  });
}

export function buildEvidenceUserMessage(meta, inventory) {
  return JSON.stringify({
    task: "evidence_extraction",
    promptVersion: TAKEOFF_EVIDENCE_PROMPT_VERSION,
    caseId: meta.caseId,
    filename: meta.filename,
    contentHash: meta.contentHash,
    inventorySummary: {
      pageCount: inventory?.pageCount ?? null,
      countertopContentPresent: inventory?.countertopContentPresent ?? null,
      dimensionsAppearReadable: inventory?.dimensionsAppearReadable ?? null,
      roomLabelsVisible: inventory?.roomLabelsVisible ?? []
    },
    requiredJsonSchema: {
      evidence: [
        {
          id: "string",
          pageNumber: "number",
          label: "string",
          value: "number|string|null",
          unit: "string|null",
          confidence: "high|medium|low",
          locationNote: "string|null",
          bboxNorm: { x: "0-1", y: "0-1", w: "0-1", h: "0-1" }
        }
      ],
      warnings: [{ code: "string", message: "string", severity: "informational|estimator_review|approval_blocking" }]
    }
  });
}

export function buildGeometryUserMessage(meta, inventory, evidence) {
  return JSON.stringify({
    task: "geometry_proposal",
    promptVersion: TAKEOFF_GEOMETRY_PROMPT_VERSION,
    caseId: meta.caseId,
    filename: meta.filename,
    contentHash: meta.contentHash,
    inventorySummary: {
      pageCount: inventory?.pageCount ?? null,
      countertopContentPresent: inventory?.countertopContentPresent ?? null
    },
    evidenceIds: (evidence?.evidence ?? []).map((e) => e.id),
    requiredJsonSchema: {
      pages: [{ pageNumber: "number", role: "string", notes: ["string"] }],
      rooms: [
        {
          id: "string",
          name: "string",
          confidence: "high|medium|low",
          pieces: [
            {
              id: "string",
              label: "string",
              lengthIn: "number|null",
              depthIn: "number|null",
              shape: "rect|tri",
              pieceType: "counter|splash|fhb",
              evidenceIds: ["string"],
              cutouts: [{ type: "string", label: "string" }],
              notes: ["string"],
              requiresEstimatorReview: "boolean"
            }
          ],
          backsplashScope: "no_stone|standard|full_height|tile_by_others|needs_review|null",
          backsplashLinearIn: "number|null",
          backsplashHeightIn: "number|null",
          sourcePages: ["number"]
        }
      ],
      providerProposedTotals: {
        countertopSf: "number|null",
        backsplashSf: "number|null",
        combinedSf: "number|null",
        nonAuthoritative: true
      },
      confidence: "high|medium|low",
      missingDimensions: ["string"],
      contradictions: ["string"],
      warnings: [{ code: "string", message: "string", severity: "informational|estimator_review|approval_blocking" }]
    }
  });
}
