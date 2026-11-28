/**
 * Normalizes raw resume text (from PDF extraction or pasted by hand) into a
 * line-structured form that downstream consumers (resume-validator's
 * droppedSkills/skillsSectionNotFound checks, diff-utils's alignment, and
 * the tailor prompt's <original_resume>) can reliably split into headings,
 * entry headers, and bullets.
 *
 * Real-world PDF extraction (and some pasted text) can arrive as one giant
 * flattened line/paragraph with no real newlines separating the header,
 * section headings, company/role headers, and bullets. This function
 * inserts newlines at the structural boundaries it can detect:
 *  - before every bullet character variant (•, ●, ▪), normalizing all of
 *    them to "• ";
 *  - before and after known section headings (uppercase OR Title Case,
 *    matched as standalone words);
 *  - before a company/title header pattern that ends in a year range (e.g.
 *    "(2021 - 2023)", "2023 - PRESENT", "(2020-Present)");
 *  - and collapses repeated spaces (while preserving the newlines just
 *    inserted).
 */

// Reused/adapted from resume-validator.ts's SECTION_HEADING_TERMS and
// diff-utils.ts's SECTION_HEADING_ALIASES — the canonical set of heading
// words we recognize as section boundaries.
const SECTION_HEADING_TERMS = [
  "experience",
  "work experience",
  "work history",
  "professional experience",
  "relevant experience",
  "employment",
  "education",
  "projects",
  "certifications",
  "certificates",
  "summary",
  "profile",
  "objective",
  "skills",
  "technical skills",
  "technologies",
  "tech stack",
  "core competencies",
  "awards",
  "publications",
  "volunteer",
  "volunteering",
  "languages",
  "interests",
  "references",
];

// Sort longest-first so multi-word terms (e.g. "work experience") match
// before their shorter substrings (e.g. "experience") would otherwise
// fragment the match.
const SORTED_HEADING_TERMS = [...SECTION_HEADING_TERMS].sort((a, b) => b.length - a.length);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches a heading term as a standalone "word" (not embedded in a larger
// word), in either ALL UPPERCASE or Title Case form, so "PROFILE", "Profile",
// "EXPERIENCE", "Experience", "Work Experience", etc. are all recognized.
function buildHeadingRegex(): RegExp {
  const alternatives = SORTED_HEADING_TERMS.map((term) => {
    const words = term.split(" ");
    const wordPattern = words
      .map((w) => {
        const escaped = escapeRegExp(w);
        // Allow either ALL CAPS or Title Case for each word.
        return `(?:${escaped.toUpperCase()}|${w.charAt(0).toUpperCase()}${escaped.slice(1).toLowerCase()})`;
      })
      .join("\\s+");
    return wordPattern;
  });
  return new RegExp(`(?<![A-Za-z])(${alternatives.join("|")})(?![A-Za-z])`, "g");
}

const HEADING_RE = buildHeadingRegex();

// Bullet character variants to normalize to "• ".
const BULLET_CHARS_RE = /[•●▪]/g;

// A company/title header pattern that ends in a year range, e.g.
// "(2021 - 2023)", "2023 - PRESENT", "(2020-Present)". Tolerant of spacing
// and dash variants (-, –, —).
const YEAR_RANGE_END_RE =
  /\(?\s*(19|20)\d{2}\s*[-–—]\s*(present|current|(19|20)\d{2})\s*\)?/gi;

export function normalizeResumeText(text: string): string {
  if (!text) return text;

  let result = text;

  // Normalize CRLF to LF first so offsets/splits behave predictably.
  result = result.replace(/\r\n/g, "\n");

  // 1. Insert a newline before every bullet character variant, normalizing
  // all of them to "• ".
  result = result.replace(BULLET_CHARS_RE, "\n• ");

  // 2. Insert a newline before AND after known section headings. Skip a
  // match that's immediately followed by a colon ("Languages:", "Tools:")
  // — that's a Skills-section category LABEL (e.g. "Languages: JS, TS"),
  // not a standalone section heading, and breaking it onto its own line
  // would sever the label from its items and corrupt downstream parsing
  // (e.g. resume-validator's extractSkillsSectionFromRawText would treat
  // the label as the start of a new top-level section and stop early).
  HEADING_RE.lastIndex = 0;
  result = result.replace(HEADING_RE, (match, _p1, offset, full) => {
    const after = full.slice(offset + match.length);
    if (/^\s*:/.test(after)) return match;
    return `\n${match}\n`;
  });

  // 3. Insert a newline before a company/title header pattern that ends in
  // a year range — the year range itself is the END of that header line,
  // so we break right after it (start a new line for whatever follows) and
  // also ensure the header itself starts on its own line by inserting a
  // newline before it if it's preceded by non-whitespace, non-newline text.
  // We detect "sentence-like" header starts by looking for the pattern:
  // <break before> ... <year range> <break after>.
  YEAR_RANGE_END_RE.lastIndex = 0;
  result = result.replace(YEAR_RANGE_END_RE, (match) => `${match}\n`);

  // Insert a newline BEFORE a likely header start: a run of text that is
  // not preceded by a newline and that contains a year-range ending before
  // the next bullet/heading/newline. We approximate this by looking for a
  // capital-letter sequence (often a company name) following a period,
  // bullet, or heading break, and ending (within ~120 chars) in a year
  // range. This is intentionally conservative — most structure is already
  // handled by bullets/headings above.
  const HEADER_START_RE = /([.!?•\n]\s*)([A-Z][A-Za-z0-9&.,'/ ]{2,100}?\(?\s*(19|20)\d{2}\s*[-–—]\s*(present|current|(19|20)\d{2})\s*\)?)/g;
  result = result.replace(HEADER_START_RE, (_m, prefix, header) => {
    const trimmedPrefix = prefix.replace(/\s+$/, "");
    return `${trimmedPrefix}\n${header}`;
  });

  // Entry headers are often bold-wrapped (e.g. "**Company Name** — Role
  // (2021 - 2023)"). When such a header is glued onto the end of the
  // previous bullet/sentence with no punctuation boundary between them
  // (common in flattened PDF extraction), break a line before the opening
  // "**" whenever it isn't already at the start of a line.
  result = result.replace(/([^\n])(\*\*[^*\n]+\*\*[^\n]*?(19|20)\d{2}\s*[-–—]\s*(present|current|(19|20)\d{2})\)?)/gi, (_m, prevChar, header) => {
    return `${prevChar}\n${header}`;
  });

  // 4. Collapse repeated spaces/tabs (but preserve newlines).
  result = result
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");

  // Collapse 3+ consecutive blank lines down to a single blank line, and
  // strip any leading/trailing blank lines.
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return result;
}
