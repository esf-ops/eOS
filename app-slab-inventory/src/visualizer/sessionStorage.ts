import type {
  ExportMeta,
  VisualizerMask,
  VisualizerSession,
  VisualizerSessionSummary,
  MaskSettings,
} from "./types";
import { SESSION_STORAGE_KEY } from "./types";

type StoredSessions = Record<string, VisualizerSession>;

function readStore(): StoredSessions {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSessions;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: StoredSessions) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store));
}

export function listVisualizerSessions(): VisualizerSessionSummary[] {
  const store = readStore();
  return Object.entries(store)
    .map(([id, session]) => ({
      id,
      name: session.name,
      savedAt: session.savedAt,
      hasPhoto: Boolean(session.photoDataUrl),
      maskCount: session.masks.length,
      primaryColor: session.masks[0]?.textureSlug ?? null,
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export type SaveSessionInput = {
  name: string;
  photoDataUrl: string | null;
  photoSource: "upload" | "sample";
  sampleId: string | null;
  masks: VisualizerMask[];
  defaultSettings: MaskSettings;
  favoriteSlugs: string[];
  exportMeta: ExportMeta;
};

const MAX_PHOTO_DATA_URL_BYTES = 4 * 1024 * 1024;

export function saveVisualizerSession(input: SaveSessionInput): { id: string; photoOmitted: boolean } {
  const id = crypto.randomUUID();
  let photoDataUrl = input.photoDataUrl;
  let photoOmitted = false;

  if (photoDataUrl && photoDataUrl.length > MAX_PHOTO_DATA_URL_BYTES) {
    photoDataUrl = null;
    photoOmitted = true;
  }

  const session: VisualizerSession = {
    version: 1,
    savedAt: new Date().toISOString(),
    name: input.name.trim() || "Untitled session",
    photoDataUrl,
    photoSource: input.photoSource,
    sampleId: input.sampleId,
    masks: input.masks,
    defaultSettings: input.defaultSettings,
    favoriteSlugs: input.favoriteSlugs,
    exportMeta: input.exportMeta,
  };

  const store = readStore();
  store[id] = session;
  writeStore(store);
  return { id, photoOmitted };
}

export function loadVisualizerSession(id: string): VisualizerSession | null {
  const store = readStore();
  return store[id] ?? null;
}

export function deleteVisualizerSession(id: string) {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

export async function photoToDataUrl(
  photo: HTMLImageElement,
  maxBytes = MAX_PHOTO_DATA_URL_BYTES,
): Promise<string | null> {
  const oc = document.createElement("canvas");
  oc.width = photo.naturalWidth;
  oc.height = photo.naturalHeight;
  const ctx = oc.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(photo, 0, 0);
  let quality = 0.92;
  let dataUrl = oc.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxBytes && quality > 0.45) {
    quality -= 0.08;
    dataUrl = oc.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > maxBytes) return null;
  return dataUrl;
}

export function buildExportSummary(
  exportMeta: ExportMeta,
  colorName: string | null,
  materialName: string | null,
): string {
  const lines = [
    "Elite Stone Visualizer Preview",
    exportMeta.projectName ? `Project: ${exportMeta.projectName}` : null,
    exportMeta.customerName ? `Customer: ${exportMeta.customerName}` : null,
    colorName ? `Color: ${colorName}` : null,
    materialName ? `Material: ${materialName}` : null,
    exportMeta.note ? `Note: ${exportMeta.note}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
