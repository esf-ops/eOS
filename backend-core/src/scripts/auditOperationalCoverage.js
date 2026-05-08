import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function yearWindow(year) {
  const y = Number.parseInt(String(year ?? ""), 10);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) throw new Error(`Invalid year: ${year}`);
  return { year: y, start: `${y}-01-01`, endExclusive: `${y + 1}-01-01` };
}

async function fetchAllPaged(queryBuilder, { pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function topN(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

export async function auditOperationalCoverage() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const year = String(process.env.MORAWARE_AUDIT_YEAR || "2026").trim();
  const win = yearWindow(year);

  const latestDir = path.join(process.cwd(), "debug", "moraware", "latest");
  await fs.mkdir(latestDir, { recursive: true });

  const jobs = await fetchAllPaged(
    supabase
      .from("brain_jobs")
      .select("job_id, creation_date")
      .gte("creation_date", win.start)
      .lt("creation_date", win.endExclusive)
      .order("job_id", { ascending: true }),
    { pageSize: 1000 }
  );

  const jobIds = jobs.map((j) => String(j.job_id));
  const jobIdChunks = chunk(jobIds, 500);

  const summaries = [];
  const activities = [];
  const contacts = [];

  for (const ids of jobIdChunks) {
    const sRows = await fetchAllPaged(
      supabase
        .from("brain_job_operational_summary")
        .select("*")
        .in("job_id", ids)
        .order("job_id", { ascending: true }),
      { pageSize: 1000 }
    );
    summaries.push(...sRows);

    const aRows = await fetchAllPaged(
      supabase
        .from("brain_job_activities")
        .select("job_id, activity_type, activity_status, start_date")
        .in("job_id", ids),
      { pageSize: 1000 }
    );
    activities.push(...aRows);

    const cRows = await fetchAllPaged(
      supabase.from("brain_job_contacts").select("job_id").in("job_id", ids),
      { pageSize: 1000 }
    );
    contacts.push(...cRows);
  }

  const summaryByJob = new Set(summaries.map((r) => String(r.job_id)));
  const jobsWithSummary = summaryByJob.size;

  const jobsWithTemplate = summaries.filter((r) => r.has_template_activity).length;
  const jobsWithInstall = summaries.filter((r) => r.has_install_activity).length;
  const jobsWithOrderStone = summaries.filter((r) => r.has_order_stone_activity).length;
  const jobsWithSlab = summaries.filter((r) => r.has_slab_signal).length;
  const jobsWithRemake = summaries.filter((r) => r.has_remake_signal).length;
  const jobsWithChange = summaries.filter((r) => r.has_change_signal).length;

  const jobsWithContacts = new Set(contacts.map((r) => String(r.job_id))).size;

  const activityTypeCounts = new Map();
  const activityStatusCounts = new Map();
  let minDate = null;
  let maxDate = null;
  for (const a of activities) {
    const t = String(a.activity_type ?? "(blank)") || "(blank)";
    const s = String(a.activity_status ?? "(blank)") || "(blank)";
    inc(activityTypeCounts, t, 1);
    inc(activityStatusCounts, s, 1);
    const d = a.start_date ? String(a.start_date) : "";
    if (d) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
  }

  const report = {
    year: win.year,
    window: win,
    jobCount: jobIds.length,
    jobsWithOperationalSummary: jobsWithSummary,
    totalActivities: activities.length,
    jobsWithTemplateActivity: jobsWithTemplate,
    jobsWithInstallActivity: jobsWithInstall,
    jobsWithOrderStoneActivity: jobsWithOrderStone,
    jobsWithSlabSignal: jobsWithSlab,
    jobsWithRemakeSignal: jobsWithRemake,
    jobsWithChangeSignal: jobsWithChange,
    jobsWithContacts,
    topActivityTypes: topN(activityTypeCounts, 25),
    topActivityStatuses: topN(activityStatusCounts, 25),
    activityDateRange: { min: minDate, max: maxDate }
  };

  const txt =
    `OPERATIONAL COVERAGE (${win.year})\n` +
    `jobs in window: ${report.jobCount}\n` +
    `jobs with operational summary: ${report.jobsWithOperationalSummary}\n` +
    `total activities: ${report.totalActivities}\n` +
    `jobs with template activity: ${report.jobsWithTemplateActivity}\n` +
    `jobs with install activity: ${report.jobsWithInstallActivity}\n` +
    `jobs with order stone activity: ${report.jobsWithOrderStoneActivity}\n` +
    `jobs with slab signal: ${report.jobsWithSlabSignal}\n` +
    `jobs with remake signal: ${report.jobsWithRemakeSignal}\n` +
    `jobs with change signal: ${report.jobsWithChangeSignal}\n` +
    `jobs with contacts: ${report.jobsWithContacts}\n` +
    `activity date range: ${minDate || "(none)"} .. ${maxDate || "(none)"}\n` +
    `\nTOP ACTIVITY TYPES\n` +
    `${report.topActivityTypes.map((r) => `${r.count}\t${r.key}`).join("\n")}\n` +
    `\nTOP ACTIVITY STATUSES\n` +
    `${report.topActivityStatuses.map((r) => `${r.count}\t${r.key}`).join("\n")}\n`;

  await fs.writeFile(
    path.join(latestDir, `operational-coverage-${win.year}.json`),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  await fs.writeFile(path.join(latestDir, `operational-coverage-${win.year}.txt`), txt, "utf8");

  console.log(`Wrote: debug/moraware/latest/operational-coverage-${win.year}.json`);
  console.log(`Wrote: debug/moraware/latest/operational-coverage-${win.year}.txt`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  auditOperationalCoverage().catch((e) => {
    console.error(e?.stack || e);
    process.exitCode = 1;
  });
}

