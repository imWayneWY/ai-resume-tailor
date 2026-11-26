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

/**
 * Filters supportedKeywords down to only those whose evidence quote appears
 * verbatim (after normalization) in the original resume text. Malformed
 * entries are dropped silently rather than throwing.
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
    if (normalizedResume.includes(normalizedEvidence)) {
      verified.push({ term, evidence });
    }
  }

  return {
    verified,
    verifiedTerms: verified.map((v) => v.term),
  };
}
