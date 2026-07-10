/**
 * Phase 4G.4 extraction contract tests — fake/sentinel payloads only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractIntelOpenAmount,
  extractIntelTotalAmount,
  parseIntelMoneyScalar,
} from "./quickBooksIntelligenceExtract.js";

describe("quickBooksIntelligenceExtract (SQL contract mirror)", () => {
  it("parses plain, #text, currency, and comma money scalars", () => {
    assert.equal(parseIntelMoneyScalar("1234.56"), 1234.56);
    assert.equal(parseIntelMoneyScalar({ "#text": "99.00" }), 99);
    assert.equal(parseIntelMoneyScalar("$1,234.56"), 1234.56);
    assert.equal(parseIntelMoneyScalar(50), 50);
    assert.equal(parseIntelMoneyScalar("SENTINEL_NAME"), null);
  });

  it("extracts invoice total from TotalAmount first", () => {
    assert.equal(
      extractIntelTotalAmount({
        TotalAmount: "100.00",
        Subtotal: "90.00",
        Amount: "80.00",
      }),
      100,
    );
  });

  it("falls back to Subtotal then Amount when TotalAmount missing", () => {
    assert.equal(extractIntelTotalAmount({ Subtotal: { "#text": "42.5" } }), 42.5);
    assert.equal(extractIntelTotalAmount({ Amount: "$10.00" }), 10);
  });

  it("extracts open amount from BalanceRemaining", () => {
    assert.equal(
      extractIntelOpenAmount({ BalanceRemaining: { "#text": "15.25" } }),
      15.25,
    );
  });

  it("never requires or returns raw_payload keys in results", () => {
    const total = extractIntelTotalAmount({ TotalAmount: "1.00", Memo: "nope" });
    assert.equal(total, 1);
    assert.equal(typeof total, "number");
  });
});
