#!/usr/bin/env node
/**
 * Regenerates backend-core/supabase/eos_quote_platform_seed_prototype.sql from the
 * hardcoded config in docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html
 *
 * Usage (from repo root):
 *   node backend-core/src/scripts/generateQuotePrototypePricingSeed.js
 *
 * Do not commit customer data or secrets; output is catalog + list pricing only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PROTOTYPE_HTML = path.join(
  REPO_ROOT,
  "docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html"
);
const OUT_SQL = path.join(REPO_ROOT, "backend-core/supabase/eos_quote_platform_seed_prototype.sql");

const html = fs.readFileSync(PROTOTYPE_HTML, "utf8");
const m = html.match(/const config = \{[\s\S]*?tearOut: \{ label: 'Tear Out Needed', price: 750 \}\s*\};/);
if (!m) throw new Error("config block not found in prototype HTML");
const block = m[0];

const tiers = [...block.matchAll(/\{\s*n:\s*'([^']+)',\s*p:\s*(\d+)\s*\}/g)].map((x) => ({ n: x[1], p: +x[2] }));
const matRe = /\{\s*name:\s*'((?:\\'|[^'])*)',\s*supplier:\s*'((?:\\'|[^'])*)',\s*material:\s*'((?:\\'|[^'])*)',\s*group:\s*'([^']+)'\s*\}/g;
const materials = [];
let mm;
while ((mm = matRe.exec(block))) {
  materials.push({
    name: mm[1].replace(/\\'/g, "'"),
    supplier: mm[2].replace(/\\'/g, "'"),
    material: mm[3].replace(/\\'/g, "'"),
    group: mm[4]
  });
}

const vanityBlock = block.match(/vanityPricing:\s*\{([\s\S]*?)\},\s*vanitySinkOptions/)?.[1];
if (!vanityBlock) throw new Error("vanityPricing block not found");
const vanityPricing = {};
for (const vm of vanityBlock.matchAll(/'([^']+)':\s*\{\s*name:\s*'((?:\\'|[^'])*)',\s*t1:\s*(\d+),\s*t2:\s*(\d+),\s*b:\s*(\d+)\s*\}/g)) {
  vanityPricing[vm[1]] = { name: vm[2].replace(/\\'/g, "'"), t1: +vm[3], t2: +vm[4], b: +vm[5] };
}

const sinkBlock = block.match(/vanitySinkOptions:\s*\[([\s\S]*?)\],\s*addOns/)?.[1];
if (!sinkBlock) throw new Error("vanitySinkOptions block not found");
const vanitySinkOptions = [];
for (const sm of sinkBlock.matchAll(/\{\s*value:\s*'([^']+)',\s*label:\s*'((?:\\'|[^'])*)',\s*amount:\s*(\d+)\s*\}/g)) {
  vanitySinkOptions.push({ value: sm[1], label: sm[2].replace(/\\'/g, "'"), amount: +sm[3] });
}

const addOnsBlock = block.match(/addOns:\s*\[([\s\S]*?)\],\s*tearOut/)?.[1];
if (!addOnsBlock) throw new Error("addOns block not found");
const addOns = [];
for (const am of addOnsBlock.matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'((?:\\'|[^'])*)',\s*price:\s*(\d+)\s*\}/g)) {
  addOns.push({ id: am[1], label: am[2].replace(/\\'/g, "'"), price: +am[3] });
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
}
function slug(s) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}
function j(obj) {
  return escSql(JSON.stringify(obj));
}

const STRUCTURES = [
  {
    name: "Public Retail",
    code: "public_retail",
    description:
      "Public-facing retail pricing that protects dealer/partner pricing with at least 25% markup (applied at quote total level in quoteCalculator.js).",
    pricing_mode: "public_retail",
    retail_markup_percent: 25,
    is_public_default: true
  },
  {
    name: "Dealer Tier 1",
    code: "dealer_tier_1",
    description: "Protected dealer baseline (prototype v1.01 rates). Initial seed; requires Eric/admin review.",
    pricing_mode: "dealer",
    retail_markup_percent: 0,
    is_public_default: false
  },
  {
    name: "Dealer Tier 2",
    code: "dealer_tier_2",
    description: "Protected dealer tier 2 (seeded same as Tier 1 until tier split is defined).",
    pricing_mode: "dealer",
    retail_markup_percent: 0,
    is_public_default: false
  },
  {
    name: "Builder Partner",
    code: "builder_partner",
    description: "Protected builder partner baseline (prototype v1.01 rates).",
    pricing_mode: "builder",
    retail_markup_percent: 0,
    is_public_default: false
  },
  {
    name: "Designer Partner",
    code: "designer_partner",
    description: "Protected designer partner baseline (prototype v1.01 rates).",
    pricing_mode: "designer",
    retail_markup_percent: 0,
    is_public_default: false
  },
  {
    name: "Internal / House",
    code: "internal_house",
    description: "Internal house economics (prototype v1.01 rates).",
    pricing_mode: "internal",
    retail_markup_percent: 0,
    is_public_default: false
  }
];

const groupItemCode = (groupName) =>
  "group_" +
  groupName
    .replace(/^Group\s+/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const addOnCategory = (id) => {
  if (id.startsWith("qty-v-") || id === "qty-ss" || id === "qty-blanco") return "sink";
  return "cutout";
};

let out = "";
out += `-- eliteOS Quote Platform — prototype pricing seed (v1.01 HTML reference)
-- Safe to run AFTER: backend-core/supabase/eos_quote_platform.sql
--
-- Idempotency:
-- - quote_pricing_structures: ON CONFLICT (code) DO UPDATE
-- - quote_pricing_rules: no unique constraint on (pricing_structure_id, category, item_code).
--   Re-run deletes prior rows for this seed via metadata->>'seed_pack' = 'prototype_v101' on
--   structures we manage below, then re-inserts. Safe to repeat; do not hand-edit seeded rows
--   without updating seed_pack or expect them to be wiped on re-seed.
--
-- IMPORTANT — Public retail vs rule unit prices:
-- - quoteCalculator.js treats per-line rule prices as WHOLESALE economics, then applies
--   applyRetailProtection() to the QUOTE TOTAL when pricing_mode is public_retail.
-- - Therefore material_group / add-on / vanity unit prices are the SAME across all structures
--   in this seed (prototype baseline). Public list is enforced by structure retail_markup_percent
--   (>=25) on totals, not by inflating per-sf rows (which would double-apply markup).
--
-- Admin review:
-- - These are initial seed values from the prototype and require Eric/admin review.
-- - Future Pricing Admin UI should edit these values.
-- - Prototype file: docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html
-- - Regenerate: node backend-core/src/scripts/generateQuotePrototypePricingSeed.js
--

`;

for (const s of STRUCTURES) {
  out += `INSERT INTO public.quote_pricing_structures (name, code, description, pricing_mode, retail_markup_percent, is_public_default, is_active, metadata)
VALUES (
  '${escSql(s.name)}',
  '${escSql(s.code)}',
  '${escSql(s.description)}',
  '${escSql(s.pricing_mode)}',
  ${s.retail_markup_percent},
  ${s.is_public_default},
  true,
  '{"seed_pack":"prototype_v101"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pricing_mode = EXCLUDED.pricing_mode,
  retail_markup_percent = EXCLUDED.retail_markup_percent,
  is_public_default = EXCLUDED.is_public_default,
  is_active = EXCLUDED.is_active,
  metadata = COALESCE(public.quote_pricing_structures.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

`;
}

out += `-- Remove prior prototype seed rules (scoped to our structures only)
DELETE FROM public.quote_pricing_rules r
USING public.quote_pricing_structures s
WHERE r.pricing_structure_id = s.id
  AND s.code IN (${STRUCTURES.map((x) => `'${escSql(x.code)}'`).join(", ")})
  AND r.metadata->>'seed_pack' = 'prototype_v101';

`;

out += `-- ---------------------------------------------------------------------------
-- Rules: same baseline unit economics on every structure; public retail markup
-- is enforced on quote totals (see header comment).
-- ---------------------------------------------------------------------------

`;

function insertRule(structCode, fields) {
  const { category, item_code, item_name, unit_type, base_cost, price, markup_percent, metadata } = fields;
  const meta = { seed_pack: "prototype_v101", ...metadata };
  const bc = base_cost == null ? "NULL" : String(base_cost);
  const pr = price == null ? "NULL" : String(price);
  const mp = markup_percent == null ? "NULL" : String(markup_percent);
  return `INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, '${escSql(category)}', '${escSql(item_code)}', '${escSql(item_name)}', '${escSql(unit_type)}', ${bc}, ${pr}, ${mp}, true, '${j(meta)}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = '${escSql(structCode)}';

`;
}

for (const struct of STRUCTURES) {
  const code = struct.code;
  for (const t of tiers) {
    const ic = groupItemCode(t.n);
    out += insertRule(code, {
      category: "material_group",
      item_code: ic,
      item_name: t.n,
      unit_type: "per_sqft",
      base_cost: null,
      price: t.p,
      markup_percent: null,
      metadata: {
        source: "prototype",
        prototype_key: "config.tiers",
        original_group_name: t.n,
        notes: "Extracted from ESF Quoting Tool v1.01 prototype"
      }
    });
  }

  for (const mat of materials) {
    const ic = slug(`${mat.supplier}_${mat.material}_${mat.name}`);
    out += insertRule(code, {
      category: "material_color",
      item_code: ic,
      item_name: mat.name,
      unit_type: "per_sqft",
      base_cost: null,
      price: null,
      markup_percent: null,
      metadata: {
        source: "prototype",
        prototype_key: "config.materials",
        supplier: mat.supplier,
        material: mat.material,
        group: mat.group,
        color_name: mat.name,
        notes: "Color→group mapping; calculator still prices by material_group until color-specific pricing exists."
      }
    });
  }

  for (const [vKey, v] of Object.entries(vanityPricing)) {
    out += insertRule(code, {
      category: "vanity",
      item_code: vKey,
      item_name: v.name,
      unit_type: "each",
      base_cost: v.t1,
      price: v.t2,
      markup_percent: null,
      metadata: {
        source: "prototype",
        prototype_key: "config.vanityPricing",
        tier_1_price: v.t1,
        tier_2_price: v.t2,
        bowls: v.b,
        notes:
          "quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."
      }
    });
  }

  for (const vs of vanitySinkOptions) {
    const ic = `vanity_sink_upgrade_${vs.value}`;
    out += insertRule(code, {
      category: "vanity_sink_upgrade",
      item_code: ic,
      item_name: vs.label,
      unit_type: "each",
      base_cost: null,
      price: vs.amount,
      markup_percent: null,
      metadata: {
        source: "prototype",
        prototype_key: "config.vanitySinkOptions",
        prototype_value: vs.value,
        label: vs.label
      }
    });
  }

  for (const ao of addOns) {
    out += insertRule(code, {
      category: addOnCategory(ao.id),
      item_code: ao.id,
      item_name: ao.label,
      unit_type: "each",
      base_cost: null,
      price: ao.price,
      markup_percent: null,
      metadata: {
        source: "prototype",
        prototype_key: "config.addOns",
        prototype_id: ao.id
      }
    });
  }

  out += insertRule(code, {
    category: "tearout",
    item_code: "tearout",
    item_name: "Tear Out Needed",
    unit_type: "job",
    base_cost: null,
    price: 750,
    markup_percent: null,
    metadata: {
      source: "prototype",
      prototype_key: "config.tearOut",
      spec_item_code: "tear_out_needed",
      notes:
        "item_code is tearout to match quoteCalculator.js / prototype add-on key; spec_item_code records naming from pricing spec."
    }
  });
}

fs.writeFileSync(OUT_SQL, out, "utf8");
console.log("Wrote", OUT_SQL);
console.log(
  JSON.stringify(
    {
      structures: STRUCTURES.length,
      tiers: tiers.length,
      materials: materials.length,
      vanities: Object.keys(vanityPricing).length,
      sinkUpgrades: vanitySinkOptions.length,
      addOns: addOns.length,
      rulesPerStructure: tiers.length + materials.length + Object.keys(vanityPricing).length + vanitySinkOptions.length + addOns.length + 1
    },
    null,
    2
  )
);
