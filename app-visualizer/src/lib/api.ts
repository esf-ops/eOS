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

function prefersShareSheet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua);
  const ipadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return ios || ipadOs;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) {
    throw new Error("Could not prepare this photo for saving.");
  }
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mime = /data:([^;,]+)/.exec(header)?.[1] || "image/png";
  const binary = /;base64/i.test(header) ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

/**
 * Save a rendered preview during the click that asked for it.
 * Waiting on fetch() first drops the browser's permission to start a download,
 * and a sandboxed kiosk frame blocks the click entirely unless the parent allows downloads.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], filename, { type: blob.type || "image/png" });

  if (prefersShareSheet() && navigator.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file], title: "Countertop preview" }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      triggerBlobDownload(blob, filename);
    });
    return;
  }

  triggerBlobDownload(blob, filename);
}
