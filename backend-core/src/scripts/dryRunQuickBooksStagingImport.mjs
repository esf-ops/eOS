#!/usr/bin/env node
/**
 * dryRunQuickBooksStagingImport — Phase 2B QuickBooks staging import DRY RUN (local only).
 *
 * Usage:
 *   node backend-core/src/scripts/dryRunQuickBooksStagingImport.mjs /path/to/export-folder
 *   npm run qb:staging:dry-run -- /path/to/export-folder
 *
 * Reads a materialized QuickBooks SDK connector export folder, validates it with the
 * Phase 1 reader/summary, then builds Phase 2 staging rows in memory to prove the export
 * would import cleanly — WITHOUT writing anything.
 *
 * SAFETY (hard guarantees):
 *   - No Supabase client is imported or constructed. No service-role env vars are read.
 *   - No network calls of any kind. No QuickBooks connection. No writeback.
 *   - Staging rows are built and immediately discarded after counting — never persisted.
 *   - Only safe metadata/counts are printed. Raw records and raw_payload are NEVER printed.
 *
 * Fails closed (DRY RUN FAIL) if:
 *   - manifest is missing/invalid
 *   - any entity has selfReportedOnlyFileCount > 0 (records not materialized)
 *   - any entity has unreadableFileCount > 0
 *   - any entity has unrecognizedShapeFileCount > 0
 *   - a manifest-backed entity's record count does not match its discovered count
 *   - any record fails to build a staging row (isolated per record, but still fails the run)
 *
 * Exit codes: 0 = DRY RUN PASS, 1 = DRY RUN FAIL or usage error.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { readQuickBooksExport, KNOWN_ENTITY_FOLDERS } from "../quickbooks/quickBooksExportReader.js";
import { buildQuickBooksExportSummary } from "../quickbooks/quickBooksExportSummary.js";
import { extractRecordsFromBatchJson, readQuickBooksJsonFile } from "../quickbooks/quickBooksJsonFileReader.js";
import {
  buildInvoiceLineRowsFromInvoiceRecord,
  buildStagingBatch,
  buildStagingRow,
  classifyQbEntityKind,
} from "../quickbooks/quickBooksStaging.js";
import {
  computeBlockReasons,
  manifestEntityCounts,
  readEntityRecordBatches,
} from "../quickbooks/quickBooksExportValidation.js";

// Re-export the shared validation helpers so existing importers of this module keep working.
export { computeBlockReasons, manifestEntityCounts, readEntityRecordBatches };

/**
 * Dry-run placeholder organization id. This is NOT a Supabase credential — it only
 * scopes the in-memory staging rows so the builder's org validation passes. Override
 * with --org=<uuid> or QB_DRYRUN_ORGANIZATION_ID for a realistic multi-tenant preview.
 */
const DEFAULT_DRYRUN_ORG_ID = "00000000-0000-0000-0000-000000000000";

/** Entity folders that carry stageable per-entity batch files (company is a root file). */
const STAGEABLE_FOLDERS = KNOWN_ENTITY_FOLDERS;

function printUsage() {
  console.log("Usage: node backend-core/src/scripts/dryRunQuickBooksStagingImport.mjs /path/to/export-folder [--org=<uuid>]");
}

/**
 * Build the company staging entry from the root `company.json` file (the connector writes
 * company as a root file, not an entity folder). Fails closed when the manifest declares a
 * company entity but the file is missing/unreadable/unmaterialized/empty, or when it does
 * not yield exactly the manifest-declared number of company records. Never logs record
 * content. Returns null only when company is neither in the manifest nor present on disk.
 *
 * @param {string} exportFolderPath
 * @param {boolean} companyInManifest
 * @param {StagingContext} ctx
 * @returns {Promise<{ sourceRecordCount: number, stagingRowCount: number, failureCount: number, failureReasons: Record<string, number> }|null>}
 */
