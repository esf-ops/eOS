/**
 * Current configuration delta calculator entrypoint.
 *
 * New Studio / public / amendment calculations always use elite100-config-delta-v2.
 * Historical elite100-config-delta-v1 remains in elite100ConfigDeltaEngine.mjs and
 * must never be silently recomputed or relabeled.
 */

export {
  calculateElite100ConfigDeltaV2 as calculateElite100ConfigDelta,
  ELITE100_CONFIG_DELTA_ENGINE_ID_V2 as ELITE100_CONFIG_DELTA_ENGINE_ID
} from "./elite100ConfigDeltaEngineV2.mjs";

export { calculateElite100ConfigDelta as calculateElite100ConfigDeltaV1 } from "./elite100ConfigDeltaEngine.mjs";

export {
  ELITE100_CONFIG_DELTA_ENGINE_ID_V1,
  ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
  CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID
} from "./elite100ConfigDeltaConstants.mjs";
