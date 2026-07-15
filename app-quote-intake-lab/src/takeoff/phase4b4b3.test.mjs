/**
 * Phase 4B.4B.3 — takeoff workspace provenance labels (no Gemini calls).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { warningRequiredAction } from "./takeoffEligibility.mjs";
import {
  liveBannerClaimsAreHonest,
  resolveTakeoffWorkspaceMode,
  simulatedBannerClaimsAreHonest,
  takeoffIsolationBannerCopy,
  takeoffTopbarChipLabel,
  takeoffWorkspaceBannerCopy
} from "./takeoffWorkspaceProvenance.mjs";

describe("Phase 4B.4B.3 takeoff workspace provenance", () => {
  it("no run + simulated selection → simulated labels", () => {
    const mode = resolveTakeoffWorkspaceMode({ providerSelection: "simulated", selectedRun: null });
    assert.equal(mode, "simulated");
    assert.equal(takeoffTopbarChipLabel(mode), "LAB · simulated takeoff");
    const banner = takeoffIsolationBannerCopy(mode);
    assert.equal(simulatedBannerClaimsAreHonest(banner), true);
    assert.match(banner.title, /Simulated/);
    assert.ok(banner.lines.some((l) => /attachment contents not read/i.test(l)));
    assert.ok(banner.lines.some((l) => /no gemini/i.test(l)));
  });

  it("no run + live selection → live labels", () => {
    const mode = resolveTakeoffWorkspaceMode({ providerSelection: "live", selectedRun: null });
    assert.equal(mode, "live");
    assert.equal(takeoffTopbarChipLabel(mode), "LAB · live Gemini takeoff");
    const banner = takeoffIsolationBannerCopy(mode);
    assert.equal(liveBannerClaimsAreHonest(banner), true);
    assert.match(banner.title, /Live Gemini/);
    assert.ok(banner.lines.some((l) => /acknowledgment/i.test(l)));
    assert.ok(banner.lines.some((l) => /Approved synthetic/i.test(l)));
  });

  it("successful live run → live labels", () => {
    const mode = resolveTakeoffWorkspaceMode({
      providerSelection: "simulated",
      selectedRun: { provider: { mode: "live" }, labTakeoffStatus: "qil_takeoff_review" }
    });
    assert.equal(mode, "live");
    assert.equal(takeoffTopbarChipLabel(mode), "LAB · live Gemini takeoff");
  });

  it("failed live run → live labels", () => {
    const mode = resolveTakeoffWorkspaceMode({
      providerSelection: "simulated",
      selectedRun: {
        provider: { mode: "live" },
        labTakeoffStatus: "qil_takeoff_failed",
        failure: { code: "TAKEOFF_FAILURE", message: "x" }
      }
    });
    assert.equal(mode, "live");
    assert.equal(liveBannerClaimsAreHonest(takeoffIsolationBannerCopy(mode)), true);
  });

  it("simulated historical run → simulated labels", () => {
    const mode = resolveTakeoffWorkspaceMode({
      providerSelection: "live",
      selectedRun: { provider: { mode: "simulated" }, scenarioId: "qil-synth-kitchen-island" }
    });
    assert.equal(mode, "simulated");
    assert.equal(takeoffTopbarChipLabel(mode), "LAB · simulated takeoff");
  });

  it("switching between live and simulated history updates labels", () => {
    const live = resolveTakeoffWorkspaceMode({
      providerSelection: "live",
      selectedRun: { provider: { mode: "live" } }
    });
    const sim = resolveTakeoffWorkspaceMode({
      providerSelection: "live",
      selectedRun: { provider: { mode: "simulated" } }
    });
    const liveAgain = resolveTakeoffWorkspaceMode({
      providerSelection: "simulated",
      selectedRun: { provider: { mode: "live" } }
    });
    assert.equal(live, "live");
    assert.equal(sim, "simulated");
    assert.equal(liveAgain, "live");
    assert.notEqual(takeoffTopbarChipLabel(live), takeoffTopbarChipLabel(sim));
  });

  it("live warnings never use simulated run", () => {
    const text = warningRequiredAction({ severity: "informational" }, { takeoffMode: "live" });
    assert.doesNotMatch(text, /simulated run/i);
    assert.match(text, /lab takeoff run/i);
  });

  it("simulated banner retains attachment contents not read", () => {
    const copy = takeoffIsolationBannerCopy("simulated");
    assert.equal(simulatedBannerClaimsAreHonest(copy), true);
    const ws = takeoffWorkspaceBannerCopy("simulated");
    assert.equal(simulatedBannerClaimsAreHonest(ws), true);
  });

  it("live banner never claims bytes were not read or that Gemini was not used", () => {
    const copy = takeoffIsolationBannerCopy("live");
    assert.equal(liveBannerClaimsAreHonest(copy), true);
    const ws = takeoffWorkspaceBannerCopy("live");
    assert.equal(liveBannerClaimsAreHonest(ws), true);
    const blob = `${copy.title} ${copy.lines.join(" ")}`.toLowerCase();
    assert.doesNotMatch(blob, /attachment contents not read/);
    assert.doesNotMatch(blob, /\bno gemini\b/);
    assert.doesNotMatch(blob, /simulated/);
  });
});
