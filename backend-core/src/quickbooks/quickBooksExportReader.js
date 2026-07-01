/**
 * quickBooksExportReader — Phase 1 QuickBooks ingestion (local export preview only).
 *
 * SCOPE / SAFETY:
 *   - Reads a local QuickBooks SDK connector export folder (manifest.json + per-entity
 *     JSON batch files) produced by quickbooks-sdk-connector on the Windows VM.
 *   - Read-only against the local filesystem. Never writes to Supabase, never calls
 *     QuickBooks, never makes network requests.
 *   - Never returns or logs customer names, invoice numbers, addresses, emails, phone
 *     numbers, dollar amounts, or memo/note text. Only safe counts and metadata are
 *     extracted from batch JSON files — record payloads are discarded after counting.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { extractRecordCountFromBatchJson, readQuickBooksJsonFile } from "./quickBooksJsonFileReader.js";

/** Required top-level fields on manifest.json, per the connector's SyncRunManifest shape. */
export const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  "RunId",
  "StartedAt",
  "CompletedAt",
  "QbXmlVersion",
  "CompanyFile",
  "ExportDirectory",
  "Entities",
  "Errors",
]);

/** Entity folders the connector may create under an export directory (company.xml/json live at the root, not a folder). */
export const KNOWN_ENTITY_FOLDERS = Object.freeze([
  "customers",
  "invoices",
  "invoice-lines",
  "items",
  "payments",
  "vendors",
  "bills",
  "purchase-orders",
  "accounts",
  "classes",
  "sales-reps",
  "terms",
  "estimates",
  "sales-orders",
]);

/**
 * Read and validate manifest.json from an export folder.
 * Never throws — returns a result object describing validity and any errors.
 *
 * @param {string} exportFolderPath
 * @returns {Promise<{ valid: boolean, manifest: object|null, manifestPath: string, errors: string[] }>}
 */
export async function readManifest(exportFolderPath) {
  const manifestPath = path.join(exportFolderPath, "manifest.json");

  const readResult = await readQuickBooksJsonFile(manifestPath);
  if (!readResult.ok) {
    return {
      valid: false,
      manifest: null,
      manifestPath,
      errors: [`manifest.json is ${readResult.error}`],
    };
  }

  const parsed = readResult.data;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      valid: false,
      manifest: parsed,
      manifestPath,
      errors: ["manifest.json does not contain a JSON object"],
    };
  }

  const missingFields = REQUIRED_MANIFEST_FIELDS.filter((field) => !(field in parsed));
  if (missingFields.length > 0) {
    return {
      valid: false,
      manifest: parsed,
      manifestPath,
      errors: [`manifest.json missing required fields: ${missingFields.join(", ")}`],
    };
  }

  return { valid: true, manifest: parsed, manifestPath, errors: [] };
}

/**
 * List immediate subdirectories of the export folder. Returns [] if the folder
 * does not exist or is unreadable — never throws.
 *
 * @param {string} exportFolderPath
 * @returns {Promise<string[]>}
 */
export async function listExportSubfolders(exportFolderPath) {
  let entries;
  try {
    entries = await fs.readdir(exportFolderPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/**
 * Read one entity's batch JSON files and return safe counts only.
 * Batch file shape: { entityType, batchNumber, recordCount, records: [...] }.
 * The `records` array is never retained — only its length is kept.
 *
 * @param {string} exportFolderPath
 * @param {string} entityFolderName
 * @returns {Promise<{ exists: boolean, jsonFileCount: number, recordCount: number, unreadableFileCount: number, unrecognizedShapeFileCount: number }>}
 */
export async function readEntityBatchFiles(exportFolderPath, entityFolderName) {
  const folderPath = path.join(exportFolderPath, entityFolderName);

  let entries;
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    return {
      exists: false,
      jsonFileCount: 0,
      recordCount: 0,
      unreadableFileCount: 0,
      unrecognizedShapeFileCount: 0,
    };
  }

  const jsonFileNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  let recordCount = 0;
  let unreadableFileCount = 0;
  let unrecognizedShapeFileCount = 0;

  for (const fileName of jsonFileNames) {
    const filePath = path.join(folderPath, fileName);
    const readResult = await readQuickBooksJsonFile(filePath);

    if (!readResult.ok) {
      unreadableFileCount += 1;
      continue;
    }

    const { recordCount: fileRecordCount, warning } = extractRecordCountFromBatchJson(
      readResult.data,
      entityFolderName
    );
    recordCount += fileRecordCount;
    if (warning) {
      unrecognizedShapeFileCount += 1;
    }
  }

  return {
    exists: true,
    jsonFileCount: jsonFileNames.length,
    recordCount,
    unreadableFileCount,
    unrecognizedShapeFileCount,
  };
}

/**
 * Detect unknown subfolders that themselves contain a manifest.json — a strong signal
 * the export folder was nested/duplicated (e.g. copy/zip mistake).
 *
 * @param {string} exportFolderPath
 * @param {string[]} candidateFolders
 * @returns {Promise<string[]>}
 */
export async function findNestedManifestFolders(exportFolderPath, candidateFolders) {
  const nested = [];
  for (const folderName of candidateFolders) {
    const nestedManifestPath = path.join(exportFolderPath, folderName, "manifest.json");
    try {
      await fs.access(nestedManifestPath);
      nested.push(folderName);
    } catch {
      // Not nested — expected for normal entity data folders.
    }
  }
  return nested;
}

/**
 * Read an entire export folder: manifest + known entity folders + unknown-folder detection.
 * Safe to call even when the export folder is missing, partial, or contains unexpected
 * extra subfolders — this never throws and never surfaces raw record content.
 *
 * @param {string} exportFolderPath
 * @param {{ entityFolders?: readonly string[] }} [options]
 */
export async function readQuickBooksExport(exportFolderPath, options = {}) {
  const entityFolderNames = options.entityFolders ?? KNOWN_ENTITY_FOLDERS;

  const manifestResult = await readManifest(exportFolderPath);
  const discoveredFolders = await listExportSubfolders(exportFolderPath);

  const knownSet = new Set(entityFolderNames);
  const unknownFolders = discoveredFolders.filter((name) => !knownSet.has(name));

  const entityFolders = {};
  for (const folderName of entityFolderNames) {
    entityFolders[folderName] = await readEntityBatchFiles(exportFolderPath, folderName);
  }

  const exportFolderBaseName = path.basename(exportFolderPath);
  const selfNamedNestedFolders = unknownFolders.filter((name) => name === exportFolderBaseName);
  const nestedManifestFolders = await findNestedManifestFolders(exportFolderPath, unknownFolders);

  return {
    exportFolderPath,
    manifestResult,
    entityFolders,
    discoveredFolders,
    unknownFolders,
    nestedManifestFolders: Array.from(new Set([...nestedManifestFolders, ...selfNamedNestedFolders])),
  };
}
