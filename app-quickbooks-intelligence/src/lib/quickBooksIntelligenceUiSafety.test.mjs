/**
 * Source-level guards for QuickBooks Intelligence head UI.
 * Ensures sensitive fields are never referenced in presentational modules.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const viewTsx = readFileSync(join(here, "../ui/QuickBooksIntelligenceView.tsx"), "utf8");
const appTsx = readFileSync(join(here, "../ui/App.tsx"), "utf8");

describe("quickbooks-intelligence UI safety", () => {
  it("does not reference raw_payload in presentational UI", () => {
    assert.equal(viewTsx.includes("raw_payload"), false);
    assert.equal(appTsx.includes("raw_payload"), false);
  });

  it("does not render address/memo fields from staging", () => {
    for (const forbidden of ["BillAddr", "ShipAddr", "bill_address", "ship_address", "raw_memo"]) {
      assert.equal(viewTsx.includes(forbidden), false, `view must not include ${forbidden}`);
    }
  });

  it("uses EliteosTopbar and allowed finance roles", () => {
    assert.ok(appTsx.includes("EliteosTopbar"));
    assert.ok(appTsx.includes("finance"));
    assert.ok(appTsx.includes("accounting"));
    assert.ok(appTsx.includes("executive"));
  });
});
