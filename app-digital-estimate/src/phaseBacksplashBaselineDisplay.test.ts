/**
 * Backsplash display uses published pricing baseline — not eligibility/defaultQty.
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseBacksplashBaselineDisplay.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  backsplashModeTokenFromOptionKey,
  resolvePublishedBacksplashMode,
} from "./backsplashDisplayAuthority.ts";

const here = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(here, "ConfigurationView.tsx"), "utf8");
const theme = readFileSync(join(here, "lovable-theme.css"), "utf8");
const vmSrc = readFileSync(join(here, "lovableViewModel.ts"), "utf8");
const authSrc = readFileSync(join(here, "backsplashDisplayAuthority.ts"), "utf8");

console.log("\nphaseBacksplashBaselineDisplay.test.ts\n");

{
  assert.equal(resolvePublishedBacksplashMode({ backsplashHeightMode: "none" }), "none");
  assert.equal(
    resolvePublishedBacksplashMode({ backsplashHeightMode: "standard", backsplashIncluded: true }),
    "standard_4in",
  );
  assert.equal(
    resolvePublishedBacksplashMode({ backsplashHeightMode: null, backsplashIncluded: false }),
    "none",
  );
  assert.equal(
    resolvePublishedBacksplashMode({ backsplashHeightMode: null, backsplashIncluded: true }),
    "standard_4in",
  );
  assert.equal(backsplashModeTokenFromOptionKey("backsplash:kitchen:standard_4in"), "standard_4in");
  assert.equal(backsplashModeTokenFromOptionKey("backsplash:kitchen:none"), "none");
  console.log("ok: published backsplash mode from height/inclusion, not eligibility");
}

{
  // Simulate the mapping rule used by lovableViewModel (source-contract + authority).
  function mapSelected(args: {
    heightMode: string | null;
    included: boolean;
    qty: Record<string, number>;
    wronglySeededFour: boolean;
  }) {
    const published = resolvePublishedBacksplashMode({
      backsplashHeightMode: args.heightMode,
      backsplashIncluded: args.included,
    });
    const options = [
      { optionKey: "backsplash:kitchen:none", defaultQty: args.wronglySeededFour ? 0 : 1 },
      {
        optionKey: "backsplash:kitchen:standard_4in",
        defaultQty: args.wronglySeededFour ? 1 : 0,
      },
    ];
    const roleHasExplicit = Object.entries(args.qty).some(
      ([k, v]) => k.startsWith("backsplash:kitchen:") && Number(v) > 0,
    );
    return options.map((o) => {
      const token = backsplashModeTokenFromOptionKey(o.optionKey);
      const isPublished = token === published;
      const selected = roleHasExplicit
        ? (args.qty[o.optionKey] ?? 0) > 0
        : isPublished;
      return { optionKey: o.optionKey, selected, includedInBaseline: isPublished };
    });
  }

  const noneBaseline = mapSelected({
    heightMode: "none",
    included: false,
    qty: {},
    wronglySeededFour: true,
  });
  assert.equal(noneBaseline.find((o) => o.optionKey.endsWith(":none"))?.selected, true);
  assert.equal(noneBaseline.find((o) => o.optionKey.endsWith(":standard_4in"))?.selected, false);
  assert.equal(noneBaseline.find((o) => o.optionKey.endsWith(":none"))?.includedInBaseline, true);
  assert.equal(
    noneBaseline.find((o) => o.optionKey.endsWith(":standard_4in"))?.includedInBaseline,
    false,
  );
  console.log("ok: 1. published none wins over wrongly seeded 4-inch defaultQty");

  const fourBaseline = mapSelected({
    heightMode: "standard",
    included: true,
    qty: {},
    wronglySeededFour: true,
  });
  assert.equal(fourBaseline.find((o) => o.optionKey.endsWith(":standard_4in"))?.selected, true);
  console.log("ok: 2. published 4-inch baseline still selects 4-inch");

  const upgraded = mapSelected({
    heightMode: "none",
    included: false,
    qty: { "backsplash:kitchen:standard_4in": 1 },
    wronglySeededFour: true,
  });
  assert.equal(upgraded.find((o) => o.optionKey.endsWith(":standard_4in"))?.selected, true);
  assert.equal(upgraded.find((o) => o.optionKey.endsWith(":none"))?.selected, false);
  assert.equal(
    upgraded.find((o) => o.optionKey.endsWith(":standard_4in"))?.includedInBaseline,
    false,
  );
  console.log("ok: 3. explicit 4-inch qty selects upgrade over published none");
}

{
  assert.match(authSrc, /never eligibility alone/i);
  assert.match(vmSrc, /resolvePublishedBacksplashMode/);
  assert.match(vmSrc, /Never treat eligibility\/defaultQty as selected for backsplash/);
  assert.match(vmSrc, /backsplashIsPublishedBaseline/);
  assert.match(theme, /\.de-option-selected\b/);
  assert.match(theme, /\.de-option-selected-badge\b/);
  assert.match(view, /de-option-selected/);
  assert.match(view, /de-option-selected-badge/);
  assert.match(view, /de-edge-option-selected-badge/);
  assert.doesNotMatch(
    view,
    /opt\.selected\s*\?\s*"border-primary bg-accent\/40 ring-2 ring-primary/,
  );
  assert.doesNotMatch(
    view,
    /selected\s*\?\s*"border-primary bg-accent\/40 ring-1 ring-primary\/20"/,
  );
  assert.doesNotMatch(view, /opt\.selected\s*\?\s*"border-foreground bg-muted\/30"/);
  assert.match(theme, /--de-selected-bg:\s*#fff7f8/);
  assert.doesNotMatch(
    theme,
    /\.de-option-selected\s*\{[^}]*var\(--accent\)/s,
  );
  console.log("ok: 4. selected styling softened; badge still present");
}

console.log("\nphaseBacksplashBaselineDisplay.test.ts: ok\n");
