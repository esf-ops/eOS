import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toAiQuoteDetail, toAiQuoteListItem } from "./slabAiQuoteActions.js";

describe("slabAiQuoteActions DTOs", () => {
  it("minimizes list item and labels recorded total", () => {
    const item = toAiQuoteListItem({
      id: "11111111-1111-4111-8111-111111111111",
      quote_number: "ESF-100",
      quote_status: "draft",
      customer_name: "Acme",
      project_name: "Kitchen",
      project_address: "1 Main",
      city: "Austin",
      state: "TX",
      zip: "78701",
      estimated_sqft: 42,
      grand_total: 1234.56,
    });
    assert.equal(item.quoteNumber, "ESF-100");
    assert.equal(item.recordedTotal, 1234.56);
    assert.match(item.note, /authoritative/i);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "unit_price"), false);
  });

  it("detail omits line prices", () => {
    const detail = toAiQuoteDetail(
      {
        id: "11111111-1111-4111-8111-111111111111",
        quote_number: "ESF-100",
        customer_name: "Acme",
        project_name: "Kitchen",
      },
      {
        rooms: [{ name: "Kitchen", notes: "Island" }],
        lineItems: [{ description: "Countertop", quantity: 1, unit: "ea", unit_price: 999 }],
      }
    );
    assert.equal(detail.rooms[0].name, "Kitchen");
    assert.equal(detail.lineHints[0].description, "Countertop");
    assert.equal(Object.prototype.hasOwnProperty.call(detail.lineHints[0], "unit_price"), false);
    assert.match(detail.authority, /read-only/i);
  });
});
