/**
 * Studio estimate repository factory.
 * Default: Supabase (durable). Memory is explicit / tests only.
 */
import {
  InMemoryStudioEstimateRepository,
  sharedInMemoryStudioEstimateRepository
} from "./inMemoryStudioEstimateRepository.mjs";
import { SupabaseStudioEstimateRepository } from "./supabaseStudioEstimateRepository.mjs";

export { InMemoryStudioEstimateRepository, sharedInMemoryStudioEstimateRepository };
export { SupabaseStudioEstimateRepository };

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   repository?: object,
 *   getSupabase?: () => import("@supabase/supabase-js").SupabaseClient,
 *   db?: import("@supabase/supabase-js").SupabaseClient
 * }} [deps]
 */
export function createStudioEstimateRepository(deps = {}) {
  if (deps.repository) return { repository: deps.repository, mode: "injected" };

  const mode = String(deps.env?.ELITE100_STUDIO_ESTIMATE_REPOSITORY ?? "supabase")
    .trim()
    .toLowerCase();

  if (mode === "memory") {
    return { repository: sharedInMemoryStudioEstimateRepository, mode: "memory" };
  }

  if (mode !== "supabase") {
    const err = new Error(
      `Unknown ELITE100_STUDIO_ESTIMATE_REPOSITORY=${mode} (use supabase or memory)`
    );
    err.statusCode = 503;
    err.code = "studio_estimate_persistence_misconfigured";
    throw err;
  }

  const db = deps.db || deps.getSupabase?.();
  if (!db) {
    const err = new Error("Supabase client unavailable for studio estimate persistence");
    err.statusCode = 503;
    err.code = "studio_estimate_persistence_misconfigured";
    throw err;
  }

  return {
    repository: new SupabaseStudioEstimateRepository({ db }),
    mode: "supabase"
  };
}
