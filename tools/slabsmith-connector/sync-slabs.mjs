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
 *
 * Backend call occurs when:
 *   --send is passed, OR
 *   config.writeEnabled === true and --dry-run is NOT passed.
 *
 * Never logs syncToken.
 */

import { existsSync, mkdirSync, readFileSync, statSync, appendFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYNC_HEADER = "X-EliteOS-Slabsmith-Sync-Token";
const INGEST_PATH = "/api/integrations/slabsmith/inventory/xml";

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {{ configPath: string|null, dryRun: boolean, send: boolean, help: boolean }} */
  const out = { configPath: null, dryRun: false, send: false, help: false };
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

/**
 * @param {string} configPath
 */
export function loadConfig(configPath) {
  const abs = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);
  if (!existsSync(abs)) {
    throw new Error(`Config file not found: ${abs}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    throw new Error(`Invalid JSON config: ${String(err?.message || err)}`);
  }
  return { config: parsed, configPath: abs };
}

/**
 * @param {Record<string, unknown>} config
 */
export function validateConfig(config) {
  const backendBaseUrl = String(config.backendBaseUrl ?? "").trim().replace(/\/+$/, "");
  const sourceXmlPath = String(config.sourceXmlPath ?? "").trim();
  const syncToken = String(config.syncToken ?? "").trim();
  const logDir = String(config.logDir ?? "").trim();
  const writeEnabled = config.writeEnabled === true;

  if (!backendBaseUrl) throw new Error("config.backendBaseUrl is required");
  if (!sourceXmlPath) throw new Error("config.sourceXmlPath is required");
  if (!syncToken || syncToken === "REPLACE_WITH_TOKEN") {
    throw new Error("config.syncToken must be set to the backend SLABSMITH_SYNC_TOKEN value");
  }

  return { backendBaseUrl, sourceXmlPath, syncToken, logDir, writeEnabled };
}

/**
 * @param {string} sourceXmlPath
 */
export function inspectSourceXml(sourceXmlPath) {
  const abs = isAbsolute(sourceXmlPath) ? sourceXmlPath : resolve(process.cwd(), sourceXmlPath);
  if (!existsSync(abs)) {
    throw new Error(`Slabsmith XML not found: ${abs}`);
  }
  const stat = statSync(abs);
  return {
    path: abs,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
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
 * @param {string} logDir
 * @param {string} line
 */
export function appendLogLine(logDir, line) {
  if (!logDir) return;
  try {
    mkdirSync(logDir, { recursive: true });
    const file = join(logDir, `sync-${new Date().toISOString().slice(0, 10)}.log`);
    appendFileSync(file, `${line}\n`, "utf8");
  } catch (err) {
    console.warn(`[slabsmith-connector] log write failed: ${String(err?.message || err)}`);
  }
}

/**
 * @param {object} params
 */
export async function postXmlToBackend({
  backendBaseUrl,
  syncToken,
  xml,
  fetchImpl = fetch,
}) {
  const url = `${backendBaseUrl.replace(/\/+$/, "")}${INGEST_PATH}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      [SYNC_HEADER]: syncToken,
    },
    body: xml,
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { ok: false, error: text.slice(0, 500) || `HTTP ${response.status}` };
  }

  return { status: response.status, body };
}

/**
 * @param {string[]} [argv]
 */
export async function runSync(argv = process.argv) {
  const { configPath, dryRun, send, help } = parseArgs(argv);
  if (help) {
    console.log(`Slabsmith XML connector

Usage:
  node sync-slabs.mjs --config config.json [--dry-run] [--send]

  --dry-run   Validate local XML only (no backend unless --send)
  --send      Force POST to backend
  writeEnabled: true in config also enables send (unless --dry-run without --send)
`);
    return 0;
  }

  const cfgPath = configPath || join(__dirname, "config.json");
  const { config } = loadConfig(cfgPath);
  const validated = validateConfig(config);
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
  const { status, body } = await postXmlToBackend({
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runSync()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`[slabsmith-connector] fatal: ${String(err?.message || err)}`);
      process.exit(1);
    });
}
