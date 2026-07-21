import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BACKSPLASH_REVIEW_CODES,
  buildBacksplashPricingInput,
  resolveBilledSfForMode,
  resolveOriginalBacksplashMode,
  roomHasEligibleBacksplashLocations
} from "./backsplashPricingAuthority.mjs";

// --- Test matrix — location authority (section 28) -------------------------------------

test("wall-backed perimeter segment is eligible: measured length > 0 => eligible", () => {
  assert.equal(
    roomHasEligibleBacksplashLocations({ backsplashMeasuredLengthIn: 120, backsplashSf: 4 }),
    true
  );
});

test("island-only room: no measured length, no billed sf => not eligible", () => {
  assert.equal(
    roomHasEligibleBacksplashLocations({ backsplashMeasuredLengthIn: null, backsplashSf: 0 }),
    false
  );
});

test("legacy room with billed SF but no length is still eligible (pre-length-tracking data)", () => {
  assert.equal(
    roomHasEligibleBacksplashLocations({ backsplashMeasuredLengthIn: null, backsplashSf: 6 }),
    true
  );
});

test("original mode inference: explicit studio mode wins over legacy SF inference", () => {
  assert.equal(resolveOriginalBacksplashMode({ backsplashHeightMode: "full_height", backsplashSf: 10 }), "full_height");
  assert.equal(resolveOriginalBacksplashMode({ backsplashHeightMode: "custom", backsplashSf: 5 }), "custom_height");
  assert.equal(resolveOriginalBacksplashMode({ backsplashHeightMode: "standard", backsplashSf: 5 }), "standard_4in");
  assert.equal(resolveOriginalBacksplashMode({ backsplashHeightMode: null, backsplashSf: 0 }), "none");
});

test("legacy publication with no backsplashHeightMode infers standard_4in only when SF>0 (never fabricated new mode)", () => {
  assert.equal(resolveOriginalBacksplashMode({ backsplashHeightMode: null, backsplashSf: 7 }), "standard_4in");
  assert.equal(resolveOriginalBacksplashMode({ backsplashHeightMode: undefined, backsplashSf: 0 }), "none");
});

// --- 4-inch backsplash -------------------------------------------------------------------

test("4-inch: unchanged original 4-inch mode reuses the already-billed SF exactly (no mode-change delta)", () => {
  const room = { backsplashHeightMode: "standard", backsplashSf: 7, rawBacksplashSf: 6.2 };
  const r = resolveBilledSfForMode(room, "standard_4in");
  assert.equal(r.billedSf, 7);
  assert.equal(r.reviewCode, null);
  assert.equal(r.source, "original_billed_sf");
});

test("4-inch: adding where none existed recomputes from measured length independently and ceils", () => {
  const room = { backsplashHeightMode: "none", backsplashSf: 0, backsplashMeasuredLengthIn: 365 };
  // 365in * 4in / 144 = 10.1388.. sf -> ceil 11
  const r = resolveBilledSfForMode(room, "standard_4in");
  assert.equal(r.billedSf, 11);
  assert.equal(r.reviewCode, null);
});

test("4-inch: no original billed SF and no measured length => geometry missing review, no invented price", () => {
  const room = { backsplashHeightMode: "none", backsplashSf: 0, backsplashMeasuredLengthIn: null };
  const r = resolveBilledSfForMode(room, "standard_4in");
  assert.equal(r.billedSf, null);
  assert.equal(r.reviewCode, BACKSPLASH_REVIEW_CODES.GEOMETRY_MISSING);
});

// --- Full height --------------------------------------------------------------------------

test("full height: authoritative when original mode was already full_height", () => {
  const room = { backsplashHeightMode: "full_height", backsplashSf: 22, rawBacksplashSf: 21.4, backsplashHeightIn: 18 };
  const r = resolveBilledSfForMode(room, "full_height");
  assert.equal(r.billedSf, 22);
  assert.equal(r.resolvedHeightInches, 18);
  assert.equal(r.reviewCode, null);
});

test("full height: no authoritative wall height when original was standard => review required, no invented price", () => {
  const room = { backsplashHeightMode: "standard", backsplashSf: 6, backsplashMeasuredLengthIn: 216 };
  const r = resolveBilledSfForMode(room, "full_height");
  assert.equal(r.billedSf, null);
  assert.equal(r.reviewCode, BACKSPLASH_REVIEW_CODES.FULL_HEIGHT_MEASUREMENT_REQUIRED);
});

// --- Custom height -------------------------------------------------------------------------

