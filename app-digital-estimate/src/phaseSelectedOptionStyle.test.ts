/**
 * Public Digital Estimate selected-option chrome contracts.
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseSelectedOptionStyle.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(here, "ConfigurationView.tsx"), "utf8");
const theme = readFileSync(join(here, "lovable-theme.css"), "utf8");
const styles = readFileSync(join(here, "styles.css"), "utf8");
const main = readFileSync(join(here, "main.tsx"), "utf8");

console.log("\nphaseSelectedOptionStyle.test.ts\n");

// 1–3. Dedicated light selected tokens (not legacy green --accent)
assert.match(theme, /--de-selected-bg:\s*#fff7f8/);
assert.match(theme, /--de-selected-border:\s*rgba\(178,\s*35,\s*48,\s*0\.35\)/);
assert.match(theme, /--de-selected-accent:\s*#b22330/);
assert.match(theme, /\.de-option-selected\s*\{[^}]*background:\s*var\(--de-selected-bg\)/s);
assert.match(theme, /\.de-option-selected\s*\{[^}]*border-color:\s*var\(--de-selected-border\)/s);
assert.match(theme, /\.de-option-selected-badge\s*\{/s);
assert.doesNotMatch(
  theme,
  /\.de-option-selected\s*\{[^}]*color-mix\(in oklch,\s*var\(--accent\)/s,
);
console.log("ok: 1. premium selected tokens + class use light burgundy chrome");

// Legacy styles.css must not clobber theme --accent / --border / --radius
assert.match(styles, /--de-doc-accent:\s*#24513f/);
assert.doesNotMatch(styles, /(?:^|[^-])--accent:/m);
assert.doesNotMatch(styles, /(?:^|[^-])--border:/m);
assert.doesNotMatch(styles, /(?:^|[^-])--radius:/m);
assert.match(main, /import "\.\/lovable-theme\.css"/);
assert.match(main, /import "\.\/styles\.css"/);
console.log("ok: 2. legacy doc tokens namespaced; no :root --accent collision");

// Option surfaces use shared selected class (no dark selected fills)
const edgeBlock = view.slice(
  view.indexOf('data-testid="de-edge-option"'),
  view.indexOf('data-testid="de-edge-option"') + 1600,
);
assert.match(edgeBlock, /de-option-selected/);
assert.match(edgeBlock, /de-option-selected-badge/);
assert.doesNotMatch(edgeBlock, /bg-primary|bg-emerald|bg-green|bg-muted\/30|text-primary-foreground/);
console.log("ok: 3. selected edge row uses light selected class, not dark fill");

assert.match(view, /function ChoiceRadio/);
const choiceRadio = view.slice(view.indexOf("function ChoiceRadio"), view.indexOf("function ProductCards"));
assert.match(choiceRadio, /de-option-selected/);
assert.doesNotMatch(choiceRadio, /bg-primary|bg-muted\/30|text-primary-foreground/);
console.log("ok: 4. ChoiceRadio (backsplash/etc.) light selected, no dark fill");

const productCards = view.slice(
  view.indexOf("function ProductCards"),
  view.indexOf("function customerFacingFaucetCategory"),
);
assert.match(productCards, /de-option-selected/);
assert.match(productCards, /de-option-selected-badge/);
assert.match(productCards, /de-\$\{role\}-finish-row/);
assert.doesNotMatch(
  productCards,
  /selected\s*\?\s*"[^"]*bg-primary|finishSelected\s*\?\s*"[^"]*bg-primary|bg-muted\/30/,
);
console.log("ok: 5. sink/faucet product + finish rows light selected");

assert.doesNotMatch(view, /opt\.selected\s*\?\s*"border-foreground bg-muted\/30"/);
assert.doesNotMatch(view, /active\s*\?\s*"border-foreground bg-muted\/30"/);
assert.doesNotMatch(view, /source === "esf"\s*\?\s*"border-foreground bg-muted\/30"/);
console.log("ok: 6. accessory/specialty/source choices no gray selected fill");

// Badge + keyboard focus remain
assert.match(view, /de-option-selected-badge/);
assert.match(view, /de-edge-option-selected-badge/);
assert.match(view, /de-color-selected-badge/);
assert.match(view, /focus-visible:outline-ring|focus-within:outline-ring/);
console.log("ok: 7. Selected badge + keyboard focus styling remain");

// CTA primary fills are allowed; selected option rows must not use them
assert.match(view, /bg-primary/);
const selectedTernaries = [...view.matchAll(/\?\s*"([^"]*de-option-selected[^"]*)"/g)].map((m) => m[1]);
assert.ok(selectedTernaries.length >= 4, "expected multiple de-option-selected ternaries");
for (const cls of selectedTernaries) {
  assert.doesNotMatch(cls, /bg-primary|text-primary-foreground|bg-emerald|bg-green|bg-slate|bg-stone/);
}
console.log("ok: 8. selected ternaries never include dark selected fills");

console.log("\nphaseSelectedOptionStyle.test.ts: ok\n");
