/**
 * geminiVisualizerRenderProvider — Gemini image-generation render for countertop visualization.
 *
 * Uses generateContent with responseModalities including IMAGE.
 * API key is never logged (passed as query param per Gemini API design).
 */
import { buildVisualizerPrompt } from "./visualizerPrompt.mjs";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const SUPPORTED_ROOM_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * @param {string} mimeType
 * @returns {string}
 */
function normalizeMime(mimeType) {
  const m = String(mimeType ?? "").trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

/**
 * @param {import("./visualizerRenderProvider.mjs").VisualizerRenderInput} input
 * @returns {Promise<import("./visualizerRenderProvider.mjs").VisualizerRenderOutput>}
 */
export async function geminiVisualizerRenderProvider(input) {
  const apiKey = String(input.apiKey ?? "").trim();
  if (!apiKey) {
    throw Object.assign(new Error("GEMINI_API_KEY is not configured — cannot run visualizer render."), {
      statusCode: 503,
    });
  }

  const roomMime = normalizeMime(input.roomMimeType);
  if (!SUPPORTED_ROOM_MIME.has(roomMime)) {
    throw Object.assign(new Error(`Unsupported room image type: ${input.roomMimeType}`), { statusCode: 400 });
  }

  const materialMime = normalizeMime(input.materialMimeType);
  const modelName = String(input.modelName ?? "gemini-2.0-flash-preview-image-generation").trim();
  const prompt = buildVisualizerPrompt({
    materialName: input.materialName,
    userInstruction: input.userInstruction,
  });

  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: roomMime,
              data: input.roomBuffer.toString("base64"),
            },
          },
          {
            inlineData: {
              mimeType: materialMime,
              data: input.materialBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.error?.message ??
      json?.message ??
      `Gemini visualizer render failed (${res.status})`;
    throw Object.assign(new Error(msg), { statusCode: res.status >= 500 ? 502 : 400 });
  }

  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  let imageBase64 = null;
  let imageMime = "image/png";

  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      imageBase64 = inline.data;
      imageMime = inline.mimeType ?? inline.mime_type ?? "image/png";
      break;
    }
  }

  if (!imageBase64) {
    throw Object.assign(
      new Error("Gemini returned no image in the response. Check VISUALIZER_RENDER_MODEL supports image output."),
      { statusCode: 502 },
    );
  }

  const renderedBuffer = Buffer.from(imageBase64, "base64");
  const dataUrl = `data:${imageMime};base64,${imageBase64}`;

  return {
    renderedBuffer,
    renderedDataUrl: dataUrl,
    renderedMimeType: imageMime,
    modelUsed: modelName,
    provider: "gemini",
  };
}
