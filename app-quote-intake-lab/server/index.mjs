/**
 * Quote Intake Lab — isolated live intelligence server (Phase 3.1).
 *
 * Bind: 127.0.0.1 only
 * Default port: 5197
 * Not mounted in backend-core/server.js
 * Does not start with the production Brain
 *
 * Start: npm run live-server   (from app-quote-intake-lab)
 */

import "./loadEnv.mjs";
import http from "node:http";
import { readLabServerConfig, readSafeLabServerConfig } from "./config.mjs";
import { createConcurrencyGate } from "./concurrency.mjs";
import { runLiveClassificationPipeline } from "./classifyPipeline.mjs";
import { sanitizeLiveClassificationRequest } from "./sanitizeLiveRequest.mjs";
import { LIVE_PROVIDER_MODE, LIVE_PROVIDER_NAME, LIVE_PROVIDER_VERSION } from "./classifyPipeline.mjs";

const config = readLabServerConfig();
const gate = createConcurrencyGate(config.maxConcurrency);
const LIVE_META = {
  provider: LIVE_PROVIDER_NAME,
  mode: LIVE_PROVIDER_MODE,
  version: LIVE_PROVIDER_VERSION
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-QIL-Lab-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

function originAllowed(req) {
  const origin = String(req.headers.origin ?? "");
  if (!origin) {
    // Same-machine tools without Origin (curl/smoke) allowed only with valid token later
    return { ok: true, origin: config.allowedOrigin, loose: true };
  }
  if (origin === config.allowedOrigin) return { ok: true, origin, loose: false };
  return { ok: false, origin, loose: false };
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Request body too large."), { statusCode: 413, code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function requireLabToken(req) {
  if (!config.labRequestToken) {
    const err = new Error("QIL_LAB_REQUEST_TOKEN is not configured on the lab server.");
    err.statusCode = 503;
    err.code = "TOKEN_NOT_CONFIGURED";
    throw err;
  }
  const token = String(req.headers["x-qil-lab-token"] ?? "");
  if (!token || token !== config.labRequestToken) {
    const err = new Error("Invalid or missing lab request token.");
    err.statusCode = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);
  const originCheck = originAllowed(req);

  if (req.method === "OPTIONS") {
    if (!originCheck.ok) {
      sendJson(res, 403, { ok: false, code: "ORIGIN_DENIED" });
      return;
    }
    res.writeHead(204, [...Object.entries(corsHeaders(originCheck.origin))].reduce((a, [k, v]) => {
      a[k] = v;
      return a;
    }, {}));
    res.end();
    return;
  }

  const withCors = (status, body) => {
    const headers = originCheck.ok && !originCheck.loose ? corsHeaders(originCheck.origin) : {};
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
      "Cache-Control": "no-store",
      ...headers
    });
    res.end(payload);
  };

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      withCors(200, { ok: true, service: "quote-intake-lab-intelligence", ...readSafeLabServerConfig() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/classify") {
      if (req.headers.origin && !originCheck.ok) {
        withCors(403, { ok: false, code: "ORIGIN_DENIED", error: "Origin not allowed." });
        return;
      }
      requireLabToken(req);
      const ct = String(req.headers["content-type"] ?? "");
      if (!ct.includes("application/json")) {
        withCors(415, { ok: false, code: "UNSUPPORTED_MEDIA", error: "Content-Type must be application/json." });
        return;
      }

      const buf = await readBody(req, config.maxBodyBytes);
      let parsedBody;
      try {
        parsedBody = JSON.parse(buf.toString("utf8") || "{}");
      } catch {
        withCors(400, { ok: false, code: "BAD_JSON", error: "Invalid JSON body." });
        return;
      }

      // Do not log body contents
      const request = sanitizeLiveClassificationRequest(parsedBody);
      const outcome = await gate.run(() =>
        runLiveClassificationPipeline({ request, config })
      );

      withCors(200, {
        ok: true,
        startedAt: outcome.startedAt,
        completedAt: outcome.completedAt,
        result: outcome.result,
        validationWarnings: outcome.validationWarnings,
        // Safe operational metadata only — never echo request body
        meta: {
          provider: LIVE_META.provider,
          mode: LIVE_META.mode,
          version: LIVE_META.version,
          extractionPromptVersion: outcome.result.verification?.extractionPromptVersion,
          verificationPromptVersion: outcome.result.verification?.verificationPromptVersion
        }
      });
      return;
    }

    withCors(404, { ok: false, code: "NOT_FOUND" });
  } catch (e) {
    const status = e?.statusCode && Number.isFinite(e.statusCode) ? e.statusCode : 500;
    // Operational log only — message/code, never bodies or keys
    console.error(`[qil-live] ${req.method} ${url.pathname} → ${status} ${e?.code ?? "ERROR"}: ${e?.message ?? e}`);
    withCors(status, {
      ok: false,
      code: e?.code ?? "SERVER_ERROR",
      error: status >= 500 ? "Lab intelligence request failed." : String(e?.message ?? "Request failed.")
    });
  }
});

server.listen(config.port, config.host, () => {
  const safe = readSafeLabServerConfig();
  console.log(
    `[qil-live] listening on http://${safe.host}:${safe.port} · live=${safe.liveAiEnabled} · key=${safe.hasApiKey} · modelConfigured=${safe.modelConfigured}`
  );
});
