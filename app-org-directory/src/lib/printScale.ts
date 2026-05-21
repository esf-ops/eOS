/** Screen-only print sizing presets (applied via CSS variables on the print sheet). */
export type PrintScalePreset = "safe" | "95" | "90" | "85";

export const PRINT_SCALE_PRESETS: { id: PrintScalePreset; label: string }[] = [
  { id: "safe", label: "Fit safe (recommended)" },
  { id: "95", label: "95%" },
  { id: "90", label: "90%" },
  { id: "85", label: "85%" }
];

const SCALE_MULTIPLIERS: Record<PrintScalePreset, number> = {
  safe: 1,
  "95": 0.95,
  "90": 0.9,
  "85": 0.85
};

/** CSS custom properties for font, gap, and padding scaling on the print sheet. */
export function printScaleCssVars(preset: PrintScalePreset): Record<string, string> {
  const scale = SCALE_MULTIPLIERS[preset];
  return {
    "--org-print-font-scale": String(scale),
    "--org-print-gap-scale": String(scale),
    "--org-print-pad-scale": String(scale)
  };
}

export const PRINT_SHEET_WIDTH = "10.05in";
export const PRINT_SHEET_HEIGHT = "7.15in";
