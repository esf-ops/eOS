import type { PieceGeometry } from "../components/MeasureView";

export type JobSize = { lengthIn: number; widthIn: number };

/** Same rule as Brain `pieceFitsJob`: photo-derived usable rectangles, else the L×W bounding box. */
export function pieceFitsJob(
  piece: { geometry?: PieceGeometry | null; length_actual_in: number | null; width_actual_in: number | null },
  job: JobSize
) {
  const js = Math.min(job.lengthIn, job.widthIn);
  const jl = Math.max(job.lengthIn, job.widthIn);
  const frontier = piece.geometry?.fit_frontier_in;
  if (Array.isArray(frontier) && frontier.length) {
    return frontier.some(([s, l]) => js <= s + 1e-6 && jl <= l + 1e-6);
  }
  const L = Number(piece.length_actual_in);
  const W = Number(piece.width_actual_in);
  if (!(L > 0) || !(W > 0)) return false;
  return js <= Math.min(L, W) && jl <= Math.max(L, W);
}

/** Parse the two job inputs; one value means a square piece. Null when nothing usable was entered. */
export function parseJobSize(lengthRaw: string, widthRaw: string): JobSize | null {
  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 400 ? n : null;
  };
  const L = num(lengthRaw);
  const W = num(widthRaw);
  if (L == null && W == null) return null;
  return { lengthIn: L ?? (W as number), widthIn: W ?? (L as number) };
}
