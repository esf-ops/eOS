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

export type PublicVisualizerConfig = {
  ok: boolean;
  publicVisualizerEnabled: boolean;
  renderEnabled: boolean;
  maxUploadMb: number;
  maxRendersPerIpPerHour: number;
  providerLabel: string | null;
  disclaimer: string;
};

export type VisualizerTexture = {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  collection?: string | null;
  group: string | null;
  colorFamily: string | null;
  patternType?: "veined" | "solid" | "speckled" | null;
  finish: string | null;
  thumbUrl: string;
  fullUrl: string;
  hasImage: boolean;
  active: boolean;
  source?: "static" | "elite100_visual_asset" | "cambria_visual_asset";
};

export type VisualizerTexturesResponse = {
  ok: boolean;
  textures: VisualizerTexture[];
  meta: TextureCatalogMeta & {
    finalCount?: number;
    staticCount?: number;
    elite100AssetCount?: number;
    elite100VisualAssetCount?: number;
    usesElite100Assets?: boolean;
    fallbackStaticOnly?: boolean;
    warning?: string | null;
    collections?: string[];
    skippedAssets?: Record<string, number>;
  };
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

export async function fetchPublicVisualizerConfig(): Promise<PublicVisualizerConfig> {
  return (await parseResponse(await fetch(joinUrl("/api/public-visualizer/config")))) as PublicVisualizerConfig;
}

export async function fetchPublicVisualizerTextures(): Promise<VisualizerTexturesResponse> {
  return (await parseResponse(
    await fetch(joinUrl("/api/public-visualizer/textures")),
  )) as VisualizerTexturesResponse;
}

export async function renderPublicVisualizer(params: {
  roomFile: File;
  materialId: string;
  userInstruction?: string;
}): Promise<VisualizerRenderResult> {
  const form = new FormData();
  form.append("roomImage", params.roomFile);
  form.append("materialId", params.materialId);
  if (params.userInstruction?.trim()) {
    form.append("userInstruction", params.userInstruction.trim());
  }

  return (await parseResponse(
    await fetch(joinUrl("/api/public-visualizer/render"), {
      method: "POST",
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
