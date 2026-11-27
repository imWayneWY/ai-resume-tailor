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
  /\b(supporting|reflecting|aligned with|in line with)\b.{0,40}\b(commitment|values|culture|mission|vision)\b(\s+(to|for|of|toward|towards)\s+[^,.;]*)?|\bin an? (fast-paced|dynamic|collaborative)(\s+(startup|work|team))? environment\b|\bto (deliver|provide|create) an? \w+ (user )?experience\b/i;

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

// Heuristics for deciding whether a non-bullet line immediately following a
// bullet is a genuine wrapped continuation (fold it in) vs. a brand-new
// entry/section header (do NOT fold it) — see splitIntoUnits.
const YEAR_OR_DATE_RANGE_RE = /\b(19|20)\d{2}\b|\(\s*\d{4}\s*-\s*(present|\d{4})\s*\)/i;
// Connector/preposition words that, when ending the previous line, clearly
// indicate the phrase continues onto the next (capitalized) line — used to
// decide whether a capitalized candidate line is a genuine wrapped
// continuation vs. a new entry/section header.
const CONTINUATION_CONNECTOR_RE = /\b(and|across|with|for|to|in|on|using|via|including)$/i;
const CONTINUATION_HEADING_TERMS = new Set([
  "summary",
  "profile",
  "objective",
  "experience",
  "work experience",
  "work history",
  "employment",
  "education",
  "skills",
  "technical skills",
  "technologies",
  "tech stack",
  "core competencies",
  "projects",
  "certifications",
  "certificates",
  "awards",
  "publications",
  "volunteer",
  "volunteering",
  "languages",
  "interests",
  "references",
]);

function isMostlyUppercase(line: string): boolean {
  const letters = line.match(/[a-zA-Z]/g) || [];
  if (letters.length === 0) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase());
  return upper.length / letters.length > 0.5;
}

/**
 * Decides whether `candidate` (a non-bullet line immediately following
 * `prevLine`, the bullet or last-folded continuation line) looks like a
 * genuine wrapped continuation of `prevLine` rather than a new entry/section
 * header. All checks must pass for folding to be allowed.
 */
