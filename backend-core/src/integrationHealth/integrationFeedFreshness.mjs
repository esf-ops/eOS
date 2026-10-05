/**
 * Integration feed freshness + stale-feed alerting (read-only against feeds).
 *
 * Evaluates the latest *successful* run per organization for each scheduled ingest feed
 * (Moraware Mac mini worker, QuickBooks ODBC workers). Runs from Brain (Vercel Cron) so it
 * keeps working when the worker host is down — a host that is powered on but not writing runs
 * is still reported stale.
 *
 * Only write: one `organization_integration_configs` row per org
 * (`integration_key = 'integration_feed_alert_state'`) holding last alert state for dedupe.
 */

import { sendEstimateEmail } from "../email/emailClient.js";

export const FEED_ALERT_STATE_INTEGRATION_KEY = "integration_feed_alert_state";
const MORAWARE_CURSOR_INTEGRATION_KEY = "moraware_incremental_cursor";
const HOUR_MS = 3_600_000;

/**
 * `staleAfterHours` is the default; override with INTEGRATION_FEED_STALE_HOURS_<KEY upper>.
 */
export const FEED_DEFINITIONS = Object.freeze([
  {
    key: "moraware_incremental",
    label: "Moraware incremental (Mac mini, hourly)",
    host: "mac_mini",
    table: "moraware_sync_runs",
    tsColumn: "finished_at",
    successStatuses: ["success"],
    filters: { mode: "incremental-worker-import" },
    staleAfterHours: 3,
    readsMorawareCursor: true,
  },
  {
    key: "moraware_new_jobs",
    label: "Moraware new-job discovery (newest job creation date in mirror)",
    host: "mac_mini",
    table: "brain_moraware_jobs",
    tsColumn: "created_at_source",
    successStatuses: null,
    filters: {},
    staleAfterHours: 96,
    diagnosisWhenStale:
      "Incremental runs can succeed while discovering no new jobs (they only re-refresh existing ones). Check creation_window_candidates in moraware_sync_runs.metadata.",
  },
  {
    key: "moraware_nightly_report",
    label: "Moraware nightly pipeline + View 219 (Mac mini)",
    host: "mac_mini",
    table: "moraware_report_runs",
    tsColumn: "started_at",
    successStatuses: ["promoted"],
    filters: {},
    staleAfterHours: 30,
  },
  {
    key: "qb_sales_sync",
    label: "QuickBooks sales sync (ODBC, every 2h)",
    host: "quickbooks_windows",
    table: "sales_quickbooks_sync_runs",
    tsColumn: "completed_at",
    successStatuses: ["success"],
    filters: {},
    staleAfterHours: 6,
  },
  {
    key: "qb_customer_sync",
    label: "QuickBooks customers → Account Directory (nightly)",
    host: "quickbooks_windows",
    table: "ad_qb_customer_sync_runs",
    tsColumn: "completed_at",
    successStatuses: ["success", "partial"],
    filters: {},
    staleAfterHours: 30,
  },
  {
    key: "qb_finance_sync",
    label: "QuickBooks finance sync",
    host: "quickbooks_windows",
    table: "qb_finance_sync_runs",
    tsColumn: "started_at",
    successStatuses: ["success"],
    filters: {},
    staleAfterHours: 30,
  },
]);

function pickStr(v) {
  return v == null ? "" : String(v).trim();
}

function toMs(iso) {
  const t = Date.parse(pickStr(iso));
  return Number.isFinite(t) ? t : null;
}

export function staleThresholdHours(def, env = process.env) {
  const raw = env[`INTEGRATION_FEED_STALE_HOURS_${def.key.toUpperCase()}`];
  const n = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(n) && n > 0 ? n : def.staleAfterHours;
}

/**
 * Pure evaluation of one feed.
 * @param {typeof FEED_DEFINITIONS[number]} def
 * @param {{ lastSuccessAt: string | null, queryError?: string | null, cursor?: { last_attempt_at?: string | null, last_failure_at?: string | null, last_failure_reason?: string | null } | null }} snap
 * @param {Date} now
 * @param {number} thresholdHours
 */
