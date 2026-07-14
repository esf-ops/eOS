/**
 * Sanitize filenames for safe display (not path traversal, not control chars).
 * @param {string|null|undefined} name
 * @param {string} [fallback]
 */
export function sanitizeFilename(name, fallback = "attachment.bin") {
  let s = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  // Neutralize spreadsheet formula prefixes if ever opened elsewhere
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (!s) s = fallback;
  if (s.length > 180) {
    const ext = s.includes(".") ? s.slice(s.lastIndexOf(".")) : "";
    s = `${s.slice(0, 160)}${ext.slice(0, 20)}`;
  }
  return s;
}
