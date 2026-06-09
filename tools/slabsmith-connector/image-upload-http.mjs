/**
 * image-upload-http.mjs — multipart POST via node:http/https (Windows-safe).
 */

import http from "node:http";
import https from "node:https";

const SYNC_HEADER = "X-EliteOS-Slabsmith-Sync-Token";
const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * @param {string} text
 * @param {number} status
 */
function parseJsonResponse(text, status) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 500) || `HTTP ${status}` };
  }
}

/**
 * @param {object} params
 */
export function postMultipartWithNodeHttp({
  backendBaseUrl,
  syncToken,
  routePath,
  body,
  contentType,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const url = new URL(`${backendBaseUrl.replace(/\/+$/, "")}${routePath}`);
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    /** @type {import("node:http").ClientRequest} */
    let req;

    const onDone = (err, result) => {
      if (req) req.removeAllListeners();
      if (err) reject(err);
      else resolve(result);
    };

    req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": contentType,
          [SYNC_HEADER]: syncToken,
          "Content-Length": body.length,
          Connection: "close",
        },
      },
      (res) => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = Number(res.statusCode ?? 0);
          onDone(null, { status, body: parseJsonResponse(text, status) });
        });
        res.on("error", (err) => onDone(err));
      }
    );

    req.on("error", (err) => onDone(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.write(body);
    req.end();
  });
}
