/**
 * Visualizer routes — standalone countertop concept visualization.
 *
 * Endpoints:
 *   GET  /api/visualizer/config    — safe provider config (no secrets)
 *   GET  /api/visualizer/textures  — static demo texture manifest
 *   POST /api/visualizer/render    — AI provider render (multipart)
 *
 * Isolation:
 *   - Separate from /api/takeoff/* and AI Takeoff job/result tables
 *   - No /api/slab-inventory/* calls
 *   - No quote, inventory, catalog, or estimate DB writes
 *   - Auth + requireHeadAccess("visualizer")
 */
import express from "express";
import { parseMultipartForm } from "../slabsmith/multipartParse.mjs";
import { readSafeRenderConfig } from "./visualizerRenderProvider.mjs";
import { listDemoTexturesForApi } from "./visualizerTextureCatalog.mjs";
import { executeVisualizerRender } from "./visualizerRenderService.mjs";
import { VISUALIZER_DISCLAIMER } from "./visualizerPrompt.mjs";

export const VISUALIZER_HEAD_SLUG = "visualizer";

/**
 * @param {import("express").Application} app
 * @param {{
 *   requireAuth: Function,
 *   headAccess?: Function,
 * }} deps
 */
export function attachVisualizerRoutes(app, { requireAuth, headAccess }) {
  const guardHead = typeof headAccess === "function" ? headAccess : (_req, _res, next) => next();
  const guard = [requireAuth(), guardHead];

  app.get("/api/visualizer/config", ...guard, (_req, res) => {
    try {
      const config = readSafeRenderConfig();
      return res.json({ ok: true, ...config, disclaimer: VISUALIZER_DISCLAIMER });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  app.get("/api/visualizer/textures", ...guard, (_req, res) => {
    try {
      return res.json({ ok: true, textures: listDemoTexturesForApi(), disclaimer: VISUALIZER_DISCLAIMER });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  const maxUploadMb = Number.parseInt(String(process.env.VISUALIZER_MAX_UPLOAD_MB ?? "10"), 10);
  const maxMultipartBytes = (Number.isFinite(maxUploadMb) && maxUploadMb > 0 ? maxUploadMb : 10) * 1024 * 1024 + 512 * 1024;
  const rawParser = express.raw({ type: () => true, limit: maxMultipartBytes });

  app.post("/api/visualizer/render", ...guard, rawParser, async (req, res) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""), "utf8");
      if (!body.length) {
        return res.status(400).json({ ok: false, error: "Empty multipart body" });
      }

      const { fields, files } = parseMultipartForm(body, req.headers["content-type"], {
        maxFileBytes: maxMultipartBytes,
      });

      const roomFile = files.roomImage;
      if (!roomFile?.buffer?.length) {
        return res.status(400).json({ ok: false, error: "roomImage file is required" });
      }

      const materialFile = files.materialImage ?? null;
      const materialId = String(fields.materialId ?? "").trim() || null;
      const userInstruction = String(fields.userInstruction ?? "").trim() || null;

      const result = await executeVisualizerRender({
        roomFile: {
          buffer: roomFile.buffer,
          mimeType: roomFile.mimeType,
          filename: roomFile.filename,
        },
        materialId,
        materialFile: materialFile
          ? {
              buffer: materialFile.buffer,
              mimeType: materialFile.mimeType,
              filename: materialFile.filename,
            }
          : null,
        userInstruction,
      });

      return res.json({ ok: true, ...result });
    } catch (e) {
      const status = Number(e?.statusCode) || 500;
      if (status >= 500) {
        console.error("[visualizer/render] failed:", e?.message || String(e));
      }
      return res.status(status).json({ ok: false, error: String(e?.message ?? e), disclaimer: VISUALIZER_DISCLAIMER });
    }
  });

  console.log("[visualizer] mounted GET /api/visualizer/config, GET /api/visualizer/textures, POST /api/visualizer/render");
}
