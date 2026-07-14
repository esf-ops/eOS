import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_AS_OF } from "../fixtures/quoteIntakeCases.mjs";
import { FixtureQuoteIntakeRepository } from "./FixtureQuoteIntakeRepository.mjs";

describe("FixtureQuoteIntakeRepository", () => {
  const repo = new FixtureQuoteIntakeRepository();

  it("returns fixture cases", async () => {
    const cases = await repo.listCases();
    assert.ok(cases.length >= 12);
    assert.ok(cases.every((c) => c.dataSource === "fixture"));
    assert.ok(cases.every((c) => c.elapsedTurnaroundLabel));
  });

  it("returns status counts for full set", async () => {
    const counts = await repo.getStatusCounts();
    assert.equal(counts.total, (await repo.listCases()).length);
    assert.ok(counts.new >= 1);
    assert.ok(counts.ready_for_review >= 1);
    assert.ok(counts.missing_information >= 1);
    assert.ok(counts.sent_simulated >= 1);
  });

  it("supports search", async () => {
    const cases = await repo.listCases({ search: "Willow Park" });
    assert.equal(cases.length, 1);
    assert.equal(cases[0].id, "qil-case-004");
  });

  it("supports status filtering", async () => {
    const cases = await repo.listCases({ status: "qil_needs_manual_takeoff" });
    assert.ok(cases.length >= 1);
    assert.ok(cases.every((c) => c.status === "qil_needs_manual_takeoff"));
  });

  it("supports missing-information filtering", async () => {
    const cases = await repo.listCases({ missingInfo: "has_missing" });
    assert.ok(cases.length >= 1);
    assert.ok(cases.every((c) => c.missingInformation.length > 0));
  });

  it("supports priority filtering", async () => {
    const cases = await repo.listCases({ priority: "urgent" });
    assert.ok(cases.length >= 1);
    assert.ok(cases.every((c) => c.priority === "urgent"));
  });

  it("looks up a case by id", async () => {
    const c = await repo.getCase("qil-case-004");
    assert.ok(c);
    assert.equal(c.projectName, "Willow Park Kitchen");
    assert.equal(await repo.getCase("missing"), null);
  });

  it("uses deterministic asOf", () => {
    assert.equal(repo.getAsOf(), FIXTURE_AS_OF);
  });

  it("lists salespeople and estimators from fixtures", async () => {
    const sales = await repo.listSalespeople();
    const estimators = await repo.listEstimators();
    assert.ok(sales.includes("Jordan Blake"));
    assert.ok(estimators.includes("Alex Rivera"));
  });
});
