/**
 * Secure Plan Viewer Phase 1 — authenticated attachment content for Studio.
 * Read-only. Never returns Graph/storage URLs or credentials.
 * Prefer stored quote_files bytes; fall back to Graph attachment GET (backend-only).
 */

import { createHash } from "node:crypto";
import {
  isQuoteIntakeGraphEnabled,
  isQuoteIntakeGraphManualSyncEnabled,
  readQuoteIntakeGraphCredentials,
  readQuoteIntakeGraphLimits
} from "../quoteIntake/quoteIntakeGraphConfig.mjs";
import { createQuoteIntakeGraphClient } from "../quoteIntake/quoteIntakeGraphClient.mjs";
import { QUOTE_FILE_BUCKET } from "../files/quoteFileStoragePath.mjs";

const PDF_MAGIC = Buffer.from("%PDF");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
/** WebP: RIFF....WEBP */
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_WEBP = Buffer.from("WEBP");

const DEFAULT_PREVIEW_MAX = 50 * 1024 * 1024;
const HARD_PREVIEW_MAX = 100 * 1024 * 1024;

/**
 * @param {string} message
 * @param {number} statusCode
 * @param {string} code
 */
export function planViewerError(message, statusCode, code) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

/**
 * @param {unknown} value
 * @param {number} [max]
 */
