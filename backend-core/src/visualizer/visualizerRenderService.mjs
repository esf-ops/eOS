/**
 * visualizerRenderService — validate uploads and orchestrate provider render.
 * No database writes. No quote/inventory/catalog mutations.
 */
import { findCatalogTexture, loadTextureBytes } from "./visualizerTextureCatalog.mjs";
import { VISUALIZER_DISCLAIMER } from "./visualizerPrompt.mjs";
import { readRenderConfig, runVisualizerRender } from "./visualizerRenderProvider.mjs";
import { readPublicRenderConfig } from "./publicVisualizerConfig.mjs";
import { loadPublicMaterialBytes } from "./publicVisualizerTextureService.mjs";

const SUPPORTED_ROOM_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const RENDER_TIMEOUT_MS = Number.parseInt(String(process.env.VISUALIZER_RENDER_TIMEOUT_MS ?? "120000"), 10) || 120000;

function normalizeRoomMime(mimeType) {
  const m = String(mimeType ?? "").trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

function formatUploadLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * @param {{
 *   roomFile: { buffer: Buffer, mimeType: string, filename: string },
 *   materialId?: string|null,
 *   materialFile?: { buffer: Buffer, mimeType: string, filename: string }|null,
 *   userInstruction?: string|null,
 * }} input
 * @param {{ channel?: "internal"|"public", getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null }} [options]
 */
export async function executeVisualizerRender(input, options = {}) {
  const channel = options.channel === "public" ? "public" : "internal";
  const internalCfg = readRenderConfig();
  const cfg =
    channel === "public"
      ? readPublicRenderConfig()
      : {
          publicSurfaceEnabled: true,
          renderEnabled: internalCfg.enabled,
          maxUploadBytes: internalCfg.maxUploadBytes,
          providerName: internalCfg.providerName,
          modelName: internalCfg.modelName,
          apiKey: internalCfg.apiKey,
        };

  if (channel === "public" && !cfg.publicSurfaceEnabled) {
    throw Object.assign(new Error("Public visualizer is temporarily unavailable."), {
      statusCode: 503,
      code: "PUBLIC_DISABLED",
    });
  }

  if (!cfg.renderEnabled) {
    const msg =
      channel === "public"
        ? "Concept rendering is temporarily unavailable. Please try again later."
        : "Visualizer render is disabled on the server. Set VISUALIZER_RENDER_ENABLED=1.";
    throw Object.assign(new Error(msg), { statusCode: 503, code: "RENDER_DISABLED" });
  }

  if (!cfg.apiKey) {
    throw Object.assign(
      new Error("Render service is not configured. Please try again later."),
      { statusCode: 503, code: "MISSING_API_KEY" },
    );
  }

  const roomBuffer = input.roomFile?.buffer;
  const maxUploadBytes = cfg.maxUploadBytes;
  if (!roomBuffer?.length) {
    throw Object.assign(new Error("Upload a room photo before generating."), { statusCode: 400, code: "MISSING_ROOM" });
  }
  if (roomBuffer.length > cfg.maxUploadBytes) {
    throw Object.assign(
      new Error(`Photo is too large. Maximum upload size is ${formatUploadLimit(cfg.maxUploadBytes)}.`),
      { statusCode: 413, code: "UPLOAD_TOO_LARGE" },
    );
  }

  const roomMimeType = normalizeRoomMime(input.roomFile.mimeType);
  if (!SUPPORTED_ROOM_MIME.has(roomMimeType)) {
    throw Object.assign(
      new Error("Unsupported photo type. Use JPEG, PNG, or WebP."),
      { statusCode: 400, code: "UNSUPPORTED_MIME" },
    );
  }

  let materialBuffer;
  let materialMimeType;
  let materialName;

  if (input.materialFile?.buffer?.length) {
    materialBuffer = input.materialFile.buffer;
    materialMimeType = normalizeRoomMime(input.materialFile.mimeType) || "image/jpeg";
    materialName = input.materialFile.filename || "Custom material";
    if (materialBuffer.length > cfg.maxUploadBytes) {
      throw Object.assign(new Error("Material image exceeds max upload size."), { statusCode: 413, code: "UPLOAD_TOO_LARGE" });
    }
  } else {
    const materialId = String(input.materialId ?? "").trim();
    if (!materialId) {
      throw Object.assign(new Error("Choose a countertop material before generating."), {
        statusCode: 400,
        code: "MISSING_MATERIAL",
      });
    }

    if (channel === "public") {
      const loaded = await loadPublicMaterialBytes(materialId, {
        getSupabase: options.getSupabase,
      });
      materialBuffer = loaded.buffer;
      materialMimeType = loaded.mimeType;
      materialName = loaded.materialName;
    } else {
      const catalogEntry = findCatalogTexture(materialId);
      if (!catalogEntry) {
        throw Object.assign(new Error(`Unknown material: ${materialId}`), { statusCode: 400, code: "UNKNOWN_MATERIAL" });
      }
      const loaded = loadTextureBytes(materialId);
      materialBuffer = loaded.buffer;
      materialMimeType = loaded.mimeType;
      materialName = loaded.materialName;
    }
  }

  let result;
  try {
    result = await Promise.race([
      runVisualizerRender({
        roomBuffer,
        roomMimeType,
        roomFilename: input.roomFile.filename || "room.jpg",
        materialBuffer,
        materialMimeType,
        materialName,
        userInstruction: input.userInstruction ?? null,
        modelName: cfg.modelName,
        apiKey: cfg.apiKey,
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            Object.assign(new Error("Visualizer render timed out. Try again in a moment."), {
              statusCode: 504,
              code: "RENDER_TIMEOUT",
            }),
          );
        }, RENDER_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes("no image") || msg.includes("No image")) {
      throw Object.assign(
        new Error("The render provider returned no image. Check VISUALIZER_RENDER_MODEL supports image output."),
        { statusCode: 502, code: "NO_IMAGE_RETURNED" },
      );
    }
    if (msg.includes("API key") || msg.includes("not configured")) {
      throw Object.assign(new Error(msg), { statusCode: 503, code: "PROVIDER_CONFIG" });
    }
    throw err;
  }

  return {
    renderedImage: result.renderedDataUrl,
    renderedMimeType: result.renderedMimeType,
    originalFilename: input.roomFile.filename || "room.jpg",
    materialName,
    provider: result.provider,
    modelUsed: result.modelUsed,
    disclaimer: VISUALIZER_DISCLAIMER,
  };
}
