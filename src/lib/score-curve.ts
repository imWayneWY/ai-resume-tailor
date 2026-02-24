/**
 * Curve raw keyword-match scores into a more intuitive 0-100 range.
 *
 * Raw scores represent the % of JD keywords found in the resume. A raw 50%
 * is actually very good, but users interpret it as "barely passing" because
 * they apply school-grading logic. This curve maps realistic outcomes into
 * ranges that feel right:
 *
 *   Raw  →  Display
 *    0   →    0
 *   15   →   39
 *   30   →   55
 *   50   →   71
 *   70   →   84
 *   85   →   92
 *  100   →  100
 *
 * Uses a square-root curve: display = round(sqrt(raw / 100) * 100)
 */
export function curveScore(raw: number): number {
  const clamped = Math.max(0, Math.min(100, raw));
  return Math.round(Math.sqrt(clamped / 100) * 100);
}

export type ScoreLabel = "Weak" | "Fair" | "Good" | "Strong" | "Excellent";

/** Human-readable label for a curved (display) score. */
export function scoreLabel(displayScore: number): ScoreLabel {
  if (displayScore >= 85) return "Excellent";
  if (displayScore >= 70) return "Strong";
  if (displayScore >= 50) return "Good";
  if (displayScore >= 30) return "Fair";
  return "Weak";
}
