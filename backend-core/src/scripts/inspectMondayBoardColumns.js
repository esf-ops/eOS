#!/usr/bin/env node
/**
 * Optional dev helper: list Monday.com board columns (id, title, type) and groups for mapping env vars.
 *
 * Usage (from repo root, with secrets in your shell — do not commit tokens):
 *   export MONDAY_API_TOKEN="your_token"
 *   export MONDAY_PUBLIC_QUOTES_BOARD_ID="1234567890"
 *   node backend-core/src/scripts/inspectMondayBoardColumns.js
 *
 * Internal Estimates board:
 *   export MONDAY_INTERNAL_QUOTES_BOARD_ID="18413174398"
 *   node backend-core/src/scripts/inspectMondayBoardColumns.js --internal
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
    groups {
      id
      title
    }
  }
}
`;

const INTERNAL_ENV_HINTS = [
  ["Quote ID", "MONDAY_INTERNAL_COL_QUOTE_ID"],
  ["Quote Date", "MONDAY_INTERNAL_COL_QUOTE_DATE"],
  ["Salesperson", "MONDAY_INTERNAL_COL_SALESPERSON"],
  ["Account Master List", "MONDAY_INTERNAL_COL_ACCOUNT"],
  ["Estimated By", "MONDAY_INTERNAL_COL_ESTIMATED_BY"],
  ["Branch Location", "MONDAY_INTERNAL_COL_BRANCH"],
  ["Est Sq Ft", "MONDAY_INTERNAL_COL_EST_SQ_FT"],
  ["Quote Amount", "MONDAY_INTERNAL_COL_QUOTE_AMOUNT"],
  ["Room Count", "MONDAY_INTERNAL_COL_ROOM_COUNT"],
  ["Status", "MONDAY_INTERNAL_COL_STATUS"],
  ["Phone", "MONDAY_INTERNAL_COL_PHONE"],
  ["Email", "MONDAY_INTERNAL_COL_EMAIL"],
  ["Project Address", "MONDAY_INTERNAL_COL_PROJECT_ADDRESS"],
  ["City", "MONDAY_INTERNAL_COL_CITY"],
  ["State", "MONDAY_INTERNAL_COL_STATE"],
  ["Estimate Summary", "MONDAY_INTERNAL_COL_ESTIMATE_SUMMARY"],
  ["Estimate Link", "MONDAY_INTERNAL_COL_ESTIMATE_LINK"]
];

const INTERNAL_GROUP_HINTS = [
  ["New Quotes", "MONDAY_INTERNAL_GROUP_NEW_QUOTES"],
  ["In Review", "MONDAY_INTERNAL_GROUP_IN_REVIEW"],
  ["Approved Quotes", "MONDAY_INTERNAL_GROUP_APPROVED_QUOTES"]
];

async function main() {
  const internal = process.argv.includes("--internal");
  const token = String(process.env.MONDAY_API_TOKEN || "").trim();
  const boardId = internal
    ? String(process.env.MONDAY_INTERNAL_QUOTES_BOARD_ID || "").trim()
    : String(process.env.MONDAY_PUBLIC_QUOTES_BOARD_ID || "").trim();
  if (!token || !boardId) {
    console.error(
      internal
        ? "Missing env: set MONDAY_API_TOKEN and MONDAY_INTERNAL_QUOTES_BOARD_ID"
        : "Missing env: set MONDAY_API_TOKEN and MONDAY_PUBLIC_QUOTES_BOARD_ID"
    );
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
    console.log("Columns (id\ttitle\ttype):");
    const cols = b.columns || [];
    for (const c of cols) {
      console.log([c.id, c.title, c.type].join("\t"));
    }
    console.log("");
    console.log("Groups (id\ttitle):");
    for (const g of b.groups || []) {
      console.log([g.id, g.title].join("\t"));
    }
    console.log("");
    if (internal) {
      console.log("Suggested env vars (copy column id from above):");
      for (const [title, envKey] of INTERNAL_ENV_HINTS) {
        const col = cols.find((c) => String(c.title || "").trim() === title);
        console.log(`# ${envKey}=${col ? col.id : ""}  # ${title}${col ? ` (${col.type})` : " — not found"}`);
      }
      console.log("");
      for (const [title, envKey] of INTERNAL_GROUP_HINTS) {
        const grp = (b.groups || []).find((g) => String(g.title || "").trim() === title);
        console.log(`# ${envKey}=${grp ? grp.id : ""}  # group: ${title}`);
      }
      console.log("");
      console.log("See docs/quote-platform/monday-internal-quotes-setup.md");
    } else {
      console.log("Map text/numbers columns to MONDAY_PUBLIC_COL_* env vars (see docs/quote-platform/monday-public-quotes-setup.md).");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
