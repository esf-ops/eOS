/**
 * Evidence envelope — every gateway result is traceable.
 * The LLM may cite evidenceIds; fabricated IDs are rejected by answer validation.
 */

import { randomUUID } from "node:crypto";

/**
 * @param {object} args
 * @returns {import('./types.js').BrainEvidence}
 */
export function makeEvidence({
  sourceDomain,
  sourceSystem,
  entityType = null,
  entityId = null,
  sourceUpdatedAt = null,
  authoritative = true,
  data,
  freshnessNote = null,
}) {
  const retrievedAt = new Date().toISOString();
  return {
    evidenceId: `ev_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sourceDomain: String(sourceDomain || "unknown"),
    sourceSystem: String(sourceSystem || "eliteos_brain"),
    entityType: entityType ? String(entityType) : null,
    entityId: entityId != null ? String(entityId) : null,
    retrievedAt,
    sourceUpdatedAt: sourceUpdatedAt || null,
    authoritative: Boolean(authoritative),
    freshnessNote: freshnessNote || null,
    data,
  };
}

/**
 * Strip internal-only fields before sending evidence data to the model.
 * Keep IDs needed for follow-up tool calls; omit raw payloads / calc dumps.
 */
export function sanitizeEvidenceDataForModel(data) {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map(sanitizeEvidenceDataForModel);
  if (typeof data !== "object") return data;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const key = String(k);
    if (/raw_payload|calculation_snapshot|service_role|password|token|secret/i.test(key)) continue;
    out[key] = sanitizeEvidenceDataForModel(v);
  }
  return out;
}

export function evidenceForModel(ev) {
  return {
    evidenceId: ev.evidenceId,
    sourceDomain: ev.sourceDomain,
    sourceSystem: ev.sourceSystem,
    entityType: ev.entityType,
    entityId: ev.entityId,
    retrievedAt: ev.retrievedAt,
    sourceUpdatedAt: ev.sourceUpdatedAt,
    authoritative: ev.authoritative,
    freshnessNote: ev.freshnessNote,
    data: sanitizeEvidenceDataForModel(ev.data),
  };
}
