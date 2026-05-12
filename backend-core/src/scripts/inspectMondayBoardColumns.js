#!/usr/bin/env node
/**
 * Optional dev helper: list Monday.com board columns (id, title, type) for mapping env vars.
 *
 * Usage (from repo root, with secrets in your shell — do not commit tokens):
 *   export MONDAY_API_TOKEN="your_token"
 *   export MONDAY_PUBLIC_QUOTES_BOARD_ID="1234567890"
 *   node backend-core/src/scripts/inspectMondayBoardColumns.js
 *
 * This script is not run by CI or npm scripts by default.
 */

const MONDAY_API_URL = "https://api.monday.com/v2";

const QUERY = `
query ($boardIds: [ID!]!) {
  boards(ids: $boardIds) {
    id
    name
    columns {
      id
      title
      type
    }
  }
}
`;

async function main() {
  const token = String(process.env.MONDAY_API_TOKEN || "").trim();
  const boardId = String(process.env.MONDAY_PUBLIC_QUOTES_BOARD_ID || "").trim();
  if (!token || !boardId) {
    console.error("Missing env: set MONDAY_API_TOKEN and MONDAY_PUBLIC_QUOTES_BOARD_ID");
    process.exit(1);
  }

  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { boardIds: [boardId] }
    })
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("Non-JSON response:", text.slice(0, 500));
    process.exit(1);
  }

  if (!res.ok) {
    console.error("HTTP", res.status, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  if (json.errors?.length) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const boards = json.data?.boards || [];
  if (!boards.length) {
    console.error("No boards returned for id:", boardId);
    process.exit(1);
  }

  for (const b of boards) {
    console.log(`Board ${b.id}: ${b.name || "(unnamed)"}`);
    console.log("");
    const cols = b.columns || [];
    for (const c of cols) {
      console.log([c.id, c.title, c.type].join("\t"));
    }
    console.log("");
    console.log("Map text/numbers columns to MONDAY_PUBLIC_COL_* env vars (see docs/quote-platform/monday-public-quotes-setup.md).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
