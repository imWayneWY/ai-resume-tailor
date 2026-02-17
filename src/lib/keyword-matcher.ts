/**
 * Keyword extraction and matching utilities for JD-Resume comparison.
 *
 * Features:
 * - Extracts both single keywords and multi-word phrases (bigrams)
 * - Basic suffix stemming for better matching (developing ↔ development)
 * - Short tech keyword allowlist (go, r, c, ai, ml, etc.)
 * - Aggressive stop word filtering for resume/JD context (~350+ stop words)
 * - Generic compound word filtering (ai-augmented, user-friendly, non-core, etc.)
 */

const STOP_WORDS = new Set([
  // Articles & pronouns
  "a", "an", "the", "i", "me", "my", "we", "our", "you", "your", "he", "him",
  "his", "she", "her", "it", "its", "they", "them", "their", "what", "which",
  "who", "whom", "this", "that", "these", "those",
  // Common verbs
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has",
  "had", "having", "do", "does", "did", "doing", "will", "would", "could",
  "should", "might", "must", "shall", "can", "need",
  // Prepositions & conjunctions
  "and", "but", "if", "or", "because", "as", "until", "while", "of", "at",
  "by", "for", "with", "about", "against", "between", "into", "through",
  "during", "before", "after", "above", "below", "to", "from", "up", "down",
  "in", "out", "on", "off", "over", "under", "again", "further", "then",
  "once", "nor", "so", "yet", "both", "either", "neither", "not", "only",
  // Common words
  "here", "there", "when", "where", "why", "how", "all", "each", "every",
  "few", "more", "most", "other", "some", "such", "no", "own", "same",
  "than", "too", "very", "just", "also", "now", "etc", "within",
  // Generic verbs & adverbs (appear in any context)
  "ask", "bring", "call", "calls", "check", "come", "find", "get", "give",
  "keep", "know", "let", "look", "move", "put", "run", "say", "see", "set",
  "show", "start", "tell", "think", "try", "turn", "use", "want",
  "often", "always", "never", "sometimes", "usually", "regularly",
  "currently", "recently", "typically", "generally", "specifically",
  "proactively", "actively", "directly", "quickly", "rapidly",
  // Generic adjectives
  "able", "available", "best", "big", "certain", "clear", "common",
  "comprehensive", "current", "deep", "different", "early", "easy",
  "enough", "expected", "first", "following", "free", "full", "general",
  "given", "ideal", "important", "large", "last", "late", "little", "local",
  "long", "low", "main", "major", "many", "next", "old", "open", "part",
  "particular", "possible", "potential", "previous", "primary", "public",
  "real", "related", "relevant", "right", "second", "several", "short",
  "significant", "similar", "simple", "small", "special", "specific",
  "top", "total", "true", "wide", "whole",
  // Generic nouns
  "areas", "area", "aspect", "aspects", "base", "basis", "case", "cases",
  "change", "changes", "class", "context", "cost", "day", "days", "detail",
  "details", "end", "example", "examples", "fact", "field", "focus",
  "form", "goal", "goals", "group", "groups", "hand", "idea", "ideas",
  "impact", "information", "interest", "issue", "issues", "item", "items",
  "kind", "line", "list", "lot", "matter", "member", "members", "method",
  "methods", "mind", "model", "models", "name", "number", "numbers",
  "order", "outcome", "outcomes", "part", "parts", "path", "people",
  "person", "place", "plan", "plans", "point", "points", "practice",
  "practices", "problem", "problems", "process", "processes", "program",
  "programs", "question", "questions", "range", "reason", "reasons",
  "record", "result", "results", "sense", "series", "service", "services",
  "side", "situation", "size", "solution", "solutions", "sort", "source",
  "space", "stage", "standard", "standards", "state", "step", "steps",
  "story", "stuff", "success", "system", "systems", "terms", "thing",
  "things", "thought", "time", "times", "topic", "topics", "type", "types",
  "value", "view", "views", "way", "ways", "word", "words",
  // Job posting filler
  "role", "position", "job", "work", "working", "team", "company", "looking",
  "seeking", "required", "requirements", "responsibilities", "qualifications",
  "preferred", "experience", "years", "year", "ability", "skills", "knowledge",
  "strong", "excellent", "good", "great", "well", "include", "including",
  "includes", "must", "may", "like", "via", "based", "using", "used", "new",
  "across", "along", "ensure", "take", "make", "join", "apply", "please",
  "candidate", "candidates", "opportunity", "read", "learn", "create",
  "world", "desire", "mission", "help", "culture", "values",
  // Job posting filler (expanded)
  "anyone", "applicant", "applicants", "applying", "authorized",
  "career", "encouraged", "employment", "entails", "equivalent", "hire",
  "hiring", "hours", "interview", "offer", "offering", "offers", "post",
  "posting", "rotation", "rotations", "salary", "share", "sharing",
  "title", "vacancy",
  // Corporate / business buzzwords (not technical skills)
  "blog", "business", "creation", "customers", "customer",
  "description", "describes", "driving", "engineering", "engineers",
  "enhancements", "environment", "environments", "explorations",
  "feedback", "foster", "fostering", "framework", "frameworks",
  "growth", "impactful", "initiatives", "innovation", "innovative",
  "insights", "interfaces", "leadership", "levels", "organization",
  "organizations", "ownership", "participate", "participating",
  "play", "products", "product", "professional", "professionals",
  "progress", "rapid", "reliable", "robust", "stakeholders",
  "stakeholder", "strategy", "strategic", "technology", "technologies",
  "vision", "visionary", "virtual", "viewable",
  // Location names (not skills)
  "alberta", "british", "columbia", "ontario", "saskatchewan", "quebec",
  "manitoba", "provinces", "canada", "canadian",
  // Resume-generic words (appear in every resume regardless of fit)
  "build", "built", "develop", "developed", "developing", "development",
  "manage", "managed", "managing", "management", "support", "supported",
  "supporting", "implement", "implemented", "implementing", "implementation",
  "design", "designed", "designing", "provide", "provided", "providing",
  "maintain", "maintained", "maintaining", "responsible", "lead", "leading",
  "led", "improve", "improved", "improving", "improvement", "drive", "driven",
  "collaborate", "collaborated", "collaborating", "collaboration",
  "communicate", "communicated", "communication", "deliver", "delivered",
  "delivering", "high", "level", "leverage", "multiple", "various",
  "key", "effectively", "efficient", "successfully",
  "contribute", "contributed", "contributing", "established", "utilize",
  "utilized", "utilizing", "facilitate", "facilitated", "facilitating",
  "engage", "engaged", "engaging", "engagement", "advocate", "advocating",
  "analyze", "analyzed", "analyzing", "enable", "enabled", "enabling",
  "evaluate", "evaluated", "evaluating", "execute", "executed", "executing",
  "identify", "identified", "identifying", "oversee", "overseeing",
  "perform", "performed", "performing", "resolve", "resolved", "resolving",
  "review", "reviewed", "reviewing", "streamline", "streamlined",
  "transform", "transformed", "transforming",
  "combine", "combined", "combining", "expedite", "expedited",
]);

