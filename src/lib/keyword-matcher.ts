/**
 * Keyword extraction and matching utilities for JD-Resume comparison.
 *
 * Features:
 * - Extracts both single keywords and multi-word phrases (bigrams)
 * - Basic suffix stemming for better matching (developing ↔ development)
 * - Short tech keyword allowlist (go, r, c, ai, ml, etc.)
 * - Aggressive stop word filtering for resume/JD context
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
  // Job posting filler
  "role", "position", "job", "work", "working", "team", "company", "looking",
  "seeking", "required", "requirements", "responsibilities", "qualifications",
  "preferred", "experience", "years", "year", "ability", "skills", "knowledge",
  "strong", "excellent", "good", "great", "well", "include", "including",
  "includes", "must", "may", "like", "via", "based", "using", "used", "new",
  "across", "along", "ensure", "take", "make", "join", "apply", "please",
  "candidate", "candidates", "opportunity", "read", "learn", "create",
  "world", "desire", "mission", "help", "culture", "values",
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
  "key", "effectively", "efficient", "successfully", "ensure",
  "contribute", "contributed", "contributing", "established", "utilize",
  "utilized", "utilizing", "facilitate", "facilitated", "facilitating",
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
  "unit testing", "integration testing", "end to end",
  "version control", "code review", "pull request",
  "responsive design", "web accessibility", "accessibility",
  "performance optimization", "search engine optimization", "seo",
  "object oriented", "object-oriented", "functional programming",
  "design patterns", "design system", "component library",
  "state management", "server side rendering", "server-side rendering",
  "static site generation", "single page application",
  "node.js", "next.js", "react.js", "vue.js", "angular.js",
  "ruby on rails", "asp.net", ".net core",
  "amazon web services", "aws", "google cloud", "gcp", "microsoft azure",
  "azure", "docker compose", "kubernetes",
  "sql server", "no sql", "nosql",
  "type safety", "type-safe",
];

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
    "ting", "ing",
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
 * Extract significant keywords from text.
 * Returns both the raw keywords and their stemmed forms for matching.
 */
export function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();
  const lowerText = text.toLowerCase();

  // 1. Extract known multi-word phrases
  for (const phrase of KNOWN_PHRASES) {
    if (lowerText.includes(phrase)) {
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

  // Build a set of stemmed resume keywords for fuzzy matching
  const resumeStems = new Set<string>();
  for (const kw of resumeKeywords) {
    resumeStems.add(stemWord(kw));
  }

  const matchedKeywords: string[] = [];
  const missedKeywords: string[] = [];

  for (const keyword of jdKeywords) {
    // For multi-word phrases, check if the phrase appears in the resume text directly
    if (keyword.includes(" ") || keyword.includes("/")) {
      if (resumeLower.includes(keyword)) {
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
