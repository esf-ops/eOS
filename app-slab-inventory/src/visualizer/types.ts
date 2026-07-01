import type { Elite100VisualizerTexture } from "../lib/elite100VisualizerTextures";

export type NormPoint = { nx: number; ny: number };
export type TextureRenderMode = "cover" | "repeat";
export type WorkspaceMode = "drawing" | "editing" | "preview";

export type MaskSettings = {
  textureSlug: string;
  opacity: number;
  textureMode: TextureRenderMode;
  textureScale: number;
  textureRotation: number;
  textureOffsetX: number;
  textureOffsetY: number;
  feather: number;
  brightness: number;
  contrast: number;
  saturation: number;
  lightingStrength: number;
};

export type VisualizerMask = {
  id: string;
  label: string;
  points: NormPoint[];
  visible: boolean;
} & MaskSettings;

export type SceneInput = {
  photo: HTMLImageElement;
  masks: VisualizerMask[];
  textureImages: Map<string, HTMLImageElement>;
  draftPoints: NormPoint[];
  isDrawing: boolean;
  activeMaskId: string | null;
  showMaskOutlines: boolean;
  renderTextures: boolean;
};

export type VisualizerSample = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  accent: string;
};

export type ExportMeta = {
  projectName: string;
  customerName: string;
  note: string;
};

export type VisualizerSession = {
  version: 1;
  savedAt: string;
  name: string;
  photoDataUrl: string | null;
  photoSource: "upload" | "sample";
  sampleId: string | null;
  masks: VisualizerMask[];
  defaultSettings: MaskSettings;
  favoriteSlugs: string[];
  exportMeta: ExportMeta;
};

export type VisualizerSessionSummary = {
  id: string;
  name: string;
  savedAt: string;
  hasPhoto: boolean;
  maskCount: number;
  primaryColor: string | null;
};

export const COVER_SCALE_DEFAULT = 1;
export const REPEAT_SCALE_DEFAULT = 0.55;
export const DEFAULT_FEATHER = 6;
export const MAX_FAVORITES = 4;
export const SESSION_STORAGE_KEY = "eliteos-visualizer-sessions-v1";

export const LABEL_PRESETS = ["Countertop 1", "Countertop 2", "Island", "Backsplash"];

export function defaultLabelForIndex(index: number): string {
  if (index < LABEL_PRESETS.length) return LABEL_PRESETS[index]!;
  return `Countertop ${index + 1}`;
}

export function defaultMaskSettings(textures: readonly Elite100VisualizerTexture[]): MaskSettings {
  return {
    textureSlug: textures.find((t) => t.hasImage)?.slug ?? textures[0]?.slug ?? "",
    opacity: 0.82,
    textureMode: "cover",
    textureScale: COVER_SCALE_DEFAULT,
    textureRotation: 0,
    textureOffsetX: 0,
    textureOffsetY: 0,
    feather: DEFAULT_FEATHER,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    lightingStrength: 0.55,
  };
}

export function maskToSettings(mask: VisualizerMask): MaskSettings {
  return {
    textureSlug: mask.textureSlug,
    opacity: mask.opacity,
    textureMode: mask.textureMode,
    textureScale: mask.textureScale,
    textureRotation: mask.textureRotation,
    textureOffsetX: mask.textureOffsetX,
    textureOffsetY: mask.textureOffsetY,
    feather: mask.feather,
    brightness: mask.brightness,
    contrast: mask.contrast,
    saturation: mask.saturation,
    lightingStrength: mask.lightingStrength,
  };
}

export function cloneMask(mask: VisualizerMask): VisualizerMask {
  return {
    ...mask,
    id: crypto.randomUUID(),
    label: `${mask.label} copy`,
    points: mask.points.map((p) => ({ ...p })),
    visible: true,
  };
}

export function workspaceModeLabel(mode: WorkspaceMode): string {
  if (mode === "drawing") return "Drawing";
  if (mode === "editing") return "Editing";
  return "Preview";
}
