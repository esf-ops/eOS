import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  attachListIntelligence,
  buildYtdActivityReadModel,
  companyOperationalPublic,
  connectionSortRank,
  connectionsFromLinks,
  countNotesByAccount,
  createOrgScopedTtlCache,
  followUpSortRank,
  lastActivityAtForAccount,
  linkSetComplete,
  loadCurrentMorawareJobsForOrg,
  loadCurrentMorawareJobsForSourceAccountIds,
  loadDirectoryOperationalIntelligence,
  loadOrganizationInternalEstimatesForWinRate,
  readRowsUntilCap,
  resolveDirectoryListSort,
  scopedPopulationOverflow,
  sortDirectoryListItems,
  summarizeOpenFollowUps,
  ytdPublic
} from "./accountDirectoryListIntelligence.mjs";
import { isAccountMorawareLinked } from "./accountDirectoryMorawareLinkage.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CURRENT = {
  available: true,
  full_census_started_at: "2026-08-01T00:00:00.000Z"
};
const NOW = new Date("2026-08-18T15:00:00.000-05:00");
const ORG = "org-a";
const ORG_B = "org-b";

function job({ id, account, date, sqft = 10, lastSeen = "2026-08-15T12:00:00.000Z", extra = {} }) {
  return {
    organization_id: extra.org || ORG,
    source_job_id: id,
    source_account_id: account,
    created_at_source: date,
    last_seen_at: lastSeen,
    raw_payload: {
      forms: [{ formTemplateName: "Job Worksheet", fields: [{ label: "Sq.Ft.", numericValue: sqft }] }]
    },
    ...extra
  };
}

function mwLink(accountId, sourceId) {
  return {
    accountId,
    externalId: sourceId,
    isActive: true,
    externalSystem: "moraware"
  };
}

function qbLink(accountId, listId) {
  return {
    accountId,
    externalId: listId,
    isActive: true,
    externalSystem: "quickbooks_desktop"
  };
}

{
  const links = [qbLink("ad-1", "8000AAAA")];
  const conn = connectionsFromLinks(links);
  assert.equal(conn.quickbooks, true);
  assert.equal(conn.moraware, false);
  console.log("ok: 7) exact QB link → QB connected");
}

{
  const conn = connectionsFromLinks([]);
  assert.equal(conn.quickbooks, false);
  const item = { connections: conn, qbEnrichmentCode: "suggested_match" };
  assert.equal(connectionSortRank(item) > 1, true);
  assert.equal(conn.quickbooks, false);
  console.log("ok: 8) suggestion only does NOT → QB connected");
}

{
  const links = [mwLink("ad-1", "101"), mwLink("ad-1", "202")];
  assert.equal(isAccountMorawareLinked(links), true);
  const conn = connectionsFromLinks(links);
  assert.equal(conn.moraware, true);
  console.log("ok: 9–10) exact Moraware link → connected; multi-ID still one badge");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [
      job({ id: "j1", account: "101", date: "2026-02-01", sqft: 100 }),
      job({ id: "j2", account: "999", date: "2026-03-01", sqft: 50 })
    ],
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.byAccount.get("ad-1").jobs, 1);
  assert.equal(ytd.byAccount.get("ad-1").sqft, 100);
  assert.equal(ytd.company.jobs, 2, "company includes unlinked Moraware jobs");
  console.log("ok: 11) per-account exact linked Moraware IDs only");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [
      job({ id: "a", account: "101", date: "2026-01-10", sqft: 10 }),
      job({ id: "b", account: "202", date: "2026-02-10", sqft: 15 })
    ],
    morawareLinks: [mwLink("ad-1", "101"), mwLink("ad-1", "202")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.byAccount.get("ad-1").jobs, 2);
  assert.equal(ytd.company.customersWithActivity, 1);
  console.log("ok: 12) multi-ID account unions jobs");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [
      job({ id: "same", account: "101", date: "2026-01-10", sqft: 10, lastSeen: "2026-08-10T00:00:00.000Z" }),
      job({ id: "same", account: "101", date: "2026-01-10", sqft: 10, lastSeen: "2026-08-16T00:00:00.000Z" })
    ],
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.byAccount.get("ad-1").jobs, 1);
  assert.equal(ytd.company.jobs, 1);
  console.log("ok: 13) duplicate source_job_id counted once");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [
      job({ id: "stale", account: "101", date: "2026-04-01", sqft: 900, lastSeen: "2026-05-01T00:00:00.000Z" }),
      job({ id: "prior", account: "101", date: "2025-12-01", sqft: 80 }),
      job({ id: "future", account: "101", date: "2026-12-01", sqft: 40 }),
      job({ id: "now", account: "101", date: "2026-08-01", sqft: 12 })
    ],
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.byAccount.get("ad-1").jobs, 1);
  assert.equal(ytd.byAccount.get("ad-1").sqft, 12);
  console.log("ok: 14) stale/prior-year/future-dated excluded from YTD");
}

