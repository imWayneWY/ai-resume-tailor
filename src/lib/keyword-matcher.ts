/**
 * Keyword extraction and matching utilities for JD-Resume comparison.
 * Extracts significant keywords from job descriptions and calculates
 * match percentages against resume text.
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
  // Job posting filler (not meaningful keywords)
  "role", "position", "job", "work", "working", "team", "company", "looking",
  "seeking", "required", "requirements", "responsibilities", "qualifications",
  "preferred", "experience", "years", "year", "ability", "skills", "knowledge",
  "strong", "excellent", "good", "great", "well", "include", "including",
  "includes", "must", "may", "like", "via", "based", "using", "used", "new",
  "across", "along", "ensure", "take", "make", "join", "apply", "please",
  "candidate", "candidates", "opportunity", "read", "learn", "create",
  "world", "desire", "mission", "help", "culture", "values",
]);

const MIN_WORD_LENGTH = 3;

/**
 * Short tech keywords that should be kept despite being under MIN_WORD_LENGTH.
 * These are legitimate programming languages/tools that would be filtered out
 * by the length check alone.
 */
const SHORT_KEYWORD_ALLOWLIST = new Set([
  "go", "r", "c", "c#", "c++", "ai", "ml", "ci", "cd", "ui", "ux", "qa",
  "db", "os", "vm", "ip", "io",
]);

/**
 * Extract significant keywords from text.
 * Filters out stop words, short words, and normalizes to lowercase.
 */
export function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();
  const words = text.toLowerCase().split(/[^a-z0-9#+.-]+/);

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
  const resumeKeywords = extractKeywords(resumeText);
  const matchedKeywords: string[] = [];
  const missedKeywords: string[] = [];

  for (const keyword of jdKeywords) {
    if (resumeKeywords.has(keyword)) {
      matchedKeywords.push(keyword);
    } else {
      missedKeywords.push(keyword);
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
