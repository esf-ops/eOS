import assert from "node:assert/strict";
import { test } from "node:test";

import { formatInches, parseLengthInches } from "./measure.ts";

test("parseLengthInches reads inches and feet-inches the way plans are written", () => {
  assert.equal(parseLengthInches("126"), 126);
  assert.equal(parseLengthInches('126"'), 126);
  assert.equal(parseLengthInches("126 in"), 126);
  assert.equal(parseLengthInches("25.5"), 25.5);
  assert.equal(parseLengthInches("10'"), 120);
  assert.equal(parseLengthInches("10' 6"), 126);
  assert.equal(parseLengthInches(`10'6"`), 126);
  assert.equal(parseLengthInches("10 ft 6 in"), 126);
  assert.equal(parseLengthInches("10.5'"), 126);
  assert.equal(parseLengthInches("10′ 6″"), 126);
});

test("parseLengthInches rejects blanks, negatives and junk", () => {
  for (const bad of ["", "  ", "-5", "abc", "10'x", "5 6"]) assert.equal(parseLengthInches(bad), null, bad);
});

test("formatInches shows feet and inches", () => {
  assert.equal(formatInches(126), "10′ 6″");
  assert.equal(formatInches(120), "10′");
  assert.equal(formatInches(8), "8″");
  assert.equal(formatInches(0), "");
});
