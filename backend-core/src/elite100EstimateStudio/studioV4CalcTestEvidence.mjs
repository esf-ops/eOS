/**
 * Test-only: give a hand-built pricingVersion 4 calculation the `elite100` rate evidence a real
 * V4 calculation of the same scope carries, so publishing freezes a repriceable pin.
 */
import { calculateStudioEstimateV4 } from "./elite100RoomPricingStudioAdapter.mjs";

export async function withRealV4RateEvidence(calc, scope, env = {}) {
  const real = await calculateStudioEstimateV4({ scope, env });
  return { ...calc, elite100: real.elite100, account: calc.account ?? real.account };
}
