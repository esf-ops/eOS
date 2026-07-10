/**
 * quickBooksStagingImport — Phase 3A QuickBooks ingestion (import orchestrator).
 *
 * Orchestrates a staging import by REUSING the Phase 2B dry-run validation and the Phase 2
 * staging-row builders, then writing rows through an injected repository (see
 * quickBooksStagingRepository.js). In Phase 3A the only repository implementation is the
 * in-memory fake — there is NO Supabase client, NO service-role env, NO network here.
 *
 * Flow:
 *   1. Read + summarize the export (Phase 1) and compute fail-closed gates (dry-run).
 *   2. If any gate trips -> abort BEFORE any repository writes (status "failed").
 *   3. Otherwise open an audit run, then build + chunk-upsert:
 *        - company (root company.json)
 *        - all primary manifest folder entities
 *        - invoice-lines DERIVED from invoices (authoritative, parent-linked)
 *   4. Isolate per-record failures (record safe reasons; keep importing the rest).
 *   5. Reconcile manifest totals; record data-quality findings; finalize the run.
 *
 * SAFETY: never logs or returns raw records, raw_payload, names, addresses, amounts, or
 * memos. The result and the endpoint response carry only counts, IDs, safe reason strings,
 * and finding type names.
 */

import path from "node:path";

import { readQuickBooksExport, KNOWN_ENTITY_FOLDERS } from "./quickBooksExportReader.js";
import { buildQuickBooksExportSummary } from "./quickBooksExportSummary.js";
import { extractRecordsFromBatchJson, readQuickBooksJsonFile } from "./quickBooksJsonFileReader.js";
import {
  buildInvoiceLineRowsFromInvoiceRecord,
  buildStagingBatch,
  buildStagingRow,
  classifyQbEntityKind,
  getStagingUpsertConfig,
} from "./quickBooksStaging.js";
import {
  computeBlockReasons,
  manifestEntityCounts,
  readEntityRecordBatches,
} from "./quickBooksExportValidation.js";

const DEFAULT_CHUNK_SIZE = 500;

/**
 * Upsert rows through the repository in fixed-size chunks (models the chunked import path
 * for large entities). Returns aggregate insert/update counts.
 *
 * @param {import("./quickBooksStagingRepository.js").QuickBooksStagingRepository} repository
 * @param {{ tableName: string, conflictColumns: string[], updateColumns: string[] }} config
 * @param {object[]} rows
 * @param {number} chunkSize
 * @returns {Promise<{ inserted: number, updated: number }>}
 */
async function upsertInChunks(repository, config, rows, chunkSize) {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result = await repository.upsertRows(config.tableName, chunk, config.conflictColumns, config.updateColumns);
    inserted += result.inserted;
    updated += result.updated;
  }
  return { inserted, updated };
}

/**
 * Import a materialized QuickBooks export into staging via the injected repository.
 *
 * @param {string} exportFolderPath
 * @param {{
 *   organizationId: string,
 *   repository: import("./quickBooksStagingRepository.js").QuickBooksStagingRepository,
 *   chunkSize?: number,
 *   mode?: string,
 * }} options
 * @returns {Promise<object>} safe result (counts/IDs/reasons only)
 */
