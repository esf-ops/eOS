/**
 * Client-side image normalization for the Elite Stone Visualizer upload flow.
 *
 * Problem: full-size iPhone photos (and any large upload) often cause "Load
 * Failed" because the multipart payload is too large, EXIF color-space metadata
 * confuses the server, or the image/heic MIME type slips through on iOS despite
 * the "JPG / Most Compatible" camera setting.
 *
 * Solution: decode every selected file on a <canvas>, resize to ≤ 1800px,
 * re-export as image/jpeg at 0.86 quality. This:
 *   - strips EXIF (canvas only paints pixel data)
 *   - normalises HEIC/HEIF and non-standard colour spaces to sRGB JPEG
 *   - keeps file size well under any upload limit
 *   - makes camera-capture and gallery-upload paths identical to the backend
 *
 * Public API
 * ──────────
 *   normalizeRoomImage(file)           normalizes and returns a new File
 *   createObjectURLFromFile(file)      returns a revocable preview URL (caller revokes)
 *   isDevMode                          true when Vite dev server is running
 */

export const MAX_DIMENSION_PX = 1800;
export const JPEG_QUALITY = 0.86;
export const OUTPUT_MIME = "image/jpeg" as const;

/** True only in Vite dev mode — used to gate dev-only console logs. */
export const isDevMode: boolean =
  typeof import.meta !== "undefined" &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

function devLog(...args: unknown[]): void {
  if (isDevMode) console.log("[imageNormalize]", ...args);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Decode a File/Blob into an HTMLImageElement via a temporary object URL.
 * Throws a descriptive error if the browser cannot decode the image.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "We couldn't read that image. Please try another photo or take a new picture.",
        ),
      );
    };

    img.src = url;
  });
}

/**
 * Compute output dimensions keeping aspect ratio and never upscaling.
 */
function computeOutputSize(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  if (srcWidth <= maxDimension && srcHeight <= maxDimension) {
    return { width: srcWidth, height: srcHeight };
  }
  const scale = maxDimension / Math.max(srcWidth, srcHeight);
  return {
    width: Math.round(srcWidth * scale),
    height: Math.round(srcHeight * scale),
  };
}

/**
 * Draw `img` onto a canvas at `targetSize` and export as JPEG blob.
 * Throws if toBlob returns null (should only happen in a sandboxed env).
 */
function canvasToBlob(
  img: HTMLImageElement,
  targetSize: { width: number; height: number },
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(
      new Error(
        "We couldn't prepare that image. Please try a smaller photo or take a new picture.",
      ),
    );
  }

  ctx.drawImage(img, 0, 0, targetSize.width, targetSize.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(
            new Error(
              "We couldn't prepare that image. Please try a smaller photo or take a new picture.",
            ),
          );
        }
      },
      OUTPUT_MIME,
      quality,
    );
  });
}

/** Derive a normalized filename: strip extension, append -normalized.jpg. */
function normalizedFilename(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "");
  return `${base || "room"}-normalized.jpg`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type NormalizeResult = {
  file: File;
  width: number;
  height: number;
  originalSizeMb: number;
  normalizedSizeMb: number;
};

/**
 * Normalize a room photo for upload:
 * 1. Decode via browser image element (works for JPEG, PNG, WebP, and iOS HEIC
 *    when the OS provides a codec — which it does on iOS 11+ for user-picked
 *    photos regardless of extension).
 * 2. Resize to ≤ MAX_DIMENSION_PX (1800px), preserving aspect ratio.
 * 3. Re-export as JPEG at JPEG_QUALITY (0.86) — strips EXIF, normalises colour
 *    space, removes alpha channel.
 *
 * Dev-mode console logs are emitted but never include image data or secrets.
 *
 * @throws if the image cannot be decoded or the canvas export fails.
 */
export async function normalizeRoomImage(file: File): Promise<NormalizeResult> {
  const originalSizeMb = file.size / (1024 * 1024);

  devLog("original:", {
    name: file.name,
    type: file.type || "(no MIME type)",
    sizeMb: originalSizeMb.toFixed(2),
  });

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch (err) {
    // Re-throw with our user-friendly message already set by loadImage.
    throw err;
  }

  const targetSize = computeOutputSize(img.naturalWidth, img.naturalHeight, MAX_DIMENSION_PX);

  let blob: Blob;
  try {
    blob = await canvasToBlob(img, targetSize, JPEG_QUALITY);
  } catch (err) {
    throw err;
  }

  const normalizedSizeMb = blob.size / (1024 * 1024);
  const outName = normalizedFilename(file.name);
  const outFile = new File([blob], outName, { type: OUTPUT_MIME });

  devLog("normalized:", {
    type: OUTPUT_MIME,
    sizeMb: normalizedSizeMb.toFixed(2),
    width: targetSize.width,
    height: targetSize.height,
    reductionPct: `${Math.round((1 - blob.size / file.size) * 100)}%`,
  });

  return {
    file: outFile,
    width: targetSize.width,
    height: targetSize.height,
    originalSizeMb,
    normalizedSizeMb,
  };
}

/**
 * Convenience wrapper: create a preview object URL from any File.
 * The caller is responsible for calling URL.revokeObjectURL when done.
 */
export function createObjectURLFromFile(file: File): string {
  return URL.createObjectURL(file);
}
