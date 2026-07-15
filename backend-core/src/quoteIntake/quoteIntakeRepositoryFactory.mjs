/**
 * Quote Intake repository selection (Phase 6P.2).
 *
 * QUOTE_INTAKE_REPOSITORY=memory   (default) — InMemoryQuoteIntakeRepository
 * QUOTE_INTAKE_REPOSITORY=supabase — SupabaseQuoteIntakeRepository
 *
 * Never falls back from supabase → memory after a config or DB error.
 * Never exposed via VITE_*.
 *
 * Memory / API-off selection must not call getSupabase() or construct
 * SupabaseQuoteIntakeRepository (no credentials required at that point).
 */

import {
  InMemoryQuoteIntakeRepository,
  sharedInMemoryQuoteIntakeRepository
} from "./quoteIntakeRepository.mjs";
import { SupabaseQuoteIntakeRepository } from "./supabaseQuoteIntakeRepository.mjs";

export const QUOTE_INTAKE_REPOSITORY_ENV = "QUOTE_INTAKE_REPOSITORY";

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"memory"|"supabase"}
 */
export function readQuoteIntakeRepositoryMode(env = process.env) {
  const raw = String(env[QUOTE_INTAKE_REPOSITORY_ENV] ?? "memory")
    .trim()
    .toLowerCase();
  if (raw === "" || raw === "memory") return "memory";
  if (raw === "supabase") return "supabase";
  const err = new Error(
    `Invalid ${QUOTE_INTAKE_REPOSITORY_ENV}="${raw}". Use memory or supabase.`
  );
  err.code = "quote_intake_persistence_misconfigured";
  err.statusCode = 503;
  throw err;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: () => unknown,
 *   memoryRepository?: InMemoryQuoteIntakeRepository,
 *   supabaseClient?: unknown
 * }} deps
 * @returns {{ mode: "memory"|"supabase", repository: object }}
 */
export function createQuoteIntakeRepository(deps = {}) {
  const env = deps.env ?? process.env;
  const mode = readQuoteIntakeRepositoryMode(env);

  if (mode === "memory") {
    // Critical: do not call getSupabase or `new SupabaseQuoteIntakeRepository`.
    return {
      mode,
      repository: deps.memoryRepository ?? sharedInMemoryQuoteIntakeRepository
    };
  }

  // supabase mode — fail closed; never silent memory fallback
  if (deps.supabaseClient) {
    return {
      mode,
      repository: new SupabaseQuoteIntakeRepository({ client: deps.supabaseClient })
    };
  }
  if (typeof deps.getSupabase !== "function") {
    const err = new Error(
      "QUOTE_INTAKE_REPOSITORY=supabase requires getSupabase (or an injected supabaseClient)"
    );
    err.code = "quote_intake_persistence_misconfigured";
    err.statusCode = 503;
    throw err;
  }

  let client;
  try {
    client = deps.getSupabase();
  } catch (e) {
    const err = new Error("Quote Intake Supabase client unavailable");
    err.code = "quote_intake_persistence_misconfigured";
    err.statusCode = 503;
    err.cause = e;
    throw err;
  }
  if (!client || typeof client.from !== "function") {
    const err = new Error("Quote Intake Supabase client is invalid");
    err.code = "quote_intake_persistence_misconfigured";
    err.statusCode = 503;
    throw err;
  }

  return {
    mode,
    repository: new SupabaseQuoteIntakeRepository({ getSupabase: () => client })
  };
}
