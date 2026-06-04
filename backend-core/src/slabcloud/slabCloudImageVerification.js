/**
 * slabCloudImageVerification — backend-only, write-gated verification of the
 * guessed SlabCloud image/thumbnail URLs stored in slab_images.
 *
 * SCOPE / SAFETY (read before extending):
 *   - READ-ONLY against SlabCloud: HEAD requests (with a lightweight Range GET
 *     fallback only when HEAD is not supported). NEVER downloads/stores image bytes.
 *   - No cookies, no Authorization headers, no tokens (assertNoAuthHeaders guards).
 *   - Updates ONLY slab_images (image_status, last_checked_at, updated_at).
 *   - NEVER updates slab_inventory. NEVER creates or deletes image rows.
 *   - NEVER marks slabs inactive. NEVER writes back to SlabCloud/Slabsmith.
 *   - No Supabase UPDATE unless SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED === "1".
 *
 * Both the Supabase client and the fetch implementation are injectable so this
 * is fully unit-testable without a real DB or network.
 */

import {
  buildRequestHeaders,
  assertNoAuthHeaders,
  mapWithConcurrency,
} from "./slabCloudClient.js";
import { TABLE_IMAGES, formatSupabaseError } from "./slabCloudPersistence.js";

export const IMAGE_VERIFY_WRITE_ENV = "SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED";

export const DEFAULT_VERIFY_LIMIT = 50;
export const DEFAULT_VERIFY_CONCURRENCY = 3;
export const DEFAULT_VERIFY_STATUS = "unknown";
export const DEFAULT_VERIFY_KIND = "thumbnail-first";
export const DEFAULT_VERIFY_TIMEOUT_MS = 15000;

const defaultNow = () => new Date().toISOString();

function wrapError(err) {
  if (err instanceof Error) return err;
  const wrapped = new Error(formatSupabaseError(err));
  wrapped.supabaseError = err;
  return wrapped;
}

/**
 * The image-verification write gate. Writes only when the env var is exactly "1".
 */
export function isImageVerifyWriteEnabled() {
  return String(process.env[IMAGE_VERIFY_WRITE_ENV] ?? "").trim() === "1";
}

/**
 * Choose which URL to verify for a row, based on the requested kind.
 *   thumbnail-first (default) | image-first | thumbnail | image
 * Returns null when no suitable URL is present.
 */
export function pickUrl(row, kind = DEFAULT_VERIFY_KIND) {
  if (!row) return null;
  const thumb = row.thumbnail_url || null;
  const full = row.image_url || null;
  switch (kind) {
    case "image":
      return full;
    case "thumbnail":
      return thumb;
    case "image-first":
      return full || thumb;
    case "thumbnail-first":
    default:
      return thumb || full;
  }
}

async function tryRequest(url, method, headers, timeoutMs, fetchImpl, cancelBody = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method,
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Never read the body. If a fallback GET pulled a stream, cancel it so we
    // don't buffer/download image bytes.
    if (cancelBody) {
      try {
        await res.body?.cancel?.();
      } catch {
        // best-effort
      }
    }
    return { ok: !!res.ok, status: res.status ?? null };
  } catch (err) {
    clearTimeout(timer);
    return {
      networkError: true,
      detail: err && err.name === "AbortError" ? "timeout" : err?.message || "network error",
    };
  }
}

/**
 * Verify a single URL. Returns:
 *   { status: "ok" | "missing" | "error" | "skipped", httpStatus, method, detail? }
 *
 * Strategy: HEAD first. Fall back to a Range:bytes=0-0 GET only when the server
 * reports HEAD is unsupported (405/501). Never downloads the full image.
 */
export async function verifyImageUrl(
  url,
  { fetchImpl = globalThis.fetch, headers, timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS } = {}
) {
  if (!url) return { status: "skipped", httpStatus: null, method: null };
  if (typeof fetchImpl !== "function") {
    return { status: "error", httpStatus: null, method: null, detail: "no fetch impl" };
  }
  const baseHeaders = headers || buildRequestHeaders();
  assertNoAuthHeaders(baseHeaders);

  // 1) HEAD
  const head = await tryRequest(url, "HEAD", baseHeaders, timeoutMs, fetchImpl);
  if (head.networkError) {
    return { status: "error", httpStatus: null, method: "HEAD", detail: head.detail };
  }
  if (head.ok) return { status: "ok", httpStatus: head.status, method: "HEAD" };
  if (head.status === 404 || head.status === 410) {
    return { status: "missing", httpStatus: head.status, method: "HEAD" };
  }

  // 2) Lightweight GET fallback ONLY when HEAD is unsupported.
  if (head.status === 405 || head.status === 501) {
    const rangeHeaders = { ...baseHeaders, Range: "bytes=0-0" };
    const get = await tryRequest(url, "GET", rangeHeaders, timeoutMs, fetchImpl, true);
    if (get.networkError) {
      return { status: "error", httpStatus: null, method: "GET", detail: get.detail };
    }
    if (get.ok) return { status: "ok", httpStatus: get.status, method: "GET" };
    if (get.status === 404 || get.status === 410) {
      return { status: "missing", httpStatus: get.status, method: "GET" };
    }
    return { status: "error", httpStatus: get.status, method: "GET" };
  }

  return { status: "error", httpStatus: head.status, method: "HEAD" };
}

