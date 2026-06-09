#!/usr/bin/env node
/**
 * sync-slabs.mjs — Windows local Slabsmith XML → eliteOS backend ingest connector (v1).
 *
 * Reads slabs.xml from disk and POSTs to backend-core (no Supabase service role on PC).
 *
 * Usage:
 *   node sync-slabs.mjs --config config.json
 *   node sync-slabs.mjs --config config.json --dry-run
 *   node sync-slabs.mjs --config config.json --send
 *   node sync-slabs.mjs --config config.json --image-manifest
 *
 * Backend call occurs when:
 *   --send is passed, OR
 *   config.writeEnabled === true and --dry-run is NOT passed.
 *
 * Never logs syncToken.
 *
 * Exit: sets process.exitCode and lets Node drain handles (avoids Windows libuv
 * assertion when process.exit() runs before undici/fetch sockets close).
 */

import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendLogLine,
  inspectSourceXml,
  loadConfig,
  validateSyncConfig,
} from "./connector-shared.mjs";
import { runImageManifest } from "./sync-images.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYNC_HEADER = "X-EliteOS-Slabsmith-Sync-Token";
const INGEST_PATH = "/api/integrations/slabsmith/inventory/xml";
const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export { loadConfig, inspectSourceXml, appendLogLine } from "./connector-shared.mjs";

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {{ configPath: string|null, dryRun: boolean, send: boolean, imageManifest: boolean, help: boolean }} */
  const out = {
    configPath: null,
    dryRun: false,
    send: false,
    imageManifest: false,
    help: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--send") {
      out.send = true;
      continue;
    }
    if (arg === "--image-manifest") {
      out.imageManifest = true;
      continue;
    }
    if (arg === "--config") {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) throw new Error("--config requires a path");
      out.configPath = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

/** @deprecated use validateSyncConfig from connector-shared */
export function validateConfig(config) {
  return validateSyncConfig(config);
}

/**
 * @param {{ dryRun: boolean, send: boolean, writeEnabled: boolean }} flags
 */
export function shouldCallBackend({ dryRun, send, writeEnabled }) {
  if (dryRun && !send) return false;
  if (send) return true;
  return writeEnabled === true;
}

/**
 * @param {string} text
 * @param {number} status
 */
export function parseIngestResponse(text, status) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 500) || `HTTP ${status}` };
  }
}

/**
 * POST XML using node:http/https (one-shot request; socket closes on end).
 * Avoids global fetch/undici keep-alive issues on Windows scheduled tasks.
 *
 * @param {object} params
 */
export function postXmlWithNodeHttp({
  backendBaseUrl,
  syncToken,
  xml,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const url = new URL(`${backendBaseUrl.replace(/\/+$/, "")}${INGEST_PATH}`);
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;
  const bodyBuffer = Buffer.from(xml, "utf8");

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
          "Content-Type": "application/xml; charset=utf-8",
          [SYNC_HEADER]: syncToken,
          "Content-Length": bodyBuffer.length,
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
          onDone(null, { status, body: parseIngestResponse(text, status) });
        });
        res.on("error", (err) => onDone(err));
      }
    );

    req.on("error", (err) => onDone(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.write(bodyBuffer);
    req.end();
  });
}

/**
 * Optional fetch transport (tests). Closes undici global dispatcher when present.
 * @param {object} params
 */
