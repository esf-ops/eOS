import {
  buildRelationshipView,
  enrichRelationshipHealthWithFinancials,
  formatWhen,
  COMMERCIAL_EMPTY,
  RELATIONSHIP_EMPTY_TIMELINE
} from "./accountDirectoryRelationshipUi.mjs";
import { panelFromTab, parseUrlState, serializeUrlState, tabFromPanel } from "./accountDirectoryWorkspace.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

function formatJobsLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Math.round(Number(value));
  return `${n.toLocaleString("en-US")} ${n === 1 ? "Job" : "Jobs"}`;
}

function formatSqft(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const text = n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: 1
  });
  return `${text} SF`;
}

const here = dirname(fileURLToPath(import.meta.url));
const panels = readFileSync(join(here, "../ui/Account360Panels.tsx"), "utf8");
const app = readFileSync(join(here, "../AccountDirectoryApp.tsx"), "utf8");

console.log("\naccountDirectoryRelationshipUi.test.mjs\n");

assert.ok(formatWhen("2026-01-15"), "formatWhen formats ISO dates");
assert.equal(formatWhen(null), null);
assert.equal(formatWhen(""), null);
assert.ok(panels.includes("buildRelationshipView"), "Relationship panel uses the safe view-model");
assert.ok(panels.includes("formatWhen"), "Relationship panel formats dates via formatWhen");
assert.equal(panels.includes("relationship?.estimates.internal"), false, "must not unguard estimates.internal");
assert.equal(panels.includes("relationship?.jobs.notes"), false, "must not unguard jobs.notes");
assert.ok(panels.includes(RELATIONSHIP_EMPTY_TIMELINE) || panels.includes("emptyCopy"), "designed empty timeline copy");
assert.ok(panels.includes("timelineRecencyLabel"), "timeline recency is labeled separately");
assert.ok(panels.includes("commercialRecencyLabel"), "commercial recency is labeled separately");
const relChunk = panels.slice(panels.indexOf("export function RelationshipWorkspace"));
assert.equal(relChunk.includes("<RelationshipHealthPanel"), false, "Relationship tab must not duplicate health panel");
assert.ok(app.includes("profile-more"), "secondary header actions use More overflow");
assert.ok(app.includes("+ Alias") && app.includes("Connect QuickBooks") && app.includes("Archive"), "More menu preserves Alias, Connect QuickBooks, Archive");
console.log("ok: Relationship source no longer accesses unguarded nested fields");

assert.doesNotThrow(() => buildRelationshipView(null, null));
assert.doesNotThrow(() => buildRelationshipView(undefined, undefined));
const missing = buildRelationshipView(null, null);
assert.equal(missing.emptyTimeline, true);
assert.equal(missing.emptyCopy, RELATIONSHIP_EMPTY_TIMELINE);
assert.equal(missing.internal.hasItems, false);
assert.equal(missing.studio.hasItems, false);
assert.equal(missing.signals.length, 0);
assert.ok(missing.jobsNotes);
assert.equal(missing.morawareLinked, false);
assert.equal(missing.jobCount2026, null);
console.log("ok: missing relationship data does not crash");

const emptyTimelineWithCommercial = buildRelationshipView(
  {
    estimates: {
      internal: {
        state: "available",
        items: [{ quote_number: "Q-1", status: "draft", updated_at: "2026-08-15" }]
      }
    }
  },
  { items: [] },
  { lastInvoiceDate: "2026-08-04", lastPaymentDate: "2026-07-31" }
);
assert.equal(emptyTimelineWithCommercial.emptyTimeline, true);
assert.equal(emptyTimelineWithCommercial.timelineRecencyLabel, RELATIONSHIP_EMPTY_TIMELINE);
assert.match(emptyTimelineWithCommercial.commercialRecencyLabel, /^Most recent commercial activity: /);
assert.ok(emptyTimelineWithCommercial.commercialRecencyLabel.includes(formatWhen("2026-08-15")));
assert.equal(emptyTimelineWithCommercial.timelineItems.length, 0, "must not synthesize timeline events from invoices/estimates");
console.log("ok: empty timeline + existing commercial activity stays distinct");

const emptyBoth = buildRelationshipView(null, { items: [] }, {});
assert.equal(emptyBoth.timelineRecencyLabel, RELATIONSHIP_EMPTY_TIMELINE);
assert.equal(emptyBoth.commercialRecencyLabel, COMMERCIAL_EMPTY);
console.log("ok: empty timeline + no commercial activity");

const partial = buildRelationshipView(
  { health: { label: "Watch" }, estimates: {}, jobs: null },
  { items: [{ id: "e1", at: "not-a-date", title: "Linked" }] }
);
assert.equal(partial.healthLabel, "Watch");
assert.equal(partial.signals.length, 0);
assert.equal(partial.internal.items.length, 0);
assert.equal(partial.emptyTimeline, false);
assert.ok(partial.timelineItems[0].title);
assert.doesNotThrow(() => formatWhen(partial.timelineItems[0].at));
console.log("ok: malformed/partial optional relationship data does not crash");