export function evaluateFeed(def, snap, now, thresholdHours) {
  const base = {
    key: def.key,
    label: def.label,
    host: def.host,
    threshold_hours: thresholdHours,
    last_success_at: snap.lastSuccessAt ?? null,
    age_hours: null,
    state: "fresh",
    diagnosis: null,
  };
  if (snap.queryError) return { ...base, state: "unknown", diagnosis: `Freshness query failed: ${snap.queryError}` };
  const last = toMs(snap.lastSuccessAt);
  if (last == null) return { ...base, state: "not_configured", diagnosis: "No successful run recorded for this organization." };
  const ageHours = Math.max(0, (now.getTime() - last) / HOUR_MS);
  const out = { ...base, age_hours: Math.round(ageHours * 10) / 10 };
  if (ageHours <= thresholdHours) return out;

  out.state = "stale";
  const cursor = snap.cursor;
  if (def.readsMorawareCursor && cursor) {
    const attempt = toMs(cursor.last_attempt_at);
    const failure = toMs(cursor.last_failure_at);
    if (attempt != null && attempt > last + HOUR_MS / 6 && failure != null && failure >= attempt - 60_000) {
      out.diagnosis = `Worker is running but failing: ${pickStr(cursor.last_failure_reason) || "unknown reason"} (last attempt ${cursor.last_attempt_at}).`;
    } else if (attempt == null || attempt <= last + HOUR_MS / 6) {
      out.diagnosis = "No worker attempts reached production since the last success — worker is not running or cannot reach Brain/Supabase.";
    } else {
      out.diagnosis = `Worker attempted at ${cursor.last_attempt_at} but did not record a successful run.`;
    }
  } else {
    out.diagnosis = def.diagnosisWhenStale ?? "No successful run within the freshness window. Check the worker host and its scheduled task.";
  }
  return out;
}

/**
 * Decide which alerts to send given previous per-feed state.
 * @param {ReturnType<typeof evaluateFeed>[]} results
 * @param {Record<string, { state?: string, alerted_at?: string | null }>} previous
 * @param {Date} now
 * @param {number} remindHours
 */
export function planFeedAlerts(results, previous, now, remindHours = 12) {
  const stale = [];
  const recovered = [];
  const nextState = {};
  for (const r of results) {
    const prev = previous?.[r.key] ?? {};
    const prevAlertMs = toMs(prev.alerted_at);
    if (r.state === "stale") {
      const due = prev.state !== "stale" || prevAlertMs == null || now.getTime() - prevAlertMs >= remindHours * HOUR_MS;
      if (due) stale.push(r);
      nextState[r.key] = { state: "stale", alerted_at: due ? now.toISOString() : prev.alerted_at ?? null, last_success_at: r.last_success_at };
    } else if (r.state === "fresh") {
      if (prev.state === "stale") recovered.push(r);
      nextState[r.key] = { state: "fresh", alerted_at: null, last_success_at: r.last_success_at };
    } else {
      nextState[r.key] = { state: r.state, alerted_at: prev.alerted_at ?? null, last_success_at: r.last_success_at };
    }
  }
  return { stale, recovered, nextState };
}

