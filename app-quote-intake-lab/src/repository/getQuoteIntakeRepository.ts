import type { QuoteIntakeRepository } from "../domain/types";
import { getLocalQuoteIntakeRepository } from "./LocalQuoteIntakeRepository.mjs";

/**
 * Phase 2: local composite repository (fixtures + IndexedDB imports).
 */
export function getQuoteIntakeRepository(): QuoteIntakeRepository {
  return getLocalQuoteIntakeRepository() as unknown as QuoteIntakeRepository;
}
