import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  FEED_DEFINITIONS,
  FEED_ALERT_STATE_INTEGRATION_KEY,
  buildAlertEmail,
  evaluateFeed,
  planFeedAlerts,
  resolveAlertRecipients,
  runStaleFeedCheck,
  staleThresholdHours,
} from "./integrationFeedFreshness.mjs";
import { attachIntegrationFeedRoutes } from "./integrationFeedRoutes.mjs";

const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const NOW = new Date("2026-10-05T17:00:00Z");
const def = (key) => FEED_DEFINITIONS.find((d) => d.key === key);

test("fresh, stale, not_configured and unknown are distinct", () => {
  const d = def("qb_sales_sync");
  assert.equal(evaluateFeed(d, { lastSuccessAt: "2026-10-05T14:00:00Z" }, NOW, 6).state, "fresh");
  assert.equal(evaluateFeed(d, { lastSuccessAt: "2026-09-10T05:12:43Z" }, NOW, 6).state, "stale");
  assert.equal(evaluateFeed(d, { lastSuccessAt: null }, NOW, 6).state, "not_configured");
  assert.equal(evaluateFeed(d, { lastSuccessAt: null, queryError: "relation does not exist" }, NOW, 6).state, "unknown");
});

test("Moraware: no attempts since last success is diagnosed as not running", () => {
  const r = evaluateFeed(
    def("moraware_incremental"),
    { lastSuccessAt: "2026-09-02T18:03:00Z", cursor: { last_attempt_at: "2026-09-02T18:03:05Z", last_failure_at: null } },
    NOW,
    3
  );
  assert.equal(r.state, "stale");
  assert.match(r.diagnosis, /No worker attempts reached production/);
});

test("Moraware: attempts with a failure reason are diagnosed as failing, not down", () => {
  const r = evaluateFeed(
    def("moraware_incremental"),
    {
      lastSuccessAt: "2026-09-02T18:03:00Z",
      cursor: { last_attempt_at: "2026-10-05T16:30:00Z", last_failure_at: "2026-10-05T16:30:00Z", last_failure_reason: "LIVE_CANDIDATE_CEILING_EXCEEDED" },
    },
    NOW,
    3
  );
  assert.equal(r.state, "stale");
  assert.match(r.diagnosis, /running but failing: LIVE_CANDIDATE_CEILING_EXCEEDED/);
});

test("a fresh incremental run does not hide stalled new-job discovery", () => {
  const runs = evaluateFeed(def("moraware_incremental"), { lastSuccessAt: "2026-10-05T16:30:00Z", cursor: null }, NOW, 3);
  const discovery = evaluateFeed(def("moraware_new_jobs"), { lastSuccessAt: "2026-08-17T00:00:00Z" }, NOW, 96);
  assert.equal(runs.state, "fresh");
  assert.equal(discovery.state, "stale");
  assert.match(discovery.diagnosis, /creation_window_candidates/);
});

test("threshold env override per feed", () => {
  assert.equal(staleThresholdHours(def("moraware_incremental"), {}), 3);
  assert.equal(staleThresholdHours(def("moraware_incremental"), { INTEGRATION_FEED_STALE_HOURS_MORAWARE_INCREMENTAL: "5" }), 5);
  assert.equal(staleThresholdHours(def("moraware_incremental"), { INTEGRATION_FEED_STALE_HOURS_MORAWARE_INCREMENTAL: "junk" }), 3);
});

test("alert dedupe: first stale alerts, repeat suppressed until remind window, recovery notifies once", () => {
  const stale = [{ key: "moraware_incremental", state: "stale", last_success_at: "x" }];
  const first = planFeedAlerts(stale, {}, NOW, 12);
  assert.equal(first.stale.length, 1);

  const later = new Date(NOW.getTime() + 2 * 3_600_000);
  assert.equal(planFeedAlerts(stale, first.nextState, later, 12).stale.length, 0);

  const remind = new Date(NOW.getTime() + 13 * 3_600_000);
  assert.equal(planFeedAlerts(stale, first.nextState, remind, 12).stale.length, 1);

  const rec = planFeedAlerts([{ key: "moraware_incremental", state: "fresh", last_success_at: "y" }], first.nextState, later, 12);
  assert.deepEqual(rec.recovered.map((r) => r.key), ["moraware_incremental"]);
  assert.equal(planFeedAlerts([{ key: "moraware_incremental", state: "fresh" }], rec.nextState, later, 12).recovered.length, 0);
});

test("recipients parsing rejects junk; email body has no secrets and names the runbook", () => {
  assert.deepEqual(resolveAlertRecipients({ INTEGRATION_ALERT_EMAILS: "Ops@Example.com, bad, x@y.io" }), ["ops@example.com", "x@y.io"]);
  const r = evaluateFeed(def("moraware_incremental"), { lastSuccessAt: "2026-09-02T18:03:00Z", cursor: null }, NOW, 3);
  const email = buildAlertEmail({ organizationId: ORG, stale: [r], recovered: [], now: NOW });
  assert.match(email.subject, /Moraware incremental/);
  assert.match(email.text, /moraware-cloud-worker-runbook/);
  assert.doesNotMatch(email.text, /secret|password|token/i);
});

