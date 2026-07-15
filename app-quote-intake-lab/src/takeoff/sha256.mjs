/**
 * SHA-256 helpers for live takeoff client verification.
 * Prefer Web Crypto (browser). Node tests use dynamic import of node:crypto.
 */

/**
 * @param {Buffer|Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<string>} lowercase hex
 */
export async function sha256Hex(bytes) {
  const u8 =
    bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes);

  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", u8);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Node.js test / service path without Web Crypto.
  // Dynamic module id + vite-ignore keeps the browser bundle free of node:crypto.
  const nodeCrypto = "node:crypto";
  const { createHash } = await import(/* @vite-ignore */ nodeCrypto);
  return createHash("sha256").update(u8).digest("hex");
}
