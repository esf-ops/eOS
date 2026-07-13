/**
 * Unit tests — Cambria public material id helpers for the standalone visualizer.
 */
import assert from "node:assert/strict";
import {
  buildCambriaMaterialId,
  parseCambriaMaterialId,
} from "./cambriaPublicVisualizerMaterials.mjs";

assert.equal(parseCambriaMaterialId("cambria-abc-123"), "abc-123");
assert.equal(parseCambriaMaterialId("CAMBRIA-xyz"), "xyz");
assert.equal(parseCambriaMaterialId("e100-carrara"), null);
assert.equal(parseCambriaMaterialId(""), null);
assert.equal(buildCambriaMaterialId("uuid-1"), "cambria-uuid-1");
assert.equal(buildCambriaMaterialId(""), null);

console.log("ok: cambriaPublicVisualizerMaterials id helpers");