function looksLikeContinuation(prevLine: string, candidate: string): boolean {
  const prevTrimmed = prevLine.trim();
  const prevEndsWithTerminalPunct = /[.!?:]$/.test(prevTrimmed);
  if (prevEndsWithTerminalPunct) return false;
  const candTrimmed = candidate.trim();
  if (candTrimmed.length === 0) return false;
  if (candTrimmed.startsWith("**")) return false;
  if (isMostlyUppercase(candTrimmed)) return false;
  if (YEAR_OR_DATE_RANGE_RE.test(candTrimmed)) return false;
  const headingCandidate = candTrimmed.replace(/:\s*$/, "").trim().toLowerCase();
  if (CONTINUATION_HEADING_TERMS.has(headingCandidate)) return false;
  const firstChar = candTrimmed.charAt(0);
  if (firstChar.toLowerCase() === firstChar.toUpperCase()) return false; // not a letter
  if (firstChar === firstChar.toLowerCase()) return true;
  // Candidate starts with a capital letter. Still allow folding when the
  // previous line ends mid-phrase (comma, or no terminal punctuation at
  // all — already guaranteed by the prevEndsWithTerminalPunct check above)
  // — e.g. a genuine wrapped continuation that's itself a list of proper
  // nouns ("Safari, Firefox, and mobile browsers"). The date-range,
  // mostly-uppercase, and heading-term checks above already guard against
  // folding an actual new entry/section header.
  if (prevTrimmed.endsWith(",")) return true;
  return CONTINUATION_CONNECTOR_RE.test(prevTrimmed);
}

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
  // NOTE: callers are expected to normalize CRLF (`\r\n`) to `\n` before
  // content ever reaches this function (see normalizeLineEndings at the
  // React-state entry points). We still split on /\r?\n/ defensively, but
  // the lineStarts offsets below assume a single-character `\n` separator
  // — if `content` still contains `\r\n`, pre-normalize it here so offsets
  // never drift.
  const normalizedContent = content.includes("\r\n") ? content.replace(/\r\n/g, "\n") : content;
  content = normalizedContent;
  const lines = content.split(/\r?\n/);
  // Compute each line's start offset in `content` up front so we can safely
  // merge a bullet line with an immediately-following non-bullet
  // continuation line (a PDF-wrapped bullet) into ONE unit whose `raw` is
  // the exact literal content span covering both physical lines — never a
  // synthetic rejoin — so replaceUnitSpan/replaceUnitsSpan still work.
  const lineStarts: number[] = [];
  {
    let offset = 0;
    for (const line of lines) {
      lineStarts.push(offset);
      offset += line.length + 1; // +1 for the stripped newline (content is now \n-only)
    }
  }
  let cursor = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor += line.length + 1;
      continue;
    }
    if (BULLET_LINE_RE.test(trimmed)) {
      // Look ahead: does a non-bullet continuation line immediately follow
      // (no blank line in between)? If so, fold it into this bullet unit.
      let endLineIndex = li;
      const continuationTexts: string[] = [];
      let prevLine = line;
      for (let nj = li + 1; nj < lines.length; nj++) {
        const nextTrimmed = lines[nj].trim();
        if (nextTrimmed.length === 0 || BULLET_LINE_RE.test(nextTrimmed)) break;
        if (!looksLikeContinuation(prevLine, lines[nj])) break;
        continuationTexts.push(nextTrimmed);
        endLineIndex = nj;
        prevLine = lines[nj];
      }
      const spanStart = lineStarts[li] + (lines[li].length - lines[li].trimStart().length);
      const lastLine = lines[endLineIndex];
      const spanEnd = lineStarts[endLineIndex] + lastLine.trimEnd().length;
      const raw = content.slice(spanStart, spanEnd);
      const text = [trimmed.replace(BULLET_LINE_RE, ""), ...continuationTexts].join(" ");
      units.push({ raw, text, isBullet: true, start: spanStart });
      cursor = spanEnd;
      li = endLineIndex;
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
  const contiguous = sorted.every((u, i) => {
    if (i === 0) return true;
    const prev = sorted[i - 1];
    const gap = content.slice(prev.start + prev.raw.length, u.start);
    // Only treat as contiguous if nothing but whitespace/newlines sits
    // between consecutive grouped units — any other content (e.g. an
    // unrelated bullet) in the gap means this is NOT a real contiguous
    // span and must be replaced unit-by-unit instead.
    return /^\s*$/.test(gap);
  });
  const newRaw = first.isBullet ? `${first.raw.match(BULLET_LINE_RE)?.[0] ?? "• "}${newText}` : newText;
  if (contiguous) {
    // Fast path: the group's units are one contiguous span — replace it in
    // one shot (collapses any whitespace/newlines between them too).
    return content.slice(0, first.start) + newRaw + content.slice(last.start + last.raw.length);
  }
  // Non-adjacent group: never blindly span first-to-last (that would delete
  // any unrelated content sitting between them). Replace each unit's own
  // span individually, working BACKWARDS so earlier offsets stay valid, and
  // insert the single replacement text only once (at the first unit).
  let result = content;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const u = sorted[i];
    const replacement = i === 0 ? newRaw : "";
    const spanEnd = u.start + u.raw.length;
    if (replacement === "") {
      // Avoid leaving an orphaned blank line behind: consume one adjacent
      // newline — prefer a trailing one immediately after the span, else a
      // leading one immediately before it.
      if (result[spanEnd] === "\n") {
        result = result.slice(0, u.start) + result.slice(spanEnd + 1);
      } else if (result[u.start - 1] === "\n") {
        result = result.slice(0, u.start - 1) + result.slice(spanEnd);
      } else {
        result = result.slice(0, u.start) + result.slice(spanEnd);
      }
    } else {
      result = result.slice(0, u.start) + replacement + result.slice(spanEnd);
    }
  }
  return result;
}

/**
 * Inserts `rawText` as a new unit right after `afterUnit` (or at the start
 * of content if `afterUnit` is undefined), preserving everything else.
 */
