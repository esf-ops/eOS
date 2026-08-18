/**
 * Display-only Account Directory phone formatting.
 * Does not rewrite stored values. NANP → (319) 269-0407. Unknown stays readable.
 */

const EXT_RE = /(?:\s*(?:ext(?:ension)?\.?|x)\s*[:.]?\s*)(\d+)\s*$/i;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatAccountDirectoryPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let rest = raw;
  let extension = "";
  const extMatch = rest.match(EXT_RE);
  if (extMatch) {
    extension = String(extMatch[1] || "").trim();
    rest = rest.slice(0, extMatch.index).trim();
  }

  const digits = rest.replace(/\D/g, "");
  let national = digits;
  if (digits.length === 11 && digits.startsWith("1")) national = digits.slice(1);

  if (national.length === 10) {
    const pretty = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    return extension ? `${pretty} ext. ${extension}` : pretty;
  }

  return raw;
}
