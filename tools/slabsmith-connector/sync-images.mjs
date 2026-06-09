#!/usr/bin/env node
/**
 * sync-images.mjs — discover Slabsmith slab images, plan uploads, and upload to backend-core.
 *
 * Usage:
 *   node sync-images.mjs --config config.json
 *   node sync-images.mjs --config config.json --plan-upload
 *   node sync-images.mjs --config config.json --upload [--limit 5] [--slab-id <SlabID>]
 *
 * Also available as:
 *   node sync-slabs.mjs --config config.json --image-manifest
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendLogLine,
  inspectSourceXml,
  loadConfig,
  resolveConfigPath,
  validateManifestConfig,
  validateUploadConfig,
  writeJsonArtifact,
} from "./connector-shared.mjs";
import {
  discoverImageManifest,
  formatManifestSummaryLines,
} from "./image-manifest.mjs";
import {
  formatUploadSummaryLines,
  loadUploadState,
  planImageUploads,
  runImageUploads,
  shouldFailUploadRun,
} from "./image-upload.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {string[]} argv
 */
export function parseImageSyncArgs(argv) {
  /** @type {{
   *   configPath: string|null,
   *   help: boolean,
   *   imageManifest: boolean,
   *   planUpload: boolean,
   *   upload: boolean,
   *   limit: number|null,
   *   slabId: string|null,
   * }} */
  const out = {
    configPath: null,
    help: false,
    imageManifest: false,
    planUpload: false,
    upload: false,
    limit: null,
    slabId: null,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--image-manifest") {
      out.imageManifest = true;
      continue;
    }
    if (arg === "--plan-upload") {
      out.planUpload = true;
      continue;
    }
    if (arg === "--upload") {
      out.upload = true;
      continue;
    }
    if (arg === "--limit") {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) throw new Error("--limit requires a number");
      out.limit = Number(next);
      if (!Number.isFinite(out.limit) || out.limit <= 0) {
        throw new Error("--limit must be a positive number");
      }
      i += 1;
      continue;
    }
    if (arg === "--slab-id") {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) throw new Error("--slab-id requires a value");
      out.slabId = next;
      i += 1;
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
 * @param {string[]} [argv]
 * @param {object} [deps]
 */
export async function runImageManifest(argv = process.argv, deps = {}) {
  const discover = deps.discoverImageManifest ?? discoverImageManifest;
  const parsed = parseImageSyncArgs(argv);
  const { configPath, help } = parsed;

  if (help) {
    console.log(`Slabsmith image sync (manifest / plan / upload)

Usage:
  node sync-images.mjs --config config.json
  node sync-images.mjs --config config.json --plan-upload
  node sync-images.mjs --config config.json --upload [--limit 5] [--slab-id <SlabID>]

Default: manifest-only discovery (no backend upload).
Upload requires explicit --upload. Use --plan-upload to preview counts first.

Config:
  sourceXmlPath    Slabsmith export XML (required)
  imageRootPath    Folder with <SlabID>.jpg files (default: C:\\slabcloud)
  logDir           Manifest JSON + image-upload-state.json
  backendBaseUrl   Required for --plan-upload / --upload
  syncToken        Required for --plan-upload / --upload (never logged)
`);
    return 0;
  }

  const cfgPath = configPath || join(__dirname, "config.json");
  const { config } = loadConfig(cfgPath);
  const needsUploadConfig = parsed.planUpload || parsed.upload;
  const validated = needsUploadConfig ? validateUploadConfig(config) : validateManifestConfig(config);

  const startedAt = new Date().toISOString();
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    appendLogLine(validated.logDir, line);
  };

  const mode = parsed.upload ? "upload" : parsed.planUpload ? "plan-upload" : "manifest";
  log(`image sync start mode=${mode} config=${cfgPath}`);

  const xmlInfo = inspectSourceXml(validated.sourceXmlPath);
  const imageRootAbs = resolveConfigPath(validated.imageRootPath);
  log(`source xml path=${xmlInfo.path} bytes=${xmlInfo.bytes} modified=${xmlInfo.modifiedAt}`);
  log(`image root path=${imageRootAbs}`);

  const xml = readFileSync(xmlInfo.path, "utf8");
  if (!xml.trim()) {
    throw new Error("Source XML file is empty");
  }

  const manifest = discover({
    xml,
    sourceXmlPath: xmlInfo.path,
    imageRootPath: imageRootAbs,
  });

  const artifact = writeJsonArtifact(validated.logDir, "image-manifest", manifest);
  if (artifact.written) {
    log(`manifest written path=${artifact.path}`);
  }

  for (const line of formatManifestSummaryLines(manifest.summary)) {
    log(line);
  }

  if (!parsed.planUpload && !parsed.upload) {
    log(`image manifest end started=${startedAt}`);
    return 0;
  }

  const state = loadUploadState(validated.logDir);
  const plan = planImageUploads(manifest, state, {
    slabIdFilter: parsed.slabId,
    limit: parsed.limit,
  });

  const uploadSummary = await runImageUploads({
    plan,
    backendBaseUrl: validated.backendBaseUrl,
    syncToken: validated.syncToken,
    logDir: validated.logDir,
    state,
    dryRun: !parsed.upload,
    uploadPair: deps.uploadImagePair,
    saveState: deps.saveUploadState,
  });

  for (const line of formatUploadSummaryLines(uploadSummary)) {
    log(line);
  }

  log(`image sync end started=${startedAt}`);
  return shouldFailUploadRun(uploadSummary) ? 1 : 0;
}

export async function runImageManifestCli(argv = process.argv) {
  try {
    const code = await runImageManifest(argv);
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
  runImageManifestCli();
}
