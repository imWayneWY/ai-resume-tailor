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
// Matches one sentence's content up to and including its terminal
// punctuation, where the punctuation must be followed by whitespace or
// end-of-string (so "Node.js" / "C#" / version numbers don't get split
// mid-token) — or a trailing fragment with no terminal punctuation at all.
const SENTENCE_UNIT_RE = /(?:[^.!?]|[.!?](?!\s|$))+[.!?]*(?=\s|$)/g;

// Matches a sentence/line/bullet boundary immediately preceding a position —
// mirrors the heuristic used in resume-validator.ts's newProperNouns logic.
const SENTENCE_START_BOUNDARY_RE = /(^|\n|\. |! |\? |• |- |: )$/;

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

// Subjective adjectives/adverbs that the system prompt explicitly allows the
// model to delete. Removed text made up entirely of these (plus
// stopwords/punctuation) should NOT get a warning. NOTE: this list must only
// contain genuinely subjective/fluff words — ordinary content words (e.g.
// "design", "building", "products") do NOT belong here, or real factual
// removals (e.g. "component design") would be silently waved through.
// The "supporting X's commitment to..." style intent/values clause is
// handled separately via INTENT_VALUES_CLAUSE_RE, not via individual words.
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
  /\b(supporting|reflecting|aligned with|in line with)\b.{0,40}\b(commitment|values|culture|mission|vision)\b(\s+(to|for|of|toward|towards)\s+[^,.;]*)?|\bin an? (fast-paced|dynamic|collaborative) environment\b/i;

/**
 * Strips the FIRST matched intent/values clause substring out of the removed
 * text (if any) and returns what's left. Only the matched clause itself is
 * removed — any other factual content in the removed text survives so it
 * can still be checked by the proper-noun/number/filler heuristics below.
 */
function stripIntentValuesClause(removedText: string): string {
  const match = INTENT_VALUES_CLAUSE_RE.exec(removedText);
  if (!match) return removedText;
  return (removedText.slice(0, match.index) + removedText.slice(match.index + match[0].length))
    .replace(/\s{2,}/g, " ")
    .trim();
}

// --- Stopwords & word-overlap alignment ---

/**
 * Tokenizes text into words, keeping internal hyphens as part of a single
 * token (so multi-word filler entries like "high-impact" normalize to one
 * token, not two separate ones).
 */
function normalizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:[-.#+][a-z0-9]+)*/g) || []).filter((w) => w.length > 0);
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
  /** The exact original slice of content this unit owns (bullet marker + text, or the sentence with its terminal punctuation). */
  raw: string;
  /** Text with a leading bullet marker (•/-/*) stripped, if present. For prose units this equals `raw`. */
  text: string;
  /** Whether this unit is a bullet line (vs. a prose sentence). */
  isBullet: boolean;
  /** Offset into the content string where `raw` begins. Together with `raw.length` this gives an exact, literal-replaceable span. */
  start: number;
}

const BULLET_LINE_RE = /^[•\-*]\s+/;

/**
 * Splits section content into comparable units: lines starting with a
 * bullet marker become bullets; everything else is treated as prose and
 * split sentence-by-sentence (terminal punctuation is preserved). Each unit
 * records its exact `start` offset in `content` so callers can do a targeted
 * literal-string replace of ONLY that unit's span — never rebuild the whole
 * content by rejoining units (which would lose blank lines/formatting).
 */
export function splitIntoUnits(content: string): ContentUnit[] {
  if (!content) return [];
  const units: ContentUnit[] = [];
  const lines = content.split(/\r?\n/);
  let cursor = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor += line.length + 1;
      continue;
    }
    if (BULLET_LINE_RE.test(trimmed)) {
      const raw = trimmed;
      const start = content.indexOf(raw, cursor);
      units.push({ raw, text: raw.replace(BULLET_LINE_RE, ""), isBullet: true, start: start === -1 ? cursor : start });
      cursor = (start === -1 ? cursor : start) + raw.length;
      continue;
    }
    // Prose line (e.g. an entry header, or a Summary paragraph): split into
    // sentences so long paragraphs are diffed at sentence granularity.
    // Terminal punctuation is kept as part of each sentence's raw/text.
    const matches = trimmed.match(SENTENCE_UNIT_RE) || [];
    for (const m of matches) {
      const raw = m.trim();
      if (!raw || /^[.!?]+$/.test(raw)) continue;
      const start = content.indexOf(raw, cursor);
      units.push({ raw, text: raw, isBullet: false, start: start === -1 ? cursor : start });
      cursor = (start === -1 ? cursor : start) + raw.length;
    }
  }
  return units;
}