test("custom height within governed range + known length prices automatically, run length untouched by customer", () => {
  const room = { backsplashHeightMode: "standard", backsplashSf: 6, backsplashMeasuredLengthIn: 216 };
  // 216in * 10in / 144 = 15 sf exactly
  const r = resolveBilledSfForMode(room, "custom_height", { requestedHeightInches: 10 });
  assert.equal(r.billedSf, 15);
  assert.equal(r.resolvedHeightInches, 10);
  assert.equal(r.reviewCode, null);
});

test("custom height without any requested height => review required, no invented total", () => {
  const room = { backsplashMeasuredLengthIn: 216 };
  const r = resolveBilledSfForMode(room, "custom_height", {});
  assert.equal(r.billedSf, null);
  assert.equal(r.reviewCode, BACKSPLASH_REVIEW_CODES.CUSTOM_HEIGHT_REVIEW);
});

test("custom height outside governed range => height_out_of_range review, no invented total", () => {
  const room = { backsplashMeasuredLengthIn: 216 };
  const r = resolveBilledSfForMode(room, "custom_height", { requestedHeightInches: 40 });
  assert.equal(r.billedSf, null);
  assert.equal(r.reviewCode, BACKSPLASH_REVIEW_CODES.HEIGHT_OUT_OF_RANGE);
});

test("custom height within range but no measured length => review required (cannot invent run length)", () => {
  const room = { backsplashMeasuredLengthIn: null };
  const r = resolveBilledSfForMode(room, "custom_height", { requestedHeightInches: 10 });
  assert.equal(r.billedSf, null);
  assert.equal(r.reviewCode, BACKSPLASH_REVIEW_CODES.CUSTOM_HEIGHT_REVIEW);
});

// --- No backsplash / credit -----------------------------------------------------------------

test("no backsplash: billed sf is exactly zero, never negative, never a fabricated credit amount here", () => {
  const r = resolveBilledSfForMode({ backsplashSf: 12 }, "none");
  assert.equal(r.billedSf, 0);
  assert.equal(r.reviewCode, null);
});

// --- Independent rounding (section 8) --------------------------------------------------------

test("independent section rounding: backsplash SF ceils on its own, never combined with countertop", () => {
  // 10.1 sf-equivalent length*height should ceil to 11 independent of any countertop number.
  const room = { backsplashHeightMode: "none", backsplashMeasuredLengthIn: 363.6 }; // *4/144 = 10.1
  const r = resolveBilledSfForMode(room, "standard_4in");
  assert.equal(r.billedSf, 11);
});

// --- buildBacksplashPricingInput (section 10 canonical input) --------------------------------

test("canonical pricing input never leaks a rate/amount and reports reviewRequired + codes correctly", () => {
  const room = {
    roomKey: "kitchen",
    backsplashHeightMode: "standard",
    backsplashSf: 7,
    rawBacksplashSf: 6.2,
    backsplashMeasuredLengthIn: 220
  };
  const input = buildBacksplashPricingInput(room, "full_height", {});
  assert.equal(input.roomKey, "kitchen");
  assert.equal(input.originalMode, "standard_4in");
  assert.equal(input.mode, "full_height");
  assert.equal(input.billedSf, null);
  assert.equal(input.reviewRequired, true);
  assert.deepEqual(input.reviewCodes, [BACKSPLASH_REVIEW_CODES.FULL_HEIGHT_MEASUREMENT_REQUIRED]);
  assert.equal("sellPrice" in input, false);
  assert.equal("rate" in input, false);
});

test("no backsplash on a room whose original amount cannot be determined flags removal-credit-unresolved", () => {
  // Original mode is full_height (billed SF known: 20) but the caller has no way to
  // price the *credit* without a rate — this module only reports geometry, so the flag
  // fires purely from "original mode existed but original billedSf resolves to null"
  // scenario (e.g. a corrupted/partial legacy room missing backsplashSf entirely).
  const room = { backsplashHeightMode: "full_height", backsplashSf: null, backsplashHeightIn: 18 };
  const input = buildBacksplashPricingInput(room, "none", {});
  assert.equal(input.originalMode, "full_height");
  assert.ok(input.reviewCodes.includes(BACKSPLASH_REVIEW_CODES.REMOVAL_CREDIT_UNRESOLVED));
});

test("no credit review flag when original was already none", () => {
  const room = { backsplashHeightMode: "none", backsplashSf: 0 };
  const input = buildBacksplashPricingInput(room, "none", {});
  assert.equal(input.reviewCodes.length, 0);
});
