/** Lab-only attachment / message limits (not production Outlook policy). */

export const LAB_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MiB per attachment
export const LAB_MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024; // 24 MiB total
export const LAB_MAX_ATTACHMENTS = 15;
export const LAB_MAX_EML_BYTES = 32 * 1024 * 1024; // 32 MiB raw .eml
export const LAB_MAX_BODY_CHARS = 200_000;

export function formatByteLimit(n) {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MiB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KiB`;
  return `${n} B`;
}
