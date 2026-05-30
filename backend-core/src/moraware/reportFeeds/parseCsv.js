/**
 * Minimal CSV parser — handles quoted fields and commas/newlines in quotes.
 * No external dependencies.
 */

export function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  pushField();
  pushRow();
  while (rows.length && rows[rows.length - 1].every((c) => String(c ?? "").trim() === "")) rows.pop();
  return rows;
}

/**
 * @param {string} csvText
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsvReportRows(csvText) {
  const parsed = parseCsv(csvText);
  if (!parsed.length) {
    return { headers: [], rows: [] };
  }
  const headers = (parsed[0] || []).map((h) => normalizeSpaces(h));
  const rows = [];
  for (let r = 1; r < parsed.length; r++) {
    const cells = parsed[r] || [];
    if (cells.every((c) => normalizeSpaces(c) === "")) continue;
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = normalizeSpaces(cells[i] ?? "");
    }
    rows.push(obj);
  }
  return { headers, rows };
}
