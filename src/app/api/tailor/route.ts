import { NextRequest, NextResponse } from "next/server";
import { cleanSections, cleanAiPhrases } from "@/lib/ai-phrase-cleaner";
import { extractKeywords, calculateMatchScore } from "@/lib/keyword-matcher";
import { curveScore } from "@/lib/score-curve";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { validateTailoredResume } from "@/lib/resume-validator";

const rateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
const globalLimiter = createRateLimiter({ limit: 50, windowMs: 60_000 });

const API_VERSION = "2025-01-01-preview";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a resume editor. Your job is to make an existing resume easier for a recruiter at the target company to say yes to, without changing what the candidate actually did.

## 1. Facts come only from the candidate
A "fact" is: employer, title, dates, product, feature, technology, scope, number, or level of responsibility (contributed / built / owned / led).
- Use only facts present in <original_resume> or <confirmed_facts>.
- Never add a fact, never upgrade one ("contributed" → "led", "worked on" → "owned"), and never generalize into a claim the original does not support (e.g. "ensured compliance", "protected sensitive data").
- Never invent or estimate numbers. Keep numbers that already exist.

## 2. Keywords: only where already true
- You may use a term from the job description only if the original already supports it — the same skill, or a clear synonym (e.g. original says "Jest and Playwright", JD says "automated testing" → OK).
- Each JD term may appear at most 2 times in the whole resume.
- Do not rewrite a bullet just to add a keyword. If a bullet is already clear and specific, return it unchanged.
- JD terms the resume does not support go into "missingKeywords" with a short question for the candidate. They never go into the resume.

## 3. Tailoring = selection and order
- Keep every job and every bullet from the original (do not drop content).
- Within each job, put the bullets most relevant to the JD first.
- Reorder skills so the JD-relevant ones lead each line. Group skills by real category (Languages, Frontend, Backend & Cloud, Testing, Tools). Never create categories like "Concepts", "Core Competencies", or "Soft Skills".
- The summary may emphasize the parts of the candidate's background most relevant to the JD.

## 4. Writing style
Write like a senior engineer describing their own work: plain, specific, verifiable.
- Each bullet: what was built or done + how (technology/approach) + result or purpose, but include a result only if the original states one.
- Max ~30 words per bullet. Start with a concrete verb (Built, Shipped, Migrated, Fixed, Designed). Use present tense for the current job, past tense for past jobs.
- Do not end bullets with a tacked-on participle clause ("..., enhancing X", "..., ensuring Y", "..., driving Z").
- Do not repeat the same noun phrase across bullets.
- Banned words and phrases: passionate, accomplished, results-driven, self-directed, self-starter, dynamic, seasoned, spearheaded, leveraged, utilized, cutting-edge, robust, seamless, synergy, best practices, ensuring compliance, team player, strong communication skills, fast-paced environment.

## 5. Summary
2–3 sentences, max 60 words.
1. Role + years of experience + core stack.
2. What the candidate does now, with concrete products/features.
3. (Optional) One line of relevant earlier experience.
No personality claims or soft-skill claims.

## 6. Self-check before answering
Before producing output, check every revised line:
- Does every fact appear in the original or confirmed facts?
- Is any JD term used more than twice?
- Does any banned phrase or tacked-on clause appear?
Fix any violation before output.

## 7. Output
Return only JSON matching this shape:
{
  "jobTitle": string,
  "personalInfo": {
    "fullName": string,
    "email": string,
    "phone": string,
    "location": string,
    "linkedin": string
  },
  "sections": [
    { "title": string, "content": string }
  ],
  "coverLetter": string,
  "changes": [
    { "section": string, "original": string, "revised": string, "reason": string, "jdTermsUsed": string[] }
  ],
  "missingKeywords": [
    { "term": string, "question": string }
  ]
}
- "personalInfo": extract fullName, email, phone, location, and linkedin from <original_resume> only — never from the job description. Omit any field that is not present in the resume. "location" is city/province/country only (no street address).
- "jobTitle": the exact title stated in the job description. Omit this field entirely if the job description does not clearly state a title. Never guess or infer one.
- Each section's "content" is plain text with newlines (no markdown lists). Experience entries use this exact format: "**Company Name** — Role Title (Date Range)" on its own line, followed by bullets that each start with "• ".
- Omit the "coverLetter" field entirely unless a cover letter was requested. Never return it as null.
- "changes" lists only lines you actually modified. "reason" is one short sentence.`;

interface TailorRequest {
  resume: string;
  jobDescription: string;
  generateCoverLetter: boolean;
  targetKeywords?: string[];
  confirmedFacts?: string;
}

function validateRequest(
  body: unknown
): body is TailorRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const baseValid =
    typeof b.resume === "string" &&
    b.resume.trim().length > 0 &&
    typeof b.jobDescription === "string" &&
    b.jobDescription.trim().length > 0 &&
    typeof b.generateCoverLetter === "boolean";
  if (!baseValid) return false;

  if ("targetKeywords" in b && b.targetKeywords !== undefined) {
    if (!Array.isArray(b.targetKeywords)) return false;
    if (b.targetKeywords.some((k: unknown) => typeof k !== "string")) return false;
  }

  if ("confirmedFacts" in b && b.confirmedFacts !== undefined) {
    if (typeof b.confirmedFacts !== "string") return false;
  }
  return true;
}

function buildUserPrompt(
  resume: string,
  jobDescription: string,
  generateCoverLetter: boolean,
  targetKeywords?: string[],
  confirmedFacts?: string
): string {
  const keywords = targetKeywords && targetKeywords.length > 0
    ? targetKeywords.join(", ")
    : "None";

  const facts = confirmedFacts && confirmedFacts.trim().length > 0
    ? confirmedFacts.trim()
    : "None";

  const coverLetterInstruction = generateCoverLetter
    ? 'Cover letter: max 200 words, 3 short paragraphs, same fact rules as above, no opening line like "I am excited to apply".'
    : "Do NOT include a coverLetter field in the output.";

  return `<original_resume>
