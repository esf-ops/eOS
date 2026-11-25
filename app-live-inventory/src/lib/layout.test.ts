/**
 * Job layout geometry — run: node app-live-inventory/src/lib/layout.test.ts
 */
import assert from "node:assert/strict";

import {
  autoPlace,
  largestOffcut,
  layoutUsage,
  pieceRect,
  polygonAreaIn2,
  rectInsidePolygon,
  rectsConflict,
  validateLayout,
  type LayoutPiece,
} from "./layout.ts";

// L-shaped remnant: 80 × 40 with the top-right 40 × 20 missing.
const L = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 80, y: 20 },
  { x: 80, y: 40 },
  { x: 0, y: 40 },
];
const piece = (id: string, lengthIn: number, widthIn: number, x = 0, y = 0, rotated = false): LayoutPiece => ({
  id,
  label: id,
  lengthIn,
  widthIn,
  x,
  y,
  rotated,
});

assert.equal(polygonAreaIn2(L), 80 * 40 - 40 * 20);
assert.ok(rectInsidePolygon({ x: 0, y: 20, w: 80, h: 20 }, L), "full-length bottom strip fits");
assert.ok(rectInsidePolygon({ x: 0, y: 0, w: 40, h: 40 }, L), "left block fits");
assert.ok(!rectInsidePolygon({ x: 0, y: 10, w: 70, h: 25 }, L), "70×25 crosses the notch");
assert.ok(!rectInsidePolygon({ x: 30, y: 5, w: 20, h: 30 }, L), "rect containing the notch corner is rejected");
assert.ok(!rectInsidePolygon({ x: -1, y: 20, w: 10, h: 10 }, L), "outside the stone");
assert.ok(!rectInsidePolygon({ x: 0, y: 20, w: 80, h: 20 }, L, 0.5), "edge trim pulls it off the edge");
assert.ok(rectInsidePolygon({ x: 1, y: 21, w: 78, h: 18 }, L, 0.5));
console.log("ok: rectangle containment in a notched remnant");

assert.ok(rectsConflict({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }, 0.25), "touching pieces violate kerf spacing");
assert.ok(!rectsConflict({ x: 0, y: 0, w: 10, h: 10 }, { x: 10.25, y: 0, w: 10, h: 10 }, 0.25));
assert.deepEqual(pieceRect(piece("a", 30, 10, 2, 3, true)), { x: 2, y: 3, w: 10, h: 30 });

const status = validateLayout([piece("a", 40, 18, 0, 21), piece("b", 30, 18, 39, 21)], L, { spacingIn: 0.25 });
assert.equal(status.get("a")?.ok, false);
assert.deepEqual(status.get("a")?.overlaps, ["b"]);
console.log("ok: overlap + spacing validation");

const placed = autoPlace(piece("c", 70, 15), [], L, { spacingIn: 0.25, edgeTrimIn: 0.5 });
assert.ok(placed, "70×15 has a home in the bottom strip");
assert.ok(rectInsidePolygon(pieceRect(placed!), L, 0.5));
const tall = autoPlace(piece("d", 15, 35), [], L);
assert.ok(tall && rectInsidePolygon(pieceRect(tall), L));
assert.equal(autoPlace(piece("e", 70, 25), [], L), null, "70×25 fits nowhere on this L");
const second = autoPlace(piece("f", 35, 15), [placed!], L, { spacingIn: 0.25 });
assert.ok(second && !rectsConflict(pieceRect(second), pieceRect(placed!), 0.25), "second piece avoids the first");
console.log("ok: auto-place");

const empty = largestOffcut([], L);
assert.equal(empty && empty.w * empty.h, 1600, "empty L: 80 × 20 strip or 40 × 40 block (tie)");
const afterCut = largestOffcut([piece("g", 40, 40, 0, 0)], L, { spacingIn: 0.25 });
assert.ok(afterCut && afterCut.x >= 40.25 && afterCut.w * afterCut.h >= 38 * 20, "offcut is what's left right of the cut");
console.log("ok: largest offcut");

const u = layoutUsage([piece("a", 72, 24)], 144 * 24);
assert.equal(Math.round(u.usedSqft), 12);
assert.equal(Math.round(u.pct), 50);
console.log("ok: usage\n\nlayout: all tests passed");