export async function importQuickBooksStaging(exportFolderPath, options = {}) {
  const {
    repository,
    chunkSize = DEFAULT_CHUNK_SIZE,
    mode = "manual-import",
    importGroupId = null,
    chunkIndex = null,
    chunkCount = null,
  } = options;
  const organizationId = options.organizationId;

  if (!repository) {
    throw new Error("importQuickBooksStaging requires a repository");
  }

  const failedShell = (extra) => ({
    ok: false,
    status: "failed",
    syncRunId: null,
    runId: null,
    qbXmlVersion: null,
    blockReasons: [],
    failReasons: [],
    perEntity: {},
    dataQualityFindingCounts: {},
    warnings: [],
    totalStagingRows: 0,
    totalFailures: 0,
    ...extra,
  });

  if (typeof organizationId !== "string" || organizationId.trim().length === 0) {
    return failedShell({ blockReasons: ["organizationId is required"] });
  }

  const readResult = await readQuickBooksExport(exportFolderPath);
  const summary = buildQuickBooksExportSummary(readResult);
  const manifest = readResult.manifestResult?.manifest ?? null;
  const manifestCounts = manifestEntityCounts(manifest);
  const runId = summary.runId ?? null;
  const qbXmlVersion = summary.qbXmlVersion ?? null;

  const blockReasons = computeBlockReasons(summary);
  if (blockReasons.length > 0) {
    // Fail closed BEFORE any repository interaction — no run row, no staging writes.
    return failedShell({ runId, qbXmlVersion, blockReasons });
  }

  // Gates passed — open an audit run, then write.
  const { id: syncRunId } = await repository.createSyncRun({
    organization_id: organizationId,
    source_system: "quickbooks",
    qb_run_id: runId,
    qb_xml_version: qbXmlVersion,
    mode,
    status: "running",
    import_group_id: importGroupId,
    chunk_index: chunkIndex,
    chunk_count: chunkCount,
  });

  // Hoisted above the try so the catch can flush whatever was accumulated before a throw.
  const dataQualityFindingCounts = {};
  const errorRows = [];

  const bumpFinding = (type) => {
    dataQualityFindingCounts[type] = (dataQualityFindingCounts[type] ?? 0) + 1;
  };
  const pushError = (entityType, reason) => {
    errorRows.push({
      organization_id: organizationId,
      sync_run_id: syncRunId,
      entity_type: entityType,
      severity: "error",
      stage: "build",
      message: reason, // safe: builder reasons never contain record content
    });
  };
  // Build the finding rows (counts only, no record content) from accumulated counts.
  const buildFindingRows = () =>
    Object.entries(dataQualityFindingCounts).map(([findingType, count]) => ({
      organization_id: organizationId,
      sync_run_id: syncRunId,
      finding_type: findingType,
      severity: "warning",
      entity_type: findingType === "invoice_lines_standalone_vs_derived_mismatch" ? "invoice-lines" : "multiple",
      message: `${findingType} (count=${count})`,
      metadata: { count },
    }));

  try {
  const ctx = { organizationId, syncRunId, qbXmlVersion };
  const perEntity = {};
  const warnings = [];
  const failReasons = [];
  let totalStagingRows = 0;
  let totalFailures = 0;

  // ── Company (root company.json) ────────────────────────────────────────────
  const companyInManifest = Object.prototype.hasOwnProperty.call(manifestCounts, "company");
  {
    const readC = await readQuickBooksJsonFile(path.join(exportFolderPath, "company.json"));
    let sourceRecordCount = 0;
    let failureCount = 0;
    const failureReasons = {};
    const rows = [];
    const bumpR = (reason) => {
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
      pushError("company", reason);
    };

    let present = false;
    if (!readC.ok) {
      if (companyInManifest) {
        present = true;
        failureCount += 1;
        bumpR("company.json missing or unreadable");
      }
    } else {
      const extracted = extractRecordsFromBatchJson(readC.data);
      if (!extracted.ok) {
        present = true;
        failureCount += 1;
        bumpR("company.json records not materialized");
      } else {
        sourceRecordCount = extracted.records.length;
        present = companyInManifest || sourceRecordCount > 0;
        if (extracted.records.length === 0 && companyInManifest) {
          failureCount += 1;
          bumpR("company.json has no records");
        }
        for (const record of extracted.records) {
          const built = buildStagingRow("company", record, ctx);
          if (built.ok) rows.push(built.row);
          else {
            failureCount += 1;
            bumpR(built.reason);
          }
        }
      }
    }

    if (present) {
      const cfg = getStagingUpsertConfig("company");
      const { inserted, updated } = await upsertInChunks(repository, cfg, rows, chunkSize);
      perEntity.company = { sourceRecordCount, stagingRowCount: rows.length, failureCount, inserted, updated, failureReasons };
      totalStagingRows += rows.length;
      totalFailures += failureCount;
    }
  }

  // ── Derived invoice-lines accumulator + cross-invoice upsert buffer ─────────
  const derivedLines = {
    source: "derived-from-invoices",
    sourceRecordCount: 0,
    stagingRowCount: 0,
    failureCount: 0,
    inserted: 0,
    updated: 0,
    failureReasons: {},
  };
  const lineCfg = getStagingUpsertConfig("invoice-lines");
  const lineBuffer = [];
  const flushLines = async (force) => {
    while (lineBuffer.length > 0 && (force || lineBuffer.length >= chunkSize)) {
      const chunk = lineBuffer.splice(0, chunkSize);
      const r = await repository.upsertRows(lineCfg.tableName, chunk, lineCfg.conflictColumns, lineCfg.updateColumns);
      derivedLines.inserted += r.inserted;
      derivedLines.updated += r.updated;
    }
  };

  // ── Primary folder entities (skip standalone invoice-lines) ────────────────
  for (const folder of KNOWN_ENTITY_FOLDERS) {
    if (folder === "invoice-lines") continue;

    const { batches, unreadable, unmaterialized } = await readEntityRecordBatches(exportFolderPath, folder);
    const cfg = getStagingUpsertConfig(folder);
    const kind = classifyQbEntityKind(folder);

    let sourceRecordCount = 0;
    let stagingRowCount = 0;
    let failureCount = 0;
    let inserted = 0;
    let updated = 0;
    const failureReasons = {};
    const bumpR = (reason) => {
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
      pushError(folder, reason);
    };

    for (const batch of batches) {
      sourceRecordCount += batch.records.length;
      const { rows, failures } = buildStagingBatch(folder, batch.records, ctx);

      for (const row of rows) {
        if ((kind === "list" || kind === "transaction") && !row.qb_edit_sequence) bumpFinding("missing_edit_sequence");
        if (kind === "transaction" && !row.txn_date) bumpFinding("missing_txn_date");
      }

      const up = await upsertInChunks(repository, cfg, rows, chunkSize);
      inserted += up.inserted;
      updated += up.updated;
      stagingRowCount += rows.length;
      failureCount += failures.length;
      for (const f of failures) bumpR(f.reason);

      // Derive invoice lines from each invoice record. Buffer successful line rows and
      // flush in chunkSize batches ACROSS invoices (not one upsert per invoice).
      if (folder === "invoices") {
        for (const invoiceRecord of batch.records) {
          const { rows: lineRows, failures: lineFailures } = buildInvoiceLineRowsFromInvoiceRecord(invoiceRecord, ctx);
          derivedLines.sourceRecordCount += lineRows.length + lineFailures.length;
          derivedLines.stagingRowCount += lineRows.length;
          derivedLines.failureCount += lineFailures.length;
          for (const lineRow of lineRows) lineBuffer.push(lineRow);
          for (const f of lineFailures) {
            derivedLines.failureReasons[f.reason] = (derivedLines.failureReasons[f.reason] ?? 0) + 1;
            pushError("invoice-lines", f.reason);
          }
          await flushLines(false);
        }
      }
    }

    if (unreadable > 0) {
      failureCount += unreadable;
      bumpR("batch file unreadable");
    }
    if (unmaterialized > 0) {
      failureCount += unmaterialized;
      bumpR("batch file records not materialized");
    }

    perEntity[folder] = { sourceRecordCount, stagingRowCount, failureCount, inserted, updated, failureReasons };
    totalStagingRows += stagingRowCount;
    totalFailures += failureCount;
  }

  // Flush any remaining buffered invoice-line rows (final partial chunk).
  await flushLines(true);

  // Record derived invoice-lines as its own entity + standalone cross-check.
  const standaloneLinesCount = summary.perEntity?.["invoice-lines"]?.discoveredRecordCount ?? null;
  perEntity["invoice-lines"] = {
    source: derivedLines.source,
    sourceRecordCount: derivedLines.sourceRecordCount,
    stagingRowCount: derivedLines.stagingRowCount,
    failureCount: derivedLines.failureCount,
    inserted: derivedLines.inserted,
    updated: derivedLines.updated,
    failureReasons: derivedLines.failureReasons,
    standaloneFolderCount: standaloneLinesCount,
  };
  totalStagingRows += derivedLines.stagingRowCount;
  totalFailures += derivedLines.failureCount;

  if (typeof standaloneLinesCount === "number" && standaloneLinesCount !== derivedLines.stagingRowCount) {
    bumpFinding("invoice_lines_standalone_vs_derived_mismatch");
    warnings.push(
      `invoice-lines cross-check: derived from invoices=${derivedLines.stagingRowCount} != ` +
        `standalone folder=${standaloneLinesCount} (standalone folder is informational only)`
    );
  }

  // ── Manifest-total reconciliation ──────────────────────────────────────────
  const manifestTotal = Object.values(manifestCounts).reduce((sum, n) => sum + n, 0);
  const builtPrimaryTotal = Object.entries(perEntity)
    .filter(([folder]) => folder !== "invoice-lines")
    .reduce((sum, [, entity]) => sum + entity.stagingRowCount, 0);
  if (manifestTotal !== builtPrimaryTotal) {
    failReasons.push(
      `manifest-total reconciliation failed: manifest entity total (${manifestTotal}) != ` +
        `built primary staging rows (${builtPrimaryTotal}); a manifest entity may be unstaged`
    );
  }

  // ── Findings + audit finalize ──────────────────────────────────────────────
  const findingRows = buildFindingRows();
  if (findingRows.length > 0) await repository.recordFindings(findingRows);
  if (errorRows.length > 0) await repository.recordErrors(errorRows);

  const status = totalFailures > 0 || failReasons.length > 0 ? "partial" : "success";

  const entityCounts = {};
  for (const [folder, entity] of Object.entries(perEntity)) {
    entityCounts[folder] = {
      source: entity.sourceRecordCount,
      staged: entity.stagingRowCount,
      failures: entity.failureCount,
      inserted: entity.inserted,
      updated: entity.updated,
    };
  }

  await repository.finalizeSyncRun(syncRunId, {
    status,
    finished_at: new Date().toISOString(),
    error_count: totalFailures,
    entity_counts: entityCounts,
    metadata: { manifestTotal, builtPrimaryTotal, derivedInvoiceLineCount: derivedLines.stagingRowCount },
  });

  return {
    ok: status === "success",
    status,
    syncRunId,
    runId,
    qbXmlVersion,
    blockReasons: [],
    failReasons,
    perEntity,
    dataQualityFindingCounts,
    warnings,
    manifestTotal,
    builtPrimaryTotal,
    derivedInvoiceLineCount: derivedLines.stagingRowCount,
    totalStagingRows,
    totalFailures,
  };
  } catch (err) {
    // A write-phase error must not leave the run stuck "running", and per-record errors/
    // findings accumulated before the throw must not be lost. Use a SAFE message only
    // (never err.message, which could carry DB/raw details), best-effort flush the audit
    // rows, then finalize the run failed. All audit writes here are best-effort.
    const safeMessage = `import aborted during write phase (${err?.code ?? err?.name ?? "error"})`;

    try {
      if (errorRows.length > 0) await repository.recordErrors(errorRows);
    } catch {
      // Swallow — audit flush is best-effort.
    }
    try {
      const findingRows = buildFindingRows();
      if (findingRows.length > 0) await repository.recordFindings(findingRows);
    } catch {
      // Swallow — audit flush is best-effort.
    }
    try {
      await repository.finalizeSyncRun(syncRunId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_count: errorRows.length,
        error_message: safeMessage,
      });
    } catch {
      // Swallow finalize errors — we still return a failed result below.
    }

    return failedShell({ runId, qbXmlVersion, syncRunId, failReasons: [safeMessage] });
  }
}

/**
 * Shape a safe HTTP-style response from an import result — this is the endpoint contract a
 * future protected internal route (`POST /api/internal/quickbooks-sync/import`) would return.
 * Contains only counts/IDs/reasons; never raw records or raw_payload.
 *
 * @param {object} result
 * @returns {{ statusCode: number, body: object }}
 */
export function buildImportResponse(result) {
  const statusCode = result.status === "success" ? 200 : result.status === "partial" ? 207 : 422;
  return {
    statusCode,
    body: {
      result: result.status,
      runId: result.runId ?? null,
      syncRunId: result.syncRunId ?? null,
      manifestTotal: result.manifestTotal ?? null,
      builtPrimaryTotal: result.builtPrimaryTotal ?? null,
      derivedInvoiceLineCount: result.derivedInvoiceLineCount ?? null,
      totalStagingRows: result.totalStagingRows ?? 0,
      totalFailures: result.totalFailures ?? 0,
      perEntity: result.perEntity ?? {},
      dataQualityFindingCounts: result.dataQualityFindingCounts ?? {},
      warnings: result.warnings ?? [],
      blockReasons: result.blockReasons ?? [],
      failReasons: result.failReasons ?? [],
    },
  };
}
