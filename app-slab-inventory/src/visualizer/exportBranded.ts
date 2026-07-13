import type { ExportMeta, SceneInput } from "./types";
import { renderToCanvas } from "./render";

export type BrandedExportOptions = {
  scene: Omit<SceneInput, "photo"> & { photo: HTMLImageElement };
  exportMeta: ExportMeta;
  colorName: string | null;
  materialName: string | null;
  priceGroup: string | null;
  includeBranding?: boolean;
  /** Footer line prefix; defaults to Elite 100. Pass "Cambria" for Cambria kiosk. */
  brandLabel?: string;
};

export function exportBrandedPreview(options: BrandedExportOptions): void {
  const {
    scene,
    exportMeta,
    colorName,
    materialName,
    priceGroup,
    includeBranding = true,
    brandLabel = "Elite 100",
  } = options;

  const photo = scene.photo;
  const base = renderToCanvas(photo, {
    masks: scene.masks,
    textureImages: scene.textureImages,
    draftPoints: [],
    isDrawing: false,
    activeMaskId: null,
    showMaskOutlines: false,
    renderTextures: true,
  });
  if (!base) return;

  const oc = document.createElement("canvas");
  oc.width = base.width;
  oc.height = base.height;
  const ctx = oc.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(base, 0, 0);

  if (includeBranding) {
    const pad = Math.max(16, Math.round(base.width * 0.022));
    const barH = Math.max(72, Math.round(base.height * 0.09));
    const y = base.height - barH;

    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.fillRect(0, y, base.width, barH);

    const fontBase = Math.max(13, Math.round(base.width * 0.018));
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${fontBase + 4}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText("Elite Stone Fabricators", pad, y + pad * 0.7);

    ctx.font = `500 ${fontBase}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.88)";

    const detailLines = [
      colorName ? `${brandLabel} · ${colorName}` : `${brandLabel} Visualizer`,
      materialName ?? null,
      priceGroup ? `Group ${priceGroup}` : null,
      exportMeta.projectName ? `Project: ${exportMeta.projectName}` : null,
      exportMeta.customerName ? `Customer: ${exportMeta.customerName}` : null,
    ].filter(Boolean) as string[];

    detailLines.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, pad, y + pad * 0.7 + (fontBase + 6) * (i + 1.35));
    });

    ctx.textAlign = "right";
    ctx.font = `400 ${Math.max(11, fontBase - 1)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(new Date().toLocaleDateString(), base.width - pad, y + barH - pad - fontBase);
    ctx.textAlign = "left";
  }

  const slug = (colorName ?? "preview").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.download = `elite-stone-visualizer-${slug}-${date}.jpg`;
  link.href = oc.toDataURL("image/jpeg", 0.92);
  link.click();
}

export function exportPlainPreview(
  scene: Omit<SceneInput, "photo"> & { photo: HTMLImageElement },
  slug: string,
): void {
  const base = renderToCanvas(scene.photo, {
    ...scene,
    draftPoints: [],
    isDrawing: false,
    activeMaskId: null,
    showMaskOutlines: false,
    renderTextures: true,
  });
  if (!base) return;
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.download = `eliteos-visualizer-${slug}-${date}.jpg`;
  link.href = base.toDataURL("image/jpeg", 0.92);
  link.click();
}
