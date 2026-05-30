import { computeHeaderHash } from "./hashUtils.js";
import { normalizeSpaces } from "./parseCsv.js";

const SAMPLE_VALUE_LIMIT = 3;

/**
 * Profile CSV columns for contract validation and operator diagnostics.
 * @param {{ headers: string[], rows: Record<string, string>[] }} parsed
 */
export function profileReportColumns(parsed) {
  const headers = parsed.headers || [];
  const rows = parsed.rows || [];
  const columns = headers.map((header) => {
    let nonEmpty = 0;
    let empty = 0;
    const samples = [];
    for (const row of rows) {
      const value = normalizeSpaces(row[header]);
      if (value) {
        nonEmpty += 1;
        if (samples.length < SAMPLE_VALUE_LIMIT && !samples.includes(value)) {
          samples.push(value);
        }
      } else {
        empty += 1;
      }
    }
    return {
      header,
      nonEmptyCount: nonEmpty,
      emptyCount: empty,
      sampleValues: samples
    };
  });

  return {
    rowCount: rows.length,
    columnCount: headers.length,
    headerHash: computeHeaderHash(headers),
    columns
  };
}

/**
 * Compare observed header hash to an expected contract hash.
 * @returns {{ ok: boolean, observedHash: string, expectedHash: string|null, missingHeaders: string[], unexpectedHeaders: string[] }}
 */
export function validateHeaderContract(profile, expectedHeaders = [], expectedColumnHash = null) {
  const observed = new Set((profile.columns || []).map((c) => c.header));
  const expected = (expectedHeaders || []).map((h) => normalizeSpaces(h)).filter(Boolean);
  const missingHeaders = expected.filter((h) => !observed.has(h));
  const unexpectedHeaders = [...observed].filter((h) => !expected.includes(h));
  const observedHash = profile.headerHash;
  const hashOk = expectedColumnHash ? observedHash === expectedColumnHash : missingHeaders.length === 0;
  return {
    ok: hashOk && missingHeaders.length === 0,
    observedHash,
    expectedHash: expectedColumnHash || null,
    missingHeaders,
    unexpectedHeaders
  };
}