/**
 * Load slab_images rows for an organization, scoped + filtered + limited.
 * statusFilter "all" disables the status filter.
 */
export async function loadImageRows(
  db,
  { organizationId, statusFilter = DEFAULT_VERIFY_STATUS, limit = DEFAULT_VERIFY_LIMIT }
) {
  let q = db.from(TABLE_IMAGES).select("*").eq("organization_id", organizationId);
  if (statusFilter && statusFilter !== "all") {
    q = q.eq("image_status", statusFilter);
  }
  const { data, error } = await q.limit(limit);
  if (error) throw wrapError(error);
  return Array.isArray(data) ? data : [];
}

/**
 * Build the slab_images update payload. Only status + timestamps — never touches
 * other columns, never adds new columns.
 */
export function buildImageStatusUpdate({ status, now = defaultNow }) {
  const ts = now();
  return {
    image_status: status,
    last_checked_at: ts,
    updated_at: ts,
  };
}

function emptyCounts() {
  return { checked: 0, ok: 0, missing: 0, error: 0, skipped: 0, written: 0 };
}

/**
 * Verify image URLs for an organization's slab_images rows and (optionally,
 * behind the write gate) update image_status.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.db
 * @param {string} params.organizationId
 * @param {string} [params.statusFilter]
 * @param {string} [params.kind]
 * @param {number} [params.limit]
 * @param {number} [params.concurrency]
 * @param {number} [params.timeoutMs]
 * @param {boolean} [params.writeEnabled] - defaults to env gate
 * @param {Function} [params.fetchImpl]
 * @param {() => string} [params.now]
 */
export async function verifySlabCloudImages({
  db = null,
  organizationId = null,
  statusFilter = DEFAULT_VERIFY_STATUS,
  kind = DEFAULT_VERIFY_KIND,
  limit = DEFAULT_VERIFY_LIMIT,
  concurrency = DEFAULT_VERIFY_CONCURRENCY,
  timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  writeEnabled = isImageVerifyWriteEnabled(),
  fetchImpl = globalThis.fetch,
  now = defaultNow,
} = {}) {
  // Reading Supabase requires a client + org id regardless of the write gate.
  if (!db) {
    throw new Error("verifySlabCloudImages: no Supabase client provided.");
  }
  if (!organizationId) {
    throw new Error("verifySlabCloudImages: organizationId is required.");
  }

  const rows = await loadImageRows(db, { organizationId, statusFilter, limit });
  const headers = buildRequestHeaders();
  const counts = emptyCounts();

  // Verify with bounded concurrency. Results preserve input order.
  const results = await mapWithConcurrency(rows, Math.max(1, concurrency), async (row) => {
    const url = pickUrl(row, kind);
    const verdict = await verifyImageUrl(url, { fetchImpl, headers, timeoutMs });
    return {
      id: row.id,
      external_slab_id: row.external_slab_id ?? null,
      checkedUrl: url,
      previousStatus: row.image_status ?? null,
      ...verdict,
    };
  });

  for (const r of results) {
    if (r.status === "skipped") {
      counts.skipped += 1;
      continue;
    }
    counts.checked += 1;
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  // Write path (gated). Sequential updates, scoped by id + organization_id.
  if (writeEnabled === true) {
    for (const r of results) {
      if (r.status === "skipped") continue;
      const payload = buildImageStatusUpdate({ status: r.status, now });
      const { error } = await db
        .from(TABLE_IMAGES)
        .update(payload)
        .eq("id", r.id)
        .eq("organization_id", organizationId);
      if (error) throw wrapError(error);
      counts.written += 1;
    }
  }

  return {
    mode: writeEnabled === true ? "write" : "dry-run",
    writeEnabled: writeEnabled === true,
    organizationId,
    statusFilter,
    kind,
    limit,
    concurrency,
    rowCount: rows.length,
    counts,
    results: results.map((r) => ({
      id: r.id,
      external_slab_id: r.external_slab_id,
      status: r.status,
      httpStatus: r.httpStatus ?? null,
      method: r.method ?? null,
    })),
  };
}
