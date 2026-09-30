import test from "node:test";
import assert from "node:assert/strict";
import { createQuoteFlowError } from "./quoteFlowErrors.mjs";

test("validation errors keep the authored staff message", () => {
  const e = createQuoteFlowError("pricing_invalid", {
    message: 'Room "Kitchen": choose an existing custom slab package or Elite 100.'
  });
  assert.equal(e.statusCode, 422);
  assert.equal(e.message, "Pricing settings are invalid.");
  assert.match(e.staffDetail, /choose an existing custom slab package/);
});

test("non-validation errors never expose the thrown message", () => {
  const e = createQuoteFlowError("mailbox_unavailable", { message: "graph token expired for tenant x" });
  assert.equal(e.staffDetail, undefined);
});