const MIN_WORD_LENGTH = 3;

/**
 * Short tech keywords that should be kept despite being under MIN_WORD_LENGTH.
 */
const SHORT_KEYWORD_ALLOWLIST = new Set([
  "go", "r", "c", "c#", "c++", "ai", "ml", "ci", "cd", "ui", "ux", "qa",
  "db", "os", "vm", "ip", "io",
]);

/**
 * Known multi-word technical phrases to detect as single keywords.
 * These are matched case-insensitively in the original text.
 */
const KNOWN_PHRASES = [
  "machine learning", "deep learning", "natural language processing",
  "computer vision", "data science", "data engineering", "data pipeline",
  "ci/cd", "ci cd", "continuous integration", "continuous deployment",
  "continuous delivery", "test driven", "test-driven",
  "project management", "product management", "agile methodology",
  "distributed systems", "microservices architecture", "event driven",
  "event-driven", "real time", "real-time", "cross functional",
  "cross-functional", "full stack", "full-stack", "front end", "front-end",
  "back end", "back-end", "open source", "open-source",
  "cloud computing", "cloud native", "cloud-native",
  "web3", "smart contracts", "block chain", "blockchain",
  "rest api", "restful api", "graphql api",
  "user experience", "user interface",
  "unit testing", "integration testing", "end to end", "end-to-end",
  "version control", "code review", "pull request",
  "responsive design", "web accessibility", "accessibility",
  "performance optimization", "search engine optimization", "seo",
  "object oriented", "object-oriented", "functional programming",
  "design patterns", "design system", "component library",
  "state management", "server side rendering", "server-side rendering",
  "static site generation", "single page application",
  "node.js", "next.js", "react.js", "vue.js", "angular.js",
  "ruby on rails", "asp.net", ".net core",
  "amazon web services", "google cloud", "microsoft azure",
  "docker compose",
  "sql server",
  "type safety", "type-safe",
];

