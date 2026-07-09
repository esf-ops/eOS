/**
 * Pure helper functions for QuoteFilesPanel.
 * Extracted here so they can be unit-tested without a DOM/React environment.
 */

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB — mirrors backend

export const FILE_ROLES: { value: string; label: string }[] = [
  { value: "cabinet_plan",      label: "Cabinet plan" },
  { value: "measurement_plan",  label: "Measurement plan" },
  { value: "signed_quote",      label: "Signed quote" },
  { value: "customer_pdf",      label: "Customer PDF" },
  { value: "shop_drawing",      label: "Shop drawing" },
  { value: "photo",             label: "Photo" },
  { value: "spec",              label: "Spec sheet" },
  { value: "contract",          label: "Contract" },
  { value: "other",             label: "Other" },
];

export const VISIBILITY_OPTIONS: { value: string; label: string }[] = [
  { value: "internal", label: "Internal only" },
  { value: "partner",  label: "Partner-visible" },
  { value: "customer", label: "Customer-visible" },
];

/** Accepted MIME types for the file input accept attribute — must match backend ALLOWED_MIME_TYPES. */
export const FILE_ACCEPT = "application/pdf,image/*,.doc,.docx,.txt";

export function mimeTypeToFileTag(mimeType: string | null): string {
  if (!mimeType) return "FILE";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType.includes("wordprocessingml") || mimeType === "application/msword") return "DOC";
  if (mimeType === "text/plain") return "TXT";
  return "FILE";
}

export type FileMimeCategory = "pdf" | "image" | "doc" | "text" | "other";

export function mimeTypeToCategory(mimeType: string | null): FileMimeCategory {
  if (!mimeType) return "other";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("wordprocessingml") || mimeType === "application/msword") return "doc";
  if (mimeType === "text/plain") return "text";
  return "other";
}


export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function roleLabelFor(role: string): string {
  return FILE_ROLES.find((r) => r.value === role)?.label ?? role;
}

/**
 * Validate a file for upload. Returns null if valid, or an error message string.
 * Used by the batch uploader before attempting the signed-URL flow.
 */
export function validateFileForUpload(file: { name: string; size: number }): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File too large (${formatBytes(file.size)}). Maximum is 50 MB.`;
  }
  if (!file.name.trim()) {
    return "File has no name.";
  }
  return null;
}

/**
 * Build the summary message after a batch upload run.
 * Pure function — no side effects.
 */
export function buildBatchSummaryMessage(
  totalFiles: number,
  successCount: number,
  failCount: number
): { status: "success" | "error"; msg: string } {
  if (failCount === 0) {
    return {
      status: "success",
      msg:
        successCount === 1
          ? "File uploaded successfully."
          : `${successCount} files uploaded.`,
    };
  }
  if (successCount === 0) {
    return {
      status: "error",
      msg:
        totalFiles === 1
          ? "Upload failed. Please try again."
          : `All ${failCount} file${failCount !== 1 ? "s" : ""} failed to upload.`,
    };
  }
  return {
    status: "error",
    msg: `${successCount} file${successCount !== 1 ? "s" : ""} uploaded, ${failCount} failed.`,
  };
}
