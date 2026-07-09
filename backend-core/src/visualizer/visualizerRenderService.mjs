/**
 * visualizerRenderService — validate uploads and orchestrate provider render.
 * No database writes. No quote/inventory/catalog mutations.
 */
import { loadDemoTextureBytes } from "./visualizerTextureCatalog.mjs";
import { VISUALIZER_DISCLAIMER } from "./visualizerPrompt.mjs";
import { readRenderConfig, runVisualizerRender } from "./visualizerRenderProvider.mjs";

const SUPPORTED_ROOM_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * @param {string} mimeType
 */
function normalizeRoomMime(mimeType) {
  const m = String(mimeType ?? "").trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

/**
 * @param {{
 *   roomFile: { buffer: Buffer, mimeType: string, filename: string },
 *   materialId?: string|null,
 *   materialFile?: { buffer: Buffer, mimeType: string, filename: string }|null,
 *   userInstruction?: string|null,
 * }} input
 */
export async function executeVisualizerRender(input) {
  const cfg = readRenderConfig();
  if (!cfg.enabled) {
    throw Object.assign(new Error("Visualizer render is disabled. Set VISUALIZER_RENDER_ENABLED=1."), {
      statusCode: 503,
    });
  }

  const roomBuffer = input.roomFile?.buffer;
  if (!roomBuffer?.length) {
    throw Object.assign(new Error("roomImage is required"), { statusCode: 400 });
  }
  if (roomBuffer.length > cfg.maxUploadBytes) {
    throw Object.assign(new Error(`roomImage exceeds max upload size (${cfg.maxUploadBytes} bytes)`), {
      statusCode: 413,
    });
  }

  const roomMimeType = normalizeRoomMime(input.roomFile.mimeType);
  if (!SUPPORTED_ROOM_MIME.has(roomMimeType)) {
    throw Object.assign(new Error(`Unsupported roomImage MIME type: ${input.roomFile.mimeType}`), {
      statusCode: 400,
    });
  }

  let materialBuffer;
  let materialMimeType;
  let materialName;

  if (input.materialFile?.buffer?.length) {
    materialBuffer = input.materialFile.buffer;
    materialMimeType = normalizeRoomMime(input.materialFile.mimeType) || "image/jpeg";
    materialName = input.materialFile.filename || "Custom material";
    if (materialBuffer.length > cfg.maxUploadBytes) {
      throw Object.assign(new Error("materialImage exceeds max upload size"), { statusCode: 413 });
    }
  } else {
    const materialId = String(input.materialId ?? "").trim();
    if (!materialId) {
      throw Object.assign(new Error("materialId or materialImage is required"), { statusCode: 400 });
    }
    const loaded = loadDemoTextureBytes(materialId);
    materialBuffer = loaded.buffer;
    materialMimeType = loaded.mimeType;
    materialName = loaded.materialName;
  }

  const result = await runVisualizerRender({
    roomBuffer,
    roomMimeType,
    roomFilename: input.roomFile.filename || "room.jpg",
    materialBuffer,
    materialMimeType,
    materialName,
    userInstruction: input.userInstruction ?? null,
    modelName: cfg.modelName,
    apiKey: cfg.apiKey,
  });

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
