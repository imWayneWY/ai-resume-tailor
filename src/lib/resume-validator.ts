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
  droppedSkills: string[];
}

/**
 * Finds a "Skills"-titled section in a raw resume text blob and returns its
 * body content (everything until the next heading-like line or end of text).
 * Headings are recognized loosely: a short line (<=40 chars) that doesn't
 * end in punctuation, optionally followed by a blank line.
 */
const SKILLS_HEADING_RE = /^#{0,3}\s*(skills|technical skills|technologies|tech stack|core competencies)\s*:?\s*(.*)$/i;

const SECTION_HEADING_TERMS = [
  "experience",
  "work experience",
  "work history",
  "education",
  "projects",
  "certifications",
  "summary",
  "profile",
  "awards",
  "publications",
  "volunteer",
  "volunteering",
  "languages",
  "interests",
  "references",
  "objective",
];

function isSectionHeadingLine(trimmed: string): boolean {
  const withoutColon = trimmed.replace(/:\s*$/, "").trim();
  return SECTION_HEADING_TERMS.some(
    (term) => withoutColon.toLowerCase() === term.toLowerCase()
  );
}

function extractSkillsSectionFromRawText(text: string): string {
  const lines = text.split(/\r?\n/);
  let start = -1;
  let inlineContent = "";
  for (let i = 0; i < lines.length; i++) {
    const match = SKILLS_HEADING_RE.exec(lines[i].trim());
    if (match) {
      start = i + 1;
      inlineContent = match[2]?.trim() ?? "";
      break;
    }
  }
  if (start === -1) return "";

  const bodyLines: string[] = [];
  if (inlineContent) bodyLines.push(inlineContent);
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length > 0 && isSectionHeadingLine(trimmed)) {
      // Looks like the start of the next section heading.
      break;
    }
    bodyLines.push(line);
  }
  return bodyLines.join("\n");
}

/** Splits a Skills section's content into individual skill items. */
function parseSkillItems(skillsContent: string): string[] {
  if (!skillsContent) return [];
  const items: string[] = [];
  const lines = skillsContent.split(/\r?\n/);
  for (const rawLine of lines) {
    // Strip a leading category label before a colon, e.g. "Languages: JavaScript, TypeScript"
    const line = rawLine.replace(/^[^:|,;•\n]{1,40}:/, "");
    const parts = line.split(/[,•;|]/);
    for (const part of parts) {
      const item = part.trim().replace(/^[-*]\s*/, "");
      if (item.length > 0) items.push(item);
    }
  }
  return items;
}

/** Returns true if `item` appears, case-insensitive & boundary matched, in `text`. */
function containsWordBoundary(text: string, item: string): boolean {
  const escaped = escapeRegExp(item.trim());
  if (!escaped) return false;
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
  return pattern.test(text);
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

  // --- Dropped skills (present in original Skills section, missing from tailored) ---
  const originalSkillsSection = extractSkillsSectionFromRawText(originalText);
  const originalSkillItems = parseSkillItems(originalSkillsSection);
  const tailoredSkillsSection = tailoredSections
    .filter((s) => s?.title && /skills/i.test(s.title))
    .map((s) => s?.content ?? "")
    .join("\n");
  const droppedSkills: string[] = [];
  for (const item of originalSkillItems) {
    if (!containsWordBoundary(tailoredSkillsSection, item)) {
      droppedSkills.push(item);
    }
  }

  return {
    bannedPhraseHits,
    tackedOnClauseHits,
    overusedKeywords,
    newNumbers,
    newProperNouns,
    droppedSkills,
  };
}

const SENTENCE_SPLIT_RE = /[.!?]+/;
const MIN_SENTENCE_LENGTH = 25;
const LARGE_DELETION_RATIO = 0.3;

/**
 * Flags a change (original -> revised) as a likely large/unsafe deletion:
 * either the revised text shrank by more than 30% in character length, or a
 * full sentence of substantial length from the original has no reasonable
 * counterpart anywhere in the revised text (a heuristic for "a whole
 * sentence got deleted" rather than just trimmed adjectives).
 */
export function flagLargeDeletion(original: string, revised: string): boolean {
  const trimmedOriginal = (original ?? "").trim();
  const trimmedRevised = (revised ?? "").trim();
  if (trimmedOriginal.length === 0) return false;
  if (trimmedRevised.length === 0) return true;

  // Only apply the percentage-shrinkage heuristic to originals long enough
  // that a 30%+ drop is meaningful — trimming a short adjective phrase
  // ("high-impact features" -> "features") is small in absolute terms but
  // looks huge as a percentage, which would produce false positives.
  const MIN_LENGTH_FOR_RATIO_CHECK = 80;
  if (trimmedOriginal.length >= MIN_LENGTH_FOR_RATIO_CHECK) {
    const shrinkage = 1 - trimmedRevised.length / trimmedOriginal.length;
    if (shrinkage > LARGE_DELETION_RATIO) return true;
  }

  const normalizedRevised = trimmedRevised.toLowerCase().replace(/\s+/g, " ");
  const sentences = trimmedOriginal
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > MIN_SENTENCE_LENGTH);

  // Only apply the "a whole sentence vanished" heuristic when the original
  // actually contains more than one sentence — for a single-sentence change,
  // trimming some words out (e.g. a leading adjective) isn't "dropping a
  // sentence", it's just an edit to the one sentence that's there.
  if (sentences.length < 2) return false;

  for (const sentence of sentences) {
    const normalizedSentence = sentence.toLowerCase().replace(/\s+/g, " ");
    if (normalizedRevised.includes(normalizedSentence)) continue;

    // Core-words heuristic: does a substantial majority of the sentence's
    // significant words (length > 3) show up somewhere in the revised text?
    const words = normalizedSentence
      .split(/\W+/)
      .filter((w) => w.length > 3);
    if (words.length === 0) continue;
    const matchedWords = words.filter((w) => normalizedRevised.includes(w));
    const matchRatio = matchedWords.length / words.length;
    if (matchRatio < 0.6) {
      return true;
    }
  }

  return false;
}