${resume}
</original_resume>

<job_description>
${jobDescription}
</job_description>

<confirmed_facts>
${facts}
</confirmed_facts>

<target_keywords>
${keywords}
Use these only if the original resume or confirmed facts support them. Otherwise put them in missingKeywords.
</target_keywords>

Include cover letter: ${generateCoverLetter}

${coverLetterInstruction}

Return only the JSON object.`;
}

function buildAzureUrl(endpoint: string, deployment: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${API_VERSION}`;
}

interface Change {
  section: string;
  original: string;
  revised: string;
  reason: string;
  jdTermsUsed: string[];
}

interface MissingKeyword {
  term: string;
  question: string;
}

interface ParsedResult {
  jobTitle?: string;
  personalInfo?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  sections: { title: string; content: string }[];
  coverLetter?: string;
  changes?: Change[];
  missingKeywords?: MissingKeyword[];
}

async function callAzureOpenAI(
  endpoint: string,
  apiKey: string,
  deployment: string,
  userPrompt: string
): Promise<NextResponse | ParsedResult> {
  const url = buildAzureUrl(endpoint, deployment);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      top_p: 1,
      response_format: { type: "json_object" },
    }),
  });

  if (response.status === 429) {
    return NextResponse.json(
      { error: "Rate limited — please wait a moment and try again" },
      { status: 429 }
    );
  }

  if (!response.ok) {
    await response.text();
    return NextResponse.json(
      { error: `Azure OpenAI API error (${response.status})` },
      { status: 502 }
    );
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    return NextResponse.json(
      { error: "Unexpected response from Azure OpenAI" },
      { status: 502 }
    );
  }

  return parseAndValidateResponse(text);
}

function parseAndValidateResponse(text: string): NextResponse | ParsedResult {
  let parsed: ParsedResult;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse AI response" },
      { status: 502 }
    );
  }

  if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    return NextResponse.json(
      { error: "AI returned invalid resume structure" },
      { status: 502 }
    );
  }

  const hasInvalidSection = parsed.sections.some(
    (section) =>
      !section ||
      typeof section.title !== "string" ||
      typeof section.content !== "string"
  );

  const hasInvalidCoverLetter =
    "coverLetter" in parsed &&
    parsed.coverLetter !== undefined &&
    typeof parsed.coverLetter !== "string";

  const hasInvalidJobTitle =
    "jobTitle" in parsed &&
    parsed.jobTitle !== undefined &&
    typeof parsed.jobTitle !== "string";

  const hasInvalidPersonalInfo = (() => {
    if (!("personalInfo" in parsed) || parsed.personalInfo === undefined) return false;
    if (typeof parsed.personalInfo !== "object" || parsed.personalInfo === null) return true;
    const info = parsed.personalInfo;
    const fields = [info.fullName, info.email, info.phone, info.location, info.linkedin];
    return fields.some((f) => f !== undefined && typeof f !== "string");
  })();

  if (hasInvalidSection || hasInvalidCoverLetter || hasInvalidJobTitle || hasInvalidPersonalInfo) {
    return NextResponse.json(
      { error: "AI returned invalid resume structure" },
      { status: 502 }
    );
  }

  const cleanedResult = cleanSections(parsed.sections);
  parsed.sections = cleanedResult.sections;

  if (parsed.coverLetter) {
    const cleanedCoverLetter = cleanAiPhrases(parsed.coverLetter);
    parsed.coverLetter = cleanedCoverLetter.text;
  }

  if (Array.isArray(parsed.changes)) {
    parsed.changes = parsed.changes
      .filter(
        (c): c is Change =>
          !!c &&
          typeof c === "object" &&
          typeof c.section === "string" &&
          typeof c.original === "string" &&
          typeof c.revised === "string" &&
          typeof c.reason === "string"
      )
      .map((c) => ({
        ...c,
        jdTermsUsed: Array.isArray(c.jdTermsUsed)
          ? c.jdTermsUsed.filter((t): t is string => typeof t === "string")
          : [],
      }));
  } else {
    delete parsed.changes;
  }

  if (Array.isArray(parsed.missingKeywords)) {
    parsed.missingKeywords = parsed.missingKeywords.filter(
      (m): m is MissingKeyword =>
        !!m &&
        typeof m === "object" &&
        typeof m.term === "string" &&
        typeof m.question === "string"
    );
  } else {
    delete parsed.missingKeywords;
  }

  return parsed;
}

