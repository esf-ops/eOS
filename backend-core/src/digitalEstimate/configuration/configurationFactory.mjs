/**
 * DE.2B repository factory — fail closed; no memory fallback in supabase mode.
 */

import {
  isDigitalEstimateConfigurationEnabled,
  isDigitalEstimateConfigurationRuntimeEnabled
} from "./configurationConfig.mjs";
import { createInMemoryConfigurationRepository, createSupabaseConfigurationRepository } from "./configurationRepository.mjs";
import {
  createInMemoryPricingPolicyRepository,
  createSupabasePricingPolicyRepository
} from "./pricingPolicyRepository.mjs";

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   mode?: 'memory'|'supabase',
 *   db?: import('@supabase/supabase-js').SupabaseClient|null,
 *   requireRuntimeFlags?: boolean
 * }} [opts]
 */
export function createDigitalEstimateConfigurationStack(opts = {}) {
  const env = opts.env || process.env;
  const requireRuntimeFlags = opts.requireRuntimeFlags !== false;

  if (requireRuntimeFlags) {
    if (!isDigitalEstimateConfigurationEnabled(env)) {
      return null;
    }
    if (!isDigitalEstimateConfigurationRuntimeEnabled(env)) {
      return null;
    }
  } else if (!isDigitalEstimateConfigurationEnabled(env) && opts.mode !== "memory") {
    return null;
  }

  const mode = opts.mode || (opts.db ? "supabase" : "memory");

  if (mode === "supabase") {
    if (!opts.db) {
      const err = new Error("Supabase configuration mode requires db; refusing memory fallback");
      err.code = "supabase_misconfigured";
      throw err;
    }
    return {
      mode: "supabase",
      configuration: createSupabaseConfigurationRepository({ db: opts.db }),
      pricingPolicy: createSupabasePricingPolicyRepository({ db: opts.db })
    };
  }

  const pricingPolicy = createInMemoryPricingPolicyRepository();
  const configuration = createInMemoryConfigurationRepository({
    pricingPolicyRepository: pricingPolicy
  });
  return {
    mode: "memory",
    configuration,
    pricingPolicy
  };
}
