/**
 * Pure diffing utilities that power the unified track-changes Resume block.
 *
 * Diffs are computed directly from the ORIGINAL resume text vs. the
 * TAILORED section content — never from the model's self-reported
 * `changes` array, which is known to be incomplete (the model only lists
 * changes it noticed, not every actual diff).
 */

// --- Reused heuristics (adapted from resume-validator.ts) ---

const PROPER_NOUN_RE = /\b[A-Z][a-zA-Z0-9+.#-]{2,}\b/g;
const NUMBER_RE = /\b\d+(\.\d+)?%?/g;
const SENTENCE_SPLIT_RE = /[.!?]+(\s+|$)/;

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

// Subjective adjectives/adverbs and intent/values clauses that the system
// prompt explicitly allows the model to delete. Removed text made up
// entirely of these (plus stopwords/punctuation) should NOT get a warning.
const SUBJECTIVE_FILLER_WORDS = new Set([
  "passionate",
  "significantly",
  "high-impact",
  "seamless",
  "premium",
  "complex",
  "robust",
  "dynamic",
  "accomplished",
  "seasoned",
  "cutting-edge",
  "world-class",
  "results-driven",
  "self-directed",
  "self-starter",
  "committed",
  "dedicated",
  "about",
  "building",
  "great",
  "products",
  "supporting",
  "commitment",
  "inclusive",
  "design",
]);
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "with",
  "s",
]);

// Intent/values clauses the system prompt explicitly allows deleting (e.g.
// "supporting X's commitment to...", "in a fast-paced environment") even
// when they happen to reference a company/proper noun — the clause itself
// states intent/values, not a verifiable fact about scope of work.
const INTENT_VALUES_CLAUSE_RE =
  /\b(supporting|reflecting|aligned with|in line with)\b.{0,40}\b(commitment|values|culture|mission|vision)\b|\bin an? (fast-paced|dynamic|collaborative) environment\b/i;

function isIntentValuesClause(removedText: string): boolean {
  return INTENT_VALUES_CLAUSE_RE.test(removedText);
}

// --- Stopwords & word-overlap alignment ---

function normalizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:[.#+][a-z0-9]+)*/g) || []).filter((w) => w.length > 0);
}

/** Word-overlap similarity (shared-word ratio over the union of word sets). */
export function similarity(a: string, b: string): number {
  const wordsA = new Set(normalizeWords(a));
  const wordsB = new Set(normalizeWords(b));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  wordsA.forEach((w) => {
    if (wordsB.has(w)) shared++;
  });
  const union = new Set(Array.from(wordsA).concat(Array.from(wordsB))).size;
  return shared / union;
}

// --- Splitting section content into bullets/sentences ---

export interface ContentUnit {
  /** The raw text of this unit, including any leading bullet marker. */
  raw: string;
  /** Text with a leading bullet marker (•/-/*) stripped, if present. */
  text: string;
  /** Whether this unit is a bullet line (vs. a prose sentence). */
  isBullet: boolean;
}

const BULLET_LINE_RE = /^[•\-*]\s+/;

/**
 * Splits section content into comparable units: lines starting with a
 * bullet marker become bullets; everything else is treated as prose and
 * split sentence-by-sentence.
 */
export function splitIntoUnits(content: string): ContentUnit[] {
  if (!content) return [];
  const units: ContentUnit[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (BULLET_LINE_RE.test(trimmed)) {
      units.push({ raw: trimmed, text: trimmed.replace(BULLET_LINE_RE, ""), isBullet: true });
      continue;
    }
    // Prose line (e.g. an entry header, or a Summary paragraph): split into
    // sentences so long paragraphs are diffed at sentence granularity.
    const sentences = trimmed
      .split(SENTENCE_SPLIT_RE)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^[.!?]+$/.test(s));
    if (sentences.length === 0) continue;
    for (const sentence of sentences) {
      units.push({ raw: sentence, text: sentence, isBullet: false });
    }
  }
  return units;
}

// --- Word-level diff (Myers-ish via LCS on word tokens) ---

export type WordDiffOp =
  | { type: "equal"; value: string }
  | { type: "remove"; value: string }
  | { type: "add"; value: string };

/** Tokenizes into words + the whitespace/punctuation between them, preserving round-trip text. */
function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) || [];
}

