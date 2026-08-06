#!/usr/bin/env node
/**
 * Vercel Ignored Build Step helper for the eliteOS monorepo.
 *
 * Usage (from a Vercel project Root Directory such as app-hr/):
 *   node ../scripts/vercel-ignore-build.mjs <project-root>
 *
 * Exit codes (Vercel convention):
 *   0 = skip / ignore this build
 *   1 = proceed with build / deploy
 *
 * On detection failure, prefer build (exit 1) over skip.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Conservative paired frontend ← backend/shared path triggers.
 * Own project root always triggers; root package/lock triggers all.
 * Unlisted backend paths do not rebuild frontends.
 */
export const PROJECT_DEPENDENCIES = Object.freeze({
  "app-elite100-quote-flow": [
    "backend-core/src/elite100QuoteFlow",
    "backend-core/src/digitalEstimate",
    "backend-core/src/elite100EstimateStudio",
    "shared/eliteos-ui"
  ],
  "app-elite100-estimate-studio": [
    "backend-core/src/elite100EstimateStudio",
    "backend-core/src/elite100QuoteFlow",
    "backend-core/src/takeoff",
    "shared/eliteos-ui"
  ],
  "app-digital-estimate": ["backend-core/src/digitalEstimate", "shared/eliteos-ui"],
  "app-ai-takeoff": ["backend-core/src/takeoff", "shared/eliteos-ui"],
  "app-quote-library": ["backend-core/src/elite100EstimateStudio", "shared/eliteos-ui"],
  "app-quote": ["shared/eliteos-ui"],
  "app-hr": ["backend-core/src/hr", "shared/eliteos-ui"],
  "app-home": ["shared/eliteos-ui"],
  "app-kiosk": ["shared/eliteos-ui"],
  "app-sales": ["shared/eliteos-ui"],
  "app-slab-inventory": ["shared/eliteos-ui"],
  "app-visualizer": ["shared/eliteos-ui"],
  "app-pricing-admin": ["shared/eliteos-ui"],
  "app-internal-estimate": ["shared/eliteos-ui"]
});

/** Paths that force every managed project to rebuild. */
export const GLOBAL_TRIGGER_PREFIXES = Object.freeze([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".npmrc",
  "scripts/vercel-ignore-build.mjs"
]);

/** Docs / non-deploy paths — alone they never force a build. */
export const SKIP_ONLY_PREFIXES = Object.freeze([
  "docs/",
  ".cursor/",
  ".agents/",
  ".github/",
  "README.md",
  "skills-lock.json"
]);

/**
 * @param {string} projectRoot
 * @returns {string}
 */
export function normalizeProjectRoot(projectRoot) {
  const raw = String(projectRoot || "")
    .trim()
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  if (!raw) throw new Error("project-root argument is required");
  if (raw.includes("..") || raw.startsWith("/") || raw.includes("\\")) {
    throw new Error(`invalid project-root: ${projectRoot}`);
  }
  return raw;
}

/**
 * @param {string} file
 * @param {string} prefix
 */
export function pathMatchesPrefix(file, prefix) {
  const f = String(file || "").replace(/\\/g, "/");
  const p = String(prefix || "").replace(/\\/g, "/");
  if (!f || !p) return false;
  if (p.endsWith("/")) return f === p.slice(0, -1) || f.startsWith(p);
  return f === p || f.startsWith(`${p}/`);
}

/**
 * @param {string[]} changedFiles
 */
export function hasGlobalTrigger(changedFiles) {
  return (changedFiles || []).some((f) =>
    GLOBAL_TRIGGER_PREFIXES.some((p) => pathMatchesPrefix(f, p))
  );
}

/**
 * @param {string[]} changedFiles
 */
export function isDocsOnlyChange(changedFiles) {
  const files = (changedFiles || []).filter(Boolean);
  if (!files.length) return false;
  return files.every((f) => SKIP_ONLY_PREFIXES.some((p) => pathMatchesPrefix(f, p)));
}

/**
 * Decide whether this project should build for the given changed files.
 * @param {string} projectRoot
 * @param {string[]} changedFiles
 * @returns {{ build: boolean, reason: string }}
 */
