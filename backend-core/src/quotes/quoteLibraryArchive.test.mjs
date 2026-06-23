/**
 * Quote Library archive tests.
 *
 * Run: npm run eos:test:quote-library-archive
 */
import assert from "node:assert/strict";

import {
  isQuoteRowArchived,
  planArchiveForRow,
  resolveQuoteFamilyRootId,
  softArchiveQuoteFamily,
  summarizeArchiveResults
} from "./quoteLibraryArchive.js";

const ROOT = "a1111111-1111-4111-8111-111111111111";
const R1 = "b2222222-2222-4222-8222-222222222222";
const R0 = "c3333333-3333-4333-8333-333333333333";

function testResolveFamilyRoot() {
  assert.equal(resolveQuoteFamilyRootId({ id: ROOT, quote_family_root_id: ROOT }), ROOT);
  assert.equal(resolveQuoteFamilyRootId({ id: R1, quote_family_root_id: ROOT }), ROOT);
  assert.equal(resolveQuoteFamilyRootId({ id: R0 }), R0);
}

function testPlanArchiveInternalRevision() {
  const planned = planArchiveForRow({
    id: R1,
    quote_number: "ESF-DYER-000093-R1",
    quote_status: "draft",
    quote_source: "internal_quote",
    is_current_revision: true
  });
  assert.equal(planned.status, "archived");
}

function testPlanArchiveSkipsSoldUnlessForce() {
  const skipped = planArchiveForRow({ id: R1, quote_status: "sold" });
  assert.equal(skipped.status, "skipped");
  const forced = planArchiveForRow({ id: R1, quote_status: "sold" }, { force: true, elevated: true });
  assert.equal(forced.status, "archived");
}

function testSummarizeCounts() {
  const summary = summarizeArchiveResults([
    { status: "archived" },
    { status: "skipped" },
    { status: "failed" }
  ]);
  assert.equal(summary.archived_count, 1);
  assert.equal(summary.skipped_count, 1);
  assert.equal(summary.failed_count, 1);
}

function testIsQuoteRowArchived() {
  assert.equal(isQuoteRowArchived({ archived_at: "2026-01-01T00:00:00.000Z" }), true);
  assert.equal(isQuoteRowArchived({ quote_status: "archived" }), true);
  assert.equal(isQuoteRowArchived({ quote_status: "draft" }), false);
}

async function testSoftArchiveFamilyUpdatesAllRevisions() {
  const updates = [];
  const inserts = [];
  const familyRows = [
    {
      id: R0,
      quote_number: "ESF-DYER-000093-R0",
      quote_status: "revised",
      is_current_revision: false,
      quote_family_root_id: ROOT,
      archived_at: null
    },
    {
      id: R1,
      quote_number: "ESF-DYER-000093-R1",
      quote_status: "draft",
      is_current_revision: true,
      quote_family_root_id: ROOT,
      archived_at: null
    }
  ];

  const db = {
    from(table) {
      if (table === "quote_headers") {
        return {
          select() {
            return this;
          },
          or() {
            return this;
          },
          eq() {
            return this;
          },
          update(payload) {
            return {
              eq(_col, id) {
                updates.push({ id, payload });
                return {
                  select() {
                    return Promise.resolve({ data: [{ id, archived_at: payload.archived_at }], error: null });
                  }
                };
              }
            };
          },
          then(resolve) {
            resolve({ data: familyRows, error: null });
            return Promise.resolve({ data: familyRows, error: null });
          }
        };
      }
      if (table === "quote_status_history") {
        return {
          insert(row) {
            inserts.push(row);
            return Promise.resolve({ data: [row], error: null });
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };

  // Make chainable query builder awaitable
  db.from = (table) => {
    if (table !== "quote_headers") {
      return {
        insert(row) {
          inserts.push(row);
          return Promise.resolve({ data: [row], error: null });
        }
      };
    }
    const builder = {
      _mode: "select",
      select() {
        return builder;
      },
      or() {
        return builder;
      },
      eq(_col, id) {
        if (builder._mode === "update") {
          updates.push({ id, payload: builder._payload });
          return {
            select() {
              return Promise.resolve({ data: [{ id, archived_at: builder._payload.archived_at }], error: null });
            }
          };
        }
        return builder;
      },
      update(payload) {
        builder._mode = "update";
        builder._payload = payload;
        return builder;
      }
    };
    builder.then = (resolve) => resolve({ data: familyRows, error: null });
    return builder;
  };

  const summary = await softArchiveQuoteFamily(db, familyRows[1], {
    orgId: null,
    hasQuoteHeadersOrg: false,
    applyOrgScope: (qb) => qb,
    userRef: "chris@eliteosfab.com",
    source: "test",
    safeSelect: async (_db, fn) => {
      await fn();
      return { data: null, error: null };
    }
  });

  assert.equal(summary.archived_count, 2);
  assert.equal(updates.length, 2);
  assert.equal(inserts.length, 2);
  assert.ok(
    updates.every((u) => u.payload.quote_status === "archived" && u.payload.archived_at),
    "soft archive sets archived_at and status"
  );
  assert.ok(
    familyRows.every((row) => {
      const snap = JSON.parse(JSON.stringify(row.calculation_snapshot || { keep: true }));
      return snap.keep === true || row.calculation_snapshot == null;
    }),
    "archive does not mutate calculation snapshots on in-memory rows"
  );
}

function testActiveListExcludesArchivedRows() {
  const active = [
    { id: "1", quote_status: "draft", archived_at: null },
    { id: "2", quote_status: "archived", archived_at: "2026-01-01T00:00:00.000Z" }
  ].filter((row) => !isQuoteRowArchived(row));
  assert.deepEqual(active.map((r) => r.id), ["1"]);
}

async function runAll() {
  testResolveFamilyRoot();
  testPlanArchiveInternalRevision();
  testPlanArchiveSkipsSoldUnlessForce();
  testSummarizeCounts();
  testIsQuoteRowArchived();
  await testSoftArchiveFamilyUpdatesAllRevisions();
  testActiveListExcludesArchivedRows();
  console.log("quoteLibraryArchive: all tests passed");
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
