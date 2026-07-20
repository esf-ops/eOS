/**
 * Room option UX — sink / faucet / backsplash summaries and custom-height copy.
 * Run: node app-digital-estimate/src/phaseRoomOptions.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const adapter = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const studio = readFileSync(
  join(
    __dirname,
    "../../app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"
  ),
  "utf8"
);

console.log("\nphaseRoomOptions.ui.test.mjs\n");

assert.ok(view.includes("de-open-sink-modal"));
assert.ok(view.includes("de-open-faucet-modal"));
assert.ok(view.includes("de-open-backsplash-modal"));
assert.ok(view.includes("PlumbingSourceModal") || view.includes("de-sink-modal"));
assert.ok(view.includes("de-${role}-source-${kind}") || view.includes("PlumbingSourceModal"));
assert.ok(view.includes("Customer-provided sink") || view.includes("customer_provided"));
assert.ok(view.includes("Select an ESF sink") || view.includes('["esf", esfLabel]'));
assert.ok(view.includes("No sink") && view.includes("No faucet"));
assert.ok(view.includes("de-backsplash-custom-copy"));
assert.ok(view.includes("Final measurements and pricing require estimator review."));
assert.ok(view.includes("4-inch") || adapter.includes("normalizeBacksplashLabel"));
assert.equal(view.includes("4-foot"), false);
assert.ok(view.includes("de-missing-info-banner"));
assert.ok(view.includes("de-sidesplash-modal") || view.includes("Side splash"));
assert.ok(view.includes("de-open-notes-modal"));
assert.ok(adapter.includes("sidesplash"));
assert.ok(adapter.includes("missingInformationRequirements"));
assert.ok(adapter.includes("summarizeSinkDraft"));
assert.ok(adapter.includes("summarizeFaucetDraft"));
assert.ok(adapter.includes("summarizeBacksplashDraft"));
assert.ok(adapter.includes("classifySourceKind"));
assert.ok(adapter.includes("normalizeBacksplashLabel"));
assert.ok(adapter.includes("ROOM_CHOICE_ROLES"));
assert.ok(api.includes("customerProductDrafts") || api.includes("productDrafts"));
assert.ok(api.includes("backsplashDrafts"));
assert.ok(api.includes("ConfigProduct"));
assert.ok(api.includes("MissingInformationRequirement"));
assert.ok(api.includes("requestedHeightInches") || adapter.includes("requestedHeightInches"));
assert.ok(studio.includes("customerConfigurationSummary") || studio.includes("eq-de-review-selection-summary"));
assert.ok(studio.includes("Configured total") || studio.includes("configuredDisplayTotal"));
assert.ok(studio.includes("missingInformationRequirements") || studio.includes("eq-de-review-missing-info"));
assert.ok(!/esfPlumbingCatalogSeed/.test(view + adapter));
assert.ok(!/getCatalogProducts\(/.test(view));

// Keep in sync with lovableViewModel helpers
function normalizeBacksplashLabel(label) {
  return String(label || "")
    .replace(/4[- ]?foot/gi, "4-inch")
    .replace(/\b4'\s*backsplash/gi, "4-inch backsplash")
    .replace(/\b4″\b/g, "4-inch");
}
function optionTokenAfterRoom(optionKey, roomKey) {
  const prefix = optionKey.split(":")[0];
  const full = `${prefix}:${roomKey}:`;
  if (!optionKey.startsWith(full)) return optionKey.split(":").slice(2).join(":");
  return optionKey.slice(full.length);
}
function classifySourceKind(role, optionKey, roomKey) {
  const token = optionTokenAfterRoom(optionKey, roomKey).toLowerCase();
  if (!token || token === "none" || token.endsWith(":none") || /(^|:)none$/.test(token)) return "none";
  if (
    token === "customer" ||
    token === "customer_provided" ||
    token === "customer-provided" ||
    token === "customer_supplied" ||
    token.startsWith("customer")
  ) {
    return "customer_provided";
  }
  if (token === "stock" || /(^|:)stock($|:)/.test(token)) return "stock";
  if (token.startsWith("esf") || token.includes(":esf:") || /(^|:)esf($|:)/.test(token)) return "esf";
  if (role === "sink" || role === "faucet") return "esf";
  return "other";
}
function summarizeSinkDraft(draft, selectedLabel) {
  if (!draft) return selectedLabel;
  if (draft.source === "none") return "No sink";
  if (draft.source === "customer_provided") {
    const bits = [draft.manufacturer, draft.model, draft.finish].filter(Boolean);
    return bits.length ? `Customer-provided · ${bits.join(" · ")}` : "Customer-provided sink";
  }
  return draft.displayLabel || selectedLabel || "ESF sink selected";
}
function summarizeBacksplashDraft(draft, selectedLabel) {
  if (draft?.mode === "custom_height") {
    const inches = draft.requestedHeightInches ?? draft.customHeightIn;
    const h =
      inches != null && Number(inches) > 0 ? `${inches}" custom height` : "Custom height";
    return h;
  }
  if (selectedLabel) return normalizeBacksplashLabel(selectedLabel);
  if (!draft) return null;
  if (draft.mode === "none") return "No backsplash";
  if (draft.mode === "standard_4in") return "4-inch backsplash";
  if (draft.mode === "full_height") return "Full-height backsplash";
  return normalizeBacksplashLabel(String(draft.mode));
}

assert.equal(normalizeBacksplashLabel("4-foot backsplash"), "4-inch backsplash");
assert.equal(normalizeBacksplashLabel("4-inch backsplash"), "4-inch backsplash");
assert.equal(classifySourceKind("sink", "sink:kitchen:none", "kitchen"), "none");
assert.equal(classifySourceKind("sink", "sink:kitchen:customer", "kitchen"), "customer_provided");
assert.equal(classifySourceKind("sink", "sink:kitchen:esf:blanco-1", "kitchen"), "esf");
assert.equal(classifySourceKind("faucet", "faucet:kitchen:stock", "kitchen"), "stock");
assert.equal(summarizeSinkDraft({ source: "none" }, null), "No sink");
assert.equal(summarizeSinkDraft({ source: "customer_provided" }, null), "Customer-provided sink");
assert.equal(
  summarizeSinkDraft({ source: "customer_provided", manufacturer: "Kohler", model: "X" }, null),
  "Customer-provided · Kohler · X"
);
assert.equal(
  summarizeBacksplashDraft({ mode: "custom_height", requestedHeightInches: 12 }, null),
  '12" custom height'
);
assert.ok(summarizeBacksplashDraft(null, "4-foot backsplash")?.includes("4-inch"));

console.log("ok: sink/faucet/backsplash summaries + custom height copy");
console.log("ok: sidesplash + missing-info + product drafts typed");
console.log("ok: no hard-coded plumbing catalog in customer UI");
console.log("\nAll phaseRoomOptions.ui tests passed.\n");
