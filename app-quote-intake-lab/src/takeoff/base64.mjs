/**
 * Browser-safe binary helpers for live takeoff.
 * Never relies on Node's global Buffer (unavailable in Vite browser bundles).
 */

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Normalize attachment bytes to a Uint8Array without Buffer.
 * Supports Uint8Array, ArrayBuffer, TypedArray views, and Node Buffer when present in tests.
 * @param {ArrayBuffer|Uint8Array|ArrayBufferView|Blob|null|undefined} input
 * @returns {Uint8Array}
 */
export function toUint8Array(input) {
  if (input == null) {
    return new Uint8Array(0);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  if (typeof ArrayBuffer !== "undefined" && input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  // Node Buffer is a Uint8Array subclass in modern Node, but still guard for exotic cases.
  if (typeof input === "object" && input && typeof input.length === "number" && typeof input[0] === "number") {
    return Uint8Array.from(input);
  }
  const err = new Error("Unsupported attachment byte type for live takeoff.");
  err.code = "UNSUPPORTED_BYTE_TYPE";
  throw err;
}

/**
 * Async path for Blob (IndexedDB may surface Blob in some stores).
 * @param {ArrayBuffer|Uint8Array|ArrayBufferView|Blob|null|undefined} input
 * @returns {Promise<Uint8Array>}
 */
export async function toUint8ArrayAsync(input) {
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const buf = await input.arrayBuffer();
    return new Uint8Array(buf);
  }
  return toUint8Array(input);
}

/**
 * Deterministic base64 encode for attachment bytes.
 * Uses a chunked path when `btoa` is available; otherwise a pure alphabet encoder.
 * Does not use `String.fromCharCode(...largeArray)` (avoid stack/argument limits).
 *
 * @param {ArrayBuffer|Uint8Array|ArrayBufferView|null|undefined} input
 * @returns {string}
 */
export function bytesToBase64(input) {
  const bytes = toUint8Array(input);
  if (typeof btoa === "function") {
    const chunkSize = 0x8000; // 32 KiB — safe for apply()
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
  return encodeBase64Pure(bytes);
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function encodeBase64Pure(bytes) {
  let out = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < len ? BASE64_ALPHABET[(triple >> 6) & 63] : "=";
    out += i + 2 < len ? BASE64_ALPHABET[triple & 63] : "=";
  }
  return out;
}
