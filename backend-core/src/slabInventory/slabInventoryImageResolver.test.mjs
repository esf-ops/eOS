import assert from "node:assert/strict";
import {
  buildImageMap,
  IMAGE_URL_PATTERN_SLABSMITH,
  IMAGE_URL_PATTERN_SLABCLOUD,
  imageMapLookupKey,
  imagePatternDisplayLabel,
  lookupInventoryImage,
  pickPreferredImageRow,
} from "./slabInventoryImageResolver.js";

/* ── pickPreferredImageRow: SlabCloud ───────────────────────────────────── */
{
  const slabcloudFilter = { mode: "single", externalSource: "slabcloud", resolved: "slabcloud" };
  const cloudOk = {
    external_source: "slabcloud",
    image_url_pattern: IMAGE_URL_PATTERN_SLABCLOUD,
    image_status: "ok",
    image_url: "cloud.jpg",
  };
  const cloudMissing = {
    external_source: "slabcloud",
    image_url_pattern: "other",
    image_status: "missing",
    image_url: "cloud-missing.jpg",
  };
  assert.equal(pickPreferredImageRow(cloudOk, cloudMissing, slabcloudFilter).image_url, "cloud.jpg");
  console.log("ok: pickPreferredImageRow slabcloud");
}

/* ── pickPreferredImageRow: Slabsmith local upload ─────────────────────── */
{
  const slabsmithFilter = { mode: "single", externalSource: "slabsmith", resolved: "slabsmith" };
  const smithUpload = {
    external_source: "slabsmith",
    image_url_pattern: IMAGE_URL_PATTERN_SLABSMITH,
    image_status: "ok",
    image_url: "smith-upload.jpg",
  };
  const smithLegacy = {
    external_source: "slabsmith",
    image_url_pattern: "other",
    image_status: "ok",
    image_url: "smith-other.jpg",
  };
  assert.equal(
    pickPreferredImageRow(smithUpload, smithLegacy, slabsmithFilter).image_url,
    "smith-upload.jpg",
    "prefers slabsmith_local_upload"
  );
  console.log("ok: pickPreferredImageRow slabsmith");
}

/* ── buildImageMap + lookupInventoryImage: composite keys when source=all ─ */
{
  const allFilter = { mode: "all", externalSource: null, resolved: "all" };
  const rows = [
    {
      external_source: "slabcloud",
      external_slab_id: "S1",
      image_url: "cloud.jpg",
      image_status: "ok",
      image_url_pattern: IMAGE_URL_PATTERN_SLABCLOUD,
    },
    {
      external_source: "slabsmith",
      external_slab_id: "S1",
      image_url: "smith.jpg",
      image_status: "ok",
      image_url_pattern: IMAGE_URL_PATTERN_SLABSMITH,
    },
  ];
  const map = buildImageMap(rows, allFilter);
  assert.equal(map.get("slabcloud:S1").image_url, "cloud.jpg");
  assert.equal(map.get("slabsmith:S1").image_url, "smith.jpg");

  const cloudInv = { external_source: "slabcloud", external_slab_id: "S1" };
  const smithInv = { external_source: "slabsmith", external_slab_id: "S1" };
  assert.equal(lookupInventoryImage(map, cloudInv, allFilter).image_url, "cloud.jpg");
  assert.equal(lookupInventoryImage(map, smithInv, allFilter).image_url, "smith.jpg");
  console.log("ok: buildImageMap composite keys");
}

/* ── single-source mode uses plain external_slab_id key ─────────────────── */
{
  const smithFilter = { mode: "single", externalSource: "slabsmith", resolved: "slabsmith" };
  const rows = [
    {
      external_source: "slabsmith",
      external_slab_id: "INV-42",
      image_url: "upload.jpg",
      image_status: "ok",
      image_url_pattern: IMAGE_URL_PATTERN_SLABSMITH,
    },
  ];
  const map = buildImageMap(rows, smithFilter);
  assert.equal(map.get("INV-42").image_url, "upload.jpg");
  assert.equal(
    imageMapLookupKey({ external_source: "slabsmith", external_slab_id: "INV-42" }, smithFilter),
    "INV-42"
  );
  console.log("ok: buildImageMap single-source key");
}

/* ── imagePatternDisplayLabel ──────────────────────────────────────────── */
{
  assert.equal(imagePatternDisplayLabel(IMAGE_URL_PATTERN_SLABSMITH), "Local inventory image");
  assert.equal(imagePatternDisplayLabel(IMAGE_URL_PATTERN_SLABCLOUD), "Legacy URL");
  assert.equal(imagePatternDisplayLabel(""), null);
  console.log("ok: imagePatternDisplayLabel");
}
