/**
 * Jobs Command Center — unit + auth shape tests.
 * Run: node backend-core/src/jobsCommandCenter/jobsCommandCenter.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  JOBS_COMMAND_CENTER_HEAD_SLUG,
  JOBS_COMMAND_CENTER_ROLES
} from "./jobsCommandCenterConstants.js";
import { listJobsCommandCenterProjects, getJobsCommandCenterProject } from "./jobsCommandCenterService.mjs";
import { attachJobsCommandCenterRoutes } from "./jobsCommandCenterApi.js";
import { EOS_HEAD_SLUGS, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { resolveHeadDeploymentUrl } from "../me/headDeploymentUrls.js";
import { HEAD_LAUNCHER_CATALOG } from "../me/launcherHeads.js";

const here = dirname(fileURLToPath(import.meta.url));
const ORG = "00000000-0000-4000-8000-0000000000j1";
const PROJECT_REF = "11111111-1111-4111-8111-111111111111";

console.log("\njobsCommandCenter.test.mjs\n");

assert.equal(isKnownHeadSlug(JOBS_COMMAND_CENTER_HEAD_SLUG), true);
assert.ok(EOS_HEAD_SLUGS.includes(JOBS_COMMAND_CENTER_HEAD_SLUG));
assert.ok(HEAD_LAUNCHER_CATALOG.some((h) => h.slug === JOBS_COMMAND_CENTER_HEAD_SLUG));
assert.deepEqual([...JOBS_COMMAND_CENTER_ROLES], ["admin", "super_admin"]);
console.log("ok: slug registered in governance + launcher");

{
  const prev = process.env.HEAD_URL_JOBS_COMMAND_CENTER;
  process.env.HEAD_URL_JOBS_COMMAND_CENTER = "https://jobs.eliteosfab.com";
  assert.equal(resolveHeadDeploymentUrl(JOBS_COMMAND_CENTER_HEAD_SLUG), "https://jobs.eliteosfab.com");
  if (prev == null) delete process.env.HEAD_URL_JOBS_COMMAND_CENTER;
  else process.env.HEAD_URL_JOBS_COMMAND_CENTER = prev;
  console.log("ok: HEAD_URL_JOBS_COMMAND_CENTER resolves");
}

{
  const apiSrc = readFileSync(join(here, "jobsCommandCenterApi.js"), "utf8");
  assert.ok(apiSrc.includes("requireRole"));
  assert.ok(apiSrc.includes("JOBS_COMMAND_CENTER_ROLES"));
  assert.ok(apiSrc.includes('requireHeadAccess(JOBS_COMMAND_CENTER_HEAD_SLUG'));
  assert.ok(apiSrc.includes('source !== "user_profile"'));
  console.log("ok: API gates admin role + head access + profile org");
}

{
  const launcherSrc = readFileSync(join(here, "../me/launcherHeads.js"), "utf8");
  assert.ok(launcherSrc.includes('s !== "jobs_command_center"'));
  console.log("ok: executive default excludes jobs_command_center");
}

function applyFilters(rows, filters) {
  let out = rows;
  for (const f of filters) {
    if (f[0] === "eq") {
      // Fixtures often omit organization_id; treat missing org as matching.
      out = out.filter((r) =>
        f[1] === "organization_id" && !(f[1] in r) ? true : r[f[1]] === f[2]
      );
    }
    if (f[0] === "in") {
      const set = new Set((f[2] || []).map(String));
      out = out.filter((r) => set.has(String(r[f[1]])));
    }
  }
  return out;
}

function makeBuilder(table, rows) {
  const state = { filters: [] };
  const filtered = () => applyFilters(rows, state.filters);
  const chain = {
    select() {
      return chain;
    },
    eq(col, val) {
      state.filters.push(["eq", col, val]);
      return chain;
    },
    in(col, vals) {
      state.filters.push(["in", col, vals]);
      return chain;
    },
    ilike() {
      return chain;
    },
    order() {
      return chain;
    },
    range(from, to) {
      const data = filtered();
      return Promise.resolve({
        data: data.slice(from, to + 1),
        error: null,
        count: data.length
      });
    },
    maybeSingle() {
      const data = filtered();
      return Promise.resolve({ data: data[0] || null, error: null });
    },
    then(resolve, reject) {
      const data = filtered();
      return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
    }
  };
  return chain;
}

function mockSupabase(tables) {
  return {
    from(table) {
      const rows = tables[table] || [];
      return makeBuilder(table, rows);
    }
  };
}

{
  const supabase = mockSupabase({
    ad_qb_customer_facts: [
      {
        id: PROJECT_REF,
        qb_list_id: "JOB-1",
        parent_list_id: "ROOT-1",
        full_name: "Acme Homes:Kitchen Reno",
        name: "Kitchen Reno",
        is_active: true,
        is_job: true,
        synced_at: "2026-10-01T00:00:00Z",
        updated_at_source: null
      },
      { qb_list_id: "ROOT-1", parent_list_id: null, is_job: false }
    ],
    account_directory_external_links: [
      {
        account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        external_id: "ROOT-1",
        external_system: "quickbooks_desktop",
        is_active: true
      },
      {
        account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        external_id: "9001",
        external_system: "moraware",
        is_active: true
      }
    ],
    account_directory_accounts: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", display_name: "Acme Homes" }
    ],
    sales_quickbooks_open_ar_current: [{ qb_customer_list_id: "JOB-1", balance: 1500 }],
    qb_finance_transaction_index: [
      { entity_id: "JOB-1", type: "Estimate", amount: 10000 },
      { entity_id: "JOB-1", type: "SalesOrder", amount: 9800 }
    ]
  });

  const listed = await listJobsCommandCenterProjects({
    supabase,
    organizationId: ORG,
    page: 1,
    pageSize: 50
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.projects.length, 1);
  const row = listed.projects[0];
  assert.equal(row.projectRef, PROJECT_REF);
  assert.equal(row.jobName, "Kitchen Reno");
  assert.equal(row.directoryLinked, true);
  assert.equal(row.account.name, "Acme Homes");
  assert.equal(row.morawareAccountLinked, true);
  assert.equal(row.morawareJobLinked, false);
  assert.equal(row.openAr, 1500);
  assert.equal(row.estimates.count, 1);
  assert.equal(row.salesOrders.amount, 9800);
  assert.ok(!JSON.stringify(listed).includes("JOB-1"));
  assert.ok(!JSON.stringify(listed).includes("ROOT-1"));
  console.log("ok: list projects scrubs ListIDs and joins AD + Moraware flags");
}

{
  const supabase = mockSupabase({
    ad_qb_customer_facts: [
      {
        id: PROJECT_REF,
        qb_list_id: "JOB-1",
        parent_list_id: "ROOT-1",
        full_name: "Acme Homes:Kitchen Reno",
        name: "Kitchen Reno",
        is_active: true,
        is_job: true,
        synced_at: null,
        updated_at_source: null
      },
      { qb_list_id: "JOB-1", parent_list_id: "ROOT-1" },
      { qb_list_id: "ROOT-1", parent_list_id: null }
    ],
    account_directory_external_links: [
      {
        account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        external_id: "ROOT-1",
        external_system: "quickbooks_desktop",
        is_active: true
      }
    ],
    account_directory_accounts: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", display_name: "Acme Homes" }
    ],
    sales_quickbooks_open_ar_current: [],
    qb_finance_transaction_index: [
      {
        id: "txn-1",
        type: "Estimate",
        reference_number: "26-1000",
        txn_date: "2026-08-01",
        amount: 5000,
        entity_id: "JOB-1"
      }
    ],
    brain_moraware_jobs: []
  });

  const detail = await getJobsCommandCenterProject({
    supabase,
    organizationId: ORG,
    projectRef: PROJECT_REF
  });
  assert.equal(detail.ok, true);
  assert.equal(detail.project.projectRef, PROJECT_REF);
  assert.equal(detail.project.quickbooks.transactions[0].referenceNumber, "26-1000");
  assert.equal(detail.project.moraware.linkState, "not_linked");
  assert.ok(!JSON.stringify(detail).includes("JOB-1"));
  console.log("ok: project detail returns QB txns without ListIDs");
}

{
  await assert.rejects(
    () =>
      getJobsCommandCenterProject({
        supabase: mockSupabase({}),
        organizationId: ORG,
        projectRef: "not-a-uuid"
      }),
    (e) => e.code === "invalid_project_ref"
  );
  console.log("ok: invalid projectRef rejected");
}

{
  const app = express();
  assert.throws(
    () =>
      attachJobsCommandCenterRoutes(app, {
        requireAuth: () => (_req, _res, next) => next(),
        requireHeadAccess: () => (_req, _res, next) => next(),
        getSupabase: () => mockSupabase({})
      }),
    /requireRole required/
  );
  attachJobsCommandCenterRoutes(app, {
    requireAuth: () => (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    requireHeadAccess: () => (_req, _res, next) => next(),
    getSupabase: () => mockSupabase({})
  });
  console.log("ok: routes refuse to mount without requireRole; mount succeeds with full deps");
}

console.log("\nAll jobsCommandCenter tests passed.\n");