{
  const unavailable = buildYtdActivityReadModel({
    jobs: null,
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18",
    available: false
  });
  const pub = ytdPublic(unavailable.byAccount.get("ad-1"), false);
  assert.equal(pub.available, false);
  assert.equal(pub.jobs, null);
  assert.equal(pub.sqft, null);
  console.log("ok: 15) unavailable != zero");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [job({ id: "other", account: "202", date: "2026-01-01", sqft: 5 })],
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.byAccount.get("ad-1").available, true);
  assert.equal(ytd.byAccount.get("ad-1").jobs, 0);
  assert.equal(ytd.byAccount.get("ad-1").sqft, 0);
  console.log("ok: 16) genuine zero stays zero");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [
      job({ id: "j1", account: "101", date: "2026-01-01", sqft: 10 }),
      job({ id: "j1", account: "101", date: "2026-01-01", sqft: 10, lastSeen: "2026-08-16T00:00:00.000Z" }),
      job({ id: "j2", account: "202", date: "2026-01-02", sqft: 7 })
    ],
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.company.jobs, 2);
  assert.equal(ytd.company.sqft, 17);
  console.log("ok: 17–18) company jobs dedupe; Sq Ft on same population");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [
      job({ id: "a", account: "101", date: "2026-01-01", sqft: 1 }),
      job({ id: "b", account: "202", date: "2026-01-01", sqft: 1 })
    ],
    morawareLinks: [mwLink("ad-1", "101"), mwLink("ad-1", "202"), mwLink("ad-2", "303")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.company.customersWithActivity, 1);
  console.log("ok: 19–20) customers-with-activity uses canonical AD UUID; multi-ID not double-counted");
}

