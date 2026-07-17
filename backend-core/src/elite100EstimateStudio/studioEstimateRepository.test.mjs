/**
 * Studio estimate repository contract — memory + fake Supabase.
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimateRepository.test.mjs
 */
import assert from "node:assert/strict";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { SupabaseStudioEstimateRepository } from "./supabaseStudioEstimateRepository.mjs";
import { createStudioEstimateRepository } from "./studioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE = "case-contract-1";

console.log("\nstudioEstimateRepository.test.mjs\n");

/**
 * Minimal fake Supabase client for studio_estimates table only.
 */
function createFakeSupabase() {
  /** @type {Map<string, object>} */
  const rows = new Map();
  let ready = true;

  function matches(row, filters) {
    for (const f of filters) {
      if (f.op === "eq" && String(row[f.col]) !== String(f.val)) return false;
      if (f.op === "neq" && String(row[f.col]) === String(f.val)) return false;
    }
    return true;
  }

  function from(table) {
    if (table !== "studio_estimates") {
      throw new Error(`unexpected table ${table}`);
    }
    /** @type {Array<{op:string,col:string,val:unknown}>} */
    const filters = [];
    let orderCol = null;
    let orderAsc = true;
    let limitN = null;
    let action = "select";
    let payload = null;

    const api = {
      select() {
        action = action === "insert" || action === "update" ? action : "select";
        return api;
      },
      insert(row) {
        action = "insert";
        payload = row;
        return api;
      },
      update(patch) {
        action = "update";
        payload = patch;
        return api;
      },
      eq(col, val) {
        filters.push({ op: "eq", col, val });
        return api;
      },
      neq(col, val) {
        filters.push({ op: "neq", col, val });
        return api;
      },
      order(col, opts = {}) {
        orderCol = col;
        orderAsc = opts.ascending !== false;
        return api;
      },
      limit(n) {
        limitN = n;
        return api.then ? api : api;
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(async () => {
            if (!ready) {
              return {
                data: null,
                error: { code: "PGRST205", message: "Could not find the table public.studio_estimates" }
              };
            }
            if (action === "insert") {
              const active = [...rows.values()].find(
                (r) =>
                  r.organization_id === payload.organization_id &&
                  r.intake_case_id === payload.intake_case_id &&
                  r.status !== "superseded"
              );
              if (active) {
                return { data: null, error: { code: "23505", message: "duplicate key" } };
              }
              const id = payload.id;
              rows.set(id, { ...payload });
              return { data: [{ ...rows.get(id) }], error: null };
            }
            if (action === "update") {
              let list = [...rows.values()].filter((r) => matches(r, filters));
              if (!list.length) return { data: [], error: null };
              const id = list[0].id;
              rows.set(id, { ...rows.get(id), ...payload });
              return { data: [{ ...rows.get(id) }], error: null };
            }
            let list = [...rows.values()].filter((r) => matches(r, filters));
            if (orderCol) {
              list.sort((a, b) => {
                const av = a[orderCol];
                const bv = b[orderCol];
                if (av === bv) return 0;
                return orderAsc ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
              });
            }
            if (limitN != null) list = list.slice(0, limitN);
            return { data: list.map((r) => ({ ...r })), error: null };
          })
          .then(resolve, reject);
      }
    };
    // Make limit thenable by returning api which has then
    const origLimit = api.limit;
    api.limit = (n) => {
      origLimit(n);
      return api;
    };
    return api;
  }

  return {
    from,
    _rows: rows,
    _setReady(v) {
      ready = v;
    }
  };
}

async function runContract(name, repository) {
  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: CASE,
    takeoffJobId: "job-1",
    createdByUserId: "user-1",
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: { customerName: "Acme", materialGroup: "Group Promo" }
  });
  assert.ok(created.id);
  assert.equal(created.revision, 1);

  const again = await repository.create({
    organizationId: ORG,
    intakeCaseId: CASE,
    takeoffJobId: "job-1",
    createdByUserId: "user-1"
  });
  assert.equal(again.id, created.id, `${name}: reopen returns same active estimate`);

  const concurrent = await Promise.all([
    repository.create({
      organizationId: ORG,
      intakeCaseId: CASE,
      takeoffJobId: "job-1",
      createdByUserId: "user-a"
    }),
    repository.create({
      organizationId: ORG,
      intakeCaseId: CASE,
      takeoffJobId: "job-1",
      createdByUserId: "user-b"
    })
  ]);
  assert.equal(concurrent[0].id, created.id);
  assert.equal(concurrent[1].id, created.id);

  const priced = await repository.update(
    ORG,
    created.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.PRICED,
      calculationSnapshot: {
        fingerprint: "fp-1",
        pricingEngine: "quoteCalculator+studioTrustedOverlays",
        pricingVersion: 1,
        totals: { exactInternalTotal: 100 }
      }
    },
    "user-1"
  );
  assert.equal(priced.calculationFingerprint, "fp-1");

  const approved = await repository.update(
    ORG,
    created.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      approval: {
        approvedAt: "2026-07-16T12:00:00.000Z",
        approvedByUserId: "user-1",
        calculationFingerprint: "fp-1"
      }
    },
    "user-1"
  );
  assert.equal(approved.approvedByUserId, "user-1");
  assert.equal(approved.approvedAt, "2026-07-16T12:00:00.000Z");

  const revised = await repository.createRevisionFrom(
    ORG,
    approved.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      scope: { ...approved.scope, materialGroup: "Group B" },
      staleReason: "Scope changed after approval"
    },
    "user-1"
  );
  assert.notEqual(revised.id, approved.id);
  assert.equal(revised.revision, 2);
  assert.equal(revised.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.equal(revised.approval, null);
  assert.equal(revised.calculationSnapshot, null);

  const history = await repository.listByIntakeCase(ORG, CASE);
  assert.ok(history.length >= 2);
  const superseded = history.find((r) => r.id === approved.id);
  assert.equal(superseded.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  assert.equal(superseded.calculationSnapshot?.fingerprint, "fp-1");
  assert.equal(superseded.approval?.calculationFingerprint, "fp-1");
  assert.ok(superseded.supersededAt);

  const active = await repository.getActiveByIntakeCase(ORG, CASE);
  assert.equal(active.id, revised.id);

  const cross = await repository.getById("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revised.id);
  assert.equal(cross, null);

  console.log(`ok: ${name} contract (create/reopen/concurrency/revision/org-scope)`);
}

{
  const memory = new InMemoryStudioEstimateRepository();
  await runContract("memory", memory);
}

{
  const fake = createFakeSupabase();
  const supabaseRepo = new SupabaseStudioEstimateRepository({ db: fake });
  await runContract("supabase-fake", supabaseRepo);
}

{
  const fake = createFakeSupabase();
  fake._setReady(false);
  const broken = new SupabaseStudioEstimateRepository({ db: fake });
  await assert.rejects(
    () => broken.getActiveByIntakeCase(ORG, CASE),
    (e) => e.code === "studio_estimate_persistence_unavailable"
  );
  console.log("ok: supabase mode fails closed when table unavailable");
}

{
  const { mode } = createStudioEstimateRepository({
    env: { ELITE100_STUDIO_ESTIMATE_REPOSITORY: "memory" }
  });
  assert.equal(mode, "memory");
  assert.throws(
    () =>
      createStudioEstimateRepository({
        env: { ELITE100_STUDIO_ESTIMATE_REPOSITORY: "supabase" }
      }),
    (e) => e.code === "studio_estimate_persistence_misconfigured"
  );
  console.log("ok: factory defaults require supabase client; memory explicit for tests");
}

console.log("\nAll studioEstimateRepository tests passed.\n");