export async function postXmlWithFetch({ backendBaseUrl, syncToken, xml, fetchImpl = fetch }) {
  const url = `${backendBaseUrl.replace(/\/+$/, "")}${INGEST_PATH}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      [SYNC_HEADER]: syncToken,
      Connection: "close",
    },
    body: xml,
  });

  const text = await response.text();
  await closeUndiciDispatcherIfNeeded();

  return {
    status: response.status,
    body: parseIngestResponse(text, response.status),
  };
}

/**
 * Close undici keep-alive pool so Node can exit cleanly after fetch (Windows-safe).
 */
export async function closeUndiciDispatcherIfNeeded() {
  try {
    const undici = await import("undici");
    if (typeof undici.getGlobalDispatcher !== "function") return;
    const dispatcher = undici.getGlobalDispatcher();
    if (dispatcher && typeof dispatcher.close === "function") {
      await dispatcher.close();
    }
  } catch {
    // undici unavailable or not used
  }
}

/**
 * @param {object} params
 */
export async function postXmlToBackend({
  backendBaseUrl,
  syncToken,
  xml,
  fetchImpl = null,
  requestImpl = null,
}) {
  if (typeof requestImpl === "function") {
    return requestImpl({ backendBaseUrl, syncToken, xml });
  }
  if (typeof fetchImpl === "function") {
    return postXmlWithFetch({ backendBaseUrl, syncToken, xml, fetchImpl });
  }
  return postXmlWithNodeHttp({ backendBaseUrl, syncToken, xml });
}

/**
 * @param {string[]} [argv]
 * @param {{ postXmlToBackend?: typeof postXmlToBackend, runImageManifest?: typeof runImageManifest }} [deps]
 */
export async function runSync(argv = process.argv, deps = {}) {
  const postXml = deps.postXmlToBackend ?? postXmlToBackend;
  const imageManifestRunner = deps.runImageManifest ?? runImageManifest;
  const { configPath, dryRun, send, imageManifest, help } = parseArgs(argv);

  if (imageManifest) {
    return imageManifestRunner(argv, deps);
  }

  if (help) {
    console.log(`Slabsmith XML connector

Usage:
  node sync-slabs.mjs --config config.json [--dry-run] [--send] [--image-manifest]

  --dry-run         Validate local XML only (no backend unless --send)
  --send            Force POST to backend
  --image-manifest  Discover local slab images and write JSON manifest (no upload)
  writeEnabled: true in config also enables send (unless --dry-run without --send)
`);
    return 0;
  }

  const cfgPath = configPath || join(__dirname, "config.json");
  const { config } = loadConfig(cfgPath);
  const validated = validateSyncConfig(config);
  const callBackend = shouldCallBackend({
    dryRun,
    send,
    writeEnabled: validated.writeEnabled,
  });

  const startedAt = new Date().toISOString();
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    appendLogLine(validated.logDir, line);
  };

  log(`run start mode=${callBackend ? "send" : "dry-run"} config=${cfgPath}`);

  const fileInfo = inspectSourceXml(validated.sourceXmlPath);
  log(`source xml path=${fileInfo.path} bytes=${fileInfo.bytes} modified=${fileInfo.modifiedAt}`);

  if (!callBackend) {
    log("dry-run complete (local validation only; backend not called)");
    return 0;
  }

  const xml = readFileSync(fileInfo.path, "utf8");
  if (!xml.trim()) {
    throw new Error("Source XML file is empty");
  }

  log(`posting to ${validated.backendBaseUrl}${INGEST_PATH}`);
  const { status, body } = await postXml({
    backendBaseUrl: validated.backendBaseUrl,
    syncToken: validated.syncToken,
    xml,
  });

  if (status >= 400 || body?.ok === false) {
    log(`sync failed http=${status} error=${body?.error ?? "unknown"}`);
    return 1;
  }

  log(
    `sync ok rows_seen=${body.rows_seen ?? "?"} inserted=${body.inserted ?? "?"} updated=${body.updated ?? "?"} unchanged=${body.unchanged ?? "?"} sync_run_id=${body.sync_run_id ?? "(none)"} needs_review=${body.needs_review ?? 0} warnings=${body.warnings_count ?? 0}`
  );
  log(`run end started=${startedAt}`);
  return 0;
}

/**
 * CLI entry — set exitCode and allow handles to drain (do not process.exit after fetch).
 */
export async function runSyncCli(argv = process.argv) {
  try {
    const code = await runSync(argv);
    process.exitCode = code ?? 0;
  } catch (err) {
    console.error(`[slabsmith-connector] fatal: ${String(err?.message || err)}`);
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  runSyncCli();
}
