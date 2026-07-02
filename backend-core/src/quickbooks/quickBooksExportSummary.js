/**
 * quickBooksExportSummary — Phase 1 QuickBooks ingestion (local export preview only).
 *
 * Builds a safe, human-readable summary from a `readQuickBooksExport(...)` result.
 * Output contains only counts, timestamps, and folder metadata — never raw
 * customer/invoice/vendor payloads.
 */

import { KNOWN_ENTITY_FOLDERS } from "./quickBooksExportReader.js";

function manifestEntityMap(manifest) {
  const map = new Map();
  if (!manifest || !Array.isArray(manifest.Entities)) {
    return map;
  }

  for (const entity of manifest.Entities) {
    if (entity && typeof entity.EntityType === "string") {
      map.set(entity.EntityType, entity);
    }
  }

  return map;
}

/**
 * @param {Awaited<ReturnType<import("./quickBooksExportReader.js").readQuickBooksExport>>} exportReadResult
 */
export function buildQuickBooksExportSummary(exportReadResult) {
  const {
    exportFolderPath,
    manifestResult,
    entityFolders = {},
    unknownFolders = [],
    nestedManifestFolders = [],
  } = exportReadResult ?? {};

  const warnings = [];
  const manifestValid = Boolean(manifestResult?.valid);
  const manifest = manifestResult?.manifest ?? null;

  if (!manifestValid) {
    for (const err of manifestResult?.errors ?? ["manifest.json missing or invalid"]) {
      warnings.push(err);
    }
  }

  const entitiesByType = manifestEntityMap(manifest);
  const perEntity = {};
  const missingFolders = [];
  let totalManifestRecordCount = 0;
  let totalDiscoveredRecordCount = 0;

  for (const folderName of KNOWN_ENTITY_FOLDERS) {
    const folderResult = entityFolders[folderName] ?? {
      exists: false,
      jsonFileCount: 0,
      recordCount: 0,
      unreadableFileCount: 0,
      unrecognizedShapeFileCount: 0,
      selfReportedOnlyFileCount: 0,
    };

    if (!folderResult.exists) {
      missingFolders.push(folderName);
    }

    const manifestEntity = entitiesByType.get(folderName) ?? null;
    const manifestRecordCount =
      typeof manifestEntity?.RecordCount === "number" ? manifestEntity.RecordCount : null;
    const manifestBatchCount =
      typeof manifestEntity?.BatchCount === "number" ? manifestEntity.BatchCount : null;
    const manifestErrorCount = Array.isArray(manifestEntity?.Errors) ? manifestEntity.Errors.length : 0;

    if (manifestRecordCount !== null) {
      totalManifestRecordCount += manifestRecordCount;
    }
    totalDiscoveredRecordCount += folderResult.recordCount;

    const selfReportedOnlyFileCount = folderResult.selfReportedOnlyFileCount ?? 0;

    perEntity[folderName] = {
      inManifest: Boolean(manifestEntity),
      folderExists: folderResult.exists,
      manifestBatchCount,
      manifestRecordCount,
      manifestErrorCount,
      discoveredJsonFileCount: folderResult.jsonFileCount,
      discoveredRecordCount: folderResult.recordCount,
      unreadableFileCount: folderResult.unreadableFileCount ?? 0,
      unrecognizedShapeFileCount: folderResult.unrecognizedShapeFileCount ?? 0,
      selfReportedOnlyFileCount,
    };

    if (
      manifestEntity &&
      manifestRecordCount !== null &&
      folderResult.exists &&
      manifestRecordCount !== folderResult.recordCount
    ) {
      warnings.push(
        `[${folderName}] manifest record count (${manifestRecordCount}) does not match discovered files (${folderResult.recordCount})`
      );
    }

    if (manifestErrorCount > 0) {
      warnings.push(`[${folderName}] manifest reports ${manifestErrorCount} error(s) for this entity`);
    }

    if (folderResult.unreadableFileCount > 0) {
      warnings.push(`[${folderName}] ${folderResult.unreadableFileCount} batch JSON file(s) could not be read/parsed`);
    }

    if (folderResult.unrecognizedShapeFileCount > 0) {
      warnings.push(
        `[${folderName}] ${folderResult.unrecognizedShapeFileCount} batch JSON file(s) had an unrecognized/ambiguous record shape`
      );
    }

    if (selfReportedOnlyFileCount > 0) {
      warnings.push(
        `[${folderName}] ${selfReportedOnlyFileCount} batch file(s) contain only a self-reported count, not materialized records` +
          ` (connector serialization bug: record bodies were not serialized to disk) — not ingest-ready`
      );
    }
  }

  const invoiceLinesFolder = entityFolders["invoice-lines"];
  if (invoiceLinesFolder?.exists && !entitiesByType.has("invoice-lines")) {
    warnings.push(
      "invoice-lines folder exists on disk but is not represented as its own entity in manifest.Entities " +
        "(expected — invoice line items are extracted alongside the invoices entity, not as a separate manifest entry)"
    );
  }

  if (nestedManifestFolders.length > 0) {
    warnings.push(
      `export folder appears nested/duplicated — found subfolder(s) with their own manifest.json or matching the ` +
        `export folder's own name: ${nestedManifestFolders.join(", ")}`
    );
  }

  const manifestTopLevelErrorCount =
    manifestValid && Array.isArray(manifest?.Errors) ? manifest.Errors.length : null;
  if (manifestTopLevelErrorCount) {
    warnings.push(`manifest.json reports ${manifestTopLevelErrorCount} top-level error(s)`);
  }

  return {
    exportFolderPath,
    manifestValid,
    runId: manifest?.RunId ?? null,
    qbXmlVersion: manifest?.QbXmlVersion ?? null,
    startedAt: manifest?.StartedAt ?? null,
    completedAt: manifest?.CompletedAt ?? null,
    totalEntityTypesInManifest:
      manifestValid && Array.isArray(manifest?.Entities) ? manifest.Entities.length : null,
    totalManifestRecordCount,
    totalDiscoveredRecordCount,
    manifestTopLevelErrorCount,
    perEntity,
    missingFolders,
    unknownFolders,
    nestedManifestFolders,
    warnings,
  };
}
