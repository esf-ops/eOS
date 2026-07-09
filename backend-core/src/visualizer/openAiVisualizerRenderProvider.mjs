/**
 * openAiVisualizerRenderProvider — OpenAI image edit render for countertop visualization.
 *
 * Uses POST /v1/images/edits with the room photo and a detailed prompt.
 * Material reference is described in the prompt; optional second image support varies by model.
 */
import { buildVisualizerPrompt } from "./visualizerPrompt.mjs";

const OPENAI_IMAGES_EDITS_URL = "https://api.openai.com/v1/images/edits";

const SUPPORTED_ROOM_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/**
 * @param {string} mimeType
 * @returns {{ mime: string, ext: string }}
 */
function roomFileMeta(mimeType) {
  const m = String(mimeType ?? "").trim().toLowerCase();
  if (m === "image/png") return { mime: "image/png", ext: "png" };
  if (m === "image/webp") return { mime: "image/webp", ext: "webp" };
  return { mime: "image/jpeg", ext: "jpg" };
}

/**
 * @param {import("./visualizerRenderProvider.mjs").VisualizerRenderInput} input
 * @returns {Promise<import("./visualizerRenderProvider.mjs").VisualizerRenderOutput>}
 */
export async function openAiVisualizerRenderProvider(input) {
  const apiKey = String(input.apiKey ?? "").trim();
  if (!apiKey) {
    throw Object.assign(new Error("OPENAI_API_KEY is not configured — cannot run visualizer render."), {
      statusCode: 503,
    });
  }

  const roomMeta = roomFileMeta(input.roomMimeType);
  if (!SUPPORTED_ROOM_MIME.has(String(input.roomMimeType ?? "").toLowerCase()) &&
      !SUPPORTED_ROOM_MIME.has(roomMeta.mime)) {
    throw Object.assign(new Error(`Unsupported room image type: ${input.roomMimeType}`), { statusCode: 400 });
  }

  const modelName = String(input.modelName ?? "gpt-image-1").trim();
  const prompt = buildVisualizerPrompt({
    materialName: input.materialName,
    userInstruction: input.userInstruction,
  });

  const form = new FormData();
  form.append("model", modelName);
  form.append(
    "image",
    new Blob([input.roomBuffer], { type: roomMeta.mime }),
    `room.${roomMeta.ext}`,
  );
  if (input.materialBuffer?.length) {
    form.append(
      "image",
      new Blob([input.materialBuffer], { type: input.materialMimeType || "image/jpeg" }),
      "material.jpg",
    );
  }
  form.append("prompt", prompt);
  form.append("size", "1024x1024");

  const res = await fetch(OPENAI_IMAGES_EDITS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? `OpenAI visualizer render failed (${res.status})`;
    throw Object.assign(new Error(msg), { statusCode: res.status >= 500 ? 502 : 400 });
  }

  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    throw Object.assign(new Error("OpenAI returned no image data"), { statusCode: 502 });
  }

  const renderedBuffer = Buffer.from(b64, "base64");
  const renderedMimeType = "image/png";
  const dataUrl = `data:${renderedMimeType};base64,${b64}`;

  return {
    renderedBuffer,
    renderedDataUrl: dataUrl,
    renderedMimeType,
    modelUsed: modelName,
    provider: "openai",
  };
}
