import { formatTurnaround } from "../domain/age.mjs";
import {
  buildStatusCounts,
  filterQuoteIntakeCases,
  uniqueEstimators,
  uniqueSalespeople
} from "../domain/filters.mjs";
import { FIXTURE_AS_OF, getFixtureCases } from "../fixtures/quoteIntakeCases.mjs";

/**
 * Fixture-backed QuoteIntakeRepository.
 * No network, no Supabase business tables, no AI/takeoff/pricing calls.
 */
export class FixtureQuoteIntakeRepository {
  /**
   * @param {{ cases?: unknown[], asOf?: string }} [opts]
   */
  constructor(opts = {}) {
    this._cases = Object.freeze([...(opts.cases ?? getFixtureCases())]);
    this._asOf = opts.asOf ?? FIXTURE_AS_OF;
  }

  getAsOf() {
    return this._asOf;
  }

  async listCases(filter = {}) {
    const filtered = filterQuoteIntakeCases(this._cases, filter, this._asOf);
    return filtered.map((c) => enrichCase(c, this._asOf));
  }

  async getCase(id) {
    const found = this._cases.find((c) => c.id === String(id ?? "").trim());
    return found ? enrichCase(found, this._asOf) : null;
  }

  async getStatusCounts(filter = {}) {
    const filtered = filterQuoteIntakeCases(this._cases, filter, this._asOf);
    return buildStatusCounts(filtered);
  }

  async listSalespeople() {
    return uniqueSalespeople(this._cases);
  }

  async listEstimators() {
    return uniqueEstimators(this._cases);
  }
}

function enrichCase(c, asOf) {
  return {
    ...c,
    elapsedTurnaroundLabel: formatTurnaround(c.receivedAt, asOf)
  };
}

/** Singleton used by the Phase 1 UI. */
export const fixtureQuoteIntakeRepository = new FixtureQuoteIntakeRepository();