const withData = buildRelationshipView(
  {
    health: { label: "Healthy", signals: [{ code: "ok", label: "OK", detail: "Fine", severity: "watch", target: "Overview" }] },
    estimates: {
      internal: { state: "available", items: [{ quote_number: "Q-1", status: "open", amount: 10, updated_at: "2026-02-01" }] },
      studio: { state: "unavailable", items: [], notes: "No studio estimates." }
    },
    jobs: { notes: "Jobs unavailable." }
  },
  { items: [{ id: "t1", at: "2026-03-01T12:00:00Z", title: "Invoice", source: "QuickBooks" }] },
  { primaryContact: "Pat", qbState: "QB Linked" }
);
assert.equal(withData.internal.hasItems, true);
assert.equal(withData.studio.hasItems, false);
assert.equal(withData.signals.length, 1);
assert.equal(withData.primaryContact, "Pat");
assert.ok(withData.timelineRecencyLabel);
assert.notEqual(withData.timelineRecencyLabel, RELATIONSHIP_EMPTY_TIMELINE);
assert.match(withData.commercialRecencyLabel, /Most recent commercial activity/);
console.log("ok: Relationship tab renders governed data when present");

const morawareOps = buildRelationshipView(
  {
    moraware: {
      linked: true,
      jobs_state: "available",
      job_count_2026: 2,
      sqft_state: "available",
      sqft_2026: 1283.5,
      latest_job_date: "2026-06-15",
      accounts: [{ source_account_id: "635" }, { source_account_id: "553" }],
      recent_jobs: [
        {
          source_job_id: "j2",
          job_name: "Island",
          job_date: "2026-06-15",
          status_name: "complete",
          salesperson_name: "Drew"
        }
      ]
    }
  },
  { items: [] }
);
assert.equal(morawareOps.morawareLinked, true);
assert.equal(morawareOps.jobCount2026, 2);
assert.equal(morawareOps.sqft2026, 1283.5);
assert.equal(morawareOps.morawareSqftState, "available");
assert.equal(morawareOps.recentMorawareJobs[0].salesperson_name, "Drew");
const morawareDown = buildRelationshipView(
  { moraware: { linked: true, jobs_state: "unavailable", job_count_2026: null, sqft_state: "unavailable", sqft_2026: null } },
  { items: [] }
);
assert.equal(morawareDown.jobCount2026, null);
assert.equal(morawareDown.sqft2026, null);
assert.equal(morawareDown.morawareJobsState, "unavailable");
assert.equal(morawareDown.morawareSqftState, "unavailable");
assert.ok(panels.includes("2026 SqFt"), "2026 SqFt shown in Moraware Operations");
assert.ok(panels.includes("formatSqft"), "SqFt uses formatSqft");
assert.ok(panels.includes("formatJobsLabel"), "Jobs uses formatJobsLabel");
const zeroJobs = buildRelationshipView(
  {
    moraware: {
      linked: true,
      jobs_state: "available",
      job_count_2026: 0,
      sqft_state: "available",
      sqft_2026: 0,
      accounts: [{ source_account_id: "1" }]
    }
  },
  { items: [] }
);
assert.equal(zeroJobs.jobCount2026, 0);
assert.equal(zeroJobs.sqft2026, 0);
console.log("ok: Moraware operations view distinguishes zero jobs from unavailable");

{
  const enriched = enrichRelationshipHealthWithFinancials(
    {
      state: "healthy",
      label: "Healthy",
      signals: [{ code: "complete", severity: "healthy", label: "ok", detail: "ok", target: "Overview" }]
    },
    {
      linked: true,
      status: "ok",
      summary: { openAr: 500 },
      collectionAttention: { code: "attention", reason: "Past due" },
      daysSinceLastPayment: 120,
      recentActivity: [{ type: "invoice" }]
    }
  );
  assert.ok(enriched.signals.some((s) => s.code === "collection_attention"));
  assert.ok(enriched.signals.some((s) => s.code === "no_recent_payment"));
  assert.equal(enriched.state, "attention");
  console.log("ok: financials enrich relationship health without duplicate API embed");
}

assert.equal(formatJobsLabel(13), "13 Jobs");
assert.equal(formatJobsLabel(1), "1 Job");
assert.equal(formatJobsLabel(0), "0 Jobs");
assert.equal(formatJobsLabel(null), null);
assert.equal(formatSqft(1283.5), "1,283.5 SF");
assert.ok(readFileSync(join(here, "../ui/accountFormat.ts"), "utf8").includes("formatJobsLabel"));
console.log("ok: jobs + SqFt formatting");


const sequence = ["Overview", "Relationship", "Financials"].map((tab) => panelFromTab(tab));
assert.deepEqual(sequence, ["overview", "relationship", "financials"]);
assert.equal(tabFromPanel("relationship"), "Relationship");
assert.equal(tabFromPanel("financials"), "Financials");
assert.ok(app.includes('detailTab === "Relationship"'));
assert.ok(app.includes('detailTab === "Financials"'));
assert.ok(app.includes("changeWorkspaceTab"));
console.log("ok: Overview → Relationship → Financials panel routing");

const url = serializeUrlState({
  tab: "accounts",
  page: 1,
  pageSize: 50,
  search: "",
  status: "",
  linked: "",
  missingContact: "",
  missingLocation: "",
  qbEnrichment: "",
  intelligence: "",
  sort: "name_asc",
  account: "acct-1",
  panel: "relationship"
});
assert.ok(url.includes("account=acct-1"));
assert.ok(url.includes("panel=relationship"));
assert.equal(parseUrlState(url).panel, "relationship");
assert.equal(parseUrlState(url).account, "acct-1");
assert.equal(parseUrlState("?account=acct-1&panel=financials").panel, "financials");
console.log("ok: URL panel state remains correct for Relationship");

console.log("\nAll Relationship UI regression checks passed.\n");
