/**
 * image-manifest.mjs — discover Slabsmith slab images on disk (no upload).
 *
 * Matches XML SlabID to `<SlabID>.jpg` and `<SlabID>_thumb.jpg` under imageRootPath.
 * Ignores the `sync` subfolder. Case-insensitive SlabID matching.
 */

import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const SLAB_TAG_OPEN_RE = /<Slabsmith\.dbo\.Slabs\b/g;
const XML_ATTR_RE = /([A-Za-z0-9_.]+)="([^"]*)"/g;
const THUMB_SUFFIX = "_thumb";
const SAMPLE_LIMIT = 10;
const SYNC_FOLDER_NAME = "sync";

const SLAB_FIELDS = Object.freeze([
  "SlabID",
  "InventoryID",
  "Name",
  "Material",
  "Type",
  "Bundle",
  "Lot",
  "Rack",
]);

/**
 * @param {string} value
 */
export function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x0D;&#x0A;/gi, "\n")
    .replace(/&#x0D;/gi, "\r")
    .replace(/&#x0A;/gi, "\n")
    .replace(/&#x09;/gi, "\t")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * @param {string} attrString
 */
export function parseSlabsmithAttributes(attrString) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!attrString) return out;

  let match;
  XML_ATTR_RE.lastIndex = 0;
  while ((match = XML_ATTR_RE.exec(attrString)) !== null) {
    out[match[1]] = decodeXmlEntities(match[2]);
  }
  return out;
}

/**
 * @param {string} xmlString
 * @returns {Array<Record<string, string>>}
 */
export function extractSlabsmithSlabNodes(xmlString) {
  const xml = String(xmlString ?? "");
  if (!xml.trim()) return [];

  /** @type {Array<Record<string, string>>} */
  const rows = [];
  let openMatch;

  SLAB_TAG_OPEN_RE.lastIndex = 0;
  while ((openMatch = SLAB_TAG_OPEN_RE.exec(xml)) !== null) {
    const start = openMatch.index + openMatch[0].length;
    const closeIdx = xml.indexOf("/>", start);
    const gtIdx = xml.indexOf(">", start);
    let end = -1;

    if (closeIdx !== -1 && (gtIdx === -1 || closeIdx < gtIdx)) {
      end = closeIdx;
    } else if (gtIdx !== -1) {
      end = gtIdx;
    }

    if (end === -1) continue;

    const attrs = parseSlabsmithAttributes(xml.slice(start, end).trim());
    if (Object.keys(attrs).length > 0) {
      rows.push(attrs);
    }
  }

  return rows;
}

/**
 * @param {Record<string, string>} attrs
 */
export function mapSlabRecordFromAttrs(attrs) {
  const slabId = String(attrs.SlabID ?? "").trim();
  if (!slabId) return null;

  /** @type {Record<string, string|null>} */
  const record = { SlabID: slabId };
  for (const field of SLAB_FIELDS) {
    if (field === "SlabID") continue;
    const value = String(attrs[field] ?? "").trim();
    record[field] = value || null;
  }
  return record;
}

/**
 * @param {string} xmlString
 */
export function parseSlabRecordsFromXml(xmlString) {
  return extractSlabsmithSlabNodes(xmlString)
    .map(mapSlabRecordFromAttrs)
    .filter(Boolean);
}

/**
 * @param {string} fileName
 */
export function classifyJpgFileName(fileName) {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".jpg")) return null;

  if (lower.endsWith(`${THUMB_SUFFIX}.jpg`)) {
    const stem = fileName.slice(0, fileName.length - `${THUMB_SUFFIX}.jpg`.length);
    return { kind: "thumb", stem, fileName };
  }

  const stem = fileName.slice(0, fileName.length - 4);
  return { kind: "full", stem, fileName };
}

/**
 * Scan imageRootPath top-level only; skip sync/ subfolder entries.
 *
 * @param {string} imageRootPath
 * @param {{ readdirSync?: typeof readdirSync, statSync?: typeof statSync }} [deps]
 */