export function sanitizePlanFilename(value, max = 180) {
  let s = String(value ?? "plan")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\\/]+/g, "_")
    .replace(/["<>]+/g, "")
    .trim();
  if (!s) s = "plan";
  if (s.length > max) s = s.slice(0, max);
  return s;
}

/**
 * Content-Disposition filename token (quoted, CR/LF-safe).
 * @param {string} filename
 */
export function contentDispositionInline(filename) {
  const safe = sanitizePlanFilename(filename).replace(/"/g, "");
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_") || "plan";
  return `inline; filename="${ascii}"`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readPlanPreviewMaxBytes(env = process.env) {
  const raw = Number(env.QUOTE_INTAKE_MAX_PDF_BYTES || env.STUDIO_PLAN_PREVIEW_MAX_BYTES || DEFAULT_PREVIEW_MAX);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PREVIEW_MAX;
  return Math.min(Math.max(Math.floor(raw), 1024), HARD_PREVIEW_MAX);
}

/**
 * @param {Buffer} bytes
 * @param {{ declaredMime?: string|null, filename?: string|null }} hint
 * @returns {{ contentType: string, kind: 'pdf'|'png'|'jpeg'|'webp' }}
 */
export function validatePlanBytes(bytes, hint = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4) {
    throw planViewerError(
      "The file contents do not match the expected type.",
      400,
      "attachment_type_mismatch"
    );
  }
  const name = String(hint.filename || "").toLowerCase();
  const declared = String(hint.declaredMime || "").toLowerCase();

  if (bytes.subarray(0, 4).equals(PDF_MAGIC)) {
    if (declared && !declared.includes("pdf") && !/\.pdf$/i.test(name) && declared !== "application/octet-stream") {
      // Allow empty/generic declared type; reject clear mismatches (e.g. text/html).
      if (declared.includes("html") || declared.includes("svg") || declared.includes("javascript")) {
        throw planViewerError(
          "The file contents do not match the expected type.",
          400,
          "attachment_type_mismatch"
        );
      }
    }
    return { contentType: "application/pdf", kind: "pdf" };
  }

  if (bytes.length >= 8 && bytes.subarray(0, 4).equals(PNG_MAGIC)) {
    return { contentType: "image/png", kind: "png" };
  }
  if (bytes.subarray(0, 3).equals(JPEG_MAGIC)) {
    return { contentType: "image/jpeg", kind: "jpeg" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(WEBP_RIFF) &&
    bytes.subarray(8, 12).equals(WEBP_WEBP)
  ) {
    return { contentType: "image/webp", kind: "webp" };
  }

  throw planViewerError(
    declared.includes("pdf") || /\.pdf$/i.test(name)
      ? "The file contents do not match the expected type."
      : "This file type cannot be previewed securely.",
    declared.includes("pdf") || /\.pdf$/i.test(name) ? 400 : 415,
    declared.includes("pdf") || /\.pdf$/i.test(name)
      ? "attachment_type_mismatch"
      : "attachment_preview_not_supported"
  );
}

/**
 * Whether metadata alone suggests a previewable plan (before byte fetch).
 * @param {{ mimeType?: string|null, filename?: string|null, support?: string|null, contentType?: string|null, name?: string|null }} meta
 */
export function isPreviewSupportedMeta(meta = {}) {
  const support = String(meta.support || "");
  if (
    support === "direct_pdf" ||
    support === "direct_image_plan" ||
    support === "image_needs_review"
  ) {
    return support !== "too_large";
  }
  if (support === "too_large") return false;
  const mime = String(meta.mimeType || meta.contentType || "").toLowerCase();
  const name = String(meta.filename || meta.name || "").toLowerCase();
  if (mime.includes("pdf") || /\.pdf$/i.test(name)) return true;
  if (mime === "image/png" || /\.png$/i.test(name)) return true;
  if (mime === "image/jpeg" || mime === "image/jpg" || /\.jpe?g$/i.test(name)) return true;
  if (mime === "image/webp" || /\.webp$/i.test(name)) return true;
  return false;
}

/**
 * Safe headers for plan content responses.
 * @param {{ contentType: string, filename: string, sizeBytes: number }} meta
 */
export function planContentResponseHeaders(meta) {
  return {
    "Content-Type": meta.contentType,
    "Content-Disposition": contentDispositionInline(meta.filename),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "Content-Length": String(meta.sizeBytes)
  };
}

/**
 * @param {object} deps
 */
export function createStudioSecurePlanViewerService(deps = {}) {
  const env = deps.env ?? process.env;
  const repository = deps.quoteIntakeRepository || deps.repository;
  const getSupabase = deps.getSupabase || null;
  const graphClientInjected = deps.graphClient || null;
  const fetchImpl = deps.fetchImpl || deps.graphFetchImpl || undefined;
  const downloadStoredFile =
    deps.downloadStoredFile ||
    (async ({ organizationId, sha256 }) => {
      if (typeof getSupabase !== "function") return null;
      const supabase = getSupabase();
      if (!supabase) return null;
      const { data: rows, error } = await supabase
        .from("quote_files")
        .select("id,organization_id,storage_bucket,storage_path,status,original_filename,mime_type,file_size_bytes,file_hash")
        .eq("organization_id", organizationId)
        .eq("file_hash", sha256)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error || !rows?.[0]) return null;
      const file = rows[0];
      if (String(file.organization_id) !== String(organizationId)) return null;
      const bucket = file.storage_bucket || QUOTE_FILE_BUCKET;
      const { data: blob, error: dlErr } = await supabase.storage
        .from(bucket)
        .download(file.storage_path);
      if (dlErr || !blob) return null;
      const ab = await blob.arrayBuffer();
      return {
        bytes: Buffer.from(ab),
        filename: file.original_filename || "plan.pdf",
        declaredMime: file.mime_type || null,
        source: "stored"
      };
    });

  function assertOrg(organizationId) {
    const org = String(organizationId || "").trim();
    if (!org) {
      throw planViewerError("You do not have access to this plan.", 403, "plan_view_not_authorized");
    }
    return org;
  }

  function graphClientOrNull() {
    if (graphClientInjected) return graphClientInjected;
    if (!isQuoteIntakeGraphEnabled(env) || !isQuoteIntakeGraphManualSyncEnabled(env)) {
      return null;
    }
    try {
      const credentials = readQuoteIntakeGraphCredentials(env);
      const limits = readQuoteIntakeGraphLimits(env);
      return createQuoteIntakeGraphClient({
        mailbox: credentials.mailbox,
        credentials,
        fetchImpl,
        timeoutMs: limits.timeoutMs
      });
    } catch {
      return null;
    }
  }

  /**
   * Fetch attachment bytes from Graph (attachment GET only — never message PATCH).
   * Does not send mark-read / move / delete operations.
   */
  async function fetchFromGraph(messageId, attachmentId) {
    const client = graphClientOrNull();
    if (!client) {
      throw planViewerError(
        "The attachment is known, but its contents are temporarily unavailable.",
        503,
        "attachment_content_unavailable"
      );
    }
    const mid = String(messageId || "").trim();
    const aid = String(attachmentId || "").trim();
    if (!mid || !aid || mid.length > 2048 || aid.length > 2048) {
      throw planViewerError("The attachment could not be found.", 404, "attachment_not_found");
    }
    let att;
    try {
      att = await client.getAttachment(mid, aid);
    } catch (e) {
      const code = String(e?.code || "");
      if (code === "message_not_found" || Number(e?.statusCode) === 404) {
        throw planViewerError(
          "The attachment is known, but its contents are temporarily unavailable.",
          404,
          "attachment_content_unavailable"
        );
      }
      if (code === "graph_throttled" || code === "graph_timeout" || code === "graph_unavailable") {
        throw planViewerError(
          "The mailbox could not be reached.",
          Number(e?.statusCode) || 503,
          code === "graph_timeout" ? "mailbox_unavailable" : "mailbox_unavailable"
        );
      }
      throw planViewerError(
        "The attachment is known, but its contents are temporarily unavailable.",
        503,
        "attachment_content_unavailable"
      );
    }
    const b64 = att?.contentBytes;
    if (!b64 || typeof b64 !== "string") {
      throw planViewerError(
        "The attachment is known, but its contents are temporarily unavailable.",
        503,
        "attachment_content_unavailable"
      );
    }
    let bytes;
    try {
      bytes = Buffer.from(b64, "base64");
    } catch {
      throw planViewerError(
        "The file contents do not match the expected type.",
        400,
        "attachment_type_mismatch"
      );
    }
    return {
      bytes,
      filename: att?.name || "plan",
      declaredMime: att?.contentType || null,
      source: "graph"
    };
  }

  function enforceSize(bytes) {
    const max = readPlanPreviewMaxBytes(env);
    if (bytes.length > max) {
      throw planViewerError(
        "This file is too large for the current secure viewer.",
        413,
        "attachment_too_large_for_preview"
      );
    }
  }

  /**
   * Finalize validated content payload (never includes URLs/tokens).
   */
  function finalize(raw, hintFilename) {
    enforceSize(raw.bytes);
    const validated = validatePlanBytes(raw.bytes, {
      declaredMime: raw.declaredMime,
      filename: hintFilename || raw.filename
    });
    const filename = sanitizePlanFilename(hintFilename || raw.filename || `plan.${validated.kind}`);
    return {
      bytes: raw.bytes,
      contentType: validated.contentType,
      kind: validated.kind,
      filename,
      sizeBytes: raw.bytes.length,
      source: raw.source,
      sha256: createHash("sha256").update(raw.bytes).digest("hex"),
      headers: planContentResponseHeaders({
        contentType: validated.contentType,
        filename,
        sizeBytes: raw.bytes.length
      })
    };
  }

  /**
   * Shared Inbox path: messageKey + attachmentKey (Graph ImmutableIds).
   * Prefer stored intake file when the message was imported and Open Estimate ingested bytes.
   */
  async function getSharedInboxAttachmentContent({
    organizationId,
    messageKey,
    attachmentKey
  }) {
    const org = assertOrg(organizationId);
    const mid = String(messageKey || "").trim();
    const aid = String(attachmentKey || "").trim();
    if (!mid || !aid) {
      throw planViewerError("The attachment could not be found.", 404, "attachment_not_found");
    }

    // Prefer stored copy when intake case exists for this message in this org.
    if (repository && typeof repository.findCaseBySourceKeys === "function") {
      const existing = await repository.findCaseBySourceKeys(org, {
        graphMessageId: mid
      });
      if (existing?.id) {
        const caseRow = await repository.getCase(org, existing.id);
        if (caseRow && String(caseRow.organizationId || caseRow.organization_id) === org) {
          const atts = Array.isArray(caseRow.attachments) ? caseRow.attachments : [];
          const hit = atts.find(
            (a) => String(a.sourceAttachmentId || a.source_attachment_id || "") === aid
          );
          if (hit) {
            if (!isPreviewSupportedMeta({
              support: hit.support || hit.supportClassification,
              mimeType: hit.mimeType,
              filename: hit.safeFilename || hit.filename
            })) {
              throw planViewerError(
                "This file type cannot be previewed securely.",
                415,
                "attachment_preview_not_supported"
              );
            }
            const sha = String(hit.sha256 || "").trim().toLowerCase();
            if (/^[a-f0-9]{64}$/.test(sha)) {
              const stored = await downloadStoredFile({ organizationId: org, sha256: sha });
              if (stored) {
                return finalize(stored, hit.safeFilename || hit.filename || stored.filename);
              }
            }
            // Fall through to Graph using stored provider ids when possible.
            const providerMid = String(
              hit.providerMessageId ||
                caseRow.sourceMessage?.graphImmutableMessageId ||
                mid
            ).trim();
            const raw = await fetchFromGraph(providerMid, aid);
            return finalize(raw, hit.safeFilename || hit.filename || raw.filename);
          }
        }
      }
    }

    // Unimported (or no matching attachment row): Graph only. Viewing does not import.
    const raw = await fetchFromGraph(mid, aid);
    // Reject unsupported by magic after fetch.
    return finalize(raw, raw.filename);
  }

  /**
   * Intake-case path: attachment must belong to the case in this org.
   */
  async function getIntakeAttachmentContent({
    organizationId,
    intakeCaseId,
    attachmentId
  }) {
    const org = assertOrg(organizationId);
    if (!repository) {
      throw planViewerError("The attachment could not be found.", 404, "attachment_not_found");
    }
    const caseId = String(intakeCaseId || "").trim();
    const attId = String(attachmentId || "").trim();
    if (!caseId || !attId) {
      throw planViewerError("The attachment could not be found.", 404, "attachment_not_found");
    }
    const caseRow = await repository.getCase(org, caseId);
    if (!caseRow || String(caseRow.organizationId || caseRow.organization_id) !== org) {
      throw planViewerError("The attachment could not be found.", 404, "attachment_not_found");
    }
    const atts = Array.isArray(caseRow.attachments) ? caseRow.attachments : [];
    const hit =
      atts.find((a) => String(a.id || "") === attId) ||
      atts.find((a) => String(a.sourceAttachmentId || "") === attId);
    if (!hit) {
      throw planViewerError("The attachment could not be found.", 404, "attachment_not_found");
    }
    if (
      !isPreviewSupportedMeta({
        support: hit.support || hit.supportClassification,
        mimeType: hit.mimeType,
        filename: hit.safeFilename || hit.filename
      })
    ) {
      throw planViewerError(
        "This file type cannot be previewed securely.",
        415,
        "attachment_preview_not_supported"
      );
    }

    const sha = String(hit.sha256 || "").trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(sha)) {
      const stored = await downloadStoredFile({ organizationId: org, sha256: sha });
      if (stored) {
        return finalize(stored, hit.safeFilename || hit.filename || stored.filename);
      }
    }

    const providerMid = String(
      hit.providerMessageId || caseRow.sourceMessage?.graphImmutableMessageId || ""
    ).trim();
    const sourceAid = String(hit.sourceAttachmentId || "").trim();
    if (!providerMid || !sourceAid) {
      throw planViewerError(
        "The attachment is known, but its contents are temporarily unavailable.",
        503,
        "attachment_content_unavailable"
      );
    }
    const raw = await fetchFromGraph(providerMid, sourceAid);
    return finalize(raw, hit.safeFilename || hit.filename || raw.filename);
  }

  /**
   * Safe metadata list for Estimate workspace Source & Plan bar.
   */
  async function listIntakeSourcePlans({ organizationId, intakeCaseId }) {
    const org = assertOrg(organizationId);
    if (!repository) {
      return { ok: true, plans: [], sourceLabel: "No plan attached" };
    }
    const caseId = String(intakeCaseId || "").trim();
    const caseRow = await repository.getCase(org, caseId);
    if (!caseRow || String(caseRow.organizationId || caseRow.organization_id) !== org) {
      throw planViewerError("The attachment could not be found.", 404, "attachment_not_found");
    }
    const sourceType = String(caseRow.sourceType || caseRow.source_type || "");
    const isManual = sourceType === "manual";
    const atts = Array.isArray(caseRow.attachments) ? caseRow.attachments : [];
    const plans = atts
      .filter((a) =>
        isPreviewSupportedMeta({
          support: a.support || a.supportClassification,
          mimeType: a.mimeType,
          filename: a.safeFilename || a.filename
        })
      )
      .map((a) => ({
        attachmentId: a.id || null,
        attachmentKey: a.sourceAttachmentId || null,
        messageKey:
          a.providerMessageId || caseRow.sourceMessage?.graphImmutableMessageId || null,
        filename: sanitizePlanFilename(a.safeFilename || a.filename || "plan.pdf"),
        contentType: a.mimeType || null,
        sizeBytes: Number.isFinite(Number(a.sizeBytes)) ? Number(a.sizeBytes) : null,
        previewSupported: true,
        primary: true
      }));
    if (plans.length > 1) {
      plans.forEach((p, i) => {
        p.primary = i === 0;
      });
    }
    return {
      ok: true,
      intakeCaseId: caseId,
      sourceType: sourceType || null,
      sourceLabel: isManual
        ? "Manual estimate"
        : sourceType === "graph_mailbox"
          ? "Shared Inbox request"
          : "Estimate request",
      receivedAt: caseRow.receivedAt || caseRow.received_at || caseRow.createdAt || null,
      plans,
      noPlan: plans.length === 0
    };
  }

  return {
    getSharedInboxAttachmentContent,
    getIntakeAttachmentContent,
    listIntakeSourcePlans,
    graphClientOrNull
  };
}

export const _planViewerTestHelpers = {
  validatePlanBytes,
  sanitizePlanFilename,
  contentDispositionInline,
  isPreviewSupportedMeta,
  readPlanPreviewMaxBytes,
  planContentResponseHeaders,
  PDF_MAGIC,
  PNG_MAGIC,
  JPEG_MAGIC
};
