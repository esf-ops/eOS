/**
 * Estimate Builder catalog payload — option labels only. No prices leave the Brain through this payload;
 * the head asks `/price` for every amount.
 */

import { CUSTOM_QUOTE_MATERIAL_TYPES } from "../quotes/customQuotePricingResolver.js";
import { VANITY_PROGRAM_2026_BY_CODE, VANITY_PROGRAM_YEAR } from "../quotes/vanityProgram2026.js";
import {
  CUSTOM_ITEM_CATEGORIES,
  CUTOUT_CODES,
  DEFAULT_ROOM_SUGGESTIONS,
  EDGE_MITER_HEIGHTS,
  EDGE_UPGRADED_PROFILES,
  ESTIMATE_ITEM_TYPES,
  VANITY_SINK_TYPES
} from "./estimateBuilderContracts.mjs";
import { ESTIMATE_TEMPLATES } from "./estimateBuilderTemplates.mjs";

const CUTOUT_LABELS = {
  "qty-sink": "Undermount sink cutout",
  "qty-bar": "Vanity / bar sink cutout",
  "qty-cook": "Cooktop cutout",
  "qty-v-oval": "Oval vanity bowl",
  "qty-v-rect": "Rectangular vanity bowl",
  "qty-ss": "ESF stainless kitchen sink",
  "qty-blanco": "Stock Blanco sink"
};

const VANITY_SINK_LABELS = {
  oval_white: "Oval white",
  oval_bisque: "Oval bisque",
  rectangular_white: "Rectangular white",
  rectangular_bisque: "Rectangular bisque"
};

/**
 * @param {Array<Record<string, unknown>>} colors
 * @param {string[]} [warnings]
 */
export function buildEstimateBuilderCatalog(colors, warnings = []) {
  return {
    ok: true,
    itemTypes: Object.entries(ESTIMATE_ITEM_TYPES).map(([type, def]) => ({
      type,
      label: def.label,
      strategies: def.strategies,
      defaultStrategy: def.defaultStrategy
    })),
    materialColors: (colors || []).map((c) => ({
      id: String(c.id),
      colorName: String(c.colorName ?? ""),
      priceGroupLabel: String(c.priceGroupLabel ?? ""),
      supplier: c.supplier ?? null,
      materialType: c.materialType ?? null
    })),
    materialCatalogWarnings: warnings,
    cutouts: CUTOUT_CODES.map((code) => ({ code, label: CUTOUT_LABELS[code] ?? code })),
    services: [
      { code: "additional_trip", label: "Additional trip" },
      { code: "tear_out", label: "Tear-out" }
    ],
    edge: { upgradedProfiles: EDGE_UPGRADED_PROFILES, miterHeights: EDGE_MITER_HEIGHTS },
    vanity: {
      programYear: VANITY_PROGRAM_YEAR,
      sizes: Object.entries(VANITY_PROGRAM_2026_BY_CODE).map(([code, row]) => ({
        code,
        label: row.label,
        widthIn: row.widthIn,
        bowlCount: row.bowlCount
      })),
      sinkTypes: VANITY_SINK_TYPES.map((code) => ({ code, label: VANITY_SINK_LABELS[code] ?? code }))
    },
    outOfCollection: { materialTypes: CUSTOM_QUOTE_MATERIAL_TYPES },
    customCategories: CUSTOM_ITEM_CATEGORIES,
    roomSuggestions: DEFAULT_ROOM_SUGGESTIONS,
    templates: ESTIMATE_TEMPLATES
  };
}
