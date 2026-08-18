/**
 * Load operator-local final-action plan JSON.
 * Never ships CSV. Production does not default to local-imports.
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_ARTIFACT = path.join(
  REPO_ROOT,
  "local-imports/moraware-qb-full-reconciliation/moraware-final-action-plan.json"
);

export function resolveFinalActionPlanPath(env = process.env) {
  const explicit = String(env.ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_PATH || "").trim();
  if (explicit) return explicit;
  if (String(env.NODE_ENV || "").toLowerCase() === "production") return null;
  return null;
}

/**
 * Dev/operator convenience: gitignored artifact only when explicitly allowed.
 * Production never uses this fallback.
 */
export function resolveFinalActionPlanPathWithLocalFallback(env = process.env, existsFn = fs.existsSync) {
  const explicit = resolveFinalActionPlanPath(env);
  if (explicit) return explicit;
  if (String(env.NODE_ENV || "").toLowerCase() === "production") return null;
  if (String(env.ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_ALLOW_LOCAL || "").trim() === "1" && existsFn(LOCAL_ARTIFACT)) {
    return LOCAL_ARTIFACT;
  }
  return null;
}

export function loadFinalActionPlanFromPath(filePath) {
  if (!filePath) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows || parsed?.actions || [];
  if (!Array.isArray(rows)) return null;
  return rows;
}

export function loadFinalActionPlan(env = process.env) {
  const filePath = resolveFinalActionPlanPathWithLocalFallback(env);
  if (!filePath) return { available: false, path: null, actions: [] };
  try {
    const actions = loadFinalActionPlanFromPath(filePath);
    return { available: Boolean(actions?.length), path: filePath, actions: actions || [] };
  } catch {
    return { available: false, path: filePath, actions: [], error: "plan_unreadable" };
  }
}
