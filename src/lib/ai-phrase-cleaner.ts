/**
 * AI phrase blacklist and replacement utility.
 *
 * Detects and replaces AI-generated buzzwords and filler phrases
 * with simpler, more natural alternatives. Runs as a local
 * post-processing step after LLM output — no API call needed.
 *
 * Inspired by Resume Matcher's refinement pass.
 */

/** Map of AI phrases to their simpler replacements. */
const AI_PHRASE_REPLACEMENTS: Record<string, string> = {
  // Overused action verbs (including common inflections)
  spearheaded: "led",
  spearheading: "leading",
  orchestrated: "coordinated",
  orchestrating: "coordinating",
  championed: "advocated for",
  championing: "advocating for",
  synergized: "collaborated",
  leveraged: "used",
  leveraging: "using",
  revolutionized: "transformed",
  revolutionizing: "transforming",
  pioneered: "introduced",
  pioneering: "introducing",
  catalyzed: "initiated",
  catalyzing: "initiating",
  operationalized: "implemented",
  architected: "designed",
  envisioned: "planned",
  effectuated: "completed",
  endeavored: "worked",
  facilitated: "helped",
  facilitate: "help",
  facilitating: "helping",
  utilized: "used",
  utilizing: "using",

  // Corporate buzzwords
  synergy: "collaboration",
  synergies: "collaborations",
  paradigm: "approach",
  "paradigm shift": "change",
  "best-in-class": "top-performing",
  "world-class": "high-quality",
  "cutting-edge": "modern",
  "bleeding-edge": "modern",
  "game-changer": "improvement",
  "game-changing": "significant",
  disruptive: "innovative",
  disruptor: "innovator",
  holistic: "comprehensive",
  robust: "strong",
  actionable: "practical",
  impactful: "effective",
  proactive: "active",
  proactively: "actively",
  stakeholder: "team member",
  deliverables: "outputs",
  "value-add": "benefit",

  // Filler phrases
  "in order to": "to",
  "for the purpose of": "to",
  "with a view to": "to",
  "at the end of the day": "",
  "moving forward": "",
  "going forward": "",
  "on a daily basis": "daily",
  "on a regular basis": "regularly",
  "in a timely manner": "promptly",
  "at this point in time": "now",
  "due to the fact that": "because",
  "in the event that": "if",
  "in light of the fact that": "since",
};

export interface CleanupResult {
  /** The cleaned text. */
  text: string;
  /** List of phrases that were replaced. */
  replacedPhrases: string[];
  /** Number of replacements made. */
  replacementCount: number;
}

/**
 * Remove AI-generated phrases from text and replace with simpler alternatives.
 *
 * @param text - The text to clean up
 * @returns CleanupResult with cleaned text and replacement details
 */
export function cleanAiPhrases(text: string): CleanupResult {
  let cleaned = text;
  const replacedPhrases: string[] = [];
  let replacementCount = 0;

  // Replace multi-word phrases first (longer matches take priority)
  const sortedPhrases = Object.keys(AI_PHRASE_REPLACEMENTS).sort(
    (a, b) => b.length - a.length
  );

  for (const phrase of sortedPhrases) {
    const replacement = AI_PHRASE_REPLACEMENTS[phrase];
    const pattern = new RegExp(escapeRegExp(phrase), "gi");
    const matches = cleaned.match(pattern);

    if (matches) {
      replacedPhrases.push(phrase);
      replacementCount += matches.length;

      cleaned = cleaned.replace(pattern, (match) => {
        // Preserve capitalization of first character
        if (replacement.length === 0) return replacement;
        if (match[0] === match[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }
  }

  // Clean up punctuation (em-dashes → commas)
  // Handle em-dash with optional surrounding spaces
  cleaned = cleaned.replace(/\s*\u2014\s*/g, ", ");
  cleaned = cleaned.replace(/\s*---\s*/g, ", ");
  // Double-dash requires spaces on both sides to avoid false positives
  // (e.g., CLI flags like --verbose, version ranges, comment syntax)
  cleaned = cleaned.replace(/\s+--\s+/g, ", ");

  // Clean up double spaces that may result from replacements
  cleaned = cleaned.replace(/ {2,}/g, " ").trim();

  return {
    text: cleaned,
    replacedPhrases,
    replacementCount,
  };
}

/**
 * Apply AI phrase cleanup to all sections of a tailor result.
 *
 * @param sections - Array of resume sections with title and content
 * @returns Cleaned sections and aggregate cleanup stats
 */
export function cleanSections(
  sections: { title: string; content: string }[]
): {
  sections: { title: string; content: string }[];
  totalReplacements: number;
  allReplacedPhrases: string[];
} {
  const allReplacedPhrases: string[] = [];
  let totalReplacements = 0;

  const cleanedSections = sections.map((section) => {
    const result = cleanAiPhrases(section.content);
    allReplacedPhrases.push(...result.replacedPhrases);
    totalReplacements += result.replacementCount;
    return { title: section.title, content: result.text };
  });

  // Deduplicate phrases
  const uniquePhrases = [...new Set(allReplacedPhrases)];

  return {
    sections: cleanedSections,
    totalReplacements,
    allReplacedPhrases: uniquePhrases,
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