function fmtAge(h) {
  if (h == null) return "unknown";
  return h >= 48 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`;
}

export function buildAlertEmail({ organizationId, stale, recovered, now }) {
  const lines = [];
  if (stale.length) {
    lines.push("STALE FEEDS");
    for (const r of stale) {
      lines.push(`- ${r.label}: last success ${r.last_success_at} (${fmtAge(r.age_hours)} ago; window ${r.threshold_hours}h).`);
      if (r.diagnosis) lines.push(`  ${r.diagnosis}`);
    }
    if (stale.some((r) => r.host === "mac_mini")) {
      lines.push("", "Mac mini checks: see docs/eliteos/moraware-cloud-worker-runbook.md → 'Mac mini production host'.");
    }
  }
  if (recovered.length) {
    lines.push("", "RECOVERED");
    for (const r of recovered) lines.push(`- ${r.label}: last success ${r.last_success_at}.`);
  }
  lines.push("", `Organization ${organizationId} · checked ${now.toISOString()} · slabOS Brain integration feed monitor.`);
  const subjectBits = stale.length ? `${stale.length} stale feed${stale.length > 1 ? "s" : ""}: ${stale.map((r) => r.label.split(" (")[0]).join(", ")}` : `Recovered: ${recovered.map((r) => r.label.split(" (")[0]).join(", ")}`;
  const text = lines.join("\n");
  const html = `<pre style="font:13px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</pre>`;
  return { subject: `[slabOS] ${subjectBits}`, text, html };
}

