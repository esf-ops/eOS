/**
 * Homeowner-friendly guided layout presets (feet + inches).
 * Converts to countertop/backsplash square feet consistent with measurementEngine (inches for rectangles).
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
  /** Straight run — main counter length (ft) */
  mainRunFt: string;
  longWallFt: string;
  shortWallFt: string;
  backWallFt: string;
  leftWallFt: string;
  rightWallFt: string;
  side1Ft: string;
  side2Ft: string;
  islandLengthFt: string;
  islandWidthFt: string;
  splashHeightIn: string;
  counterDepthIn: string;
};

export function defaultGuidedSimpleForm(): GuidedSimpleForm {
  return {
    mainRunFt: "12",
    longWallFt: "12",
    shortWallFt: "8",
    backWallFt: "10",
    leftWallFt: "8",
    rightWallFt: "8",
    side1Ft: "10",
    side2Ft: "10",
    islandLengthFt: "6",
    islandWidthFt: "3.5",
    splashHeightIn: String(STANDARD_BACKSPLASH_HEIGHT_IN),
    counterDepthIn: String(STANDARD_COUNTER_DEPTH_IN)
  };
}

function n(v: string): number {
  const x = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

/** Rectangle counter segment: length in feet, depth in inches → sf */
function counterSegSqftFromFeet(lengthFt: number, depthIn: number): number {
  if (lengthFt <= 0 || depthIn <= 0) return 0;
  const lengthIn = lengthFt * 12;
  return round2((lengthIn * depthIn) / 144);
}

/** Splash along same length (ft), height in inches */
function splashSegSqftFromFeet(runFt: number, splashHeightIn: number): number {
  if (runFt <= 0 || splashHeightIn <= 0) return 0;
  const runIn = runFt * 12;
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
    const ft = n(form.mainRunFt);
    counter = counterSegSqftFromFeet(ft, d);
    splash = splashSegSqftFromFeet(ft, sh);
    if (ft > 0) lines.push(`Countertop: ${ft} ft run × ${d} in deep`);
    if (ft > 0 && sh > 0) lines.push(`Backsplash: ${ft} ft run × ${sh} in tall`);
  } else if (preset === "l_shape") {
    const a = n(form.longWallFt);
    const b = n(form.shortWallFt);
    counter = counterSegSqftFromFeet(a, d) + counterSegSqftFromFeet(b, d);
    splash = splashSegSqftFromFeet(a + b, sh);
    if (a || b) lines.push(`Countertop: long leg ${a} ft + short leg ${b} ft × ${d} in deep`);
    if ((a || b) && sh > 0) lines.push(`Backsplash: (${a} + ${b}) ft along walls × ${sh} in tall`);
  } else if (preset === "u_shape") {
    const back = n(form.backWallFt);
    const left = n(form.leftWallFt);
    const right = n(form.rightWallFt);
    counter = counterSegSqftFromFeet(back, d) + counterSegSqftFromFeet(left, d) + counterSegSqftFromFeet(right, d);
    splash = splashSegSqftFromFeet(back + left + right, sh);
    if (back || left || right) {
      lines.push(`Countertop: back ${back} ft + sides ${left} ft & ${right} ft × ${d} in deep`);
    }
    if ((back || left || right) && sh > 0) lines.push(`Backsplash: wall runs × ${sh} in tall`);
  } else if (preset === "galley") {
    const s1 = n(form.side1Ft);
    const s2 = n(form.side2Ft);
    counter = counterSegSqftFromFeet(s1, d) + counterSegSqftFromFeet(s2, d);
    splash = splashSegSqftFromFeet(s1 + s2, sh);
    if (s1 || s2) lines.push(`Countertop: both sides ${s1} ft + ${s2} ft × ${d} in deep`);
    if ((s1 || s2) && sh > 0) lines.push(`Backsplash: both runs × ${sh} in tall`);
  } else if (preset === "island") {
    const L = n(form.islandLengthFt);
    const W = n(form.islandWidthFt);
    if (L > 0 && W > 0) {
      counter = round2(L * W);
      lines.push(`Island countertop: ${L} ft × ${W} ft (${counter.toFixed(2)} sq ft)`);
    }
  }

  return { counter: round2(counter), splash: round2(splash), fhb: 0, lines };
}

export const CONFIDENCE_COPY = "Good starting estimate — final quote confirmed after review/template.";