async function buildCompanyEntityReport(exportFolderPath, companyInManifest, ctx) {
  const companyPath = path.join(exportFolderPath, "company.json");
  const readResult = await readQuickBooksJsonFile(companyPath);

  let sourceRecordCount = 0;
  let stagingRowCount = 0;
  let failureCount = 0;
  const failureReasons = {};
  const bump = (reason) => {
    failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
  };

  if (!readResult.ok) {
    if (!companyInManifest) return null; // no company anywhere — nothing to report
    bump("company.json missing or unreadable");
    return { sourceRecordCount: 0, stagingRowCount: 0, failureCount: 1, failureReasons };
  }

  const { ok, records } = extractRecordsFromBatchJson(readResult.data);
  if (!ok) {
    bump("company.json records not materialized");
    return { sourceRecordCount: 0, stagingRowCount: 0, failureCount: 1, failureReasons };
  }

  sourceRecordCount = records.length;
  if (records.length === 0) {
    if (!companyInManifest) return null;
    bump("company.json has no records");
    return { sourceRecordCount: 0, stagingRowCount: 0, failureCount: 1, failureReasons };
  }

  for (const record of records) {
    const result = buildStagingRow("company", record, ctx);
    if (result.ok) {
      stagingRowCount += 1;
    } else {
      failureCount += 1;
      bump(result.reason);
    }
  }

  return { sourceRecordCount, stagingRowCount, failureCount, failureReasons };
}

/**
 * Build the dry-run report for a materialized export folder. Pure with respect to the
 * filesystem (reads only) — never writes, never networks, never prints. The CLI layer
 * formats and prints the returned report.
 *
 * @param {string} exportFolderPath
 * @param {{ organizationId?: string }} [options]
 * @returns {Promise<object>}
 */