/**
 * Word-level diff using a simple LCS (longest common subsequence) dynamic
 * program over tokens. O(n*m) — fine for sentence/bullet-length strings.
 */
export function wordDiff(original: string, revised: string): WordDiffOp[] {
  const a = tokenize(original);
  const b = tokenize(revised);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: WordDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", value: a[i] });
      i++;
    } else {
      ops.push({ type: "add", value: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "remove", value: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", value: b[j] });
    j++;
  }

  // Merge adjacent same-type ops for cleaner rendering.
  const merged: WordDiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.value += op.value;
    } else {
      merged.push({ ...op });
    }
  }
  return merged;
}

// --- Alignment: match each tailored unit to its closest original unit ---

export interface AlignedPair {
  tailoredIndex: number;
  /** Index into the original units array, or -1 if no good match was found. */
  originalIndex: number;
  originalText: string;
  tailoredText: string;
  similarity: number;
}

const MIN_ALIGNMENT_SIMILARITY = 0.15;

/**
 * Aligns each tailored unit to the most similar original unit (by word
 * overlap). Multiple tailored units may align to the same original unit
 * (e.g. when the model splits one bullet into two) — this is intentional:
 * reverting either tailored unit restores it to that shared original text.
 */
export function alignUnits(originalUnits: ContentUnit[], tailoredUnits: ContentUnit[]): AlignedPair[] {
  return tailoredUnits.map((tailored, tailoredIndex) => {
    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < originalUnits.length; i++) {
      const score = similarity(originalUnits[i].text, tailored.text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const matched = bestIndex !== -1 && bestScore >= MIN_ALIGNMENT_SIMILARITY;
    return {
      tailoredIndex,
      originalIndex: matched ? bestIndex : -1,
      originalText: matched ? originalUnits[bestIndex].text : "",
      tailoredText: tailored.text,
      similarity: matched ? bestScore : 0,
    };
  });
}

// --- Warning heuristic: should a ⚠ show on this diff? ---

function wordsOf(text: string): string[] {
  return normalizeWords(text);
}

/** True if every (non-stopword) removed word is subjective filler/intent language. */
function isFillerOnlyRemoval(removedWords: string[]): boolean {
  const substantive = removedWords.filter((w) => !STOPWORDS.has(w));
  if (substantive.length === 0) return true;
  return substantive.every((w) => SUBJECTIVE_FILLER_WORDS.has(w) || BANNED_PHRASES.includes(w));
}

/**
 * Decides whether the removed portion of a diff likely contains real,
 * factual content worth flagging:
 *  - a technical term / proper noun among the removed words
 *  - a number among the removed words
 *  - removal that amounts to (most of) a full original sentence/bullet
 * ...unless every removed word is pure filler per the deletion allowlist.
 */
export function shouldWarnOnRemoval(originalText: string, removedText: string): boolean {
  const removedTrimmed = removedText.trim();
  if (!removedTrimmed) return false;

  const removedWords = wordsOf(removedTrimmed);
  if (removedWords.length === 0) return false;

  if (isIntentValuesClause(removedTrimmed)) return false;
  if (isFillerOnlyRemoval(removedWords)) return false;

  const hasProperNoun = PROPER_NOUN_RE.test(removedTrimmed.replace(/^[A-Z][a-zA-Z0-9+.#-]*\s*/, (m) => {
    // Don't let a capitalized FIRST word of the removed text (likely just
    // sentence-initial capitalization, not a proper noun) trigger a warning
    // on its own — lowercase it before testing so only genuinely
    // mid-text capitalized words count.
    return m.length > 0 ? m.charAt(0).toLowerCase() + m.slice(1) : m;
  }));
  PROPER_NOUN_RE.lastIndex = 0;
  if (hasProperNoun) return true;

  const hasNumber = NUMBER_RE.test(removedTrimmed);
  NUMBER_RE.lastIndex = 0;
  if (hasNumber) return true;

  // Full-sentence-removal heuristic: did most of the original's significant
  // words (length > 3) disappear from the revised text altogether?
  const originalWords = wordsOf(originalText).filter((w) => w.length > 3);
  if (originalWords.length >= 4) {
    const removedSignificant = removedWords.filter((w) => w.length > 3);
    const ratio = removedSignificant.length / originalWords.length;
    if (ratio >= 0.5) return true;
  }

  // Otherwise: a substantive (non-filler) multi-word removal of ordinary
  // nouns is still worth a warning — e.g. "developer productivity and code
  // maintainability" contains no proper noun/number but is clearly factual
  // content, not adjective trimming. Use word count as the signal: a single
  // adjective or short qualifier (1-2 words) is typically trimming; 3+
  // substantive words removed together is more likely a factual clause.
  const substantiveRemoved = removedWords.filter(
    (w) => !STOPWORDS.has(w) && !SUBJECTIVE_FILLER_WORDS.has(w) && !BANNED_PHRASES.includes(w)
  );
  if (substantiveRemoved.length >= 3) return true;

  return false;
}

// --- Public: full diff result for one aligned unit pair ---

export interface UnitDiff {
  tailoredIndex: number;
  originalIndex: number;
  originalText: string;
  tailoredText: string;
  ops: WordDiffOp[];
  changed: boolean;
  warn: boolean;
}

export function diffAlignedPair(pair: AlignedPair): UnitDiff {
  const ops = pair.originalIndex === -1 ? [{ type: "add" as const, value: pair.tailoredText }] : wordDiff(pair.originalText, pair.tailoredText);
  const changed = ops.some((op) => op.type !== "equal");
  const removedText = ops
    .filter((op) => op.type === "remove")
    .map((op) => op.value)
    .join("");
  const warn = changed && pair.originalIndex !== -1 && shouldWarnOnRemoval(pair.originalText, removedText);
  return {
    tailoredIndex: pair.tailoredIndex,
    originalIndex: pair.originalIndex,
    originalText: pair.originalText,
    tailoredText: pair.tailoredText,
    ops,
    changed,
    warn,
  };
}

// --- Original section text extraction (best-effort, by heading match) ---

const SECTION_HEADING_ALIASES: Record<string, string[]> = {
  summary: ["summary", "profile", "objective"],
  experience: ["experience", "work experience", "work history", "employment"],
  education: ["education"],
  skills: ["skills", "technical skills", "technologies", "tech stack", "core competencies"],
  projects: ["projects"],
  certifications: ["certifications", "certificates"],
  awards: ["awards"],
  publications: ["publications"],
  volunteer: ["volunteer", "volunteering"],
  languages: ["languages"],
  interests: ["interests"],
  references: ["references"],
};

const ALL_HEADING_TERMS = Array.from(
  new Set(Object.values(SECTION_HEADING_ALIASES).flat())
);

function isHeadingLine(trimmed: string): string | null {
  const withoutColon = trimmed.replace(/:\s*$/, "").trim();
  if (withoutColon.length === 0 || withoutColon.length > 40) return null;
  const lower = withoutColon.toLowerCase();
  return ALL_HEADING_TERMS.includes(lower) ? lower : null;
}

function aliasesFor(sectionTitle: string): string[] {
  const lower = sectionTitle.trim().toLowerCase();
  for (const [, aliases] of Object.entries(SECTION_HEADING_ALIASES)) {
    if (aliases.includes(lower)) return aliases;
  }
  // Fall back: try to find aliases whose canonical key is contained in the
  // tailored section title (e.g. "Professional Experience" -> "experience").
  for (const [, aliases] of Object.entries(SECTION_HEADING_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) return aliases;
  }
  return [lower];
}

/**
 * Best-effort extraction of the original resume text comparable to a given
 * tailored section, by matching section headings in the raw original text.
 * The original resume is raw, unstructured text — it isn't pre-split into
 * the same section titles the tailored output uses — so this is a heading
 * heuristic, not a guaranteed match. If no heading match is found, the
 * caller should fall back to treating the whole original resume as the
 * comparison pool (see ResumeTrackChanges) so alignment can still happen,
 * just with weaker precision.
 */
export function extractOriginalSectionText(originalText: string, sectionTitle: string): string {
  const aliases = aliasesFor(sectionTitle);
  const lines = originalText.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const heading = isHeadingLine(lines[i].trim());
    if (heading && aliases.includes(heading)) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return "";

  const bodyLines: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0 && isHeadingLine(trimmed) && !aliases.includes(isHeadingLine(trimmed)!)) {
      break;
    }
    bodyLines.push(lines[i]);
  }
  return bodyLines.join("\n");
}
