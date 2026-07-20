/**
 * Friendly customer choice controls → server catalog option keys.
 * Canonical persistence keys are snake_case. Legacy camelCase is normalized.
 */

/** Canonical internal permission keys (sorted fingerprint order). */
export const CANONICAL_CUSTOMER_CHOICE_KEYS = Object.freeze([
  "material_color",
  "sink",
  "faucet",
  "accessories",
  "specialty",
  "cooktop_cutout",
  "edge",
  "backsplash",
  "side_splash"
]);

/** @deprecated aliases → canonical */
const LEGACY_CHOICE_ALIASES = Object.freeze({
  materialColor: "material_color",
  material_color: "material_color",
  cooktop: "cooktop_cutout",
  cooktop_cutout: "cooktop_cutout",
  sideSplash: "side_splash",
  sidesplash: "side_splash",
  side_splash: "side_splash",
  accessory: "accessories",
  accessories: "accessories"
});

export const FRIENDLY_CUSTOMER_CHOICES = Object.freeze([
  {
    id: "material_color",
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
    id: "cooktop_cutout",
    label: "Cooktop cutout",
    help: "Yes adds a cooktop cutout charge when selected by the customer.",
    catalogKeys: ["qty-cook"]
  },
  {
    id: "edge",
    label: "Edge profile",
    help: "Eased and other free profiles included; premium profiles (Small Ogee, Crescent, Knife) when allowed.",
    catalogKeys: []
  },
  {
    id: "backsplash",
    label: "Backsplash option",
    help: "Customer may choose among estimator-approved backsplash options only.",
    catalogKeys: []
  },
  {
    id: "side_splash",
    label: "Side splash",
    help: "Optional side splash per vanity/counter piece (length from piece depth).",
    catalogKeys: []
  }
]);

const KNOWN_CANONICAL = new Set(CANONICAL_CUSTOMER_CHOICE_KEYS);
const KNOWN_CATALOG_KEYS = new Set(
  FRIENDLY_CUSTOMER_CHOICES.flatMap((c) => c.catalogKeys)
);

/**
 * Normalize one permission key to canonical snake_case, or null if unknown.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeCustomerChoiceKey(raw) {
  const key = String(raw || "").trim();
  if (!key) return null;
  if (KNOWN_CANONICAL.has(key)) return key;
  if (LEGACY_CHOICE_ALIASES[key]) return LEGACY_CHOICE_ALIASES[key];
  // camelCase → snake_case attempt
  const snake = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
  if (KNOWN_CANONICAL.has(snake)) return snake;
  if (LEGACY_CHOICE_ALIASES[snake]) return LEGACY_CHOICE_ALIASES[snake];
  return null;
}

/**
 * Normalize a list of choice groups. Throws on unknown keys when rejectUnknown.
 * @param {Iterable<string>|string[]|null|undefined} groups
 * @param {{ rejectUnknown?: boolean }} [opts]
 * @returns {string[]} sorted unique canonical keys
 */
export function normalizeCustomerChoiceGroups(groups, opts = {}) {
  const rejectUnknown = opts.rejectUnknown === true;
  const out = new Set();
  for (const raw of groups || []) {
    const canonical = normalizeCustomerChoiceKey(raw);
    if (canonical) {
      out.add(canonical);
      continue;
    }
    if (rejectUnknown && String(raw || "").trim()) {
      const err = new Error(`Unsupported customer choice permission: ${String(raw).slice(0, 80)}`);
      err.code = "DE-CONFIGURATION-CONTRACT-INVALID";
      err.statusCode = 422;
      throw err;
    }
  }
  return CANONICAL_CUSTOMER_CHOICE_KEYS.filter((k) => out.has(k));
}

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
    const on =
      Boolean(flags?.[def.id]) ||
      Boolean(flags?.[normalizeCustomerChoiceKey(def.id)]) ||
      // Accept legacy camelCase flag bags from older Studio clients / tests.
      Object.entries(LEGACY_CHOICE_ALIASES).some(
        ([legacy, canon]) => canon === def.id && Boolean(flags?.[legacy])
      );
    if (!on) continue;
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
    normalizeCustomerChoiceGroups(input.customerChoiceGroups || [], { rejectUnknown: false })
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
      flags[def.id] =
        groups.size === 0
          ? def.id === "material_color" ||
            def.id === "edge" ||
            def.id === "backsplash" ||
            def.id === "sink"
          : false;
      continue;
    }
    flags[def.id] = def.catalogKeys.some((k) => knownSet.has(k));
  }
  if (knownSet.has("qty-sink") || knownSet.has("qty-ss")) flags.sink = true;
  if (knownSet.has("qty-cook")) flags.cooktop_cutout = true;
  return flags;
}

/**
 * Infer customerChoiceGroups from an activated envelope's option keys.
 * @param {Array<{ option_key?: string, optionKey?: string }>|null|undefined} options
 * @returns {string[]}
 */
export function inferCustomerChoiceGroupsFromEnvelopeOptions(options) {
  const groups = new Set();
  for (const opt of options || []) {
    const key = String(opt?.option_key || opt?.optionKey || "");
    if (!key) continue;
    if (key.startsWith("material:")) groups.add("material_color");
    else if (key.startsWith("sink:")) groups.add("sink");
    else if (key.startsWith("faucet:")) groups.add("faucet");
    else if (key.startsWith("accessory:") || key.startsWith("accessories:")) {
      groups.add("accessories");
    } else if (key.startsWith("specialty:")) groups.add("specialty");
    else if (key.startsWith("edge:")) groups.add("edge");
    else if (key.startsWith("backsplash:")) groups.add("backsplash");
    else if (key.startsWith("sidesplash:")) groups.add("side_splash");
    else if (key === "qty-cook" || key.startsWith("qty-cook")) groups.add("cooktop_cutout");
    else if (key === "qty-sink" || key === "qty-ss") groups.add("sink");
  }
  return normalizeCustomerChoiceGroups([...groups]);
}

/**
 * Build configuration payload for DE publish/readiness.
 * @param {Record<string, boolean>} flags
 * @param {string[]} [legacyUnknownKeys]
 */
export function buildCustomerChoiceConfiguration(flags, legacyUnknownKeys = []) {
  const customerChoiceGroups = FRIENDLY_CUSTOMER_CHOICES.filter((d) => {
    if (flags?.[d.id]) return true;
    return Object.entries(LEGACY_CHOICE_ALIASES).some(
      ([legacy, canon]) => canon === d.id && Boolean(flags?.[legacy])
    );
  }).map((d) => d.id);
  return {
    customerChoiceGroups: normalizeCustomerChoiceGroups(customerChoiceGroups),
    allowedOptionKeys: friendlyChoicesToAllowedOptionKeys(flags, legacyUnknownKeys)
  };
}

/**
 * True when choiceGroups set contains a logical group (canonical or legacy).
 * @param {Set<string>|Iterable<string>} groups
 * @param {string} logicalId canonical or legacy
 */
export function choiceGroupEnabled(groups, logicalId) {
  const set = groups instanceof Set ? groups : new Set([...groups].map(String));
  const canonical = normalizeCustomerChoiceKey(logicalId) || logicalId;
  if (set.has(canonical)) return true;
  // Also accept legacy forms still present in older envelopes / drafts
  for (const [legacy, canon] of Object.entries(LEGACY_CHOICE_ALIASES)) {
    if (canon === canonical && set.has(legacy)) return true;
  }
  return set.has(logicalId);
}
