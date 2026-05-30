/**
 * Pure planner: build a deterministic supersede plan from existing active facts and incoming payloads.
 * No Supabase client. No IO.
 *
 * The DB execution order enforced by the plan:
 *   1. Deactivate previous active facts (is_active=false, superseded_at=now()).
 *   2. Insert new active facts (is_active=true, promoted_at=now()).
 *   3. Backfill superseded_by on deactivated rows using row_hash correlation.
 *
 * This order ensures the partial unique index on (organization_id, report_feed_id, row_hash)
 * WHERE is_active=true is never violated within a single transaction.
 */

/**
 * @typedef {object} ActiveFact
 * @property {string} id          - UUID of the existing prepared-fact row
 * @property {string} row_hash
 * @property {string} organization_id
 * @property {string} report_feed_id
 */

/**
 * @typedef {object} IncomingFact
 * @property {string} row_hash
 * @property {string} organization_id
 * @property {string} report_feed_id
 * // … all other moraware_prepared_sales_worksheet_facts columns from mapPreparedSalesWorksheetFact
 */

/**
 * @typedef {object} SupersedeStep
 * @property {'deactivate'|'insert'|'backfill_superseded_by'} action
 * @property {object} payload
 */

/**
 * @typedef {object} SupersedePlan
 * @property {boolean}         safe            - False if incoming has duplicate row_hashes.
 * @property {string[]}        unsafeReasons   - Human-readable block reasons when safe=false.
 * @property {string[]}        duplicateIncomingHashes - row_hashes that appear more than once in incoming.
 * @property {SupersedeStep[]} steps           - Ordered DB operations (empty when safe=false).
 * @property {number}          deactivateCount
 * @property {number}          insertCount
 * @property {number}          backfillCount
 */

/**
 * Build a supersede plan.
 *
 * @param {object} params
 * @param {ActiveFact[]}  params.existingActiveFacts  - Current is_active=true rows from the DB for this feed.
 * @param {IncomingFact[]} params.incomingFacts        - New rows from mapPreparedSalesWorksheetFact.
 * @param {Date|string|null} [params.supersededAt]     - Timestamp to stamp on deactivated rows (defaults to now).
 * @returns {SupersedePlan}
 */
export function planPreparedFactSupersede(params) {
  const {
    existingActiveFacts = [],
    incomingFacts = [],
    supersededAt = null
  } = params;

  const now = supersededAt ? new Date(supersededAt).toISOString() : new Date().toISOString();

  // Guard: detect duplicate row_hashes in incoming batch.
  const incomingHashCounts = new Map();
  for (const fact of incomingFacts) {
    const h = String(fact.row_hash ?? "");
    incomingHashCounts.set(h, (incomingHashCounts.get(h) ?? 0) + 1);
  }
  const duplicateIncomingHashes = [...incomingHashCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([h]) => h);

  if (duplicateIncomingHashes.length > 0) {
    return {
      safe: false,
      unsafeReasons: [
        `Incoming batch contains ${duplicateIncomingHashes.length} duplicate row_hash(es): ` +
          duplicateIncomingHashes.slice(0, 3).join(", ")
      ],
      duplicateIncomingHashes,
      steps: [],
      deactivateCount: 0,
      insertCount: 0,
      backfillCount: 0
    };
  }

  // Index existing active facts by row_hash.
  const existingByHash = new Map();
  for (const fact of existingActiveFacts) {
    const h = String(fact.row_hash ?? "");
    if (h) existingByHash.set(h, fact);
  }

  // Determine which incoming hashes have an existing active row to supersede.
  const toDeactivate = [];
  const toInsert = [];
  const toBackfill = [];

  for (const incoming of incomingFacts) {
    const h = String(incoming.row_hash ?? "");
    const existing = existingByHash.get(h);
    if (existing) {
      toDeactivate.push(existing);
    }
    toInsert.push(incoming);
  }

  const steps = [
    // Step 1 — deactivate (must come before insert to avoid partial-unique-index collision).
    ...toDeactivate.map((existing) => ({
      action: /** @type {'deactivate'} */ ("deactivate"),
      payload: {
        id: existing.id,
        is_active: false,
        superseded_at: now
      }
    })),
    // Step 2 — insert new active facts.
    ...toInsert.map((incoming) => ({
      action: /** @type {'insert'} */ ("insert"),
      payload: incoming
    }))
  ];

  // Step 3 — backfill superseded_by: for each deactivated row, point to the new row with the same hash.
  // In a real DB operation this is done after inserts return the new row IDs.
  // The planner represents this as placeholder tokens so the persistence layer can fulfill them.
  for (const existing of toDeactivate) {
    const h = String(existing.row_hash ?? "");
    steps.push({
      action: /** @type {'backfill_superseded_by'} */ ("backfill_superseded_by"),
      payload: {
        deactivatedId: existing.id,
        newFactRowHash: h
      }
    });
    toBackfill.push(existing.id);
  }

  return {
    safe: true,
    unsafeReasons: [],
    duplicateIncomingHashes: [],
    steps,
    deactivateCount: toDeactivate.length,
    insertCount: toInsert.length,
    backfillCount: toBackfill.length
  };
}
