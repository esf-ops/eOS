/**
 * quickBooksExportValidation — shared QuickBooks export validation/reading helpers.
 *
 * Library module (no CLI concerns) used by BOTH the Phase 2B dry-run script and the
 * Phase 3A import orchestrator, so core ingestion never depends on a scripts/ CLI file.
 *
 * SAFETY: reads the local filesystem only. Never writes, never networks, never logs or
 * returns raw record content — callers must not log the records these helpers return.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { extractRecordsFromBatchJson, readQuickBooksJsonFile } from "./quickBooksJsonFileReader.js";

/**
 * Compute the fail-closed block reasons from a Phase 1 export summary.
 *
 * The standalone `invoice-lines` folder is fully exempt: it is not the staging source
 * (invoice lines are derived from invoice records), it is not represented in
 * manifest.Entities, and it serves only as a count cross-check. A corrupt/absent
 * invoice-lines folder must never block an otherwise-valid import.
 *
 * @param {object} summary
 * @returns {string[]}
 */
export function computeBlockReasons(summary) {
  const reasons = [];

  if (!summary.manifestValid) {
    reasons.push("manifest.json is missing or invalid");
  }

  for (const [folder, entity] of Object.entries(summary.perEntity ?? {})) {
    if (folder === "invoice-lines") {
      // Cross-check only — never a source, never a block reason.
      continue;
    }
    if (entity.selfReportedOnlyFileCount > 0) {
      reasons.push(`[${folder}] selfReportedOnlyFileCount=${entity.selfReportedOnlyFileCount} (records not materialized)`);
    }
    if (entity.unreadableFileCount > 0) {
      reasons.push(`[${folder}] unreadableFileCount=${entity.unreadableFileCount}`);
    }
    if (entity.unrecognizedShapeFileCount > 0) {
      reasons.push(`[${folder}] unrecognizedShapeFileCount=${entity.unrecognizedShapeFileCount}`);
    }
    if (
      entity.inManifest &&
      typeof entity.manifestRecordCount === "number" &&
      entity.folderExists &&
      entity.manifestRecordCount !== entity.discoveredRecordCount
    ) {
      reasons.push(
        `[${folder}] manifest record count (${entity.manifestRecordCount}) != discovered (${entity.discoveredRecordCount})`
      );
    }
  }

  return reasons;
}

/**
 * Read all materialized records for one entity folder, batch file by batch file.
 * Never retains file content beyond the returned arrays; callers must not log records.
 *
 * NOTE (Phase 3B): this loads an entire entity folder's records into memory at once.
 * A production import must stream/chunk READS as well as writes — do not reuse this
 * whole-folder reader unchanged against very large exports in Phase 3B.
 *
 * @param {string} exportFolderPath
 * @param {string} folder
 * @returns {Promise<{ batches: Array<{ fileName: string, records: unknown[] }>, unreadable: number, unmaterialized: number }>}
 */
export async function readEntityRecordBatches(exportFolderPath, folder) {
  const folderPath = path.join(exportFolderPath, folder);
  let entries;
  try {
    entries = await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    return { batches: [], unreadable: 0, unmaterialized: 0 };
  }

  const jsonFileNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const batches = [];
  let unreadable = 0;
  let unmaterialized = 0;

  for (const fileName of jsonFileNames) {
    const readResult = await readQuickBooksJsonFile(path.join(folderPath, fileName));
    if (!readResult.ok) {
      unreadable += 1;
      continue;
    }
    const { ok, records } = extractRecordsFromBatchJson(readResult.data);
    if (!ok) {
      unmaterialized += 1;
      continue;
    }
    batches.push({ fileName, records });
  }

  return { batches, unreadable, unmaterialized };
}

/**
 * Build a map of manifest entity type -> declared RecordCount (safe integers only).
 * Shared reconciliation basis for the dry-run and the import orchestrator.
 *
 * @param {object|null} manifest
 * @returns {Record<string, number>}
 */
export function manifestEntityCounts(manifest) {
  const counts = {};
  const entities = Array.isArray(manifest?.Entities) ? manifest.Entities : [];
  for (const entity of entities) {
    if (entity && typeof entity.EntityType === "string" && typeof entity.RecordCount === "number") {
      counts[entity.EntityType] = entity.RecordCount;
    }
  }
  return counts;
}
