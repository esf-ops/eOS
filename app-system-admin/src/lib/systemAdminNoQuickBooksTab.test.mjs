/**
 * Assert System Admin no longer embeds QuickBooks Intelligence as a nav tab.
 * QuickBooks Intelligence is its own head: app-quickbooks-intelligence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const appTsx = readFileSync(join(here, "../ui/App.tsx"), "utf8");

describe("system-admin QuickBooks removal", () => {
  it("does not import QuickBooksIntelligenceAdmin", () => {
    assert.equal(appTsx.includes("QuickBooksIntelligenceAdmin"), false);
  });

  it("does not define a quickbooks activeView", () => {
    assert.equal(appTsx.includes('| "quickbooks"'), false);
    assert.equal(appTsx.includes('activeView === "quickbooks"'), false);
  });

  it("does not render a QuickBooks nav pill", () => {
    assert.equal(/\bQuickBooks\b/.test(appTsx), false);
  });
});