export function insertUnitAfter(content: string, afterUnit: ContentUnit | undefined, rawText: string): string {
  const insertPos = afterUnit ? afterUnit.start + afterUnit.raw.length : 0;
  const newUnitIsBullet = rawText.trim().startsWith("•") || rawText.trim().startsWith("-") || rawText.trim().startsWith("*");
  const needsNewline = content.includes("\n") || !afterUnit || afterUnit.isBullet || newUnitIsBullet;
  const separator = needsNewline ? "\n" : " ";
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

/** Tokenizes into words + punctuation + whitespace as separate token types, preserving round-trip text. Keeps internal apostrophes/hyphens as part of a word token (e.g. "don't", "high-impact") but splits off leading/trailing punctuation like commas/periods so "Pay" and "Pay," diff as the same word token plus a separate punctuation token. */
function tokenize(text: string): string[] {
  return text.match(/[a-zA-Z0-9]+(?:['-][a-zA-Z0-9]+)*|\s+|[^\sa-zA-Z0-9]/g) || [];
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
// Threshold for treating two ADJACENT, otherwise-unmatched-or-differently-matched
// tailored units as a genuine split of one original unit: their combined text
// must cover a substantial share of the original's words.
const MIN_SPLIT_COMBINED_SIMILARITY = 0.3;

/**
 * Aligns each tailored unit to AT MOST one original unit, one-to-one by
 * default: every (tailoredIndex, originalIndex) candidate pair above
 * MIN_ALIGNMENT_SIMILARITY is scored, then pairs are greedily assigned
 * highest-similarity-first, marking each original unit as "used" once
 * claimed so two unrelated tailored units can never both claim the same
 * original just because they're independently similar to it (e.g. both
 * mentioning "Teams chat").
 *
 * After one-to-one assignment, a SPARE (never-claimed) original unit may
 * still be adopted by a genuine split-bullet pair: two ADJACENT tailored
 * units (by tailoredIndex) whose combined text substantially covers the
 * original's words are reassigned to that original together. This is the
 * only way multiple tailored units may end up sharing one originalIndex —
 * coincidental similarity to the same original, without adjacency +
 * combined-coverage, is NOT treated as a split.
 */
export function alignUnits(originalUnits: ContentUnit[], tailoredUnits: ContentUnit[]): AlignedPair[] {
  // 1. Build all candidate pairs above the similarity floor.
  type Candidate = { tailoredIndex: number; originalIndex: number; score: number };
  const candidates: Candidate[] = [];
  for (let t = 0; t < tailoredUnits.length; t++) {
    for (let o = 0; o < originalUnits.length; o++) {
      const score = similarity(originalUnits[o].text, tailoredUnits[t].text);
      if (score >= MIN_ALIGNMENT_SIMILARITY) {
        candidates.push({ tailoredIndex: t, originalIndex: o, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const assignedOriginal = new Map<number, number>(); // tailoredIndex -> originalIndex
  const assignedScore = new Map<number, number>(); // tailoredIndex -> score
  const usedOriginals = new Set<number>();
  const displacedOwners = new Set<number>(); // tailoredIndex of units displaced by split-adoption, eligible for re-match
  for (const c of candidates) {
    if (assignedOriginal.has(c.tailoredIndex) || usedOriginals.has(c.originalIndex)) continue;
    assignedOriginal.set(c.tailoredIndex, c.originalIndex);
    assignedScore.set(c.tailoredIndex, c.score);
    usedOriginals.add(c.originalIndex);
  }

  // 2. Look for genuine split-bullet cases: an original unit whose current
  // single best match (if any) is weaker than what two ADJACENT tailored
  // units could cover together. We check every original (not just spares)
  // because the single-best match might belong to only one of the two
  // halves of a real split.
  for (let o = 0; o < originalUnits.length; o++) {
    for (let t = 0; t + 1 < tailoredUnits.length; t++) {
      const combinedText = `${tailoredUnits[t].text} ${tailoredUnits[t + 1].text}`;
      const combinedScore = similarity(originalUnits[o].text, combinedText);
      if (combinedScore < MIN_SPLIT_COMBINED_SIMILARITY) continue;
      // Only adopt tailored units into the split if doing so doesn't
      // steal a decent, independent assignment they already have
      // elsewhere (to a DIFFERENT original) — unless that assignment is
      // weak enough (below the combined-adoption threshold) to be a safe
      // give-up. A solid independent match (>= threshold) to a different
      // original must NOT be stolen into this split.
      const tScore = assignedOriginal.get(t) !== o ? assignedScore.get(t) ?? -1 : -1;
      const t1Score = assignedOriginal.get(t + 1) !== o ? assignedScore.get(t + 1) ?? -1 : -1;
      if (tScore >= MIN_SPLIT_COMBINED_SIMILARITY || t1Score >= MIN_SPLIT_COMBINED_SIMILARITY) continue;
      if (tScore >= combinedScore || t1Score >= combinedScore) continue;
      // Don't steal this original from a DIFFERENT adjacent pair that
      // already has a stronger combined claim on it.
      const existingOwnerT = assignedOriginal.get(t) === o ? t : undefined;
      const existingOwnerT1 = assignedOriginal.get(t + 1) === o ? t + 1 : undefined;
      if (existingOwnerT === undefined && existingOwnerT1 === undefined && usedOriginals.has(o)) {
        // original is claimed by some unrelated tailored unit with a
        // potentially-better single-match score; only override if the
        // split's combined score beats that single match.
        const owner = Array.from(assignedOriginal.entries()).find(([, oi]) => oi === o)?.[0];
        const ownerScore = owner !== undefined ? assignedScore.get(owner) ?? -1 : -1;
        if (combinedScore <= ownerScore) continue;
        if (owner !== undefined) {
          // The split pair is taking over `o` from its previous owner X —
          // X must NOT keep pointing at `o` (which now belongs to the
          // split pair), or `o` would end up with 3 tailored units mapped
          // to it, causing group-revert to blank X's unrelated content.
          // X becomes unmatched; a later pass could re-match it, but
          // unmatched (rendered as a plain "added" unit) is a safe outcome.
          usedOriginals.delete(o);
          assignedOriginal.delete(owner);
          assignedScore.delete(owner);
          displacedOwners.add(owner);
        }
      }
      // Release any originals these two previously claimed (they're
      // being reassigned to the split original instead).
      const prevT = assignedOriginal.get(t);
      const prevT1 = assignedOriginal.get(t + 1);
      if (prevT !== undefined && prevT !== o) usedOriginals.delete(prevT);
      if (prevT1 !== undefined && prevT1 !== o) usedOriginals.delete(prevT1);
      assignedOriginal.set(t, o);
      assignedOriginal.set(t + 1, o);
      assignedScore.set(t, combinedScore);
      assignedScore.set(t + 1, combinedScore);
      usedOriginals.add(o);
      displacedOwners.delete(t);
      displacedOwners.delete(t + 1);
      break;
    }
  }

  // 3. Give each displaced owner (a unit that lost its original to a
  // genuine split-adoption in step 2) a fair chance to re-match against
  // any ORIGINAL units still unclaimed after the split-adoption pass —
  // it's a rewrite of real original content, not genuinely fabricated,
  // so it shouldn't be mislabeled as "added" if a reasonable match exists.
  for (const t of Array.from(displacedOwners)) {
    let bestOriginal = -1;
    let bestScore = -1;
    for (let o = 0; o < originalUnits.length; o++) {
      if (usedOriginals.has(o)) continue;
      const score = similarity(originalUnits[o].text, tailoredUnits[t].text);
      if (score >= MIN_ALIGNMENT_SIMILARITY && score > bestScore) {
        bestScore = score;
        bestOriginal = o;
      }
    }
    if (bestOriginal !== -1) {
      assignedOriginal.set(t, bestOriginal);
      assignedScore.set(t, bestScore);
      usedOriginals.add(bestOriginal);
    }
  }

  return tailoredUnits.map((tailored, tailoredIndex) => {
    const originalIndex = assignedOriginal.get(tailoredIndex);
    const matched = originalIndex !== undefined;
    return {
      tailoredIndex,
      originalIndex: matched ? originalIndex! : -1,
      originalText: matched ? originalUnits[originalIndex!].text : "",
      tailoredText: tailored.text,
      similarity: matched ? assignedScore.get(tailoredIndex)! : 0,
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
  /** Whether the unit (original and/or tailored raw text) is a bold `**...**`-wrapped header. Applied to the unit as a whole, not per diff-op, so a changed bold header always renders fully bold. Used in Show-changes mode. */
  isBold: boolean;
  /** Whether the TAILORED text itself is bold-wrapped. Used in Clean mode specifically, so Clean mode always matches the PDF export (which reads the tailored text's own bold-wrapping, not the original's). */
  tailoredIsBold: boolean;
}

const BOLD_WRAPPER_RE = /^\*\*([\s\S]+)\*\*$/;

/** Strips a leading+trailing `**...**` wrapper from text, if present. */
function stripBoldWrapper(text: string): string {
  const m = BOLD_WRAPPER_RE.exec(text.trim());
  return m ? m[1] : text;
}

export function diffAlignedPair(pair: AlignedPair): UnitDiff {
  const originalIsBold = BOLD_WRAPPER_RE.test(pair.originalText.trim());
  const tailoredIsBold = BOLD_WRAPPER_RE.test(pair.tailoredText.trim());
  const isBold = originalIsBold || tailoredIsBold;
  // Strip the `**` markers BEFORE diffing so a bold marker pair split
  // across diff ops (e.g. by a word-boundary change inside the header)
  // never leaves raw, unmatched `**` characters in the rendered ops —
  // bold styling is applied to the whole unit instead (see isBold above).
  const originalPlain = isBold ? stripBoldWrapper(pair.originalText) : pair.originalText;
  const tailoredPlain = isBold ? stripBoldWrapper(pair.tailoredText) : pair.tailoredText;
  const ops = pair.originalIndex === -1 ? [{ type: "add" as const, value: tailoredPlain }] : wordDiff(originalPlain, tailoredPlain);
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
    isBold,
    tailoredIsBold,
  };
}

// --- Original section text extraction (best-effort, by heading match) ---

const SECTION_HEADING_ALIASES: Record<string, string[]> = {
  summary: ["summary", "profile", "objective"],
  experience: ["experience", "work experience", "work history", "employment", "professional experience", "relevant experience"],
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
