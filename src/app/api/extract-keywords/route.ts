import { NextRequest, NextResponse } from "next/server";

const API_VERSION = "2025-01-01-preview";

const SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) keyword extractor. Your job is to extract ONLY the keywords and phrases from a job description that a resume should contain to pass ATS screening.

## What to extract
- **Technical skills:** Programming languages, frameworks, libraries, tools (React, Python, Docker, Kubernetes, etc.)
- **Technologies & platforms:** AWS, Azure, GCP, Salesforce, SAP, etc.
- **Methodologies:** Agile, Scrum, CI/CD, TDD, DevOps, etc.
- **Domain-specific terms:** Terms specific to the industry or role (e.g., "payroll", "HRIS", "compliance", "underwriting")
- **Certifications:** PMP, AWS Certified, CPA, etc.
- **Soft skills that are measurable:** "cross-functional collaboration", "stakeholder management", "mentoring"
- **Job-specific requirements:** "distributed systems", "microservices", "API design", "system design"

## What to EXCLUDE
- Company names and brand names (Google, Deel, Forbes, etc.)
- Numbers, statistics, revenue figures (11.2, 150+, $4B, etc.)
- Generic English words (ago, alone, among, truly, nearly, etc.)
- Marketing fluff (fastest-growing, world-class, revolutionary, etc.)
- Job posting boilerplate (we're hiring, apply now, equal opportunity, etc.)
- Benefits and perks (health insurance, stock options, PTO, etc.)
- Location names (unless relevant as a skill like "remote")
- Words that appear in literally every resume (managed, developed, led, built, etc.)

## Output
Return a JSON object with a single "keywords" array containing the extracted keywords/phrases in lowercase.
Keep multi-word phrases together (e.g., "state management" not "state" + "management").
Aim for 15-40 keywords — enough to be comprehensive but not so many that noise creeps in.
Sort alphabetically.

Example output:
{"keywords": ["agile", "api design", "aws", "ci/cd", "distributed systems", "docker", "graphql", "kubernetes", "microservices", "node.js", "postgresql", "react", "redis", "rest api", "typescript"]}`;

function buildAzureUrl(endpoint: string, deployment: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${API_VERSION}`;
}

export async function POST(request: NextRequest) {
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
      { error: "Azure OpenAI is not configured." },
      { status: 503 }
    );
  }

  const MAX_INPUT_LENGTH = 50_000;
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

    let parsed: { keywords: string[] };
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

    // Normalize: lowercase, trim, deduplicate
    const keywords = [...new Set(
      parsed.keywords
        .map((k: string) => (typeof k === "string" ? k.toLowerCase().trim() : ""))
        .filter((k: string) => k.length > 0)
    )].sort();

    return NextResponse.json({ keywords });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
