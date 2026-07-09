/**
 * Public visualizer routes — customer-facing, no auth required.
 *
 * GET  /api/public-visualizer/config
 * GET  /api/public-visualizer/textures
 * POST /api/public-visualizer/render
 */
import express from "express";
import { parseMultipartForm } from "../slabsmith/multipartParse.mjs";
import { executeVisualizerRender } from "./visualizerRenderService.mjs";
import { VISUALIZER_DISCLAIMER } from "./visualizerPrompt.mjs";
import {
  readPublicVisualizerConfig,
  readSafePublicVisualizerConfig,
} from "./publicVisualizerConfig.mjs";
import {
  checkPublicRenderRateLimit,
  getRequestClientIp,
} from "./publicVisualizerRateLimit.mjs";
import { listPublicVisualizerTextures } from "./publicVisualizerTextureService.mjs";

/**
 * @param {import("express").Application} app
 * @param {{ getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null }} [opts]
 */
export function attachPublicVisualizerRoutes(app, opts = {}) {
  const getSupabase = typeof opts.getSupabase === "function" ? opts.getSupabase : () => null;
  app.get("/api/public-visualizer/config", (_req, res) => {
    try {
      const config = readSafePublicVisualizerConfig();
      if (!config.publicVisualizerEnabled) {
        return res.status(503).json({
          ok: false,
          error: "Public visualizer is temporarily unavailable.",
          ...config,
        });
      }
      return res.json({ ok: true, ...config });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  app.get("/api/public-visualizer/textures", async (_req, res) => {
    try {
      const pub = readPublicVisualizerConfig();
      if (!pub.enabled) {
        return res.status(503).json({
          ok: false,
          error: "Public visualizer is temporarily unavailable.",
          disclaimer: VISUALIZER_DISCLAIMER,
        });
      }
      const payload = await listPublicVisualizerTextures({ getSupabase });
      return res.json({ ok: true, ...payload, disclaimer: VISUALIZER_DISCLAIMER });
    } catch (e) {
      console.warn("[public-visualizer/textures] failed:", e?.message || String(e));
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  const pubCfg = () => readPublicVisualizerConfig();
  const maxMultipartBytes =
    (pubCfg().maxUploadMb > 0 ? pubCfg().maxUploadMb : 10) * 1024 * 1024 + 512 * 1024;
  const rawParser = express.raw({ type: () => true, limit: maxMultipartBytes });

  app.post("/api/public-visualizer/render", rawParser, async (req, res) => {
    try {
      const pub = readPublicVisualizerConfig();
      if (!pub.enabled) {
        return res.status(503).json({
          ok: false,
          error: "Public visualizer is temporarily unavailable.",
          disclaimer: VISUALIZER_DISCLAIMER,
        });
      }
      if (!pub.renderEnabled) {
        return res.status(503).json({
          ok: false,
          error: "Concept rendering is temporarily unavailable. Please try again later.",
          disclaimer: VISUALIZER_DISCLAIMER,
        });
      }

      const clientIp = getRequestClientIp(req);
      const rate = checkPublicRenderRateLimit(clientIp, pub.maxRendersPerIpPerHour);
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSec));
        return res.status(429).json({
          ok: false,
          error: "Too many visualizations from your connection. Please try again later.",
          retryAfterSec: rate.retryAfterSec,
          disclaimer: VISUALIZER_DISCLAIMER,
        });
      }

      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""), "utf8");
      if (!body.length) {
        return res.status(400).json({ ok: false, error: "Empty upload.", disclaimer: VISUALIZER_DISCLAIMER });
      }

      const uploadLimitMb = pub.maxUploadMb;
      const { fields, files } = parseMultipartForm(body, req.headers["content-type"], {
        maxFileBytes: uploadLimitMb * 1024 * 1024 + 512 * 1024,
      });

      const roomFile = files.roomImage;
      if (!roomFile?.buffer?.length) {
        return res.status(400).json({
          ok: false,
          error: "Upload a room photo before generating.",
          disclaimer: VISUALIZER_DISCLAIMER,
        });
      }

      if (files.materialImage?.buffer?.length) {
        return res.status(400).json({
          ok: false,
          error: "Custom material uploads are not supported on the public visualizer.",
          disclaimer: VISUALIZER_DISCLAIMER,
        });
      }

      const materialId = String(fields.materialId ?? "").trim() || null;
      const userInstruction = String(fields.userInstruction ?? "").trim() || null;

      const result = await executeVisualizerRender(
        {
          roomFile: {
            buffer: roomFile.buffer,
            mimeType: roomFile.mimeType,
            filename: roomFile.filename,
          },
          materialId,
          materialFile: null,
          userInstruction,
        },
        { channel: "public", getSupabase },
      );

      return res.json({ ok: true, ...result });
    } catch (e) {
      const status = Number(e?.statusCode) || 500;
      if (status >= 500) {
        console.error("[public-visualizer/render] failed:", e?.message || String(e));
      }
      const message =
        status >= 500
          ? "We could not generate your visualization right now. Please try again."
          : String(e?.message ?? e);
      return res.status(status).json({ ok: false, error: message, disclaimer: VISUALIZER_DISCLAIMER });
    }
  });

  console.log(
    "[public-visualizer] mounted GET /api/public-visualizer/config, GET /api/public-visualizer/textures, POST /api/public-visualizer/render",
  );
}