/**
 * Replaces ONLY the given unit's exact span within `content` with new raw
 * text — never rebuilds the whole content by rejoining units. Everything
 * else (blank lines, other units, surrounding punctuation/whitespace)
 * survives byte-for-byte.
 */
export function replaceUnitSpan(content: string, unit: ContentUnit, newText: string): string {
  const newRaw = unit.isBullet ? `${unit.raw.match(BULLET_LINE_RE)?.[0] ?? "• "}${newText}` : newText;
  return content.slice(0, unit.start) + newRaw + content.slice(unit.start + unit.raw.length);
}

/**
 * Replaces the full span covering MULTIPLE contiguous-in-order units (e.g. a
 * group of tailored units that all align to the same original unit, from a
 * split bullet) with a single piece of raw text. Used by group-level revert.
 */
export function replaceUnitsSpan(content: string, units: ContentUnit[], newText: string): string {
  if (units.length === 0) return content;
  const sorted = [...units].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const newRaw = first.isBullet ? `${first.raw.match(BULLET_LINE_RE)?.[0] ?? "• "}${newText}` : newText;
  return content.slice(0, first.start) + newRaw + content.slice(last.start + last.raw.length);
}

/**
 * Inserts `rawText` as a new unit right after `afterUnit` (or at the start
 * of content if `afterUnit` is undefined), preserving everything else.
 */
export function insertUnitAfter(content: string, afterUnit: ContentUnit | undefined, rawText: string): string {
  const insertPos = afterUnit ? afterUnit.start + afterUnit.raw.length : 0;
  const separator = content.includes("\n") || !afterUnit ? "\n" : " ";
  const prefix = content.slice(0, insertPos);
  const suffix = content.slice(insertPos);
  if (!afterUnit) {
    // Inserting at the very start: put it before everything, then a
    // separator before whatever followed.
    return `${rawText}${suffix.length > 0 ? separator : ""}${suffix}`;
  }
  return `${prefix}${separator}${rawText}${suffix}`;
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
 * reverting either tailored unit restores it to that shared original text
 * (see groupAlignedPairs for collapsing the whole group on revert).
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

/**
 * Returns the indices (into `originalUnits`) that were never matched by any
 * tailored unit — i.e. whole original bullets/sentences the tailored
 * content silently dropped. Rendered as always-visible, always-warned
 * "deleted" rows with a Restore action.
 */
export function findUnmatchedOriginalIndices(originalUnits: ContentUnit[], pairs: AlignedPair[]): number[] {
  const matched = new Set(pairs.filter((p) => p.originalIndex !== -1).map((p) => p.originalIndex));
  const unmatched: number[] = [];
  for (let i = 0; i < originalUnits.length; i++) {
    if (!matched.has(i)) unmatched.push(i);
  }
  return unmatched;
}

/**
 * Groups tailored unit indices that share the same originalIndex (a split
 * bullet) so the whole group can be treated — and reverted — as ONE logical
 * change. Returns a map from originalIndex -> sorted tailoredIndex[].
 */
export function groupTailoredIndicesByOriginal(pairs: AlignedPair[]): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (const pair of pairs) {
    if (pair.originalIndex === -1) continue;
    const list = groups.get(pair.originalIndex) ?? [];
    list.push(pair.tailoredIndex);
    groups.set(pair.originalIndex, list);
  }
  groups.forEach((list) => list.sort((a, b) => a - b));
  return groups;
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
 * Determines whether `word` (a capitalized token found somewhere in
 * `removedText`) is truly sentence-initial — by checking its position(s)
 * within the ORIGINAL text, not by assuming the first word of whatever
 * substring the diff algorithm happened to flag as removed is
 * sentence-initial. A word that appears ONLY in sentence-initial position in
 * the original is exempted (treated as ordinary capitalization, not a
 * fabricated proper noun); a word that ever appears mid-sentence counts.
 */
function isSentenceInitialInOriginal(word: string, originalText: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "g");
  let match: RegExpExecArray | null;
  let everMidSentence = false;
  let found = false;
  while ((match = re.exec(originalText)) !== null) {
    found = true;
    const preceding = originalText.slice(0, match.index);
    const atStart = match.index === 0 || SENTENCE_START_BOUNDARY_RE.test(preceding);
    if (!atStart) {
      everMidSentence = true;
      break;
    }
    if (match[0].length === 0) re.lastIndex++;
  }
  if (!found) return false;
  return !everMidSentence;
}

