/**
 * image-upload.mjs — plan and upload Slabsmith image pairs via backend-core.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { postMultipartWithNodeHttp } from "./image-upload-http.mjs";

export const IMAGE_UPLOAD_STATE_FILE = "image-upload-state.json";
export const IMAGE_UPLOAD_ROUTE = "/api/integrations/slabsmith/inventory/images";
export const UPLOAD_STATE_VERSION = 1;

/**
 * @param {object} slab
 */
export function isUploadablePair(slab) {
  return Boolean(slab?.full_image && slab?.thumb_image && slab?.slab_id);
}

/**
 * @param {object} pair
 */
export function buildUploadFingerprint(pair) {
  return {
    slab_id: pair.slab_id,
    inventory_id: pair.inventory_id ?? null,
    full_bytes: pair.full_image?.bytes ?? 0,
    full_modified_at: pair.full_image?.modified_at ?? null,
    thumb_bytes: pair.thumb_image?.bytes ?? 0,
    thumb_modified_at: pair.thumb_image?.modified_at ?? null,
  };
}

/**
 * @param {object|null|undefined} prev
 * @param {object} fingerprint
 */
export function isUnchangedUpload(prev, fingerprint) {
  if (!prev || prev.last_status !== "uploaded") return false;
  return (
    prev.full_bytes === fingerprint.full_bytes &&
    prev.full_modified_at === fingerprint.full_modified_at &&
    prev.thumb_bytes === fingerprint.thumb_bytes &&
    prev.thumb_modified_at === fingerprint.thumb_modified_at
  );
}

/**
 * @param {object} manifest
 * @param {object|null} state
 * @param {{ slabIdFilter?: string|null, limit?: number|null }} [opts]
 */
export function planImageUploads(manifest, state, opts = {}) {
  const slabIdFilter = opts.slabIdFilter ? String(opts.slabIdFilter).trim().toLowerCase() : null;
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? opts.limit : null;

  /** @type {Array<object>} */
  const uploadable = [];
  /** @type {Array<object>} */
  const skippedUnchanged = [];
  let missingImageCount = manifest.summary?.missing_full_image_count ?? 0;
  let unmatchedImageCount = manifest.summary?.unmatched_image_file_count ?? 0;

  for (const slab of manifest.slabs ?? []) {
    if (slabIdFilter && String(slab.slab_id).toLowerCase() !== slabIdFilter) {
      continue;
    }
    if (!isUploadablePair(slab)) continue;

    const fingerprint = buildUploadFingerprint(slab);
    const prev = state?.uploads?.[String(slab.slab_id).toLowerCase()] ?? null;
    if (isUnchangedUpload(prev, fingerprint)) {
      skippedUnchanged.push({ slab_id: slab.slab_id, inventory_id: slab.inventory_id });
      continue;
    }
    uploadable.push({ ...slab, fingerprint });
    if (limit && uploadable.length >= limit) break;
  }

  return {
    planned_upload_count: uploadable.length,
    skipped_unchanged_count: skippedUnchanged.length,
    missing_image_count: missingImageCount,
    unmatched_image_count: unmatchedImageCount,
    uploadable,
    skipped_unchanged: skippedUnchanged,
  };
}

/**
 * @param {string} logDir
 */
export function loadUploadState(logDir) {
  if (!logDir) return { version: UPLOAD_STATE_VERSION, uploads: {} };
  const path = join(logDir, IMAGE_UPLOAD_STATE_FILE);
  if (!existsSync(path)) {
    return { version: UPLOAD_STATE_VERSION, uploads: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      version: UPLOAD_STATE_VERSION,
      uploads: parsed?.uploads && typeof parsed.uploads === "object" ? parsed.uploads : {},
    };
  } catch {
    return { version: UPLOAD_STATE_VERSION, uploads: {} };
  }
}

/**
 * @param {string} logDir
 * @param {object} state
 */