export function shouldBuildProject(projectRoot, changedFiles) {
  const project = normalizeProjectRoot(projectRoot);
  const files = (changedFiles || []).map((f) => String(f).replace(/\\/g, "/")).filter(Boolean);

  if (!files.length) {
    return { build: false, reason: "no_changed_files" };
  }

  if (hasGlobalTrigger(files)) {
    return { build: true, reason: "global_package_or_ignore_script" };
  }

  if (isDocsOnlyChange(files)) {
    return { build: false, reason: "docs_only" };
  }

  // Own project tree always triggers.
  if (files.some((f) => pathMatchesPrefix(f, `${project}/`) || f === project)) {
    return { build: true, reason: "own_project_root" };
  }

  // Mapped shared / backend dependencies for this project.
  const deps = PROJECT_DEPENDENCIES[project] || [];
  for (const dep of deps) {
    if (files.some((f) => pathMatchesPrefix(f, dep))) {
      return { build: true, reason: `dependency:${dep}` };
    }
  }

  // backend-core: only own tree + globals (handled above). Unrelated apps skip.
  // Frontend apps: unrelated app-* / other backend paths skip.
  return { build: false, reason: "unaffected" };
}

/**
 * Resolve git commit range for changed-file detection.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ from: string, to: string, source: string }|null}
 */
export function resolveDiffRange(env = process.env) {
  const prev = String(env.VERCEL_GIT_PREVIOUS_SHA || "").trim();
  const curr = String(env.VERCEL_GIT_COMMIT_SHA || "").trim();
  if (prev && curr && /^[0-9a-f]{7,40}$/i.test(prev) && /^[0-9a-f]{7,40}$/i.test(curr)) {
    return { from: prev, to: curr, source: "vercel_env" };
  }
  return { from: "HEAD^", to: "HEAD", source: "head_fallback" };
}

/**
 * @param {{ from: string, to: string }} range
 * @param {{ cwd?: string, gitRunner?: Function }} [opts]
 * @returns {{ ok: boolean, files: string[], error?: string }}
 */
export function listChangedFiles(range, opts = {}) {
  const cwd = opts.cwd || REPO_ROOT;
  const runner =
    opts.gitRunner ||
    ((args) =>
      spawnSync("git", args, {
        cwd,
        encoding: "utf8",
        env: process.env
      }));

  try {
    const result = runner(["diff", "--name-only", "--diff-filter=ACDMR", range.from, range.to]);
    if (result.status !== 0) {
      return {
        ok: false,
        files: [],
        error: String(result.stderr || result.stdout || `git exit ${result.status}`).trim()
      };
    }
    const files = String(result.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return { ok: true, files };
  } catch (err) {
    return { ok: false, files: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param {string} projectRoot
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string, gitRunner?: Function, changedFiles?: string[] }} [opts]
 * @returns {{ exitCode: 0|1, build: boolean, reason: string, files: string[], range: object|null }}
 */
export function decideIgnoreBuild(projectRoot, opts = {}) {
  const env = opts.env || process.env;
  const project = normalizeProjectRoot(projectRoot);

  // Allow tests / local dry-runs to inject changed files.
  if (Array.isArray(opts.changedFiles)) {
    const decision = shouldBuildProject(project, opts.changedFiles);
    return {
      exitCode: decision.build ? 1 : 0,
      build: decision.build,
      reason: decision.reason,
      files: opts.changedFiles,
      range: null
    };
  }

  const range = resolveDiffRange(env);
  const listed = listChangedFiles(range, { cwd: opts.cwd || REPO_ROOT, gitRunner: opts.gitRunner });
  if (!listed.ok) {
    return {
      exitCode: 1,
      build: true,
      reason: `detection_failed:${listed.error || "unknown"}`,
      files: [],
      range
    };
  }

  const decision = shouldBuildProject(project, listed.files);
  return {
    exitCode: decision.build ? 1 : 0,
    build: decision.build,
    reason: decision.reason,
    files: listed.files,
    range
  };
}

/**
 * Relative ignoreCommand for a project Root Directory (sibling of scripts/).
 * @param {string} projectRoot
 */
export function ignoreCommandForProject(projectRoot) {
  const project = normalizeProjectRoot(projectRoot);
  return `node ../scripts/vercel-ignore-build.mjs ${project}`;
}

function main(argv = process.argv.slice(2)) {
  const projectRoot = argv[0];
  if (!projectRoot || projectRoot === "--help" || projectRoot === "-h") {
    process.stderr.write(
      "Usage: node scripts/vercel-ignore-build.mjs <project-root>\n" +
        "Exit 0 = skip build; exit 1 = build.\n"
    );
    process.exit(projectRoot ? 0 : 1);
  }

  let result;
  try {
    result = decideIgnoreBuild(projectRoot);
  } catch (err) {
    process.stderr.write(
      `[vercel-ignore-build] error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  const mode = result.build ? "BUILD" : "SKIP";
  process.stderr.write(
    `[vercel-ignore-build] ${normalizeProjectRoot(projectRoot)} → ${mode} (${result.reason}; ` +
      `${result.files.length} file(s)` +
      `${result.range ? `; range ${result.range.from}..${result.range.to}` : ""})\n`
  );
  process.exit(result.exitCode);
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main();
}