/** Minimal Supabase query-builder fake keyed by table. */
function fakeSupabase(tables) {
  const writes = [];
  function builder(table) {
    const filters = [];
    let order = null;
    const api = {
      select: () => api,
      eq: (c, v) => (filters.push((r) => r[c] === v), api),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), api),
      not: (c) => (filters.push((r) => r[c] != null), api),
      order: (c, { ascending }) => ((order = { c, ascending }), api),
      limit: async (n) => {
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (order) rows = [...rows].sort((a, b) => (a[order.c] < b[order.c] ? 1 : -1) * (order.ascending ? -1 : 1));
        return { data: rows.slice(0, n), error: null };
      },
      upsert: async (payload) => (writes.push({ table, payload }), { error: null }),
    };
    return api;
  }
  return { from: builder, writes };
}

const PROD_LIKE = {
  organizations: [{ id: ORG }, { id: "00000000-0000-0000-0000-000000000000" }],
  moraware_sync_runs: [{ organization_id: ORG, status: "success", mode: "incremental-worker-import", finished_at: "2026-09-02T18:03:00Z" }],
  moraware_report_runs: [{ organization_id: ORG, status: "promoted", started_at: "2026-08-28T18:02:24Z" }],
  brain_moraware_jobs: [{ organization_id: ORG, created_at_source: "2026-08-17T00:00:00Z" }],
  sales_quickbooks_sync_runs: [{ organization_id: ORG, status: "success", completed_at: "2026-09-10T05:12:43Z" }],
  ad_qb_customer_sync_runs: [{ organization_id: ORG, status: "success", completed_at: "2026-09-09T07:17:34Z" }],
  qb_finance_sync_runs: [{ organization_id: ORG, status: "success", started_at: "2026-09-10T01:40:25Z" }],
  organization_integration_configs: [
    { organization_id: ORG, integration_key: "moraware_incremental_cursor", config: { cursor: { last_attempt_at: "2026-09-02T18:03:05Z", last_success_at: "2026-09-02T18:03:05Z" } } },
  ],
};

test("full pass: alerts once per stale org, persists dedupe state only after delivery", async () => {
  const sb = fakeSupabase(PROD_LIKE);
  const sent = [];
  const result = await runStaleFeedCheck({
    supabase: sb,
    now: NOW,
    env: { INTEGRATION_ALERT_EMAILS: "ops@example.com", INTEGRATION_ALERT_EMAIL_PROVIDER: "resend" },
    sendEmail: async (p) => (sent.push(p), { ok: true, skipped: false, messageId: "m1" }),
    log: () => {},
  });
  assert.equal(result.organizations.length, 1, "placeholder org is excluded");
  const org = result.organizations[0];
  assert.deepEqual(org.alerts.stale.sort(), ["moraware_incremental", "moraware_new_jobs", "moraware_nightly_report", "qb_customer_sync", "qb_finance_sync", "qb_sales_sync"]);
  assert.equal(org.notification.status, "sent");
  assert.equal(sent.length, 1);
  assert.equal(sb.writes.length, 1);
  assert.equal(sb.writes[0].payload.integration_key, FEED_ALERT_STATE_INTEGRATION_KEY);
  assert.equal(sb.writes[0].payload.organization_id, ORG);
});

test("full pass: unconfigured channel reports not_configured and does not persist (keeps retrying)", async () => {
  const sb = fakeSupabase(PROD_LIKE);
  const logs = [];
  const result = await runStaleFeedCheck({ supabase: sb, now: NOW, env: {}, sendEmail: async () => assert.fail("must not send"), log: (o) => logs.push(o) });
  assert.equal(result.organizations[0].notification.status, "not_configured");
  assert.equal(sb.writes.length, 0);
  assert.ok(logs.some((l) => l.integration_feed_stale && l.feed === "moraware_incremental"));
});

test("dry run never sends or writes", async () => {
  const sb = fakeSupabase(PROD_LIKE);
  const result = await runStaleFeedCheck({ supabase: sb, now: NOW, notify: false, env: { INTEGRATION_ALERT_EMAILS: "ops@example.com", INTEGRATION_ALERT_EMAIL_PROVIDER: "resend" }, sendEmail: async () => assert.fail("must not send"), log: () => {} });
  assert.equal(result.organizations[0].notification.status, "suppressed_dry_run");
  assert.equal(sb.writes.length, 0);
});

test("route rejects requests without the cron secret", async () => {
  const app = express();
  attachIntegrationFeedRoutes(app, { env: { CRON_SECRET: "s3" }, getSupabase: () => fakeSupabase(PROD_LIKE) });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const unauth = await fetch(`http://127.0.0.1:${port}/api/internal/integration-feeds/stale-check?notify=0`);
    assert.equal(unauth.status, 401);
    const ok = await fetch(`http://127.0.0.1:${port}/api/internal/integration-feeds/stale-check?notify=0`, { headers: { authorization: "Bearer s3" } });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.notify, false);
  } finally {
    server.close();
  }
});
