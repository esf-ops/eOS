#!/usr/bin/env node
/**
 * Emit debug/moraware/latest/moraware-sdk-full-surface.{json,txt}
 * via tools/moraware-sdk-trace (MORAWARE_SDK_TRACE_MODE=full-surface). Reflection only unless caller also enables live probe elsewhere.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = path.join(REPO_ROOT, "debug", "moraware", "latest");
const OUT_JSON = path.join(OUT_DIR, "moraware-sdk-full-surface.json");
const OUT_TXT = path.join(OUT_DIR, "moraware-sdk-full-surface.txt");
const CSPROJ = path.join(REPO_ROOT, "tools", "moraware-sdk-trace", "MorawareSdkTrace.net8.csproj");
const DLL = path.join(REPO_ROOT, "tools", "moraware-sdk-trace", "lib", "JobTrackerAPI5.dll");

async function writeStub(reason) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    source: "stub_emitMorawareSdkFullSurfaceReport",
    reason,
    instructions: [
      "Install .NET SDK and copy Moraware JobTrackerAPI5.dll into tools/moraware-sdk-trace/lib/ (see tools/moraware-sdk-trace/README.md).",
      "From repo root: MORAWARE_SDK_TRACE_MODE=full-surface dotnet run --project tools/moraware-sdk-trace/MorawareSdkTrace.net8.csproj",
      "npm run eos:inspect:moraware-sdk-assignment also writes full surface plus assignment report."
    ]
  };
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  const txt = [
    "Moraware SDK — full surface (stub)",
    `generatedAt: ${report.generatedAt}`,
    "",
    `Reason: ${reason}`,
    "",
    ...report.instructions.map((l) => `- ${l}`)
  ].join("\n");
  await fs.writeFile(OUT_TXT, txt, "utf8");
  console.log(`[emitMorawareSdkFullSurfaceReport] Wrote stub ${OUT_JSON}`);
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
    MORAWARE_SDK_TRACE_MODE: "full-surface",
    MORAWARE_SDK_REPORT_REPO_ROOT: REPO_ROOT,
    MORAWARE_SDK_FULL_SURFACE_OUT_JSON: OUT_JSON,
    MORAWARE_SDK_FULL_SURFACE_OUT_TXT: OUT_TXT
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
    console.log(`[emitMorawareSdkFullSurfaceReport] OK ${OUT_JSON}`);
  } catch {
    await writeStub("dotnet run completed but output JSON was not found");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