export function scanImageRoot(imageRootPath, deps = {}) {
  const readDir = deps.readdirSync ?? readdirSync;
  const stat = deps.statSync ?? statSync;

  /** @type {Map<string, { file_name: string, path: string, bytes: number, modified_at: string }>} */
  const fullByStem = new Map();
  /** @type {Map<string, { file_name: string, path: string, bytes: number, modified_at: string }>} */
  const thumbByStem = new Map();

  let entries;
  try {
    entries = readDir(imageRootPath, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Image root not readable: ${imageRootPath} (${String(err?.message || err)})`);
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.toLowerCase() === SYNC_FOLDER_NAME) continue;

    const classified = classifyJpgFileName(entry.name);
    if (!classified) continue;

    const absPath = join(imageRootPath, entry.name);
    const fileStat = stat(absPath);
    const fileInfo = {
      file_name: entry.name,
      path: absPath,
      bytes: fileStat.size,
      modified_at: fileStat.mtime.toISOString(),
    };

    const stemKey = classified.stem.toLowerCase();
    if (classified.kind === "full") {
      fullByStem.set(stemKey, fileInfo);
    } else {
      thumbByStem.set(stemKey, fileInfo);
    }
  }

  return { fullByStem, thumbByStem };
}

/**
 * @param {Array<Record<string, string|null>>} slabs
 * @param {{ fullByStem: Map<string, object>, thumbByStem: Map<string, object> }} scan
 */
export function buildImageManifest({ slabs, scan, sourceXmlPath, imageRootPath }) {
  /** @type {Set<string>} */
  const matchedStemKeys = new Set();

  /** @type {Array<object>} */
  const manifestSlabs = slabs.map((slab) => {
    const stemKey = String(slab.SlabID).toLowerCase();
    const fullImage = scan.fullByStem.get(stemKey) ?? null;
    const thumbImage = scan.thumbByStem.get(stemKey) ?? null;

    if (fullImage || thumbImage) {
      matchedStemKeys.add(stemKey);
    }

    return {
      slab_id: slab.SlabID,
      inventory_id: slab.InventoryID ?? null,
      name: slab.Name ?? null,
      material: slab.Material ?? null,
      type: slab.Type ?? null,
      bundle: slab.Bundle ?? null,
      lot: slab.Lot ?? null,
      rack: slab.Rack ?? null,
      full_image: fullImage,
      thumb_image: thumbImage,
    };
  });

  /** @type {Array<object>} */
  const unmatchedImages = [];

  for (const [stemKey, fileInfo] of scan.fullByStem.entries()) {
    if (!matchedStemKeys.has(stemKey)) {
      unmatchedImages.push({ ...fileInfo, kind: "full" });
    }
  }
  for (const [stemKey, fileInfo] of scan.thumbByStem.entries()) {
    if (!matchedStemKeys.has(stemKey)) {
      unmatchedImages.push({ ...fileInfo, kind: "thumb" });
    }
  }

  unmatchedImages.sort((a, b) => a.file_name.localeCompare(b.file_name));

  const summary = summarizeImageManifest(manifestSlabs, unmatchedImages, scan);

  return {
    generated_at: new Date().toISOString(),
    source_xml_path: sourceXmlPath,
    image_root_path: imageRootPath,
    summary,
    slabs: manifestSlabs,
    unmatched_images: unmatchedImages,
  };
}

/**
 * @param {Array<object>} manifestSlabs
 * @param {Array<object>} unmatchedImages
 * @param {{ fullByStem: Map<string, object>, thumbByStem: Map<string, object> }} scan
 */
export function summarizeImageManifest(manifestSlabs, unmatchedImages, scan) {
  const fullImageCount = scan.fullByStem.size;
  const thumbImageCount = scan.thumbByStem.size;
  let matchedSlabImageCount = 0;
  let matchedFullAndThumbCount = 0;
  let missingFullImageCount = 0;
  let missingThumbImageCount = 0;

  /** @type {Array<object>} */
  const missingFullSamples = [];
  /** @type {Array<object>} */
  const missingThumbSamples = [];

  for (const slab of manifestSlabs) {
    const hasFull = Boolean(slab.full_image);
    const hasThumb = Boolean(slab.thumb_image);
    if (hasFull || hasThumb) matchedSlabImageCount += 1;
    if (hasFull && hasThumb) matchedFullAndThumbCount += 1;

    if (!hasFull) {
      missingFullImageCount += 1;
      if (missingFullSamples.length < SAMPLE_LIMIT) {
        missingFullSamples.push({
          slab_id: slab.slab_id,
          inventory_id: slab.inventory_id,
          name: slab.name,
        });
      }
    }
    if (!hasThumb) {
      missingThumbImageCount += 1;
      if (missingThumbSamples.length < SAMPLE_LIMIT) {
        missingThumbSamples.push({
          slab_id: slab.slab_id,
          inventory_id: slab.inventory_id,
          name: slab.name,
        });
      }
    }
  }

  const unmatchedImageFileCount = unmatchedImages.length;

  return {
    xml_slab_count: manifestSlabs.length,
    full_image_count: fullImageCount,
    thumb_image_count: thumbImageCount,
    matched_slab_image_count: matchedSlabImageCount,
    matched_full_and_thumb_count: matchedFullAndThumbCount,
    missing_full_image_count: missingFullImageCount,
    missing_thumb_image_count: missingThumbImageCount,
    unmatched_image_file_count: unmatchedImageFileCount,
    sample_missing_full_images: missingFullSamples,
    sample_missing_thumb_images: missingThumbSamples,
    sample_unmatched_images: unmatchedImages.slice(0, SAMPLE_LIMIT).map((img) => ({
      file_name: img.file_name,
      kind: img.kind,
    })),
  };
}

/**
 * @param {object} summary
 */
export function formatManifestSummaryLines(summary) {
  return [
    `xml_slab_count=${summary.xml_slab_count}`,
    `full_image_count=${summary.full_image_count}`,
    `thumb_image_count=${summary.thumb_image_count}`,
    `matched_slab_image_count=${summary.matched_slab_image_count}`,
    `matched_full_and_thumb_count=${summary.matched_full_and_thumb_count}`,
    `missing_full_image_count=${summary.missing_full_image_count}`,
    `missing_thumb_image_count=${summary.missing_thumb_image_count}`,
    `unmatched_image_file_count=${summary.unmatched_image_file_count}`,
    `sample_missing_full_images=${JSON.stringify(summary.sample_missing_full_images)}`,
    `sample_missing_thumb_images=${JSON.stringify(summary.sample_missing_thumb_images)}`,
    `sample_unmatched_images=${JSON.stringify(summary.sample_unmatched_images)}`,
  ];
}

/**
 * @param {object} params
 */
export function discoverImageManifest({
  xml,
  sourceXmlPath,
  imageRootPath,
  scanDeps = {},
}) {
  const slabs = parseSlabRecordsFromXml(xml);
  const scan = scanImageRoot(imageRootPath, scanDeps);
  return buildImageManifest({ slabs, scan, sourceXmlPath, imageRootPath });
}
