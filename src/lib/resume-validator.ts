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
    const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
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
  const nonSkillsText = tailoredSections
    .filter((s) => !(s?.title && /skills/i.test(s.title)))
    .map((s) => s?.content ?? "")
    .join("\n");
  for (const rawKeyword of jdKeywords) {
    const keyword = rawKeyword.trim();
    if (!keyword) continue;
    const flexPattern = keyword
      .split(/[\s/\-]+/)
      .filter((part) => part.length > 0)
      .map((part) => escapeRegExp(part))
      .join("[\\s/\\-]+");
    if (flexPattern.length === 0) continue;
    const pattern = new RegExp(`\\b${flexPattern}\\b`, "gi");
    const matches = nonSkillsText.match(pattern);
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
  // A capitalized word is a candidate proper noun unless it sits right at
  // the start of a sentence/line/bullet (where the prompt now requires a
  // verb like "Built", "Shipped", "Fixed") or it already appears somewhere
  // (case-insensitively) in the original resume.
  const PROPER_NOUN_RE = /\b[A-Z][a-zA-Z0-9+.#-]{2,}\b/g;
  // Matches a sentence/line/bullet boundary immediately preceding a position.
  const SENTENCE_START_BOUNDARY_RE = /(^|\n|\. |• |- |: )$/;
  const lowerOriginal = originalText.toLowerCase();
  const newProperNouns: string[] = [];
  const seen = new Set<string>();
  let nounMatch: RegExpExecArray | null;
  while ((nounMatch = PROPER_NOUN_RE.exec(tailoredText)) !== null) {
    const word = nounMatch[0];
    const precedingText = tailoredText.slice(0, nounMatch.index);
    const atSentenceStart = SENTENCE_START_BOUNDARY_RE.test(precedingText) || nounMatch.index === 0;
    if (atSentenceStart) continue;
    // Skip category labels on Skills lines, e.g. "Backend & Cloud: AWS, Docker"
    // — if the word sits immediately before a colon (ignoring trailing
    // whitespace), and everything from the start of the line up to and
    // including that colon looks like a short label (letters/spaces/&//),
    // treat it as a category heading, not a fabricated fact.
    const lineStart = precedingText.lastIndexOf("\n") + 1;
    const afterWord = tailoredText.slice(nounMatch.index + word.length);
    const immediatelyBeforeColon = /^\s*:/.test(afterWord);
    const labelSegment = tailoredText.slice(lineStart, nounMatch.index + word.length);
    const isLabelBeforeColon =
      immediatelyBeforeColon && /^[A-Za-z &/]+$/.test(labelSegment.trim());
    if (isLabelBeforeColon) continue;
    const lowerWord = word.toLowerCase();
    if (lowerOriginal.includes(lowerWord)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    newProperNouns.push(word);
  }

  return {
    bannedPhraseHits,
    tackedOnClauseHits,
    overusedKeywords,
    newNumbers,
    newProperNouns,
  };
}