interface MatchScores {
  beforeScore?: number;
  afterScore?: number;
}

/**
 * Compute before/after ATS match scores. Returns an empty object if scoring
 * fails — a successful tailoring must never be turned into a 500 by the
 * optional score calculation.
 */
function computeScores(
  result: ParsedResult,
  resume: string,
  jobDescription: string,
  targetKeywords?: string[]
): MatchScores {
  try {
    const cleanedKeywords = Array.isArray(targetKeywords)
      ? targetKeywords
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.toLowerCase().trim())
          .filter((k) => k.length > 0)
      : [];

    const jdKeywords =
      cleanedKeywords.length > 0
        ? new Set(cleanedKeywords)
        : extractKeywords(jobDescription);

    const realTailoredText = result.sections
      .map((s) => s?.content ?? "")
      .join("\n");

    const totalKw = jdKeywords.size;
    if (totalKw === 0) return { beforeScore: 0, afterScore: 0 };

    const beforeResult = calculateMatchScore(resume, jdKeywords);
    const afterResult = calculateMatchScore(realTailoredText, jdKeywords);

    return {
      beforeScore: curveScore(Math.round((beforeResult.matchCount / totalKw) * 100)),
      afterScore: curveScore(Math.round((afterResult.matchCount / totalKw) * 100)),
    };
  } catch (err) {
    console.debug(
      "[api/tailor] score computation failed, returning result without scores",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    );
    return {};
  }
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const globalCheck = globalLimiter.check(clientIp);
  if (!globalCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!validateRequest(body)) {
    return NextResponse.json(
      { error: "Missing required fields: resume, jobDescription, generateCoverLetter" },
      { status: 400 }
    );
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    return NextResponse.json(
      { error: "Azure OpenAI is not configured. Please contact the administrator." },
      { status: 503 }
    );
  }

  const MAX_RESUME_LENGTH = 50_000;
  const MAX_JD_LENGTH = 20_000;
  if (body.resume.length > MAX_RESUME_LENGTH) {
    return NextResponse.json(
      { error: `Resume too large (max ${MAX_RESUME_LENGTH.toLocaleString()} characters).` },
      { status: 400 }
    );
  }
  if (body.jobDescription.length > MAX_JD_LENGTH) {
    return NextResponse.json(
      { error: `Job description too large (max ${MAX_JD_LENGTH.toLocaleString()} characters).` },
      { status: 400 }
    );
  }

  const { resume, jobDescription, generateCoverLetter, targetKeywords, confirmedFacts } = body;
  const userPrompt = buildUserPrompt(resume, jobDescription, generateCoverLetter, targetKeywords, confirmedFacts);

  const rateLimitResult = rateLimiter.check(clientIp);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const result = await callAzureOpenAI(endpoint, apiKey, deployment, userPrompt);

    if (result instanceof NextResponse) {
      return result;
    }

    // Scoring is a nice-to-have: never fail a successful tailoring because of it.
    const scores = computeScores(result, resume, jobDescription, targetKeywords);

    let validation;
    try {
      const cleanedKeywords = Array.isArray(targetKeywords)
        ? targetKeywords.filter((k): k is string => typeof k === "string")
        : Array.from(extractKeywords(jobDescription));
      validation = validateTailoredResume(resume, result.sections, cleanedKeywords);
    } catch (err) {
      console.debug(
        "[api/tailor] validation computation failed, omitting validation field",
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      );
    }

    return NextResponse.json({ ...result, ...scores, validation });
  } catch (err) {
    console.debug(
      "[api/tailor] unhandled failure",
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err)
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
