import { backendBaseUrl } from "./config";
import type { TextureCatalogMeta } from "./textureCatalog";

export class VisualizerApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "VisualizerApiError";
    this.status = status;
    this.body = body;
  }
}

function joinUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${backendBaseUrl()}${p}`;
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error" in json
        ? String((json as { error?: string }).error)
        : text.slice(0, 200);
    throw new VisualizerApiError(msg || `HTTP ${res.status}`, res.status, json ?? text);
  }
  return json;
}

export type VisualizerConfig = {
  ok: boolean;
  visualizerRenderEnabled: boolean;
  activeProvider: string;
  model: string;
  maxUploadMb: number;
  hasGeminiKey: boolean;
  hasOpenAiKey: boolean;
  supportedProviders: string[];
  disclaimer: string;
};

export type VisualizerTexture = {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  group: string | null;
  colorFamily: string | null;
  finish: string | null;
  sourceLabel: string | null;
  thumbUrl: string;
  fullUrl: string;
  hasImage: boolean;
  active: boolean;
};

export type VisualizerTexturesResponse = {
  ok: boolean;
  textures: VisualizerTexture[];
  meta: TextureCatalogMeta;
  disclaimer: string;
};

export type VisualizerRenderResult = {
  ok: boolean;
  renderedImage: string;
  renderedMimeType: string;
  originalFilename: string;
  materialName: string;
  provider: string;
  modelUsed: string;
  disclaimer: string;
};

export async function fetchVisualizerConfig(token: string): Promise<VisualizerConfig> {
  const t = token.trim();
  if (!t) throw new VisualizerApiError("Sign in required", 401, null);
  return (await parseResponse(
    await fetch(joinUrl("/api/visualizer/config"), {
      headers: { authorization: `Bearer ${t}` },
    }),
  )) as VisualizerConfig;
}

export async function fetchVisualizerTextures(token: string): Promise<VisualizerTexturesResponse> {
  const t = token.trim();
  if (!t) throw new VisualizerApiError("Sign in required", 401, null);
  return (await parseResponse(
    await fetch(joinUrl("/api/visualizer/textures"), {
      headers: { authorization: `Bearer ${t}` },
    }),
  )) as VisualizerTexturesResponse;
}

export async function renderVisualizer(params: {
  token: string;
  roomFile: File;
  materialId: string;
  userInstruction?: string;
}): Promise<VisualizerRenderResult> {
  const t = params.token.trim();
  if (!t) throw new VisualizerApiError("Sign in required", 401, null);

  const form = new FormData();
  form.append("roomImage", params.roomFile);
  form.append("materialId", params.materialId);
  if (params.userInstruction?.trim()) {
    form.append("userInstruction", params.userInstruction.trim());
  }

  return (await parseResponse(
    await fetch(joinUrl("/api/visualizer/render"), {
      method: "POST",
      headers: { authorization: `Bearer ${t}` },
      body: form,
    }),
  )) as VisualizerRenderResult;
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
