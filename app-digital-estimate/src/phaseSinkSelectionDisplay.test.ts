/**
 * Sink selection display parity across room card, modal draft, and breakdown.
 *
 * Run:
 * node --experimental-strip-types app-digital-estimate/src/phaseSinkSelectionDisplay.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUpdatedBreakdown } from "./customerEstimateBreakdown.ts";
import { shouldPreservePersistedSinkDraft } from "./sinkSelectionDisplay.ts";

const here = dirname(fileURLToPath(import.meta.url));
const viewSource = readFileSync(join(here, "ConfigurationView.tsx"), "utf8");
const viewModelSource = readFileSync(join(here, "lovableViewModel.ts"), "utf8");

const VARIANT_KEY = "sink:kitchen:esf:blanco:precis-50-50:coal-black";
const SINK_LABEL = "Precis 50/50 Sinks · Coal Black";

console.log("\nphaseSinkSelectionDisplay.test.ts\n");

{
  const baselineFallback = {
    optionKey: "sink:kitchen:none",
    sourceKind: "none",
    selected: false,
    includedInBaseline: true,
  };
  assert.equal(
    shouldPreservePersistedSinkDraft(baselineFallback, "esf"),
    true,
  );
  assert.equal(
    shouldPreservePersistedSinkDraft(baselineFallback, "customer_provided"),
    true,
  );
  assert.match(
    viewModelSource,
    /role === "sink"[\s\S]{0,120}shouldPreservePersistedSinkDraft\(selected, base\.source\)[\s\S]{0,80}return base/,
  );
  assert.match(
    viewModelSource,
    /sinkSummary: summarizeSinkDraft\(sinkDraft, summarizeChoice\(sinkSelected/,
  );
  console.log("ok: room card preserves authoritative persisted sink draft on variant-key refresh");
}

{
  assert.equal(
    shouldPreservePersistedSinkDraft(
      { sourceKind: "none", selected: true },
      "none",
    ),
    false,
  );
  assert.equal(
    shouldPreservePersistedSinkDraft(
      { sourceKind: "none", selected: false },
      "none",
    ),
    false,
  );
  assert.equal(
    shouldPreservePersistedSinkDraft(
      { sourceKind: "esf", selected: true },
      "esf",
    ),
    false,
  );
  console.log("ok: explicit and untouched No sink states remain authoritative");
}

{
  assert.match(
    viewSource,
    /productDrafts\[modalRoom\.id\]\?\.sink \|\| modalRoom\.sinkDraft/,
  );
  assert.match(viewSource, /selectedOptionKey=\{draft\.optionKey \|\| null\}/);
  assert.match(viewSource, /customerProductDrafts/);
  console.log("ok: modal selected state continues to use the saved/current sink draft");
}

{
  const breakdown = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 1775,
      options: [
        {
          optionKey: VARIANT_KEY,
          displayLabel: `ESF Sink — ${SINK_LABEL}`,
          visiblePrice: 575,
          included: false,
        },
        {
          optionKey: "qty-sink:kitchen",
          displayLabel: "Kitchen — Sink cutout",
          visiblePrice: 200,
          included: false,
        },
      ],
    },
  });
  assert.ok(
    breakdown.lines.some(
      (line) => line.label === `ESF Sink — ${SINK_LABEL}` && line.amount === 575,
    ),
  );
  assert.ok(
    breakdown.lines.some(
      (line) => line.label === "Kitchen — Sink cutout" && line.amount === 200,
    ),
  );
  console.log("ok: sink and cutout prices remain separate backend-authored lines");
}

{
  const noSinkBreakdown = buildUpdatedBreakdown({
    calculation: {
      configuredDisplayTotal: 1000,
      options: [],
    },
  });
  assert.equal(
    noSinkBreakdown.lines.some((line) => /sink|cutout/i.test(line.label)),
    false,
  );
  console.log("ok: switching back to No sink has no sink or cutout charge line");
}

console.log("\nphaseSinkSelectionDisplay.test.ts: ok\n");
