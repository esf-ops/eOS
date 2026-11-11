/**
 * Save a preview image.
 *
 * A detached <a download> pointed at a data URL does nothing on iPhone Safari,
 * and desktop Chrome drops the click when that URL is large. Blob URLs avoid
 * the size limit. Phones get the share sheet so the photo can go to the camera roll.
 */

function prefersShareSheet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua);
  const ipadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return ios || ipadOs;
}

export async function saveImageBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  if (prefersShareSheet() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Countertop preview" });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  }
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((result) => {
        if (!result) reject(new Error("Could not create the image file."));
        else resolve(result);
      }, "image/jpeg", quality);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Could not export this preview."));
    }
  });
}

export function exportFailureMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  const message = err instanceof Error ? err.message : "";
  if (name === "SecurityError" || /tainted|securityerror/i.test(message)) {
    return "This photo could not be saved because a color image blocked the export. The preview is still on screen.";
  }
  if (name === "AbortError") return "";
  if (message && !/security|tainted/i.test(message)) return message;
  return "This photo could not be saved on this device.";
}