export function resolveAlertRecipients(env = process.env) {
  return pickStr(env.INTEGRATION_ALERT_EMAILS)
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

// ---------------------------------------------------------------------------
// Supabase-backed loading
// ---------------------------------------------------------------------------

async function latestSuccess(supabase, def, organizationId) {
  let q = supabase.from(def.table).select(def.tsColumn).eq("organization_id", organizationId);
  if (def.successStatuses) q = q.in("status", def.successStatuses);
  q = q.not(def.tsColumn, "is", null);
  for (const [col, val] of Object.entries(def.filters || {})) q = q.eq(col, val);
  const res = await q.order(def.tsColumn, { ascending: false }).limit(1);
  if (res.error) return { lastSuccessAt: null, queryError: res.error.message || String(res.error) };
  const row = Array.isArray(res.data) ? res.data[0] : null;
  return { lastSuccessAt: row?.[def.tsColumn] ?? null, queryError: null };
}

async function readConfig(supabase, organizationId, integrationKey) {
  const res = await supabase
    .from("organization_integration_configs")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("integration_key", integrationKey)
    .limit(1);
  if (res.error) throw new Error(res.error.message || String(res.error));
  const row = Array.isArray(res.data) ? res.data[0] : null;
  return row?.config && typeof row.config === "object" ? row.config : null;
}

/** Bounded org list; orgs with no feed history are dropped later as `not_configured`. Excludes the placeholder org. */
export async function listMonitoredOrganizationIds(supabase, { limit = 500 } = {}) {
  const res = await supabase.from("organizations").select("id").limit(limit);
  if (res.error) throw new Error(res.error.message || String(res.error));
  return (res.data ?? []).map((r) => pickStr(r.id)).filter((id) => id && id !== "00000000-0000-0000-0000-000000000000");
}

export async function evaluateOrganizationFeeds(supabase, organizationId, { now = new Date(), env = process.env } = {}) {
  let cursor = null;
  try {
    const cfg = await readConfig(supabase, organizationId, MORAWARE_CURSOR_INTEGRATION_KEY);
    cursor = cfg?.cursor ?? null;
  } catch {
    cursor = null;
  }
  const results = [];
  for (const def of FEED_DEFINITIONS) {
    const snap = await latestSuccess(supabase, def, organizationId);
    results.push(evaluateFeed(def, { ...snap, cursor: def.readsMorawareCursor ? cursor : null }, now, staleThresholdHours(def, env)));
  }
  return { organizationId, checkedAt: now.toISOString(), feeds: results, morawareCursor: cursor ? {
    last_success_at: cursor.last_success_at ?? null,
    last_attempt_at: cursor.last_attempt_at ?? null,
    last_failure_at: cursor.last_failure_at ?? null,
    last_failure_reason: cursor.last_failure_reason ?? null,
    advanced_to: cursor.advanced_to ?? null,
  } : null };
}

/**
 * Full cron pass: evaluate every org, notify on transitions, persist dedupe state.
 * @param {{ supabase: any, env?: NodeJS.ProcessEnv, now?: Date, notify?: boolean, sendEmail?: typeof sendEstimateEmail, log?: (o: object) => void }} deps
 */
export async function runStaleFeedCheck({ supabase, env = process.env, now = new Date(), notify = true, sendEmail = sendEstimateEmail, log = (o) => console.error(JSON.stringify(o)) }) {
  const recipients = resolveAlertRecipients(env);
  const provider = pickStr(env.INTEGRATION_ALERT_EMAIL_PROVIDER || env.QUOTE_EMAIL_PROVIDER || "none").toLowerCase();
  const from = pickStr(env.INTEGRATION_ALERT_EMAIL_FROM || env.QUOTE_EMAIL_FROM) || "estimates@eliteosfab.com";
  const remindHours = Number.parseFloat(String(env.INTEGRATION_ALERT_REMIND_HOURS ?? "")) || 12;

  const orgIds = await listMonitoredOrganizationIds(supabase);
  const organizations = [];
  for (const organizationId of orgIds) {
    const evaluation = await evaluateOrganizationFeeds(supabase, organizationId, { now, env });
    const configured = evaluation.feeds.filter((f) => f.state !== "not_configured");
    if (!configured.length) continue;

    const prevCfg = await readConfig(supabase, organizationId, FEED_ALERT_STATE_INTEGRATION_KEY).catch(() => null);
    const plan = planFeedAlerts(configured, prevCfg?.feeds ?? {}, now, remindHours);

    for (const f of configured.filter((x) => x.state === "stale" || x.state === "unknown")) {
      log({ integration_feed_stale: true, organization_id: organizationId, feed: f.key, state: f.state, last_success_at: f.last_success_at, age_hours: f.age_hours, diagnosis: f.diagnosis });
    }

    let notification = { status: "nothing_to_send" };
    if (plan.stale.length || plan.recovered.length) {
      if (!notify) notification = { status: "suppressed_dry_run" };
      else if (!recipients.length) notification = { status: "not_configured", reason: "INTEGRATION_ALERT_EMAILS is not set" };
      else if (provider === "none") notification = { status: "not_configured", reason: "No email provider (INTEGRATION_ALERT_EMAIL_PROVIDER / QUOTE_EMAIL_PROVIDER)" };
      else {
        const email = buildAlertEmail({ organizationId, stale: plan.stale, recovered: plan.recovered, now });
        const sent = await sendEmail({ to: recipients, subject: email.subject, text: email.text, html: email.html, from, provider });
        notification = sent?.ok && !sent.skipped ? { status: "sent", messageId: sent.messageId ?? null } : { status: "failed", error: sent?.error ?? "send failed" };
        if (notification.status === "failed") log({ integration_feed_alert_send_failed: true, organization_id: organizationId, error: notification.error });
      }
    }

    // Only persist dedupe state when the alert was actually delivered (or nothing was due),
    // so an unconfigured or failed channel keeps retrying instead of going quiet.
    const persist = notify && (notification.status === "sent" || notification.status === "nothing_to_send");
    if (persist) {
      const up = await supabase.from("organization_integration_configs").upsert(
        {
          organization_id: organizationId,
          integration_key: FEED_ALERT_STATE_INTEGRATION_KEY,
          display_name: "Integration feed stale-alert state",
          is_enabled: true,
          config: { feeds: plan.nextState, checked_at: now.toISOString() },
          metadata: { updated_by: "integration_feed_stale_check" },
          updated_at: now.toISOString(),
        },
        { onConflict: "organization_id,integration_key" }
      );
      if (up.error) log({ integration_feed_alert_state_write_failed: true, organization_id: organizationId, error: up.error.message });
    }

    organizations.push({
      organizationId,
      feeds: configured,
      morawareCursor: evaluation.morawareCursor,
      alerts: { stale: plan.stale.map((r) => r.key), recovered: plan.recovered.map((r) => r.key) },
      notification,
    });
  }
  return { checkedAt: now.toISOString(), organizations };
}
