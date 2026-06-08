/**
 * Regression checks for splitInternalEstimateCustomLines helper.
 *
 * Run from repo root:
 *   npx --yes tsx --tsconfig app-internal-estimate/tsconfig.json scripts/verify-internal-estimate-custom-lines.ts
 */
import assert from "node:assert/strict";
import { splitInternalEstimateCustomLines } from "../app-internal-estimate/src/lib/internalEstimateCustomLines.ts";

type Row = Parameters<typeof splitInternalEstimateCustomLines>[0]["customLineRows"][number];

function row(overrides: Partial<Row> & Pick<Row, "name" | "unitPrice">): Row {
  return {
    id: `id-${overrides.name.replace(/\s/g, "-")}`,
    description: "",
    category: "Other",
    qty: "1",
    customerFacing: true,
    internalNote: "",
    roomName: "",
    roomId: "",
    ...overrides,
  };
}

const NO_ROOMS: { id: string; name: string }[] = [];

// ── 1. Empty / null input ─────────────────────────────────────────────────────
{
  const r = splitInternalEstimateCustomLines({ customLineRows: [], roomDrafts: NO_ROOMS });
  assert.deepEqual(r.visibleCustomerLines, [], "empty: visibleCustomerLines is []");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "empty: internalOnlyAdjustDollars is 0");
}

// ── 2. Single customer-facing line ───────────────────────────────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Tear Out", unitPrice: "750", category: "Labor" })],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines.length, 1, "cf: one visible line");
  assert.strictEqual(r.visibleCustomerLines[0].name, "Tear Out", "cf: correct name");
  assert.strictEqual(r.visibleCustomerLines[0].lineTotal, 750, "cf: correct lineTotal");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "cf: no hidden dollars");
}

// ── 3. Internal-only line does not appear in visibleCustomerLines ─────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Internal fee", unitPrice: "200", customerFacing: false })],
    roomDrafts: NO_ROOMS,
  });
  assert.deepEqual(r.visibleCustomerLines, [], "internal: visibleCustomerLines is []");
  assert.strictEqual(r.internalOnlyAdjustDollars, 200, "internal: folds into adjust dollars");
}

// ── 4. Internal-only line contributes to internalOnlyAdjustDollars ──────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [
      row({ name: "Visible fee", unitPrice: "500", customerFacing: true }),
      row({ name: "Hidden surcharge", unitPrice: "150", customerFacing: false }),
    ],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines.length, 1, "mixed: one visible");
  assert.strictEqual(r.visibleCustomerLines[0].name, "Visible fee", "mixed: correct visible");
  assert.strictEqual(r.internalOnlyAdjustDollars, 150, "mixed: hidden folds correctly");
}

// ── 5. Discount/Credit negative price → visible on customer estimate ──────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Discount / Credit", unitPrice: "-100", category: "Discount/Credit" })],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines.length, 1, "disc: appears in visible");
  assert.strictEqual(r.visibleCustomerLines[0].lineTotal, -100, "disc: negative lineTotal");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "disc: no hidden adjust");
}

// ── 6. Discount/Credit with positive price → auto-negated (treated as credit) ──
// Behavior changed: entering "25" in a Discount/Credit row applies a -$25 credit.
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Credit", unitPrice: "25", category: "Discount/Credit" })],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines.length, 1, "disc-positive: auto-negated → visible");
  assert.strictEqual(r.visibleCustomerLines[0].lineTotal, -25, "disc-positive: lineTotal is -25");
  assert.strictEqual(r.visibleCustomerLines[0].unitPrice, -25, "disc-positive: unitPrice is -25");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "disc-positive: no hidden adjust");
}

// ── 6b. Discount/Credit with zero price → excluded ────────────────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Zero Credit", unitPrice: "0", category: "Discount/Credit" })],
    roomDrafts: NO_ROOMS,
  });
  assert.deepEqual(r.visibleCustomerLines, [], "disc-zero: excluded (zero amount)");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "disc-zero: no adjust");
}

// ── 7. Zero unit price → excluded from both buckets ──────────────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Zero priced", unitPrice: "0" })],
    roomDrafts: NO_ROOMS,
  });
  assert.deepEqual(r.visibleCustomerLines, [], "zero-price: not visible");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "zero-price: no adjust");
}

// ── 8. Unnamed row → excluded ─────────────────────────────────────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "   ", unitPrice: "100" })],
    roomDrafts: NO_ROOMS,
  });
  assert.deepEqual(r.visibleCustomerLines, [], "unnamed: not visible");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "unnamed: no adjust");
}