/**
 * Decides whether the removed portion of a diff likely contains real,
 * factual content worth flagging:
 *  - a technical term / proper noun among the removed words
 *  - a number among the removed words
 *  - removal that amounts to (most of) a full original sentence/bullet
 * ...unless every removed word is pure filler per the deletion allowlist, or
 * the removal is (after stripping any matched intent/values clause)
 * entirely filler/empty.
 */
export function shouldWarnOnRemoval(originalText: string, removedText: string): boolean {
  const removedTrimmed = removedText.trim();
  if (!removedTrimmed) return false;

  // Strip out just the matched intent/values clause substring (if any) —
  // any OTHER factual content in the removed text still gets checked below,
  // rather than exempting the whole removal just because a clause appears
  // somewhere in it.
  const effectiveRemoved = stripIntentValuesClause(removedTrimmed);
  if (!effectiveRemoved) return false;

  const removedWords = wordsOf(effectiveRemoved);
  if (removedWords.length === 0) return false;

  if (isFillerOnlyRemoval(removedWords)) return false;

  let hasProperNoun = false;
  PROPER_NOUN_RE.lastIndex = 0;
  let nounMatch: RegExpExecArray | null;
  while ((nounMatch = PROPER_NOUN_RE.exec(effectiveRemoved)) !== null) {
    const word = nounMatch[0];
    if (!isSentenceInitialInOriginal(word, originalText)) {
      hasProperNoun = true;
      break;
    }
  }
  PROPER_NOUN_RE.lastIndex = 0;
  if (hasProperNoun) return true;

  const hasNumber = NUMBER_RE.test(effectiveRemoved);
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
  if (substantiveRemoved.length >= 2) return true;

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

export interface MissingOriginalSection {
  /** The literal heading line text as it appeared in the original resume. */
  heading: string;
  /** The body content of the section (everything until the next heading). */
  content: string;
  /** Suggested index to insert this section at within the tailored sections array, to best preserve original ordering. */
  insertIndex: number;
}

/**
 * Finds whole original sections that have NO tailored counterpart at all —
 * a heading present in the original resume that doesn't match any tailored
 * section's title (by alias). These are rendered as fully-deleted section
 * blocks with a Restore option, rather than being silently dropped.
 */
export function findMissingOriginalSections(
  originalText: string,
  tailoredSections: { title: string }[]
): MissingOriginalSection[] {
  const lines = originalText.split(/\r?\n/);
  const headings: { heading: string; canonical: string; lineIndex: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const canonical = isHeadingLine(lines[i].trim());
    if (canonical) headings.push({ heading: lines[i].trim(), canonical, lineIndex: i });
  }
  if (headings.length === 0) return [];

  const tailoredAliasSets = tailoredSections.map((s) => aliasesFor(s.title));

  const missing: MissingOriginalSection[] = [];
  let matchedSoFar = 0;
  for (let hi = 0; hi < headings.length; hi++) {
    const { heading, canonical, lineIndex } = headings[hi];
    const aliasGroup = Object.values(SECTION_HEADING_ALIASES).find((aliases) => aliases.includes(canonical)) ?? [
      canonical,
    ];
    const hasTailoredMatch = tailoredAliasSets.some((aliases) => aliases.some((a) => aliasGroup.includes(a)));
    if (hasTailoredMatch) {
      matchedSoFar++;
      continue;
    }
    const bodyStart = lineIndex + 1;
    const bodyEnd = hi + 1 < headings.length ? headings[hi + 1].lineIndex : lines.length;
    const content = lines.slice(bodyStart, bodyEnd).join("\n").trim();
    if (content.length === 0) continue;
    missing.push({ heading, content, insertIndex: matchedSoFar });
  }
  return missing;
}
