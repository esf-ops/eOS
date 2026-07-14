/**
 * SHA-256 helpers for lab-local dedupe / attachment hashing.
 * Uses Web Crypto (available in modern browsers and Node 18+).
 */

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {string|Uint8Array|ArrayBuffer} input
 * @returns {Promise<string>} hex digest
 */
export async function sha256Hex(input) {
  let bytes;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new TypeError("sha256Hex expects string or bytes");
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 is required for Quote Intake Lab hashing.");
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

/** Normalize Message-ID for dedupe keys. */
export function normalizeMessageId(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/^<|>$/g, "")
    .toLowerCase();
  return s || null;
}