/**
 * Set of known phrases for efficient lookup.
 * Used by isGenericCompound to exempt recognized technical terms.
 */
const KNOWN_PHRASES_SET = new Set(KNOWN_PHRASES);

/**
 * Basic suffix stemming. Reduces common word forms to a shared root
 * for better matching (e.g., "optimizing" and "optimization" both stem similarly).
 *
 * This is intentionally simple — not a full Porter stemmer — to avoid
 * false positives while catching the most common resume/JD variations.
 */
export function stemWord(word: string): string {
  // Don't stem short words or known tech terms
  if (word.length <= 4 || SHORT_KEYWORD_ALLOWLIST.has(word)) return word;

  // Order matters: try longer suffixes first
  // Group by related forms so they reduce to the same stem
  const suffixes = [
    // -ization/-izing/-ized → strip to get common root
    "ization", "isation",
    "izing", "ising",
    "ized", "ised",
    // -ation (but not after 'iz' which is handled above)
    "ation",
    // -ment, -ness
    "ment", "ness",
    // -able/-ible
    "ible", "able",
    // -ing (general)
    "ing",
    // -ity, -ive, -ous, -ful, -ant, -ent, -al, -ial
    "ical", "ally", "ious",
    "ity", "ive", "ous", "ful", "ant", "ent",
    "ion", "ism", "ist",
    // -ed, -er, -ly
    "ed", "er", "ly",
  ];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, word.length - suffix.length);
    }
  }

  // Handle trailing 's' (plurals) but not 'ss', 'us', 'is'
  if (
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    !word.endsWith("us") &&
    !word.endsWith("is") &&
    word.length > 4
  ) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Generic modifier words that make compound terms non-technical when combined.
 * e.g., "ai-augmented" → "ai" is tech but "augmented" is generic → filter it out
 * "user-friendly" → both parts are generic → filter it out
 * But "server-side" or "type-safe" → recognized phrases, kept via KNOWN_PHRASES
 */
const GENERIC_COMPOUND_PARTS = new Set([
  // Generic modifiers often used as prefixes/suffixes in JD compound words
  "augmented", "enabled", "focused", "friendly", "oriented", "driven",
  "based", "aware", "ready", "native", "first", "centric", "facing",
  "core", "related", "specific", "wide", "like", "free",
  // Generic prefixes
  "non", "pre", "post", "multi", "cross", "self", "co", "re",
  // Generic nouns used as compound prefixes
  "user", "team", "data", "time", "cost", "goal",
]);

/**
 * Check if a hyphenated compound word is generic (not a real skill).
 * Returns true if the word should be filtered out.
 * Known phrases (from KNOWN_PHRASES) are exempted — they are recognized
 * technical terms detected separately in extractKeywords().
 */
export function isGenericCompound(word: string): boolean {
  if (!word.includes("-")) return false;

  // Never filter known technical phrases
  const lowerWord = word.toLowerCase();
  if (KNOWN_PHRASES_SET.has(lowerWord)) return false;
  // Also check with hyphens normalized to spaces (e.g., "end-to-end" → "end to end")
  const spaceNormalized = lowerWord.replace(/-/g, " ");
  if (KNOWN_PHRASES_SET.has(spaceNormalized)) return false;

  const parts = word.split("-");
  // Filter if ALL parts are stop words or generic compound parts
  const allGeneric = parts.every(
    (p) => STOP_WORDS.has(p) || GENERIC_COMPOUND_PARTS.has(p) || p.length < 2
  );
  if (allGeneric) return true;

  // Filter if the non-tech part is a generic modifier
  // e.g., "ai-augmented" — "ai" is tech but "augmented" is just a modifier
  const hasOnlyGenericModifiers = parts.every(
    (p) =>
      STOP_WORDS.has(p) ||
      GENERIC_COMPOUND_PARTS.has(p) ||
      SHORT_KEYWORD_ALLOWLIST.has(p) ||
      p.length < 2
  );
  if (hasOnlyGenericModifiers) return true;

  return false;
}