{
  const ytd = buildYtdActivityReadModel({
    jobs: [job({ id: "x", account: "101", date: "2026-01-01", sqft: 3, extra: { org: ORG_B } })],
    morawareLinks: [mwLink("ad-b", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.company.jobs, 1);
  const isolated = buildYtdActivityReadModel({
    jobs: [],
    morawareLinks: [mwLink("ad-a", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(isolated.company.jobs, 0);
  assert.equal(isolated.company.customersWithActivity, 0);
  console.log("ok: 21) org isolation is caller-scoped (empty jobs → zero, not other org)");
}

{
  const { byAccount, orgOpen, orgOverdue } = summarizeOpenFollowUps(
    [
      { accountId: "ad-1", status: "open", dueAt: "2026-08-01T12:00:00.000Z" },
      { accountId: "ad-1", status: "open", dueAt: "2026-08-18T20:00:00.000Z" },
      { accountId: "ad-1", status: "open", dueAt: "2026-09-01T12:00:00.000Z" },
      { accountId: "ad-2", status: "completed", dueAt: "2026-08-01T12:00:00.000Z" }
    ],
    NOW
  );
  assert.equal(byAccount.get("ad-1").open, 3);
  assert.equal(byAccount.get("ad-1").overdue >= 1, true);
  assert.equal(byAccount.get("ad-1").dueToday >= 1, true);
  assert.ok(byAccount.get("ad-1").nextDueAt);
  assert.equal(orgOpen, 3);
  assert.equal(orgOverdue >= 1, true);
  assert.equal(byAccount.get("ad-2"), undefined);
  console.log("ok: 22–25) follow-up open/overdue/due today/next due");
}

{
  const src = readFileSync(path.join(here, "accountDirectoryListIntelligence.mjs"), "utf8");
  assert.equal(src.includes("listAccountFollowUps("), false);
  assert.equal(src.includes("for (const accountId of accountIds)"), false);
  assert.ok(src.includes("listOpenFollowUpHeadsForAccountIds"));
  assert.ok(src.includes("listNoteHeadsForAccountIds"));
  console.log("ok: 26) follow-up/note path is batched, not N+1");
}

{
  const items = [];
  for (let i = 0; i < 60; i++) {
    items.push({
      id: `id-${String(i).padStart(2, "0")}`,
      displayName: `Acct ${String.fromCharCode(65 + (i % 26))}${i}`,
      name: `Acct ${i}`,
      ytdActivity: { available: true, jobs: i, sqft: i * 10 },
      financialIntel: { openAr: i * 5 },
      followUpSummary: { open: i === 3 ? 2 : 0, overdue: i === 3 ? 2 : 0, dueToday: 0, nextDueAt: null },
      connections: { quickbooks: i % 3 === 0, moraware: i % 5 === 0 },
      primaryContact: i % 2 ? "Zed" : "Ann",
      city: i % 2 ? "Zearing" : "Ames",
      state: "IA",
      lastActivityAt: i === 7 ? "2026-08-18" : i === 1 ? "2026-01-01" : null,
      status: i === 2 ? "needs_review" : "active"
    });
  }
  const byName = sortDirectoryListItems(items, "name_asc");
  assert.equal(byName.length, 60);
  assert.ok(byName[0].displayName <= byName[1].displayName);
  const page1 = byName.slice(0, 10);
  const page2 = byName.slice(10, 20);
  assert.equal(page1.some((r) => page2.some((x) => x.id === r.id)), false);
  console.log("ok: 27) account sort all filtered records, not page-only");

  const arDesc = sortDirectoryListItems(items, "ar_desc");
  assert.ok(arDesc[0].financialIntel.openAr >= arDesc[1].financialIntel.openAr);
  const arAsc = sortDirectoryListItems(items, "ar_asc");
  assert.ok(arAsc[0].financialIntel.openAr <= arAsc[1].financialIntel.openAr);
  console.log("ok: 28) A/R descending/ascending");

  const ytdDesc = sortDirectoryListItems(items, "ytd_sqft_desc");
  assert.ok(ytdDesc[0].ytdActivity.sqft >= ytdDesc[1].ytdActivity.sqft);
  const ytdAsc = sortDirectoryListItems(items, "ytd_sqft_asc");
  assert.ok(ytdAsc[0].ytdActivity.sqft <= ytdAsc[1].ytdActivity.sqft);
  console.log("ok: 29) YTD Sq Ft descending/ascending");

  const fu = sortDirectoryListItems(items, "followup_attention");
  assert.equal(fu[0].id, "id-03");
  assert.equal(followUpSortRank(fu[0].followUpSummary), 0);
  console.log("ok: 30) follow-up attention order");

  const conn = sortDirectoryListItems(items, "connections_desc");
  assert.equal(connectionSortRank(conn[0]) <= connectionSortRank(conn[1]), true);
  console.log("ok: 31) connection sort deterministic");

  const ytdPage1 = ytdDesc.slice(0, 10).map((r) => r.id);
  const ytdPage2 = ytdDesc.slice(10, 20).map((r) => r.id);
  assert.equal(ytdPage1.some((id) => ytdPage2.includes(id)), false);
  console.log("ok: 32) sort + pagination stable");
}

{
  const mixed = [
    { id: "b", displayName: "Beta", ytdActivity: { available: true, jobs: 1, sqft: 5 } },
    { id: "a", displayName: "Alpha", ytdActivity: { available: true, jobs: 9, sqft: 90 } }
  ];
  const filtered = mixed.filter((r) => r.displayName.startsWith("A"));
  const sorted = sortDirectoryListItems(filtered, "ytd_sqft_desc");
  assert.deepEqual(sorted.map((r) => r.id), ["a"]);
  console.log("ok: 33) sort + filters stable (sort filtered population only)");
}

{
  const ws = readFileSync(path.join(here, "../../../app-account-directory/src/lib/accountDirectoryWorkspace.mjs"), "utf8");
  assert.ok(ws.includes("ytd_sqft_desc"));
  assert.ok(ws.includes("followup_attention"));
  console.log("ok: 34) URL state includes new sorts (workspace)");
}

{
  const notes = countNotesByAccount([
    { accountId: "ad-1", createdAt: "2026-01-01" },
    { accountId: "ad-1", createdAt: "2026-08-01" }
  ]);
  assert.equal(notes.get("ad-1").count, 2);
  const last = lastActivityAtForAccount({
    currentJobDate: "2026-07-01",
    noteLatestAt: "2026-08-01"
  });
  assert.equal(last, "2026-08-01");
  assert.equal(
    lastActivityAtForAccount({
      currentJobDate: "2026-07-01",
      followUpTouchedAt: "2026-06-01T00:00:00.000Z",
      followUpNextDueAt: "2026-12-01T00:00:00.000Z"
    }),
    "2026-07-01"
  );
}

{
  const ops = companyOperationalPublic(
    {
      available: true,
      year: 2026,
      asOfYmd: "2026-08-18",
      ytd: {
        available: true,
        company: { jobs: 12, sqft: 100, customersWithActivity: 4 }
      }
    },
    { winRate: { available: true, rate: 33.3, year: 2026, asOfYmd: "2026-08-18" } }
  );
  assert.equal(ops.ytdJobs, 12);
  assert.equal(ops.ytdSqft, 100);
  assert.equal(ops.customersWithYtdActivity, 4);
  assert.equal(ops.winRate, 33.3);
  assert.equal(ops.winRateAvailable, true);
  assert.equal(ops.openAr, undefined);
  const down = companyOperationalPublic(
    { ytd: { available: false, company: { jobs: 0, sqft: 0, customersWithActivity: 0 } } },
    { winRate: { available: false, rate: null } }
  );
  assert.equal(down.ytdJobs, null);
  assert.equal(down.winRate, null);
  assert.equal(down.winRateAvailable, false);
}

{
  const attached = attachListIntelligence(
    { id: "ad-1", displayName: "A" },
    {
      ytd: buildYtdActivityReadModel({
        jobs: [job({ id: "j", account: "101", date: "2026-01-01", sqft: 8 })],
        morawareLinks: [mwLink("ad-1", "101")],
        currentPopulation: CURRENT,
        year: 2026,
        asOfYmd: "2026-08-18"
      }),
      followUp: summarizeOpenFollowUps([], NOW),
      notes: new Map(),
      links: [mwLink("ad-1", "101")]
    }
  );
  assert.equal(attached.connections.moraware, true);
  assert.equal(attached.ytdActivity.jobs, 1);
  assert.equal(JSON.stringify(attached).includes("raw_payload"), false);
  assert.equal(JSON.stringify(attached).includes("8000"), false);
}

{
  const api = readFileSync(path.join(here, "accountDirectoryApi.js"), "utf8");
  assert.equal(/bulk[-_ ]confirm/i.test(api), false);
  const recon = readFileSync(path.join(here, "accountDirectoryMorawareFinalActionQueue.mjs"), "utf8");
  assert.ok(recon.includes("READY_CONNECT_EXISTING_AD"));
}

function makeRangeClient(rows) {
  return {
    from() {
      const filters = { org: null, inCol: null, inVals: null };
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          if (col === "organization_id") filters.org = val;
          return api;
        },
        gte() {
          return api;
        },
        in(col, vals) {
          filters.inCol = col;
          filters.inVals = vals;
          return api;
        },
        is() {
          return api;
        },
        async range(from, to) {
          let data = rows;
          if (filters.org) {
            data = data.filter((r) => !r.organization_id || r.organization_id === filters.org);
          }
          if (filters.inCol === "source_account_id") {
            const set = new Set((filters.inVals || []).map(String));
            data = data.filter((r) => set.has(String(r.source_account_id)));
          }
          return { data: data.slice(from, to + 1), error: null };
        }
      };
      return api;
    }
  };
}

{
  const below = Array.from({ length: 3 }, (_, i) => ({ id: `j${i}` }));
  const complete = await readRowsUntilCap({
    cap: 3,
    pageSize: 2,
    fetchRange: async (from, to) => below.slice(from, to + 1)
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.truncated, false);
  assert.equal(complete.rows.length, 3);

  const overflow = await readRowsUntilCap({
    cap: 3,
    pageSize: 2,
    fetchRange: async (from, to) =>
      Array.from({ length: 4 }, (_, i) => ({ id: `x${i}` })).slice(from, to + 1)
  });
  assert.equal(overflow.truncated, true);
  assert.equal(overflow.complete, false);
  assert.equal(overflow.rows, null);
  console.log("ok: A/B) paged cap+1 detects complete vs truncated");
}

{
  const jobs = [
    job({ id: "a", account: "101", date: "2026-01-01", sqft: 10 }),
    job({ id: "b", account: "101", date: "2026-02-01", sqft: 5 }),
    job({ id: "c", account: "101", date: "2026-03-01", sqft: 7 })
  ];
  const loaded = await loadCurrentMorawareJobsForOrg(makeRangeClient(jobs), ORG, CURRENT, {
    cap: 3,
    pageSize: 2
  });
  assert.equal(loaded.complete, true);
  assert.equal(loaded.unavailable, false);
  assert.equal(loaded.jobs.length, 3);
  const ytd = buildYtdActivityReadModel({
    jobs: loaded.jobs,
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    year: 2026,
    asOfYmd: "2026-08-18"
  });
  assert.equal(ytd.available, true);
  assert.equal(ytd.company.jobs, 3);
  console.log("ok: A) job population below cap stays authoritative");
}

{
  const jobs = [
    job({ id: "a", account: "101", date: "2026-01-01", sqft: 10 }),
    job({ id: "b", account: "101", date: "2026-02-01", sqft: 5 }),
    job({ id: "c", account: "101", date: "2026-03-01", sqft: 7 }),
    job({ id: "d", account: "101", date: "2026-04-01", sqft: 9 })
  ];
  const loaded = await loadCurrentMorawareJobsForOrg(makeRangeClient(jobs), ORG, CURRENT, {
    cap: 3,
    pageSize: 2
  });
  assert.equal(loaded.truncated, true);
  assert.equal(loaded.unavailable, true);
  assert.equal(loaded.jobs, null);
  const intel = await loadDirectoryOperationalIntelligence({
    organizationId: ORG,
    morawareLinks: [mwLink("ad-1", "101")],
    currentPopulation: CURRENT,
    jobs,
    jobsTruncated: true,
    now: NOW
  });
  assert.equal(intel.ytd.available, false);
  const hero = companyOperationalPublic(intel);
  assert.equal(hero.ytdAvailable, false);
  assert.equal(hero.ytdJobs, null);
  assert.equal(hero.ytdSqft, null);
  assert.equal(hero.customersWithYtdActivity, null);
  const row = attachListIntelligence(
    { id: "ad-1", displayName: "A" },
    { ytd: intel.ytd, followUp: intel.followUp, notes: intel.notes, links: [mwLink("ad-1", "101")] }
  );
  assert.equal(row.ytdActivity.available, false);
  assert.equal(row.ytdActivity.jobs, null);
  assert.equal(row.ytdActivity.sqft, null);
  assert.equal(resolveDirectoryListSort("ytd_sqft_desc", { ytdAvailable: false }), "name_asc");
  const ranked = sortDirectoryListItems(
    [
      { id: "b", displayName: "Beta", ytdActivity: { available: false, jobs: null, sqft: null } },
      { id: "a", displayName: "Alpha", ytdActivity: { available: false, jobs: null, sqft: null } }
    ],
    resolveDirectoryListSort("ytd_sqft_desc", { ytdAvailable: false })
  );
  assert.deepEqual(
    ranked.map((r) => r.id),
    ["a", "b"],
    "incomplete YTD sort must not rank partial sqft"
  );
  console.log("ok: B–E) truncation is unavailable; hero/row/sort are not partial");
}

{
  assert.equal(scopedPopulationOverflow({ items: [{}, {}], total: 2, cap: 5000 }), false);
  assert.equal(scopedPopulationOverflow({ items: [{}, {}], total: 2, cap: 2 }), false);
  assert.equal(scopedPopulationOverflow({ items: [{}, {}, {}], total: 3, cap: 2 }), true);
  assert.equal(scopedPopulationOverflow({ items: [{}, {}], total: 3, cap: 2 }), true);
  console.log("ok: F/G) account population bound is detected, not silent");
}

{
  assert.equal(linkSetComplete([{ id: "1" }, { id: "2" }], 2), true);
  assert.equal(linkSetComplete([{ id: "1" }], 2), false);
  const storeSrc = readFileSync(path.join(here, "accountDirectorySupabaseStore.mjs"), "utf8");
  const start = storeSrc.indexOf("async listAllActiveExternalLinks");
  const end = storeSrc.indexOf("async getExternalLink");
  const lightLoader = storeSrc.slice(start, end);
  assert.equal(lightLoader.includes("slice(0, cap)"), false);
  assert.equal(lightLoader.includes("rows.length >= cap"), false);
  assert.ok(storeSrc.includes("fetchAllMatching(\"account_directory_external_links\""));
  assert.ok(storeSrc.includes("async listNoteHeadsForAccountIds"));
  assert.ok(storeSrc.includes("async listOpenFollowUpHeadsForAccountIds"));
  console.log("ok: H) active link loader is not a silent 20k slice");
}

{
  const jobs = [
    job({ id: "keep", account: "101", date: "2026-01-01", sqft: 10 }),
    job({ id: "skip", account: "202", date: "2026-02-01", sqft: 99 })
  ];
  const loaded = await loadCurrentMorawareJobsForSourceAccountIds(
    makeRangeClient(jobs),
    ORG,
    CURRENT,
    ["101"]
  );
  assert.equal(loaded.unavailable, false);
  assert.equal(loaded.jobs.length, 1);
  assert.equal(loaded.jobs[0].source_job_id, "keep");
  const empty = await loadCurrentMorawareJobsForSourceAccountIds(makeRangeClient(jobs), ORG, CURRENT, []);
  assert.equal(empty.unavailable, false);
  assert.deepEqual(empty.jobs, []);
  console.log("ok: page-scoped YTD jobs filter by linked source IDs");
}

{
  const quotes = [
    {
      id: "q1",
      organization_id: ORG,
      quote_status: "sold",
      updated_at: "2026-03-01",
      quote_family_root_id: "fam-1"
    },
    {
      id: "q2",
      organization_id: ORG_B,
      quote_status: "lost",
      updated_at: "2026-03-01",
      quote_family_root_id: "fam-2"
    }
  ];
  const loaded = await loadOrganizationInternalEstimatesForWinRate(makeRangeClient(quotes), ORG);
  assert.equal(loaded.available, true);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].id, "q1");
  console.log("ok: win-rate quote loader is organization isolated");
}

{
  const cache = createOrgScopedTtlCache({ ttlMs: 60_000 });
  cache.set(ORG, "jobs", { n: 1 });
  cache.set(ORG_B, "jobs", { n: 2 });
  assert.equal(cache.get(ORG, "jobs").n, 1);
  assert.equal(cache.get(ORG_B, "jobs").n, 2);
  cache.invalidateOrganization(ORG);
  assert.equal(cache.get(ORG, "jobs"), null);
  assert.equal(cache.get(ORG_B, "jobs").n, 2);
  const off = createOrgScopedTtlCache({ ttlMs: 0 });
  off.set(ORG, "jobs", { n: 9 });
  assert.equal(off.get(ORG, "jobs"), null);
  console.log("ok: summary cache is org-scoped and disabled at ttl 0");
}

console.log("\naccountDirectoryListIntelligence.test.mjs — all passed\n");
