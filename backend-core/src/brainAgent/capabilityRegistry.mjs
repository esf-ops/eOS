/**
 * Capability registry — the ONLY operational data interface for the Brain agent.
 * All capabilities are mode=read. No arbitrary SQL. No LLM DB credentials.
 */

/** @typedef {'low'|'medium'|'high'|'critical'} Sensitivity */

/**
 * @typedef {object} BrainCapability
 * @property {string} name
 * @property {string} description
 * @property {string} domain
 * @property {'read'} mode
 * @property {string|null} requiredHead
 * @property {Sensitivity} sensitivity
 * @property {string} authoritativeSource
 * @property {(input: object, ctx: object) => Promise<object>} execute
 * @property {(input: object) => object|null} [validateInput]
 */

/** @type {Map<string, BrainCapability>} */
const REGISTRY = new Map();

export function registerCapability(cap) {
  if (!cap?.name) throw new Error("capability name required");
  if (cap.mode !== "read") throw new Error(`capability ${cap.name} must be mode=read`);
  REGISTRY.set(cap.name, cap);
  return cap;
}

export function getCapability(name) {
  return REGISTRY.get(String(name || "")) || null;
}

export function listCapabilities({ permittedHeads = null, includeUnavailable = false } = {}) {
  const heads = permittedHeads instanceof Set ? permittedHeads : null;
  const out = [];
  for (const cap of REGISTRY.values()) {
    const headOk = !cap.requiredHead || !heads || heads.has(cap.requiredHead) || heads.has("*");
    if (!headOk && !includeUnavailable) continue;
    out.push({
      name: cap.name,
      description: cap.description,
      domain: cap.domain,
      mode: cap.mode,
      requiredHead: cap.requiredHead,
      sensitivity: cap.sensitivity,
      authoritativeSource: cap.authoritativeSource,
      available: headOk,
    });
  }
  return out;
}

export function listCapabilityNames() {
  return [...REGISTRY.keys()];
}

/** Reset for tests only. */
export function _resetCapabilityRegistryForTests() {
  REGISTRY.clear();
}
