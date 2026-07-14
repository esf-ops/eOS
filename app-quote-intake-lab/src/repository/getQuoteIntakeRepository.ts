import type { QuoteIntakeRepository } from "../domain/types";
import { fixtureQuoteIntakeRepository } from "./FixtureQuoteIntakeRepository.mjs";

/**
 * Phase 1 always returns the fixture repository.
 * Later phases can switch on env to an API-backed repository without UI churn.
 */
export function getQuoteIntakeRepository(): QuoteIntakeRepository {
  return fixtureQuoteIntakeRepository as unknown as QuoteIntakeRepository;
}
