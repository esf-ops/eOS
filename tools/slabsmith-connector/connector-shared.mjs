/**
 * Shared config, paths, and logging for Slabsmith Windows connector scripts.
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** Windows production default when config.imageRootPath is omitted. */
export const DEFAULT_WINDOWS_IMAGE_ROOT = "C:\\slabcloud";

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
 * @param {string} pathValue
 * @param {string} [cwd]
 */
export function resolveConfigPath(pathValue, cwd = process.cwd()) {
  const trimmed = String(pathValue ?? "").trim();
  if (!trimmed) return "";
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

/**
 * @param {Record<string, unknown>} config
 */
export function validateSyncConfig(config) {
  const backendBaseUrl = String(config.backendBaseUrl ?? "").trim().replace(/\/+$/, "");
  const sourceXmlPath = String(config.sourceXmlPath ?? "").trim();
  const syncToken = String(config.syncToken ?? "").trim();
  const logDir = String(config.logDir ?? "").trim();
  const writeEnabled = config.writeEnabled === true;
  const imageRootPath = resolveImageRootPath(config);

  if (!backendBaseUrl) throw new Error("config.backendBaseUrl is required");
  if (!sourceXmlPath) throw new Error("config.sourceXmlPath is required");
  if (!syncToken || syncToken === "REPLACE_WITH_TOKEN") {
    throw new Error("config.syncToken must be set to the backend SLABSMITH_SYNC_TOKEN value");
  }

  return { backendBaseUrl, sourceXmlPath, syncToken, logDir, writeEnabled, imageRootPath };
}

/**
 * @param {Record<string, unknown>} config
 */
export function validateManifestConfig(config) {
  const sourceXmlPath = String(config.sourceXmlPath ?? "").trim();
  const logDir = String(config.logDir ?? "").trim();
  const imageRootPath = resolveImageRootPath(config);

  if (!sourceXmlPath) throw new Error("config.sourceXmlPath is required");

  return { sourceXmlPath, logDir, imageRootPath };
}

/**
 * Manifest + backend credentials for image upload modes.
 * @param {Record<string, unknown>} config
 */
export function validateUploadConfig(config) {
  const manifest = validateManifestConfig(config);
  const backendBaseUrl = String(config.backendBaseUrl ?? "").trim().replace(/\/+$/, "");
  const syncToken = String(config.syncToken ?? "").trim();

  if (!backendBaseUrl) throw new Error("config.backendBaseUrl is required for upload");
  if (!syncToken || syncToken === "REPLACE_WITH_TOKEN") {
    throw new Error("config.syncToken must be set for upload");
  }

  return { ...manifest, backendBaseUrl, syncToken };
}

/**
 * @param {Record<string, unknown>} config
 */
export function resolveImageRootPath(config) {
  const configured = String(config.imageRootPath ?? "").trim();
  if (configured) return configured;
  return DEFAULT_WINDOWS_IMAGE_ROOT;
}

/**
 * @param {string} sourceXmlPath
 */
export function inspectSourceXml(sourceXmlPath) {
  const abs = resolveConfigPath(sourceXmlPath);
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
 * Append one log line using a short-lived write (no persistent stream handle).
 * @param {string} logDir
 * @param {string} line
 */
export function appendLogLine(logDir, line) {
  if (!logDir) return;
  try {
    mkdirSync(logDir, { recursive: true });
    const file = join(logDir, `sync-${new Date().toISOString().slice(0, 10)}.log`);
    const stream = createWriteStream(file, { flags: "a" });
    stream.write(`${line}\n`);
    stream.end();
  } catch (err) {
    console.warn(`[slabsmith-connector] log write failed: ${String(err?.message || err)}`);
  }
}

/**
 * @param {string} logDir
 * @param {string} prefix e.g. image-manifest
 * @param {unknown} payload
 */
export function writeJsonArtifact(logDir, prefix, payload) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${prefix}-${timestamp}.json`;
  if (!logDir) {
    return { path: null, fileName, written: false };
  }
  mkdirSync(logDir, { recursive: true });
  const abs = join(logDir, fileName);
  writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { path: abs, fileName, written: true };
}
