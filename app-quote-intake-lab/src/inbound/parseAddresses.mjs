/**
 * Parse recipient strings like `Name <a@example.com>, b@example.com`.
 */

/**
 * @typedef {{ name: string|null, email: string }} InboundAddress
 */

/**
 * @param {string|null|undefined} raw
 * @returns {InboundAddress[]}
 */
export function parseAddressList(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  const parts = splitAddressList(text);
  const out = [];
  for (const part of parts) {
    const parsed = parseOneAddress(part);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * @param {string|null|undefined} raw
 * @returns {InboundAddress|null}
 */
export function parseOneAddress(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const angle = s.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    const email = normalizeEmail(angle[2]);
    if (!email) return null;
    const name = angle[1].replace(/^["']|["']$/g, "").trim() || null;
    return { name, email };
  }

  const email = normalizeEmail(s);
  if (!email) return null;
  return { name: null, email };
}

/**
 * @param {string} email
 */
export function normalizeEmail(email) {
  const e = String(email ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function splitAddressList(text) {
  const parts = [];
  let buf = "";
  let inQuotes = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") inQuotes = !inQuotes;
    if (!inQuotes) {
      if (ch === "<") depth += 1;
      if (ch === ">" && depth > 0) depth -= 1;
      if (ch === "," && depth === 0) {
        if (buf.trim()) parts.push(buf.trim());
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/**
 * Join addresses for hashing / display.
 * @param {InboundAddress[]} list
 */
export function formatAddressList(list) {
  return (list ?? [])
    .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
    .join(", ");
}
