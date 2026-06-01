/**
 * Type declarations for the backend-core takeoff contract modules.
 * These files are plain JS ESM (.mjs) — allowJs:true / checkJs:false handles
 * them at the tsconfig level. This file adds minimal ambient types for the
 * values consumed by the AI Takeoff Lab UI.
 */

declare module "@takeoff-core/takeoffContract.mjs" {
  export const TAKEOFF_SCHEMA_VERSION: string;
  export const TAKEOFF_STATUS: { DRAFT: string; REVIEWED: string; APPROVED: string; REJECTED: string };
  export const TAKEOFF_CONFIDENCE: { HIGH: string; MEDIUM: string; LOW: string };
  export const TAKEOFF_DIAGNOSTIC_LEVEL: { INFO: string; WARNING: string; ERROR: string };
  export const TAKEOFF_DIAGNOSTIC_CODE: Record<string, string>;
  export const TAKEOFF_PIECE_TYPE: Record<string, string>;
  export const TAKEOFF_SHAPE_TYPE: Record<string, string>;

  export interface TakeoffRun {
    id: string;
    label: string;
    lengthIn: number;
    depthIn: number;
    shape?: "rect" | "tri";
    pieceType?: "counter" | "splash" | "fhb";
    exposedEndOverhangIn?: number;
    sourcePages?: number[];
    notes?: string[];
  }

  export interface TakeoffCornerDeduction {
    depthA_in: number;
    depthB_in: number;
    sfDeducted?: number;
  }

  export interface TakeoffExclusion {
    label: string;
    lengthIn?: number;
    depthIn?: number;
    sfExcluded?: number;
  }

  export interface TakeoffArea {
    id: string;
    label: string;
    areaType?: string;
    runs: TakeoffRun[];
    backsplashIncluded?: boolean;
    backsplashHeightIn?: number;
    backsplashLinearIn?: number;
    overlapMode?: string;
    cornerDeductions?: TakeoffCornerDeduction[];
    exclusions?: TakeoffExclusion[];
    notes?: string[];
    assumptions?: string[];
    sourcePages?: number[];
    aiProvidedSf?: number;
  }

  export interface TakeoffDiagnostic {
    level: "info" | "warning" | "error";
    code: string;
    message: string;
    path?: string;
    sourcePages?: number[];
  }

  export interface TakeoffRoom {
    id: string;
    name: string;
    roomType?: string;
    areas: TakeoffArea[];
    notes?: string[];
    assumptions?: string[];
    warnings?: TakeoffDiagnostic[];
    sourcePages?: number[];
    confidence?: string;
  }

  export interface TakeoffResult {
    schemaVersion: string;
    id: string;
    status: string;
    rooms: TakeoffRoom[];
    organizationId?: string;
    source?: { fileName?: string; fileType?: string; pageCount?: number; sourceHash?: string };
    createdAt?: string;
    confidence?: string;
    projectAssumptions?: string[];
    warnings?: TakeoffDiagnostic[];
    aiProvidedTotals?: { countertopExactSf?: number; backsplashExactSf?: number; combinedExactSf?: number };
  }

  export function makeTakeoffResult(overrides?: Partial<TakeoffResult>): TakeoffResult;
  export function makeTakeoffRoom(overrides?: Partial<TakeoffRoom>): TakeoffRoom;
  export function makeTakeoffArea(overrides?: Partial<TakeoffArea>): TakeoffArea;
  export function makeTakeoffRun(overrides?: Partial<TakeoffRun>): TakeoffRun;
}

declare module "@takeoff-core/takeoffMeasurementCalc.mjs" {
  import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";

  export interface TakeoffComputedMeasurements {
    countertopExactSf: number;
    backsplashExactSf: number;
    fhbExactSf: number;
    combinedExactSf: number;
    chargeableCountertopSf: number;
    chargeableBacksplashSf: number;
    roomBreakdown: Array<{
      roomId: string;
      roomName: string;
      countertopSf: number;
      backsplashSf: number;
      fhbSf: number;
      totalSf: number;
      areaBreakdown: Array<{
        areaId: string;
        label: string;
        countertopSf: number;
        backsplashSf: number;
        fhbSf: number;
        totalSf: number;
      }>;
    }>;
  }

  export function computeTakeoffMeasurements(result: TakeoffResult): TakeoffComputedMeasurements;
  export function sfFromRun(lengthIn: number, depthIn: number, shape?: string): number;
  export function chargeableSfFromExact(exactSf: number): number;
  export function cornerOverlapSf(depthA_in: number, depthB_in: number): number;
}

declare module "@takeoff-core/takeoffValidator.mjs" {
  import type { TakeoffResult, TakeoffDiagnostic } from "@takeoff-core/takeoffContract.mjs";
  import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";

  export interface TakeoffValidationResult {
    valid: boolean;
    hasErrors: boolean;
    hasWarnings: boolean;
    diagnostics: TakeoffDiagnostic[];
    errorCount: number;
    warningCount: number;
    infoCount: number;
  }

  export function validateTakeoffResult(
    result: TakeoffResult,
    computed: TakeoffComputedMeasurements
  ): TakeoffValidationResult;
}

declare module "@takeoff-core/takeoffImportPlanner.mjs" {
  import type { TakeoffResult, TakeoffDiagnostic } from "@takeoff-core/takeoffContract.mjs";
  import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";

  export interface ImportPlanPiece {
    label: string;
    pieceType: "counter" | "splash" | "fhb";
    lengthIn: number;
    depthIn: number;
    shape: "rect" | "tri";
    notes?: string[];
  }

  export interface ImportPlanGroup {
    label: string;
    shapeType: string;
    overlapMode: string;
    backsplashMode: "include" | "exclude";
    pieces: ImportPlanPiece[];
    notes?: string[];
    assumptions?: string[];
    sourcePages?: number[];
  }

  export interface ImportPlanRoom {
    roomId: string;
    name: string;
    roomType?: string;
    calcMode: string;
    guidedShapeGroups: ImportPlanGroup[];
    notes?: string[];
    assumptions?: string[];
    sourcePages?: number[];
    warnings: TakeoffDiagnostic[];
  }

  export interface TakeoffImportPlan {
    canImport: boolean;
    blockedReason?: string;
    rooms: ImportPlanRoom[];
    warnings: TakeoffDiagnostic[];
    computedSf: { countertopExactSf: number; backsplashExactSf: number; combinedExactSf: number };
  }

  export function planTakeoffImport(
    result: TakeoffResult,
    computed: TakeoffComputedMeasurements
  ): TakeoffImportPlan;
}

declare module "@takeoff-core/fixtures/spec73.fixture.mjs" {
  import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";

  export function buildSpec73Fixture(): TakeoffResult;
  export const SPEC73_EXPECTED: {
    countertopExactSf: number;
    backsplashExactSf: number;
    combinedExactSf: number;
    chargeableCountertopSf: number;
    chargeableBacksplashSf: number;
  };
}
