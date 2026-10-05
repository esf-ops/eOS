/**
 * Estimate templates — a template is only a list of rooms + item stubs. Instantiating one yields a normal
 * estimate document (provenance `template`); there is no separate template quote model.
 * Item stubs intentionally omit quantities/materials so the estimator fills real scope.
 */

export const ESTIMATE_TEMPLATES = Object.freeze([
  { id: "blank", label: "Blank estimate", rooms: [], items: [] },
  {
    id: "kitchen",
    label: "Kitchen",
    rooms: ["Kitchen"],
    items: [
      { room: "Kitchen", itemType: "countertop", pricingStrategy: "elite_100", inputs: {} },
      { room: "Kitchen", itemType: "backsplash", pricingStrategy: "standard", inputs: { materialSource: "room_countertop" } },
      { room: "Kitchen", itemType: "cutout", pricingStrategy: "addon_catalog", inputs: { cutoutCode: "qty-sink", qty: 1 } }
    ]
  },
  {
    id: "kitchen_island",
    label: "Kitchen + Island",
    rooms: ["Kitchen", "Island"],
    items: [
      { room: "Kitchen", itemType: "countertop", pricingStrategy: "elite_100", inputs: {} },
      { room: "Kitchen", itemType: "backsplash", pricingStrategy: "standard", inputs: { materialSource: "room_countertop" } },
      { room: "Kitchen", itemType: "cutout", pricingStrategy: "addon_catalog", inputs: { cutoutCode: "qty-sink", qty: 1 } },
      { room: "Island", itemType: "countertop", pricingStrategy: "elite_100", inputs: {} }
    ]
  },
  {
    id: "single_vanity",
    label: "Single vanity",
    rooms: ["Primary Bath"],
    items: [{ room: "Primary Bath", itemType: "vanity", pricingStrategy: "vanity_program_2026", inputs: { sizeCode: "37_S", qty: 1 } }]
  },
  {
    id: "double_vanity",
    label: "Double vanity",
    rooms: ["Primary Bath"],
    items: [{ room: "Primary Bath", itemType: "vanity", pricingStrategy: "vanity_program_2026", inputs: { sizeCode: "61_D", qty: 1 } }]
  }
]);