// ── 9. Quantity × unit price ─────────────────────────────────────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Trip", unitPrice: "75", qty: "3" })],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines[0].lineTotal, 225, "qty*price: lineTotal = 225");
  assert.strictEqual(r.visibleCustomerLines[0].qty, 3, "qty*price: qty = 3");
}

// ── 10. qty ≤ 0 (negative qty) → row excluded ────────────────────────────────
// Note: qty "0" is treated as qty 1 via the `|| 1` fallback (matches InternalEstimateApp behavior).
// Only explicitly negative qty excludes the row.
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Neg qty", unitPrice: "100", qty: "-1" })],
    roomDrafts: NO_ROOMS,
  });
  assert.deepEqual(r.visibleCustomerLines, [], "qty-neg: excluded by qty <= 0");
  assert.strictEqual(r.internalOnlyAdjustDollars, 0, "qty-neg: no adjust");
}

// ── 10b. qty "0" → treated as qty 1 (|| 1 fallback, matches original InternalEstimateApp) ──
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Zero qty", unitPrice: "100", qty: "0" })],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines.length, 1, "qty-zero: treated as qty=1 (fallback)");
  assert.strictEqual(r.visibleCustomerLines[0].qty, 1, "qty-zero: qty resolved to 1");
}

// ── 11. Mixed customer-facing and hidden → correct buckets ───────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [
      row({ name: "Sink", unitPrice: "300", customerFacing: true, category: "Sink" }),
      row({ name: "Hidden markup", unitPrice: "80", customerFacing: false }),
      row({ name: "Discount / Credit", unitPrice: "-50", category: "Discount/Credit" }),
      row({ name: "Zero internal", unitPrice: "0", customerFacing: false }),
    ],
    roomDrafts: NO_ROOMS,
  });
  // visibleCustomerLines: Sink + Discount (both customer-facing, qualifying)
  assert.strictEqual(r.visibleCustomerLines.length, 2, "full-mix: 2 visible lines");
  const names = r.visibleCustomerLines.map((l) => l.name);
  assert.ok(names.includes("Sink"), "full-mix: Sink visible");
  assert.ok(names.includes("Discount / Credit"), "full-mix: Discount visible");
  // internalOnlyAdjustDollars: hidden markup $80 (zero internal excluded)
  assert.strictEqual(r.internalOnlyAdjustDollars, 80, "full-mix: hidden markup = 80");
}

// ── 12. Room association via roomId ──────────────────────────────────────────
{
  const rooms = [{ id: "room-1", name: "Kitchen" }];
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Kitchen sink", unitPrice: "200", roomId: "room-1", roomName: "Old name" })],
    roomDrafts: rooms,
  });
  assert.strictEqual(r.visibleCustomerLines[0].roomName, "Kitchen", "roomId: resolves to draft name");
}

// ── 13. Room association falls back to roomName string ────────────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [row({ name: "Bath sink", unitPrice: "150", roomId: "", roomName: "Bathroom" })],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines[0].roomName, "Bathroom", "roomName-fallback: uses roomName string");
}

// ── 14. internalOnlyAdjustDollars arithmetic equivalence ─────────────────────
// Verifies: round2(round2(totalAll) - totalVisible) matches the original formula
// customLinePreviewTotals = round2(totalAll), internalOnlyAdjust = round2(CPT - visibleCustom)
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [
      row({ name: "Visible A", unitPrice: "333.33", customerFacing: true }),
      row({ name: "Hidden B", unitPrice: "111.11", customerFacing: false }),
    ],
    roomDrafts: NO_ROOMS,
  });
  // totalAll = 333.33 + 111.11 = 444.44; round2(444.44) = 444.44
  // totalVisible = 333.33
  // internalOnlyAdjustDollars = round2(444.44 - 333.33) = round2(111.11) = 111.11
  assert.strictEqual(r.internalOnlyAdjustDollars, 111.11, "arith: exact dollar amounts preserved");
  assert.strictEqual(r.visibleCustomerLines[0].lineTotal, 333.33, "arith: visible lineTotal preserved");
}

// ── 15. lineKey comes from row.id ─────────────────────────────────────────────
{
  const r = splitInternalEstimateCustomLines({
    customLineRows: [{ ...row({ name: "Fixture", unitPrice: "250" }), id: "my-unique-id" }],
    roomDrafts: NO_ROOMS,
  });
  assert.strictEqual(r.visibleCustomerLines[0].lineKey, "my-unique-id", "lineKey: row.id is preserved");
}

console.log("verify-internal-estimate-custom-lines: OK");
