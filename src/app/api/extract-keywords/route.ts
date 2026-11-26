import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

/**
 * SECURITY NOTE: This endpoint is intentionally public (no auth required).
 * Unauthenticated users need keyword extraction for the preview flow before
 * they sign up. It is protected by IP-based rate limiting (10 req/min) to
 * prevent abuse of the underlying Azure OpenAI API call.
 */

const rateLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export type KeywordCategory = "technical" | "domain" | "soft";

export interface KeywordItem {
  term: string;
  category: KeywordCategory;
  required: boolean;
}

const API_VERSION = "2025-01-01-preview";

const SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) keyword extractor. Your job is to extract ONLY the keywords and phrases from a job description that a resume should contain to pass ATS screening, categorized and labeled by how critical they are.

## What to extract
- **Technical skills:** Programming languages, frameworks, libraries, tools (React, Python, Docker, Kubernetes, etc.)
- **Technologies & platforms:** AWS, Azure, GCP, Salesforce, SAP, etc.
- **Methodologies:** Agile, Scrum, CI/CD, TDD, DevOps, etc.
- **Domain-specific terms:** Terms specific to the industry or role (e.g., "payroll", "HRIS", "compliance", "underwriting", "federated login")
- **Certifications:** PMP, AWS Certified, CPA, etc.
- **Soft skills that are measurable:** "cross-functional collaboration", "stakeholder management", "mentoring"
- **Job-specific requirements:** "distributed systems", "microservices", "API design", "system design"

## What to EXCLUDE
- The job title itself (e.g. if the posting is for "Senior Backend Engineer", do not extract "senior backend engineer" or "backend engineer")
- Generic terms like "software development", "problem solving", "best practices"
- Company names and brand names (Google, Deel, Forbes, etc.)
- Numbers, statistics, revenue figures (11.2, 150+, $4B, etc.)
- Generic English words (ago, alone, among, truly, nearly, etc.)
- Marketing fluff (fastest-growing, world-class, revolutionary, etc.)
- Job posting boilerplate (we're hiring, apply now, equal opportunity, etc.)
- Benefits and perks (health insurance, stock options, PTO, etc.)
- Location names (unless relevant as a skill like "remote")
- Words that appear in literally every resume (managed, developed, led, built, etc.)

## Categorization
Each keyword must be labeled with:
- "category": one of
  - "technical" — programming languages, frameworks, libraries, tools, platforms, certifications
  - "domain" — industry/role-specific terms, methodologies, job-specific requirements
  - "soft" — measurable soft skills (collaboration, communication, mentoring, stakeholder management)
- "required": true if the job description marks the term as required, must-have, or core to the role; false if it's listed as nice-to-have, a plus, or preferred-but-optional. When the posting doesn't distinguish, use your judgment based on how central the term is to the role's core responsibilities.

## Output
Return a JSON object with a single "keywords" array of objects, each shaped like:
{ "term": string, "category": "technical" | "domain" | "soft", "required": boolean }
Keep multi-word phrases together (e.g., "state management" not "state" + "management"). Use lowercase for "term" except for recognized proper nouns/acronyms that are conventionally capitalized (e.g. "GraphQL", "AWS").
Extract at least 35 keywords. Be thorough — include variations when they exist (e.g., both "React" and "React.js", both "CI/CD" and "continuous integration").
Aim for 35-60 keywords. Cover as many of the categories above as clearly appear in the job description. Do NOT invent keywords for categories that are not supported by the text.

Example output:
{"keywords": [
  { "term": "Ruby on Rails", "category": "technical", "required": true },
  { "term": "AWS", "category": "technical", "required": true },
  { "term": "Docker", "category": "technical", "required": false },
  { "term": "federated login", "category": "domain", "required": true },
  { "term": "microservices", "category": "domain", "required": false },
  { "term": "stakeholder management", "category": "soft", "required": false },
  { "term": "mentoring", "category": "soft", "required": false }
]}`;

function buildAzureUrl(endpoint: string, deployment: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${API_VERSION}`;
}

export async function POST(request: NextRequest) {
  // Rate limiting — 10 requests per minute per IP
  const clientIp = getClientIp(request);
  const rateLimitResult = rateLimiter.check(clientIp);
  if (!rateLimitResult.allowed) {
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

  const b = body as Record<string, unknown>;
  if (!b || typeof b.jobDescription !== "string" || b.jobDescription.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required field: jobDescription" },
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

  const MAX_INPUT_LENGTH = 20_000;
  if (b.jobDescription.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `Job description too large (max ${MAX_INPUT_LENGTH.toLocaleString()} characters).` },
      { status: 400 }
    );
  }

  const url = buildAzureUrl(endpoint, deployment);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extract the ATS-relevant keywords from this job description:\n\n${b.jobDescription}` },
        ],
        temperature: 0.3,
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

    let parsed: { keywords: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse keyword extraction response" },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed.keywords)) {
      return NextResponse.json(
        { error: "Invalid keyword extraction response" },
        { status: 502 }
      );
    }

    // Normalize: validate shape, normalize term casing/whitespace, dedupe
    // (case-insensitively) while keeping category/required metadata intact.
    const seen = new Set<string>();
    const keywords: KeywordItem[] = [];
    for (const raw of parsed.keywords) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      if (typeof item.term !== "string") continue;
      const term = item.term.trim().replace(/\s+/g, " ");
      if (term.length === 0) continue;
      const category: KeywordCategory =
        item.category === "technical" || item.category === "domain" || item.category === "soft"
          ? item.category
          : "domain";
      const required = item.required === true;
      const dedupeKey = term.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      keywords.push({ term, category, required });
    }
    keywords.sort((a, b) => a.term.localeCompare(b.term));

    return NextResponse.json({ keywords });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
