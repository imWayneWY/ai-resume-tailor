/**
 * Redacts text by replacing each word with a gibberish word of similar length.
 * Preserves formatting: line breaks, bullet points, indentation, and punctuation structure.
 */

// Random gibberish from a char pool (non-deterministic — fine since content is blurred anyway)
const CONSONANTS = "bcdfghjklmnpqrstvwxyz";
const VOWELS = "aeiou";

function gibberishWord(length: number): string {
  if (length <= 0) return "";
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    // Alternate consonant-vowel for pronounceable gibberish
    const pool = i % 2 === 0 ? CONSONANTS : VOWELS;
    chars.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return chars.join("");
}

export function redactText(text: string): string {
  // Replace each word while preserving whitespace, punctuation, and structure
  // The regex matches compound words (hyphenated, contractions, slash-separated)
  return text.replace(/[a-zA-Z]+(?:[''/-][a-zA-Z]+)*/g, (match) => {
    // Split on internal separators to preserve them (e.g., "self-taught" → ["self", "-", "taught"])
    const parts = match.split(/([''/-])/);
    return parts
      .map((part) => {
        // Preserve separators as-is
        if (/^[''/-]$/.test(part)) return part;
        // Replace each word part with gibberish, preserving first-char case
        const replacement = gibberishWord(part.length);
        if (part[0] === part[0].toUpperCase()) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
      })
      .join("");
  });
}

/**
 * Redacts all text content in a sections array while preserving structure.
 */
export function redactSections(
  sections: Array<{ title: string; content: string }>
): Array<{ title: string; content: string }> {
  return sections.map((section) => ({
    title: section.title, // Keep section titles — they're generic (Experience, Skills, etc.)
    content: redactText(section.content),
  }));
}

/**
 * Redacts personal info fields.
 */
export function redactPersonalInfo(info: {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
}): {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
} {
  return {
    fullName: info.fullName ? redactText(info.fullName) : info.fullName,
    email: info.email
      ? (() => {
          const tld = info.email.split(".").pop() || "com";
          return `${gibberishWord(6)}@${gibberishWord(5)}.${tld}`;
        })()
      : info.email,
    phone: info.phone ? "***-***-****" : info.phone,
    location: info.location ? redactText(info.location) : info.location,
    linkedin: info.linkedin ? "linkedin.com/in/********" : info.linkedin,
  };
}
