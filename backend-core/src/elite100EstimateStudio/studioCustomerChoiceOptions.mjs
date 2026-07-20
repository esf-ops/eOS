/**
 * Friendly customer choice controls → server catalog option keys.
 * Estimators never type qty-sink etc. Legacy unknown keys are preserved safely.
 */

export const FRIENDLY_CUSTOMER_CHOICES = Object.freeze([
  {
    id: "materialColor",
    label: "Material / color",
    help: "Customer may choose among estimator-approved Elite 100 colors.",
    catalogKeys: []
  },
  {
    id: "sink",
    label: "Sink option",
    help: "ESF catalog sink, customer-supplied sink, or no sink.",
    catalogKeys: ["qty-sink", "qty-ss"]
  },
  {
    id: "faucet",
    label: "Faucet option",
    help: "ESF catalog faucet, customer-supplied faucet, or no faucet.",
    catalogKeys: []
  },
  {
    id: "accessories",
    label: "Accessories",
    help: "Optional ESF sink accessories (grids, soap dispensers, etc.).",
    catalogKeys: []
  },
  {
    id: "specialty",
    label: "Specialty items",
    help: "Pop-up outlets and other specialty items (some require estimator review).",
    catalogKeys: []
  },
  {
    id: "cooktop",
    label: "Cooktop cutout",
    help: "Yes adds a cooktop cutout charge when selected by the customer.",
    catalogKeys: ["qty-cook"]
  },
  {
    id: "edge",
    label: "Edge profile",
    help: "Included edges (eased) by default; W/D edge when allowed by Studio scope.",
    catalogKeys: []
  },
  {
    id: "backsplash",
    label: "Backsplash option",
    help: "Customer may choose among estimator-approved backsplash options only.",
    catalogKeys: []
  },
  {
    id: "sideSplash",
    label: "Side splash",
    help: "Optional side splash per vanity/counter piece (length from piece depth).",
    catalogKeys: []
  }
]);

const KNOWN_CATALOG_KEYS = new Set(
  FRIENDLY_CUSTOMER_CHOICES.flatMap((c) => c.catalogKeys)
);

/**
 * @param {Iterable<string>|string[]|null|undefined} keys
 */
export function partitionAllowedOptionKeys(keys) {
  const list = Array.isArray(keys)
    ? keys
    : keys
      ? [...keys]
      : [];
  const known = [];
  const legacyUnknown = [];
  for (const raw of list) {
    const key = String(raw || "").trim();
    if (!key) continue;
    if (KNOWN_CATALOG_KEYS.has(key)) known.push(key);
    else legacyUnknown.push(key);
  }
  return { known, legacyUnknown };
}

/**
 * Map friendly toggles → catalog keys (plus preserved legacy unknowns).
 * @param {Record<string, boolean>} flags
 * @param {string[]} [legacyUnknownKeys]
 */
export function friendlyChoicesToAllowedOptionKeys(flags, legacyUnknownKeys = []) {
  const out = [];
  const seen = new Set();
  for (const def of FRIENDLY_CUSTOMER_CHOICES) {
    if (!flags?.[def.id]) continue;
    for (const key of def.catalogKeys) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  for (const key of legacyUnknownKeys) {
    const k = String(key || "").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Infer friendly toggles from stored catalog keys + explicit choice groups.
 * @param {{ allowedOptionKeys?: string[], customerChoiceGroups?: string[] }} input
 */
export function inferFriendlyChoiceFlags(input = {}) {
  const groups = new Set(
    (Array.isArray(input.customerChoiceGroups) ? input.customerChoiceGroups : []).map(String)
  );
  const { known } = partitionAllowedOptionKeys(input.allowedOptionKeys || []);
  const knownSet = new Set(known);
  /** @type {Record<string, boolean>} */
  const flags = {};
  for (const def of FRIENDLY_CUSTOMER_CHOICES) {
    if (groups.has(def.id)) {
      flags[def.id] = true;
      continue;
    }
    if (def.catalogKeys.length === 0) {
      // Material/edge/backsplash default on for new publishes unless explicitly off.
      flags[def.id] = groups.size === 0
        ? def.id === "materialColor" || def.id === "edge" || def.id === "backsplash" || def.id === "sink"
        : false;
      continue;
    }
    flags[def.id] = def.catalogKeys.some((k) => knownSet.has(k));
  }
  // Legacy default was qty-sink alone → sink on.
  if (knownSet.has("qty-sink") || knownSet.has("qty-ss")) flags.sink = true;
  if (knownSet.has("qty-cook")) flags.cooktop = true;
  return flags;
}

/**
 * Infer customerChoiceGroups from an activated envelope's option keys.
 * Used to hydrate Studio checkboxes after refresh when metadata is missing.
 * @param {Array<{ option_key?: string, optionKey?: string }>|null|undefined} options
 * @returns {string[]}
 */
export function inferCustomerChoiceGroupsFromEnvelopeOptions(options) {
  const groups = new Set();
  for (const opt of options || []) {
    const key = String(opt?.option_key || opt?.optionKey || "");
    if (!key) continue;
    if (key.startsWith("material:")) groups.add("materialColor");
    else if (key.startsWith("sink:")) groups.add("sink");
    else if (key.startsWith("faucet:")) groups.add("faucet");
    else if (key.startsWith("accessory:") || key.startsWith("accessories:")) {
      groups.add("accessories");
    } else if (key.startsWith("specialty:")) groups.add("specialty");
    else if (key.startsWith("edge:")) groups.add("edge");
    else if (key.startsWith("backsplash:")) groups.add("backsplash");
    else if (key.startsWith("sidesplash:")) groups.add("sideSplash");
    else if (key === "qty-cook" || key.startsWith("qty-cook")) groups.add("cooktop");
    else if (key === "qty-sink" || key === "qty-ss") groups.add("sink");
  }
  return FRIENDLY_CUSTOMER_CHOICES.map((d) => d.id).filter((id) => groups.has(id));
}

/**
 * Build configuration payload for DE publish/readiness.
 * @param {Record<string, boolean>} flags
 * @param {string[]} [legacyUnknownKeys]
 */
export function buildCustomerChoiceConfiguration(flags, legacyUnknownKeys = []) {
  const customerChoiceGroups = FRIENDLY_CUSTOMER_CHOICES.filter((d) => flags?.[d.id]).map(
    (d) => d.id
  );
  return {
    customerChoiceGroups,
    allowedOptionKeys: friendlyChoicesToAllowedOptionKeys(flags, legacyUnknownKeys)
  };
}
