/**
 * Studio lifecycle repository factory.
 *
 * Production / hosted: Supabase only. Missing tables → 503
 *   code: studio_lifecycle_persistence_unavailable
 * Memory: explicit injection or ELITE100_STUDIO_LIFECYCLE_REPOSITORY=memory (tests only).
 * Never silently falls back from Supabase to process memory.
 */

import { createInMemoryStudioLifecycleRepository } from "./studioLifecycleRepository.mjs";
import {
  createSupabaseStudioLifecycleRepository,
  studioLifecyclePersistenceUnavailable
} from "./supabaseStudioLifecycleRepository.mjs";

export { createInMemoryStudioLifecycleRepository } from "./studioLifecycleRepository.mjs";
export {
  createSupabaseStudioLifecycleRepository,
  studioLifecyclePersistenceUnavailable
} from "./supabaseStudioLifecycleRepository.mjs";

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   repository?: object,
 *   db?: import("@supabase/supabase-js").SupabaseClient,
 *   getSupabase?: () => import("@supabase/supabase-js").SupabaseClient,
 *   studioEstimateRepository?: any,
 *   allowMemory?: boolean
 * }} [deps]
 */
export function createStudioLifecycleRepository(deps = {}) {
  if (deps.repository) {
    return { repository: deps.repository, mode: "injected" };
  }

  const env = deps.env || process.env;
  const mode = String(env.ELITE100_STUDIO_LIFECYCLE_REPOSITORY ?? "supabase")
    .trim()
    .toLowerCase();

  if (mode === "memory") {
    if (deps.allowMemory !== true) {
      throw studioLifecyclePersistenceUnavailable(
        "Memory lifecycle repository requires explicit allowMemory (tests only)"
      );
    }
    return {
      repository: createInMemoryStudioLifecycleRepository({
        studioEstimateRepository: deps.studioEstimateRepository
      }),
      mode: "memory"
    };
  }

  if (mode !== "supabase") {
    const err = studioLifecyclePersistenceUnavailable(
      `Unknown ELITE100_STUDIO_LIFECYCLE_REPOSITORY=${mode} (use supabase or memory)`
    );
    throw err;
  }

  const db = deps.db || deps.getSupabase?.();
  if (!db) {
    throw studioLifecyclePersistenceUnavailable(
      "Supabase client unavailable for studio lifecycle persistence"
    );
  }

  return {
    repository: createSupabaseStudioLifecycleRepository({
      db,
      studioEstimateRepository: deps.studioEstimateRepository
    }),
    mode: "supabase"
  };
}

/**
 * Resolve lifecycle repo for route mounts.
 * Memory only when explicitly injected via deps.lifecycleRepository.
 */
export function resolveStudioLifecycleRepositoryForRoutes(deps = {}) {
  if (deps.lifecycleRepository) {
    return deps.lifecycleRepository;
  }
  const env = deps.env || process.env;
  const { repository } = createStudioLifecycleRepository({
    env,
    db: deps.db || deps.getSupabase?.(),
    getSupabase: deps.getSupabase,
    studioEstimateRepository: deps.studioEstimateRepository,
    allowMemory: false
  });
  return repository;
}
