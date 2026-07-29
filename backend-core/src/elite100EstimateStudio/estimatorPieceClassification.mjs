/**
 * Countertop vs backsplash piece classification for estimator display totals.
 * Display-only — does not change calculator formulas.
 */

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Splash-only geometry must never count toward countertopSf.
 * Canonical Takeoff pieceTypes: "splash", "fhb".
 */
export function isBacksplashPiece(piece) {
  const p = piece && typeof piece === "object" ? piece : {};
  if (p.isBacksplash === true) return true;
  const type = str(p.pieceType || p.type).toLowerCase();
  if (type === "splash" || type === "fhb" || type === "backsplash") return true;
  if (/backsplash|full[\s_-]?height/i.test(type)) return true;
  const name = str(p.name || p.label);
  if (/backsplash|\bfhb\b|full[\s_-]?height\s+backsplash/i.test(name)) return true;
  return false;
}

export function isCountertopPiece(piece) {
  const p = piece && typeof piece === "object" ? piece : {};
  if (p.included === false) return false;
  return !isBacksplashPiece(p);
}
