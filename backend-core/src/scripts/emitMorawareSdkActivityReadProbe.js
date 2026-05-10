#!/usr/bin/env node
/**
 * Emit debug/moraware/latest/moraware-sdk-activity-read-probe.{json,txt}
 * via tools/moraware-sdk-trace (MORAWARE_SDK_TRACE_MODE=activity-read-probe).
 * Read-only allowlisted Connection Get* calls — no sync / Supabase.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = path.join(REPO_ROOT, "debug", "moraware", "latest");
const OUT_JSON = path.join(OUT_DIR, "moraware-sdk-activity-read-probe.json");
const OUT_TXT = path.join(OUT_DIR, "moraware-sdk-activity-read-probe.txt");
const CSPROJ = path.join(REPO_ROOT, "tools", "moraware-sdk-trace", "MorawareSdkTrace.net8.csproj");
const DLL = path.join(REPO_ROOT, "tools", "moraware-sdk-trace", "lib", "JobTrackerAPI5.dll");

async function writeStub(reason) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    source: "stub_emitMorawareSdkActivityReadProbe",
    reason,
    instructions: [
      "Install .NET SDK and copy JobTrackerAPI5.dll into tools/moraware-sdk-trace/lib/.",
      "Set MORAWARE_URL or MORAWARE_API_URL, MORAWARE_USERNAME, MORAWARE_PASSWORD.",
      "Optional: MORAWARE_SDK_PROBE_JOB_ID=38837 MORAWARE_SDK_PROBE_JOB_ACTIVITY_ID MORAWARE_SDK_PROBE_MAX_ACTIVITIES=50",
      "Run: MORAWARE_SDK_TRACE_MODE=activity-read-probe dotnet run --project tools/moraware-sdk-trace/MorawareSdkTrace.net8.csproj"
    ]
  };
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  const txt = [
    "Moraware SDK — activity read probe (stub)",
    `generatedAt: ${report.generatedAt}`,
    "",
    `Reason: ${reason}`,
    "",
    ...report.instructions.map((l) => `- ${l}`)
  ].join("\n");
  await fs.writeFile(OUT_TXT, txt, "utf8");
  console.log(`[emitMorawareSdkActivityReadProbe] Wrote stub ${OUT_JSON}`);
}

async function main() {
  const which = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
  const hasDotnet = !which.error && which.status === 0;

  let hasDll = false;
  try {
    await fs.access(DLL);
    hasDll = true;
  } catch {
    hasDll = false;
  }

  if (!hasDotnet || !hasDll) {
    await writeStub(!hasDotnet ? "dotnet SDK not on PATH" : "tools/moraware-sdk-trace/lib/JobTrackerAPI5.dll missing");
    return;
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const env = {
    ...process.env,
    MORAWARE_SDK_TRACE_MODE: "activity-read-probe",
    MORAWARE_SDK_REPORT_REPO_ROOT: REPO_ROOT,
    MORAWARE_SDK_ACTIVITY_READ_PROBE_OUT_JSON: OUT_JSON,
    MORAWARE_SDK_ACTIVITY_READ_PROBE_OUT_TXT: OUT_TXT
  };

  const r = spawnSync("dotnet", ["run", "--project", CSPROJ], { encoding: "utf8", cwd: REPO_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  console.log((r.stdout || "").slice(0, 4000));
  if (r.stderr) console.error((r.stderr || "").slice(0, 2000));
  if (r.status !== 0) {
    await writeStub(`dotnet run exit ${r.status}: ${(r.stderr || r.stdout || "").slice(0, 500)}`);
    return;
  }

  try {
    await fs.access(OUT_JSON);
    console.log(`[emitMorawareSdkActivityReadProbe] OK ${OUT_JSON}`);
  } catch {
    await writeStub("dotnet run completed but output JSON was not found");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
