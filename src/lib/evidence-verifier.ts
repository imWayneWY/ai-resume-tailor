/**
 * Verifies evidence quotes the tailoring model claims support a "supported"
 * keyword. A supported-keyword claim is only trustworthy if the quoted
 * evidence appears verbatim (after normalization) in the candidate's
 * original resume text — otherwise it's discarded rather than trusted.
 */

export interface SupportedKeyword {
  term: string;
  evidence: string;
}

/** Lowercase + collapse whitespace, for forgiving substring comparison. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Minimum normalized evidence length (characters) to be considered trustworthy. */
const MIN_EVIDENCE_CHARS = 20;
/** Minimum normalized evidence length (words) to be considered trustworthy. */
const MIN_EVIDENCE_WORDS = 4;

/**
 * An evidence quote must be substantial enough to actually demonstrate the
 * claim — trivial quotes like "react" or "a" are rejected even though they
 * may appear verbatim in the resume.
 */
function isSubstantialEvidence(normalizedEvidence: string): boolean {
  if (normalizedEvidence.length >= MIN_EVIDENCE_CHARS) return true;
  const wordCount = normalizedEvidence.split(" ").filter(Boolean).length;
  return wordCount >= MIN_EVIDENCE_WORDS;
}

/**
 * Filters supportedKeywords down to only those whose evidence quote appears
 * verbatim (after normalization) in the original resume text and is long
 * enough (>= 4 words or 20 characters after normalization) to actually
 * demonstrate the claim. Malformed or too-short entries are dropped silently
 * rather than throwing. Note: this only verifies the quote exists in the
 * resume — it does not judge whether the quote is semantically relevant to
 * the term (synonym judgments still need a human check).
 */
export function verifySupportedKeywords(
  originalResume: string,
  supportedKeywords: SupportedKeyword[]
): { verified: SupportedKeyword[]; verifiedTerms: string[] } {
  const normalizedResume = normalize(originalResume);
  const verified: SupportedKeyword[] = [];

  for (const entry of supportedKeywords) {
    if (!entry || typeof entry.term !== "string" || typeof entry.evidence !== "string") {
      continue;
    }
    const term = entry.term.trim();
    const evidence = entry.evidence.trim();
    if (!term || !evidence) continue;

    const normalizedEvidence = normalize(evidence);
    if (normalizedEvidence.length === 0) continue;
    if (!isSubstantialEvidence(normalizedEvidence)) continue;
    if (normalizedResume.includes(normalizedEvidence)) {
      verified.push({ term, evidence });
    }
  }

  return {
    verified,
    verifiedTerms: verified.map((v) => v.term),
  };
}