export function saveUploadState(logDir, state) {
  if (!logDir) return;
  const path = join(logDir, IMAGE_UPLOAD_STATE_FILE);
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/**
 * @param {object} params
 */
export function buildMultipartUploadBody({ slab, fullBuffer, thumbBuffer }) {
  const boundary = `----eliteos-slabsmith-${Date.now().toString(16)}`;
  /** @type {Buffer[]} */
  const chunks = [];
  const fields = {
    slab_id: slab.slab_id,
    inventory_id: slab.inventory_id ?? "",
    full_modified_at: slab.full_image?.modified_at ?? "",
    thumb_modified_at: slab.thumb_image?.modified_at ?? "",
    full_bytes: String(slab.full_image?.bytes ?? fullBuffer.length),
    thumb_bytes: String(slab.thumb_image?.bytes ?? thumbBuffer.length),
  };

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    );
  }

  for (const [fieldName, filename, buffer] of [
    ["full_image", "full.jpg", fullBuffer],
    ["thumb_image", "thumb.jpg", thumbBuffer],
  ]) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`
      )
    );
    chunks.push(buffer);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * @param {object} params
 */
export async function uploadImagePair({
  backendBaseUrl,
  syncToken,
  slab,
  readFile = readFileSync,
  postMultipart = postMultipartWithNodeHttp,
}) {
  const fullBuffer = readFile(slab.full_image.path);
  const thumbBuffer = readFile(slab.thumb_image.path);
  const multipart = buildMultipartUploadBody({ slab, fullBuffer, thumbBuffer });

  const { status, body } = await postMultipart({
    backendBaseUrl,
    syncToken,
    routePath: IMAGE_UPLOAD_ROUTE,
    body: multipart.body,
    contentType: multipart.contentType,
  });

  return { status, body };
}

/**
 * @param {object} params
 */
export async function runImageUploads({
  plan,
  backendBaseUrl,
  syncToken,
  logDir,
  state,
  dryRun,
  uploadPair = uploadImagePair,
  saveState = saveUploadState,
}) {
  let uploadedCount = 0;
  let failedCount = 0;
  /** @type {Array<object>} */
  const failures = [];

  if (dryRun) {
    return {
      planned_upload_count: plan.planned_upload_count,
      skipped_unchanged_count: plan.skipped_unchanged_count,
      uploaded_count: 0,
      failed_count: 0,
      missing_image_count: plan.missing_image_count,
      unmatched_image_count: plan.unmatched_image_count,
      dry_run: true,
      failures,
    };
  }

  for (const slab of plan.uploadable) {
    try {
      const { status, body } = await uploadPair({
        backendBaseUrl,
        syncToken,
        slab,
      });

      const ok =
        status < 400 &&
        body?.ok !== false &&
        (body?.status === "uploaded" || body?.status === "skipped_no_inventory_match");

      const key = String(slab.slab_id).toLowerCase();
      state.uploads[key] = {
        ...slab.fingerprint,
        last_upload_at: new Date().toISOString(),
        last_status: body?.status ?? (ok ? "uploaded" : "failed"),
        last_http_status: status,
      };

      if (body?.status === "uploaded") {
        uploadedCount += 1;
      } else if (body?.status === "skipped_no_inventory_match") {
        // Non-fatal; keep going.
      } else if (!ok) {
        failedCount += 1;
        failures.push({
          slab_id: slab.slab_id,
          inventory_id: slab.inventory_id,
          error: body?.error ?? `HTTP ${status}`,
        });
      }
    } catch (err) {
      failedCount += 1;
      failures.push({
        slab_id: slab.slab_id,
        inventory_id: slab.inventory_id,
        error: String(err?.message || err),
      });
    }
  }

  saveState(logDir, state);

  return {
    planned_upload_count: plan.planned_upload_count,
    skipped_unchanged_count: plan.skipped_unchanged_count,
    uploaded_count: uploadedCount,
    failed_count: failedCount,
    missing_image_count: plan.missing_image_count,
    unmatched_image_count: plan.unmatched_image_count,
    dry_run: false,
    failures: failures.slice(0, 10),
  };
}

/**
 * @param {object} summary
 */
export function formatUploadSummaryLines(summary) {
  return [
    `planned_upload_count=${summary.planned_upload_count}`,
    `skipped_unchanged_count=${summary.skipped_unchanged_count}`,
    `uploaded_count=${summary.uploaded_count}`,
    `failed_count=${summary.failed_count}`,
    `missing_image_count=${summary.missing_image_count}`,
    `unmatched_image_count=${summary.unmatched_image_count}`,
    summary.dry_run ? "mode=dry-run-plan" : "mode=upload",
    summary.failures?.length
      ? `sample_failures=${JSON.stringify(summary.failures)}`
      : "sample_failures=[]",
  ];
}
