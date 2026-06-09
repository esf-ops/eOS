/**
 * multipartParse — small multipart/form-data parser for connector image uploads.
 */

/**
 * @param {Buffer} body
 * @param {string} contentType
 * @param {{ maxFileBytes?: number }} [opts]
 */
export function parseMultipartForm(body, contentType, opts = {}) {
  const maxFileBytes = opts.maxFileBytes ?? 12 * 1024 * 1024;
  const ct = String(contentType ?? "");
  const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) {
    throw new Error("Missing multipart boundary");
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitMultipart(body, delimiter);
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {Record<string, { filename: string, buffer: Buffer, mimeType: string }>} */
  const files = {};

  for (const part of parts) {
    if (!part.length) continue;
    const partText = part.toString("latin1");
    if (partText.startsWith("--") || partText.trim() === "--") continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerBlock = part.subarray(0, headerEnd).toString("utf8");
    let content = part.subarray(headerEnd + 4);
    if (content.subarray(-2).equals(Buffer.from("\r\n"))) {
      content = content.subarray(0, content.length - 2);
    }

    const nameMatch = headerBlock.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = headerBlock.match(/filename="([^"]*)"/i);

    if (filenameMatch) {
      if (content.length > maxFileBytes) {
        throw new Error(`File ${name} exceeds max upload size`);
      }
      const mimeMatch = headerBlock.match(/Content-Type:\s*([^\r\n]+)/i);
      files[name] = {
        filename: filenameMatch[1] || name,
        buffer: content,
        mimeType: mimeMatch ? mimeMatch[1].trim() : "application/octet-stream",
      };
    } else {
      fields[name] = content.toString("utf8");
    }
  }

  return { fields, files };
}

/**
 * @param {Buffer} body
 * @param {Buffer} delimiter
 */
function splitMultipart(body, delimiter) {
  /** @type {Buffer[]} */
  const parts = [];
  let start = 0;
  while (start < body.length) {
    const idx = body.indexOf(delimiter, start);
    if (idx === -1) break;
    if (start > 0) {
      parts.push(body.subarray(start, idx));
    }
    start = idx + delimiter.length;
    if (body.subarray(start, start + 2).equals(Buffer.from("--"))) {
      break;
    }
    if (body.subarray(start, start + 2).equals(Buffer.from("\r\n"))) {
      start += 2;
    }
  }
  return parts;
}