export async function buildDryRunReport(exportFolderPath, options = {}) {
  const organizationId = options.organizationId || DEFAULT_DRYRUN_ORG_ID;

  const readResult = await readQuickBooksExport(exportFolderPath);
  const summary = buildQuickBooksExportSummary(readResult);

  const runId = summary.runId ?? null;
  const qbXmlVersion = summary.qbXmlVersion ?? null;

  const blockReasons = computeBlockReasons(summary);

  // Fail closed on validation gates before building any rows.
  if (blockReasons.length > 0) {
    return {
      ok: false,
      blocked: true,
      exportFolderPath,
      organizationId,
      runId,
      qbXmlVersion,
      blockReasons,
      perEntity: {},
      dataQualityFindingCounts: {},
      totalStagingRows: 0,
      totalFailures: 0,
      result: "DRY RUN FAIL",
    };
  }

  const ctx = { organizationId, syncRunId: null, qbXmlVersion };
  const manifest = readResult.manifestResult?.manifest ?? null;
  const manifestCounts = manifestEntityCounts(manifest);
  const perEntity = {};
  const dataQualityFindingCounts = {};
  const warnings = [];
  const failReasons = [];
  let totalStagingRows = 0;
  let totalFailures = 0;

  const bumpFinding = (type) => {
    dataQualityFindingCounts[type] = (dataQualityFindingCounts[type] ?? 0) + 1;
  };

  // Company is a root file (company.json), not an entity folder — stage it first so it is
  // never silently omitted (it is a manifest entity with a brain_quickbooks_company table).
  const companyInManifest = Object.prototype.hasOwnProperty.call(manifestCounts, "company");
  const companyEntity = await buildCompanyEntityReport(exportFolderPath, companyInManifest, ctx);
  if (companyEntity) {
    perEntity.company = companyEntity;
    totalStagingRows += companyEntity.stagingRowCount;
    totalFailures += companyEntity.failureCount;
  }

  // Accumulators for invoice lines DERIVED from invoice records (the authoritative source).
  const derivedLines = {
    source: "derived-from-invoices",
    sourceRecordCount: 0, // total nested line elements seen across all invoices
    stagingRowCount: 0,
    failureCount: 0,
    failureReasons: {},
  };
  const bumpDerivedReason = (reason) => {
    derivedLines.failureReasons[reason] = (derivedLines.failureReasons[reason] ?? 0) + 1;
  };

  for (const folder of STAGEABLE_FOLDERS) {
    // The standalone invoice-lines folder is NOT a staging source — it is a count
    // cross-check only. Invoice lines are derived from invoice records below.
    if (folder === "invoice-lines") {
      continue;
    }

    const { batches, unreadable, unmaterialized } = await readEntityRecordBatches(exportFolderPath, folder);

    let sourceRecordCount = 0;
    let stagingRowCount = 0;
    let failureCount = 0;
    /** Safe reason string -> count. buildStagingRow reasons never contain record content. */
    const failureReasons = {};
    const kind = classifyQbEntityKind(folder);

    const bumpReason = (reason) => {
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
    };

    for (const batch of batches) {
      sourceRecordCount += batch.records.length;
      const { rows, failures } = buildStagingBatch(folder, batch.records, ctx);
      stagingRowCount += rows.length;
      failureCount += failures.length;
      for (const failure of failures) {
        bumpReason(failure.reason);
      }

      // Safe data-quality findings (counts only, never record content).
      for (const row of rows) {
        if ((kind === "list" || kind === "transaction") && !row.qb_edit_sequence) {
          bumpFinding("missing_edit_sequence");
        }
        if (kind === "transaction" && !row.txn_date) {
          bumpFinding("missing_txn_date");
        }
      }

      // Derive invoice lines from each invoice record (authoritative, parent-linked source).
      if (folder === "invoices") {
        for (const invoiceRecord of batch.records) {
          const { rows: lineRows, failures: lineFailures } = buildInvoiceLineRowsFromInvoiceRecord(
            invoiceRecord,
            ctx
          );
          derivedLines.sourceRecordCount += lineRows.length + lineFailures.length;
          derivedLines.stagingRowCount += lineRows.length;
          derivedLines.failureCount += lineFailures.length;
          for (const failure of lineFailures) {
            bumpDerivedReason(failure.reason);
          }
        }
      }
    }

    // A file that could not be read/materialized in this second pass also fails the run.
    if (unreadable > 0) {
      failureCount += unreadable;
      bumpReason("batch file unreadable");
    }
    if (unmaterialized > 0) {
      failureCount += unmaterialized;
      bumpReason("batch file records not materialized");
    }

    perEntity[folder] = { sourceRecordCount, stagingRowCount, failureCount, failureReasons };
    totalStagingRows += stagingRowCount;
    totalFailures += failureCount;
  }

  // Record derived invoice-lines as its own entity, with a cross-check against the
  // standalone invoice-lines folder discovered count (from the Phase 1 summary).
  const standaloneLinesCount = summary.perEntity?.["invoice-lines"]?.discoveredRecordCount ?? null;
  perEntity["invoice-lines"] = {
    source: derivedLines.source,
    sourceRecordCount: derivedLines.sourceRecordCount,
    stagingRowCount: derivedLines.stagingRowCount,
    failureCount: derivedLines.failureCount,
    failureReasons: derivedLines.failureReasons,
    standaloneFolderCount: standaloneLinesCount,
  };
  totalStagingRows += derivedLines.stagingRowCount;
  totalFailures += derivedLines.failureCount;

  // Cross-check: derived line count vs the standalone folder count (warning only, not a block).
  if (
    typeof standaloneLinesCount === "number" &&
    standaloneLinesCount !== derivedLines.stagingRowCount
  ) {
    bumpFinding("invoice_lines_standalone_vs_derived_mismatch");
    warnings.push(
      `invoice-lines cross-check: derived from invoices=${derivedLines.stagingRowCount} != ` +
        `standalone folder=${standaloneLinesCount} (standalone folder is informational only)`
    );
  }

  // Manifest-total reconciliation: every manifest entity (including company) must be
  // represented by built staging rows. Derived invoice-lines are excluded because they are
  // not a manifest entity. Any delta means a manifest entity was skipped or under-built.
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

  const ok = totalFailures === 0 && failReasons.length === 0;

  return {
    ok,
    blocked: false,
    exportFolderPath,
    organizationId,
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
    result: ok ? "DRY RUN PASS" : "DRY RUN FAIL",
  };
}

