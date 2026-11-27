"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import FitSummary, { type FitSummaryKeyword } from "@/components/FitSummary";
import MissingKeywords, { type MissingKeywordItem, type ConfirmedFactEntry } from "@/components/MissingKeywords";
import ResumeTrackChanges from "@/components/ResumeTrackChanges";

export interface Section {
  title: string;
  content: string;
}

/** Normalizes all line endings to `\n` so splitIntoUnits/diff-utils never has to deal with CRLF offset drift. */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

interface Change {
  section: string;
  original: string;
  revised: string;
  reason: string;
  jdTermsUsed: string[];
}

interface ValidationResult {
  bannedPhraseHits: { phrase: string; context: string }[];
  tackedOnClauseHits: { clause: string; context: string }[];
  overusedKeywords: { term: string; count: number }[];
  newNumbers: string[];
  newProperNouns: string[];
  droppedSkills: string[];
  skillsSectionNotFound: boolean;
}

/**
 * Surfaces the deterministic guardrail checks run against the AI's output
 * right after generation. This is a check of what the model produced, not
 * of any manual edits made afterward in the Resume block.
 */
function GeneratedContentChecks({ validation }: { validation: ValidationResult }) {
  const hasAnyHits =
    validation.bannedPhraseHits.length > 0 ||
    validation.tackedOnClauseHits.length > 0 ||
    validation.overusedKeywords.length > 0 ||
    validation.newNumbers.length > 0 ||
    validation.newProperNouns.length > 0 ||
    validation.droppedSkills.length > 0 ||
    validation.skillsSectionNotFound;

  if (!hasAnyHits) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
        Generated content checks
      </h2>
      <p className="mb-4 text-xs text-muted">
        Automated checks run on the AI&apos;s output right after it was generated.
        These do not reflect any manual edits you make below.
      </p>

      {validation.skillsSectionNotFound && (
        <div className="mb-3 rounded-md border border-error-border bg-error-bg p-2">
          <p className="text-xs font-semibold text-error-text">
            ⚠ Couldn&apos;t locate the Skills section to verify skills
          </p>
        </div>
      )}

      {validation.droppedSkills.length > 0 && (
        <div className="mb-3 rounded-md border border-error-border bg-error-bg p-2">
          <p className="mb-1 text-xs font-semibold text-error-text">
            ⚠ Dropped skills — present in the original but missing from the tailored resume
          </p>
          <ul className="flex flex-wrap gap-2">
            {validation.droppedSkills.map((skill, i) => (
              <li
                key={i}
                className="rounded-full border border-error-border bg-error-bg px-2 py-0.5 text-xs font-medium text-error-text"
              >
                {skill}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.bannedPhraseHits.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-muted">Banned phrases</p>
          <ul className="flex flex-col gap-1">
            {validation.bannedPhraseHits.map((hit, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-error-text">{hit.phrase}</span>
                <span className="text-muted"> — &quot;{hit.context}&quot;</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.tackedOnClauseHits.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-muted">Tacked-on clauses</p>
          <ul className="flex flex-col gap-1">
            {validation.tackedOnClauseHits.map((hit, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-error-text">{hit.clause}</span>
                <span className="text-muted"> — &quot;{hit.context}&quot;</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.overusedKeywords.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-muted">Overused keywords</p>
          <ul className="flex flex-col gap-1">
            {validation.overusedKeywords.map((kw, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-error-text">{kw.term}</span>
                <span className="text-muted"> — used {kw.count} times</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.newNumbers.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-muted">New numbers not in the original resume</p>
          <ul className="flex flex-wrap gap-2">
            {validation.newNumbers.map((n, i) => (
              <li key={i} className="rounded-full border border-error-border bg-error-bg px-2 py-0.5 text-xs text-error-text">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.newProperNouns.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">New proper nouns not in the original resume</p>
          <ul className="flex flex-wrap gap-2">
            {validation.newProperNouns.map((n, i) => (
              <li key={i} className="rounded-full border border-error-border bg-error-bg px-2 py-0.5 text-xs text-error-text">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
}

interface TailorResult {
  sections: Section[];
  coverLetter?: string;
  jobTitle?: string;
  personalInfo?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  beforeScore?: number;
  afterScore?: number;
  // Kept for reason-lookup purposes only (the model's self-reported list of
  // changes) — diffs themselves are computed directly from original vs.
  // tailored text, not from this array, since it's known to be incomplete.
  changes?: Change[];
  missingKeywords?: MissingKeywordItem[];
  supportedKeywords?: { term: string; evidence: string }[];
  verifiedSupportedKeywords?: { term: string; evidence: string }[];
  validation?: {
    bannedPhraseHits: { phrase: string; context: string }[];
    tackedOnClauseHits: { clause: string; context: string }[];
    overusedKeywords: { term: string; count: number }[];
    newNumbers: string[];
    newProperNouns: string[];
    droppedSkills: string[];
    skillsSectionNotFound: boolean;
  };
}

function normalizeValidation(
  validation:
    | {
        bannedPhraseHits?: { phrase: string; context: string }[];
        tackedOnClauseHits?: { clause: string; context: string }[];
        overusedKeywords?: { term: string; count: number }[];
        newNumbers?: string[];
        newProperNouns?: string[];
        droppedSkills?: string[];
        skillsSectionNotFound?: boolean;
      }
    | undefined
): TailorResult["validation"] {
  if (!validation) return undefined;
  return {
    bannedPhraseHits: Array.isArray(validation.bannedPhraseHits) ? validation.bannedPhraseHits : [],
    tackedOnClauseHits: Array.isArray(validation.tackedOnClauseHits) ? validation.tackedOnClauseHits : [],
    overusedKeywords: Array.isArray(validation.overusedKeywords) ? validation.overusedKeywords : [],
    newNumbers: Array.isArray(validation.newNumbers) ? validation.newNumbers : [],
    newProperNouns: Array.isArray(validation.newProperNouns) ? validation.newProperNouns : [],
    droppedSkills: Array.isArray(validation.droppedSkills) ? validation.droppedSkills : [],
    skillsSectionNotFound: validation.skillsSectionNotFound === true,
  };
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<TailorResult | null>(null);
  const [editableSections, setEditableSections] = useState<Section[]>([]);
  const [originalResume, setOriginalResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [coverLetterExpanded, setCoverLetterExpanded] = useState(false);
  const [llmKeywords, setLlmKeywords] = useState<FitSummaryKeyword[] | undefined>(
    undefined
  );
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
  });
  const [jobTitle, setJobTitle] = useState("");
  const [singlePage, setSinglePage] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const pdfGeneratingRef = useRef(false);
  const missingKeywordsRef = useRef<HTMLDivElement>(null);
  const scrollToMissingKeywords = useCallback(() => {
    missingKeywordsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState("");
  // Accumulated confirmations across all regeneration rounds, keyed by term
  // (lowercased, trimmed) so earlier rounds' explanations aren't lost when a
  // later round sends its own confirmations. Both the confirmedFacts prompt
  // text and the confirmedKeywords used for scoring are derived from this
  // single source of truth.
  const [confirmedFactsMap, setConfirmedFactsMap] = useState<Map<string, string>>(new Map());
  const confirmedKeywords = useMemo(() => Array.from(confirmedFactsMap.keys()), [confirmedFactsMap]);

  useEffect(() => {
    const stored = sessionStorage.getItem("tailorResult");
    if (!stored) {
      router.replace("/tailor");
      return;
    }

    try {
      const parsed: TailorResult = JSON.parse(stored);
      if (
        !Array.isArray(parsed.sections) ||
        parsed.sections.length === 0 ||
        parsed.sections.some(
          (s) =>
            !s ||
            typeof s.title !== "string" ||
            typeof s.content !== "string"
        )
      ) {
        router.replace("/tailor");
        return;
      }
      parsed.validation = normalizeValidation(parsed.validation);
      setResult(parsed);
      setEditableSections(parsed.sections.map((s) => ({ ...s, content: normalizeLineEndings(s.content) })));
      setOriginalResume(normalizeLineEndings(sessionStorage.getItem("tailorOriginalResume") || ""));
      setJobDescription(sessionStorage.getItem("tailorJobDescription") || "");

      if (typeof parsed.jobTitle === "string" && parsed.jobTitle.trim()) {
        setJobTitle(parsed.jobTitle.trim());
      }

      const llmInfo = parsed.personalInfo || {};
      setPersonalInfo({
        fullName: llmInfo.fullName || "",
        email: llmInfo.email || "",
        phone: llmInfo.phone || "",
        location: llmInfo.location || "",
        linkedin: llmInfo.linkedin || "",
      });

      const storedKeywords = sessionStorage.getItem("tailorLlmKeywords");
      if (storedKeywords) {
        try {
          const parsedKeywords = JSON.parse(storedKeywords);
          if (Array.isArray(parsedKeywords)) {
            const normalized: FitSummaryKeyword[] = [];
            for (const entry of parsedKeywords) {
              if (typeof entry === "string") {
                normalized.push({ term: entry, category: "domain", required: false });
              } else if (
                entry &&
                typeof entry === "object" &&
                typeof (entry as { term?: unknown }).term === "string"
              ) {
                const e = entry as { term: string; category?: unknown; required?: unknown };
                const category =
                  e.category === "technical" || e.category === "domain" || e.category === "soft"
                    ? e.category
                    : "domain";
                normalized.push({
                  term: e.term,
                  category,
                  required: e.required === true,
                });
              }
              // anything else (malformed objects without a string term) is dropped
            }
            setLlmKeywords(normalized);
          }
        } catch {
          // Fall back to regex extraction
        }
      }
    } catch {
      router.replace("/tailor");
    }
  }, [router]);

  const handleRegenerate = useCallback(
    async (confirmedEntries: ConfirmedFactEntry[]) => {
      setRegenerateError("");
      setIsRegenerating(true);
      // Merge this round's confirmations into the accumulated map so earlier
      // rounds' explanations aren't lost on subsequent regenerations.
      const mergedMap = new Map(confirmedFactsMap);
      for (const { term, explanation } of confirmedEntries) {
        if (term) mergedMap.set(term, explanation);
      }
      setConfirmedFactsMap(mergedMap);
      const confirmedFacts = Array.from(mergedMap.entries())
        .map(([term, explanation]) => `- ${term}: ${explanation}`)
        .join("\n");
      try {
        const requestBody: Record<string, unknown> = {
          resume: originalResume,
          jobDescription,
          generateCoverLetter: !!result?.coverLetter,
          confirmedFacts,
        };
        if (llmKeywords) {
          requestBody.targetKeywords = llmKeywords
            .filter((k) => k.category !== "soft")
            .map((k) => k.term);
        }

        const response = await fetch("/api/tailor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();

        let data: TailorResult | null = null;
        if (contentType.includes("application/json") && text) {
          try {
            data = JSON.parse(text);
          } catch {
            // JSON parsing failed
          }
        }

        if (!response.ok || !data) {
          setRegenerateError("Failed to regenerate. Please try again.");
          return;
        }

        data.validation = normalizeValidation(data.validation);
        setResult(data);
        setEditableSections(data.sections.map((s) => ({ ...s, content: normalizeLineEndings(s.content) })));
        sessionStorage.setItem("tailorResult", JSON.stringify(data));

        if (typeof data.jobTitle === "string" && data.jobTitle.trim()) {
          setJobTitle(data.jobTitle.trim());
        }
        const info = data.personalInfo || {};
        setPersonalInfo({
          fullName: info.fullName || "",
          email: info.email || "",
          phone: info.phone || "",
          location: info.location || "",
          linkedin: info.linkedin || "",
        });
      } catch {
        setRegenerateError("Network error — please check your connection and try again.");
      } finally {
        setIsRegenerating(false);
      }
    },
    [originalResume, jobDescription, result, llmKeywords, confirmedFactsMap]
  );

  useEffect(() => {
    if (editableSections.length === 0) return;
    const stored = sessionStorage.getItem("tailorResult");
    if (!stored) return;
    try {
      const current: TailorResult = JSON.parse(stored);
      current.sections = editableSections;
      current.jobTitle = jobTitle;
      current.personalInfo = personalInfo;
      sessionStorage.setItem("tailorResult", JSON.stringify(current));
    } catch {
      // ignore
    }
  }, [editableSections, jobTitle, personalInfo]);

  const handleDownloadPdf = async () => {
    if (pdfGeneratingRef.current) return;
    pdfGeneratingRef.current = true;
    setPdfGenerating(true);
    setPdfError("");
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { default: ResumePdf } = await import(
        "@/components/ResumePdf"
      );

      const blob = await pdf(
        <ResumePdf
          sections={editableSections}
          coverLetter={result?.coverLetter}
          personalInfo={personalInfo}
          jobTitle={jobTitle}
          singlePage={singlePage}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored-resume.pdf";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 0);
    } catch {
      setPdfError("Failed to generate PDF. Please try again.");
    } finally {
      pdfGeneratingRef.current = false;
      setPdfGenerating(false);
    }
  };

  if (!result) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <p className="text-center text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Top bar */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Tailored Resume
          </h1>
          <p className="mt-1 text-sm text-muted sm:text-base">
            Review and edit your tailored resume below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="single-page-toggle"
            className="flex cursor-pointer items-center gap-2 text-sm text-muted"
          >
            <input
              id="single-page-toggle"
              type="checkbox"
              checked={singlePage}
              onChange={(e) => setSinglePage(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
            />
            Fit to one page
          </label>
          <button
            onClick={() => router.push("/tailor")}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface"
          >
            ← Back
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfGenerating ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* PDF error message */}
      <div aria-live="polite">
        {pdfError && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text sm:mb-8"
          >
            {pdfError}
          </div>
        )}
      </div>

      {/* Fit summary */}
      {originalResume && jobDescription && (
        <div className="mb-6 sm:mb-8">
          <FitSummary
            originalResume={originalResume}
            jobDescription={jobDescription}
            llmKeywords={llmKeywords}
            verifiedSupportedKeywords={result?.verifiedSupportedKeywords}
            missingKeywords={result?.missingKeywords}
            confirmedKeywords={confirmedKeywords}
            onReviewTerm={scrollToMissingKeywords}
          />
        </div>
      )}

      {/* Missing keywords review */}
      {result.missingKeywords && result.missingKeywords.length > 0 && (
        <div className="mb-6 sm:mb-8" ref={missingKeywordsRef}>
          <div aria-live="polite">
            {regenerateError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
              >
                {regenerateError}
              </div>
            )}
          </div>
          <MissingKeywords
            missingKeywords={result.missingKeywords}
            onRegenerate={handleRegenerate}
            isRegenerating={isRegenerating}
          />
        </div>
      )}

      {/* Generated content checks (only shown when there are issues/warnings) */}
      {result.validation && (
        <div className="mb-6 sm:mb-8">
          <GeneratedContentChecks validation={result.validation} />
        </div>
      )}

      {/* Personal info + job title (compact header form fields) */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="mb-2 block text-sm font-medium">Personal Information</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-fullName" className="sr-only">Full Name</label>
              <input
                id="edit-fullName"
                type="text"
                value={personalInfo.fullName}
                onChange={(e) =>
                  setPersonalInfo((prev) => ({ ...prev, fullName: e.target.value }))
                }
                placeholder="Full Name"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="edit-email" className="sr-only">Email</label>
              <input
                id="edit-email"
                type="email"
                value={personalInfo.email}
                onChange={(e) =>
                  setPersonalInfo((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Email"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="edit-phone" className="sr-only">Phone</label>
              <input
                id="edit-phone"
                type="tel"
                value={personalInfo.phone}
                onChange={(e) =>
                  setPersonalInfo((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="Phone"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="edit-location" className="sr-only">Location</label>
              <input
                id="edit-location"
                type="text"
                value={personalInfo.location}
                onChange={(e) =>
                  setPersonalInfo((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="Location"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="edit-linkedin" className="sr-only">LinkedIn</label>
              <input
                id="edit-linkedin"
                type="text"
                value={personalInfo.linkedin}
                onChange={(e) =>
                  setPersonalInfo((prev) => ({ ...prev, linkedin: e.target.value }))
                }
                placeholder="linkedin.com/in/johndoe"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <label htmlFor="jobTitle" className="mb-2 block text-sm font-medium">
            Target Job Title
          </label>
          <input
            id="jobTitle"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g., Senior Software Engineer"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Resume: unified track-changes block (replaces Review Changes + Preview + Edit Sections) */}
      <div className="mb-6 sm:mb-8">
        <ResumeTrackChanges
          sections={editableSections}
          originalResume={originalResume}
          changes={result.changes}
          onSectionsChange={setEditableSections}
        />
      </div>

      {/* Cover Letter */}
      {result.coverLetter && (
        <div className="mt-6 sm:mt-8">
          <button
            onClick={() => setCoverLetterExpanded(!coverLetterExpanded)}
            aria-expanded={coverLetterExpanded}
            className="flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${
                coverLetterExpanded ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Cover Letter
          </button>
          <div
            className="cover-letter-collapse mt-4"
            data-expanded={coverLetterExpanded}
          >
            <div>
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {result.coverLetter}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
