/**
 * DE.2B configuration feature flags — exact string "1" enables; default OFF.
 */

import {
  isDigitalEstimateApiEnabled
} from "../digitalEstimateConfig.mjs";
import { isElite100EstimateStudioEnabled } from "../../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";

export function isDigitalEstimateConfigurationEnabled(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_CONFIGURATION_ENABLED ?? "").trim() === "1";
}

/**
 * Studio configuration contracts require API + configuration + Studio flags.
 * (Product HTTP routes are optional in DE.2B; factory uses this for fail-closed.)
 */
export function isDigitalEstimateConfigurationRuntimeEnabled(env = process.env) {
  return (
    isDigitalEstimateApiEnabled(env) &&
    isDigitalEstimateConfigurationEnabled(env) &&
    isElite100EstimateStudioEnabled(env)
  );
}

export const DIGITAL_ESTIMATE_CONFIG_ENGINE_VERSION_PLACEHOLDER =
  "elite100_config_delta_v1_placeholder";

/** Production DE.2C engine id (also exported from elite100ConfigDeltaConstants). */
export const DIGITAL_ESTIMATE_CONFIG_ENGINE_VERSION = "elite100-config-delta-v1";

export function readSafeDigitalEstimateConfigurationConfig(env = process.env) {
  return {
    apiEnabled: isDigitalEstimateApiEnabled(env),
    configurationEnabled: isDigitalEstimateConfigurationEnabled(env),
    studioEnabled: isElite100EstimateStudioEnabled(env),
    runtimeEnabled: isDigitalEstimateConfigurationRuntimeEnabled(env),
    engineVersionPlaceholder: DIGITAL_ESTIMATE_CONFIG_ENGINE_VERSION_PLACEHOLDER,
    engineVersion: DIGITAL_ESTIMATE_CONFIG_ENGINE_VERSION
  };
}