/**
 * Render the report as an array of safe output lines. No raw records, no raw_payload,
 * no PII — only counts, IDs, and metadata.
 *
 * @param {object} report
 * @returns {string[]}
 */
export function buildDryRunReportLines(report) {
  const lines = [
    "EliteOS QuickBooks staging import DRY RUN (local, read-only — no Supabase, no network, no writes)",
    `Export folder: ${report.exportFolderPath}`,
    `Organization (dry-run scope): ${report.organizationId}`,
    `Run ID: ${report.runId}`,
    `QBXML version: ${report.qbXmlVersion}`,
  ];

  if (report.blocked) {
    lines.push("", "Blocked before building staging rows:");
    for (const reason of report.blockReasons) {
      lines.push(`  - ${reason}`);
    }
    lines.push("", `Result: ${report.result}`);
    return lines;
  }

  lines.push("", "Per-entity (source records -> staging rows / failures):");
  for (const [folder, entity] of Object.entries(report.perEntity)) {
    const sourceSuffix = entity.source ? ` source=${entity.source}` : "";
    lines.push(
      `  ${folder}: sourceRecordCount=${entity.sourceRecordCount} ` +
        `stagingRowCount=${entity.stagingRowCount} failureCount=${entity.failureCount}${sourceSuffix}`
    );
    if (typeof entity.standaloneFolderCount === "number") {
      const match = entity.standaloneFolderCount === entity.stagingRowCount ? "matches" : "MISMATCH";
      lines.push(
        `      cross-check: standalone invoice-lines folder=${entity.standaloneFolderCount} (${match}, informational only)`
      );
    }
    const reasons = Object.entries(entity.failureReasons ?? {});
    for (const [reason, count] of reasons) {
      lines.push(`      failure: ${reason} (${count})`);
    }
  }

  const findingEntries = Object.entries(report.dataQualityFindingCounts);
  if (findingEntries.length > 0) {
    lines.push("", "Data-quality findings (counts only):");
    for (const [type, count] of findingEntries) {
      lines.push(`  ${type}=${count}`);
    }
  } else {
    lines.push("", "Data-quality findings: none");
  }

  if ((report.warnings ?? []).length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if ((report.failReasons ?? []).length > 0) {
    lines.push("", "Fail reasons:");
    for (const reason of report.failReasons) {
      lines.push(`  - ${reason}`);
    }
  }

  if (typeof report.manifestTotal === "number") {
    lines.push(
      "",
      `Manifest entity total (incl. company): ${report.manifestTotal}`,
      `Built primary staging rows (excl. derived invoice-lines): ${report.builtPrimaryTotal}`,
      `Derived invoice-line rows: ${report.derivedInvoiceLineCount}`
    );
  }

  lines.push(
    "",
    `Total rows that would be upserted: ${report.totalStagingRows}`,
    `Total rows skipped/failed: ${report.totalFailures}`,
    "",
    `Result: ${report.result}`
  );

  return lines;
}

export function printDryRunReport(report) {
  for (const line of buildDryRunReportLines(report)) {
    console.log(line);
  }
}

function parseOrgArg(argv) {
  for (const arg of argv) {
    if (arg.startsWith("--org=")) {
      return arg.slice("--org=".length);
    }
  }
  return process.env.QB_DRYRUN_ORGANIZATION_ID || undefined;
}

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const exportFolderArg = positional[0];
  if (!exportFolderArg) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const exportFolderPath = path.resolve(exportFolderArg);
  const organizationId = parseOrgArg(process.argv.slice(2));

  const report = await buildDryRunReport(exportFolderPath, { organizationId });
  printDryRunReport(report);

  process.exitCode = report.ok ? 0 : 1;
}

const isRunAsCliScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isRunAsCliScript) {
  main().catch((err) => {
    console.error(`dryRunQuickBooksStagingImport failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
}