/**
 * Extract significant keywords from text.
 * Returns single words and recognized multi-word phrases, normalized to lowercase.
 * Filters out stop words, short words (unless in allowlist), pure numbers,
 * and generic compound words (e.g., "ai-augmented", "user-friendly").
 */
export function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();
  const lowerText = text.toLowerCase();

  // 1. Extract known multi-word phrases (word boundary matching to avoid substrings)
  for (const phrase of KNOWN_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, "i");
    if (pattern.test(lowerText)) {
      keywords.add(phrase);
    }
  }

  // 2. Extract single words
  const words = lowerText.split(/[^a-z0-9#+./-]+/);
  for (const word of words) {
    const cleaned = word.replace(/^[.-]+|[.-]+$/g, "");
    if (
      !/^\d+$/.test(cleaned) &&
      !STOP_WORDS.has(cleaned) &&
      !isGenericCompound(cleaned) &&
      (cleaned.length >= MIN_WORD_LENGTH || SHORT_KEYWORD_ALLOWLIST.has(cleaned))
    ) {
      keywords.add(cleaned);
    }
  }

  return keywords;
}

/**
 * Calculate match statistics between resume text and JD keywords.
 * Uses stemming to match word variants (e.g., "optimizing" matches "optimization").
 *
 * @param resumeText - Raw resume text to match against
 * @param jdKeywords - Keywords extracted via `extractKeywords()`. Must be pre-normalized
 *   (lowercase, cleaned) — pass the output of `extractKeywords(jobDescription)` directly.
 */
export function calculateMatchScore(
  resumeText: string,
  jdKeywords: Set<string>
): {
  matchedKeywords: string[];
  missedKeywords: string[];
  matchCount: number;
  totalKeywords: number;
  matchPercentage: number;
} {
  const resumeLower = resumeText.toLowerCase();
  const resumeKeywords = extractKeywords(resumeText);

  // Build a set of stemmed resume keywords for fuzzy matching (single words only)
  const resumeStems = new Set<string>();
  for (const kw of resumeKeywords) {
    if (!kw.includes(" ") && !kw.includes("/")) {
      resumeStems.add(stemWord(kw));
    }
  }

  const matchedKeywords: string[] = [];
  const missedKeywords: string[] = [];

  for (const keyword of jdKeywords) {
    // For multi-word phrases or compound terms, check with flexible separator matching
    if (keyword.includes(" ") || keyword.includes("/") || keyword.includes("-")) {
      // Normalize separators for flexible matching (ci/cd ↔ ci cd, real-time ↔ real time)
      const flexPattern = keyword
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/[\s/\\-]+/g, "[\\s/\\-]+");
      const pattern = new RegExp(flexPattern, "i");
      if (pattern.test(resumeLower)) {
        matchedKeywords.push(keyword);
      } else {
        missedKeywords.push(keyword);
      }
    } else {
      // For single words, try exact match first, then stemmed match
      if (resumeKeywords.has(keyword)) {
        matchedKeywords.push(keyword);
      } else if (resumeStems.has(stemWord(keyword))) {
        matchedKeywords.push(keyword);
      } else {
        missedKeywords.push(keyword);
      }
    }
  }

  const matchCount = matchedKeywords.length;
  const totalKeywords = jdKeywords.size;
  const matchPercentage =
    totalKeywords > 0 ? Math.round((matchCount / totalKeywords) * 100) : 0;

  return {
    matchedKeywords: matchedKeywords.sort(),
    missedKeywords: missedKeywords.sort(),
    matchCount,
    totalKeywords,
    matchPercentage,
  };
}
