/**
 * Homeowner-friendly guided layout presets (run lengths in inches).
 * Converts to countertop/backsplash square feet consistent with measurementEngine.
 */

import { round2, STANDARD_BACKSPLASH_HEIGHT_IN, STANDARD_COUNTER_DEPTH_IN } from "./measurementEngine";

export type GuidedLayoutPreset =
  | "straight"
  | "l_shape"
  | "u_shape"
  | "galley"
  | "island"
  | "not_sure";

export type GuidedSimpleForm = {
  /** Straight run — main counter length (in) */
  mainRunIn: string;
  longWallIn: string;
  shortWallIn: string;
  backWallIn: string;
  leftWallIn: string;
  rightWallIn: string;
  side1In: string;
  side2In: string;
  islandLengthIn: string;
  islandWidthIn: string;
  splashHeightIn: string;
  counterDepthIn: string;
};

export function defaultGuidedSimpleForm(): GuidedSimpleForm {
  return {
    mainRunIn: "144",
    longWallIn: "144",
    shortWallIn: "96",
    backWallIn: "120",
    leftWallIn: "96",
    rightWallIn: "96",
    side1In: "120",
    side2In: "120",
    islandLengthIn: "72",
    islandWidthIn: "42",
    splashHeightIn: String(STANDARD_BACKSPLASH_HEIGHT_IN),
    counterDepthIn: String(STANDARD_COUNTER_DEPTH_IN)
  };
}

function n(v: string): number {
  const x = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

/** Rectangle counter segment: length and depth in inches → sq ft */
function counterSegSqftFromInches(lengthIn: number, depthIn: number): number {
  if (lengthIn <= 0 || depthIn <= 0) return 0;
  return round2((lengthIn * depthIn) / 144);
}

/** Backsplash along a run (inches of wall × inches tall) → sq ft */
function splashSegSqftFromInches(runIn: number, splashHeightIn: number): number {
  if (runIn <= 0 || splashHeightIn <= 0) return 0;
  return round2((runIn * splashHeightIn) / 144);
}

export function computeGuidedSimpleAreas(
  preset: GuidedLayoutPreset | null,
  form: GuidedSimpleForm
): { counter: number; splash: number; fhb: number; lines: string[] } {
  const d = n(form.counterDepthIn) || STANDARD_COUNTER_DEPTH_IN;
  const sh = n(form.splashHeightIn) || STANDARD_BACKSPLASH_HEIGHT_IN;
  const lines: string[] = [];
  let counter = 0;
  let splash = 0;

  if (!preset || preset === "not_sure") {
    return { counter: 0, splash: 0, fhb: 0, lines };
  }

  if (preset === "straight") {
    const run = n(form.mainRunIn);
    counter = counterSegSqftFromInches(run, d);
    splash = splashSegSqftFromInches(run, sh);
    if (run > 0) lines.push(`Main countertop run: about ${fmtIn(run)} long.`);
    if (run > 0 && sh > 0) lines.push(`Backsplash along that run at about ${fmtIn(sh)} tall.`);
  } else if (preset === "l_shape") {
    const a = n(form.longWallIn);
    const b = n(form.shortWallIn);
    counter = counterSegSqftFromInches(a, d) + counterSegSqftFromInches(b, d);
    splash = splashSegSqftFromInches(a + b, sh);
    if (a || b) lines.push(`Long run about ${fmtIn(a)}, shorter run about ${fmtIn(b)}.`);
    if ((a || b) && sh > 0) lines.push(`Backsplash follows both walls.`);
  } else if (preset === "u_shape") {
    const back = n(form.backWallIn);
    const left = n(form.leftWallIn);
    const right = n(form.rightWallIn);
    counter =
      counterSegSqftFromInches(back, d) + counterSegSqftFromInches(left, d) + counterSegSqftFromInches(right, d);
    splash = splashSegSqftFromInches(back + left + right, sh);
    if (back || left || right) {
      lines.push(`Back wall about ${fmtIn(back)}, sides about ${fmtIn(left)} and ${fmtIn(right)}.`);
    }
    if ((back || left || right) && sh > 0) lines.push(`Backsplash along the U-shaped runs.`);
  } else if (preset === "galley") {
    const s1 = n(form.side1In);
    const s2 = n(form.side2In);
    counter = counterSegSqftFromInches(s1, d) + counterSegSqftFromInches(s2, d);
    splash = splashSegSqftFromInches(s1 + s2, sh);
    if (s1 || s2) lines.push(`Two facing runs: about ${fmtIn(s1)} and ${fmtIn(s2)}.`);
    if ((s1 || s2) && sh > 0) lines.push(`Backsplash on both sides.`);
  } else if (preset === "island") {
    const L = n(form.islandLengthIn);
    const W = n(form.islandWidthIn);
    if (L > 0 && W > 0) {
      counter = counterSegSqftFromInches(L, W);
      lines.push(`Island surface about ${fmtIn(L)} by ${fmtIn(W)}.`);
    }
  }

  return { counter: round2(counter), splash: round2(splash), fhb: 0, lines };
}

function fmtIn(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  return `${v} in`;
}

export const CONFIDENCE_COPY =
  "This is a planning estimate. Final measurements are confirmed after review and template.";
