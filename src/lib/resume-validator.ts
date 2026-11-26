/**
 * Deterministic post-generation checks for the fact-grounded tailoring flow.
 * These never block a response — they're surfaced to the UI so the user can
 * see whether the model stayed within the guardrails defined in the system
 * prompt (banned phrases, tacked-on clauses, keyword stuffing, fabricated
 * facts/numbers/proper nouns).
 */

const BANNED_PHRASES = [
  "passionate",
  "accomplished",
  "results-driven",
  "self-directed",
  "self-starter",
  "dynamic",
  "seasoned",
  "spearheaded",
  "leveraged",
  "utilized",
  "cutting-edge",
  "robust",
  "seamless",
  "synergy",
  "best practices",
  "ensuring compliance",
  "team player",
  "strong communication skills",
  "fast-paced environment",
];

const TACKED_ON_CLAUSE_RE = /,\s*(enhancing|ensuring|driving|improving)\s+[^.]*/gi;

const CONTEXT_RADIUS = 40;

function getContext(text: string, index: number, length: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + CONTEXT_RADIUS);
  return text.slice(start, end).trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface BannedPhraseHit {
  phrase: string;
  context: string;
}

export interface TackedOnClauseHit {
  clause: string;
  context: string;
}

export interface OverusedKeyword {
  term: string;
  count: number;
}

export interface ResumeValidationResult {
  bannedPhraseHits: BannedPhraseHit[];
  tackedOnClauseHits: TackedOnClauseHit[];
  overusedKeywords: OverusedKeyword[];
  newNumbers: string[];
  newProperNouns: string[];
}

export function validateTailoredResume(
  originalText: string,
  tailoredSections: { title: string; content: string }[],
  jdKeywords: string[]
): ResumeValidationResult {
  const tailoredText = tailoredSections.map((s) => s?.content ?? "").join("\n");

  // --- Banned phrases ---
  const bannedPhraseHits: BannedPhraseHit[] = [];
  for (const phrase of BANNED_PHRASES) {
    const pattern = new RegExp(escapeRegExp(phrase), "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(tailoredText)) !== null) {
      bannedPhraseHits.push({
        phrase,
        context: getContext(tailoredText, match.index, match[0].length),
      });
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }

  // --- Tacked-on clauses ---
  const tackedOnClauseHits: TackedOnClauseHit[] = [];
  const tackedPattern = new RegExp(TACKED_ON_CLAUSE_RE.source, TACKED_ON_CLAUSE_RE.flags);
  let tackedMatch: RegExpExecArray | null;
  while ((tackedMatch = tackedPattern.exec(tailoredText)) !== null) {
    tackedOnClauseHits.push({
      clause: tackedMatch[0].trim(),
      context: getContext(tailoredText, tackedMatch.index, tackedMatch[0].length),
    });
    if (tackedMatch[0].length === 0) tackedPattern.lastIndex++;
  }

  // --- Overused keywords ---
  const overusedKeywords: OverusedKeyword[] = [];
  for (const rawKeyword of jdKeywords) {
    const keyword = rawKeyword.trim();
    if (!keyword) continue;
    const flexPattern = keyword
      .split(/[\s/\-]+/)
      .filter((part) => part.length > 0)
      .map((part) => escapeRegExp(part))
      .join("[\\s/\\-]+");
    if (flexPattern.length === 0) continue;
    const pattern = new RegExp(flexPattern, "gi");
    const matches = tailoredText.match(pattern);
    const count = matches ? matches.length : 0;
    if (count > 2) {
      overusedKeywords.push({ term: keyword, count });
    }
  }

  // --- New numbers (present in tailored, absent from original) ---
  const NUMBER_RE = /\b\d+(\.\d+)?%?/g;
  const originalNumbers = new Set((originalText.match(NUMBER_RE) || []).map((n) => n));
  const tailoredNumbers = new Set((tailoredText.match(NUMBER_RE) || []).map((n) => n));
  const newNumbers: string[] = [];
  for (const n of Array.from(tailoredNumbers)) {
    if (!originalNumbers.has(n)) newNumbers.push(n);
  }

  // --- New proper nouns (present in tailored, absent from original) ---
  const PROPER_NOUN_RE = /\b[A-Z][a-zA-Z0-9+.#-]{2,}\b/g;
  const originalProperNouns = new Set(originalText.match(PROPER_NOUN_RE) || []);
  const tailoredProperNouns = new Set(tailoredText.match(PROPER_NOUN_RE) || []);
  const newProperNouns: string[] = [];
  for (const noun of Array.from(tailoredProperNouns)) {
    if (!originalProperNouns.has(noun)) newProperNouns.push(noun);
  }

  return {
    bannedPhraseHits,
    tackedOnClauseHits,
    overusedKeywords,
    newNumbers,
    newProperNouns,
  };
}
