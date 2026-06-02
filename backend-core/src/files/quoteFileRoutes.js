/**
 * Quote File Routes — signed upload/download intent + file list + lifecycle.
 *
 * Endpoints:
 *   POST /api/quote-files/upload-intent   — create a signed upload URL + quote_files metadata row
 *   POST /api/quote-files/confirm-upload  — confirm bytes reached storage; log 'uploaded' event
 *   POST /api/quote-files/download-url    — create a signed download URL for an existing file
 *   POST /api/quote-files/archive         — soft-archive a file (remove from default lists)
 *   GET  /api/quote-files                 — list files for a quote (?quoteId=...)
 *
 * All endpoints:
 *   - Require authentication (requireAuth middleware).
 *   - Require an authenticated organization context.
 *   - Are backed by service-role Supabase client (never anon key).
 *   - Never expose storage_path in the list response.
 *   - Log all access to quote_file_events.
 *
 * Hard boundaries: no pricing, no AI calls, no Internal Estimate UI, no Monday sync.
 */
import express from "express";
import {
  createQuoteFileUploadIntent,
  confirmQuoteFileUpload,
  createQuoteFileDownloadUrl,
  listQuoteFilesForQuote,
  archiveQuoteFile,
} from "./quoteFileService.mjs";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";

const jsonParser = express.json({ limit: "1mb" });

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachQuoteFileRoutes(app, { requireAuth, getSupabase }) {

  // ── POST /api/quote-files/upload-intent ────────────────────────────────────
  //
  // Creates a signed upload URL for a new quote file and persists the metadata row.
  // The client POSTs the file directly to Supabase Storage via the signed URL.
  //
  // Request body:
  //   originalFilename  string   required
  //   fileRole          string   required — see ALLOWED_FILE_ROLES
  //   mimeType          string   optional
  //   fileSizeBytes     number   optional — validated ≤ 50 MB if provided
  //   quoteId           uuid     optional — if provided, quote must belong to org
  //   takeoffJobId      uuid     optional — if provided, job must belong to org
  //   partnerAccountId  uuid     optional — for pre-quote partner scoping
  //   visibility        string   optional — 'internal' | 'partner' | 'customer' (default: internal)
  //
  // Response:
  //   { ok: true, quoteFileId, signedUploadUrl, uploadToken, expiresAt, safeFilename }
  //   Note: storagePath is included for staff debugging only (do not forward to customer UIs).
  //
  app.post("/api/quote-files/upload-intent", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const {
        originalFilename,
        fileRole,
        mimeType,
        fileSizeBytes,
        quoteId,
        takeoffJobId,
        partnerAccountId,
        visibility,
      } = body;

      const result = await createQuoteFileUploadIntent({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        originalFilename: String(originalFilename ?? "").trim(),
        fileRole: String(fileRole ?? "").trim(),
        mimeType: mimeType ? String(mimeType).trim() : null,
        fileSizeBytes: fileSizeBytes != null ? Number(fileSizeBytes) : null,
        quoteId: quoteId ? String(quoteId).trim() : null,
        takeoffJobId: takeoffJobId ? String(takeoffJobId).trim() : null,
        partnerAccountId: partnerAccountId ? String(partnerAccountId).trim() : null,
        visibility: String(visibility ?? "internal").trim(),
      });

      return res.status(201).json({
        ok: true,
        quoteFileId: result.quoteFileId,
        signedUploadUrl: result.signedUploadUrl,
        uploadToken: result.uploadToken,
        expiresAt: result.expiresAt,
        safeFilename: result.safeFilename,
        // storagePath included for internal staff tooling only:
        storagePath: result.storagePath,
      });
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({
        ok: false,
        error: String(e?.message ?? e),
        code,
        // Include quoteFileId if row was inserted before storage URL failed:
        ...(e.quoteFileId ? { quoteFileId: e.quoteFileId } : {}),
      });
    }
  });

  // ── POST /api/quote-files/confirm-upload ──────────────────────────────────
  //
  // Called by the client after a successful PUT to the signed upload URL.
  // Logs the 'uploaded' event in quote_file_events at the correct moment
  // (when bytes are confirmed in storage, not when intent was created).
  //
  // Request body:
  //   quoteFileId  uuid  required
  //
  // Response:
  //   { ok: true }
  //
  app.post("/api/quote-files/confirm-upload", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const quoteFileId = String(body.quoteFileId ?? "").trim();

      const result = await confirmQuoteFileUpload({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        quoteFileId,
      });

      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── POST /api/quote-files/download-url ────────────────────────────────────
  //
  // Generates a short-lived signed download URL for an existing quote file.
  // Verifies organization and file status before issuing URL.
  // Logs a 'downloaded' event in quote_file_events.
  //
  // Request body:
  //   quoteFileId  uuid  required
  //
  // Response:
  //   { ok: true, signedUrl, expiresAt, filename, mimeType, fileSizeBytes, fileRole, visibility }
  //   Note: storage_path is never returned.
  //
  app.post("/api/quote-files/download-url", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const quoteFileId = String(body.quoteFileId ?? "").trim();

      const result = await createQuoteFileDownloadUrl({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        quoteFileId,
      });

      return res.json({
        ok: true,
        signedUrl: result.signedUrl,
        expiresAt: result.expiresAt,
        filename: result.filename,
        mimeType: result.mimeType,
        fileSizeBytes: result.fileSizeBytes,
        fileRole: result.fileRole,
        visibility: result.visibility,
      });
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── POST /api/quote-files/archive ─────────────────────────────────────────
  //
  // Soft-archives a quote file. Sets status = 'archived' and logs the event.
  // File bytes are NOT deleted from Supabase Storage. Metadata row is preserved.
  // Archived files are excluded from normal list responses.
  //
  // Request body:
  //   quoteFileId  uuid  required
  //
  // Response:
  //   { ok: true }
  //
  app.post("/api/quote-files/archive", requireAuth(), jsonParser, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = req.user;

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const quoteFileId = String(body.quoteFileId ?? "").trim();

      const result = await archiveQuoteFile({
        supabase,
        organizationId: orgCtx.organizationId,
        userId: user?.id ?? null,
        quoteFileId,
      });

      return res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });

  // ── GET /api/quote-files ──────────────────────────────────────────────────
  //
  // Lists quote files for a given quote. Returns safe metadata only.
  // storage_path is never included in the response.
  //
  // Query params:
  //   quoteId          uuid     required
  //   includeArchived  boolean  optional — default false
  //
  // Response:
  //   { ok: true, quoteId, files: [{ id, originalFilename, fileRole, visibility, ... }] }
  //
  app.get("/api/quote-files", requireAuth(), async (req, res) => {
    try {
      const supabase = getSupabase();

      const orgCtx = await resolveOrganizationContext({ req, supabase, mode: "authenticated" });
      if (!orgCtx.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const quoteId = String(req.query.quoteId ?? "").trim();
      const includeArchived = String(req.query.includeArchived ?? "false").trim() === "true";

      const result = await listQuoteFilesForQuote({
        supabase,
        organizationId: orgCtx.organizationId,
        quoteId,
        includeArchived,
      });

      return res.json({ ok: true, ...result });
    } catch (e) {
      const status = e.statusCode ?? 500;
      const code = status < 500 ? "validation_error" : "server_error";
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), code });
    }
  });
}
