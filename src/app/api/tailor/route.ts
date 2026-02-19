import { NextRequest, NextResponse } from "next/server";
import { cleanSections, cleanAiPhrases } from "@/lib/ai-phrase-cleaner";

const API_VERSION = "2025-01-01-preview";

const SYSTEM_PROMPT = `You are an expert resume writer and ATS (Applicant Tracking System) optimizer. Your job is to deeply tailor a candidate's master resume to a specific job description.

## Core Principle
Every section of the resume must be actively tailored — not just the summary. A good tailoring should make someone reading the resume think "this person was made for this role."

## CRITICAL RULES

### Completeness — DO NOT TRUNCATE
- You MUST include EVERY job/role from the original resume. Count them. If the original has 5 jobs, the output must have 5 jobs.
- You MUST include ALL bullet points for each role — do not cut or drop any. You may rewrite, reorder, or condense wording, but every bullet must be represented.
- Missing experience entries = failed output. This is the most important rule.

### Summary / Profile
- Rewrite completely to address the specific role and company
- Lead with the most relevant experience and skills for THIS job
- Mirror the job's core requirements in the opening lines
- Weave in 3-5 key technical terms from the JD naturally

### Skills
- Reorder skills so the most relevant ones for the JD appear first
- Group skills to match the JD's categories when possible (e.g., if the JD lists "React, Node.js, TypeScript" prominently, lead with those)
- Include relevant skills from the resume that match JD keywords, even if they were listed less prominently in the original
- Do NOT add skills the candidate doesn't have

### Experience — REWRITE EVERY BULLET
- DO NOT copy bullets unchanged from the original resume. Every bullet should be actively rephrased.
- For each bullet point, identify at least one keyword or phrase from the JD that relates to the work described, and weave it in naturally.
- NEVER append JD keywords at the end of an existing bullet as a tacked-on phrase. This is the #1 mistake to avoid:
  ✗ BAD: "Led codebase migration from JS to TS, reducing errors, with a focus on collaborative development and knowledge sharing"
  ✗ BAD: "Built React components, leveraging cross-functional collaboration and driving engineering excellence"
  ✗ BAD: "Implemented new features for the platform, contributing to scalable architecture and system reliability"
  These all share the same anti-pattern: the original achievement is stated, then a comma or conjunction bolts on JD buzzwords that add no specific information.
  ✓ GOOD: "Led collaborative migration of codebase from JavaScript to TypeScript across 3 teams, reducing runtime errors by 40%"
  ✓ GOOD: "Partnered with design and product teams to build accessible React components, improving user engagement by 25%"
  ✓ GOOD: "Architected scalable microservices handling 10K+ requests/sec, improving system reliability to 99.9% uptime"
  In the good examples, keywords appear at the START or MIDDLE of the sentence as part of the core action — not tacked on at the end.
- THE KEY TEST: Remove the last clause after the final comma. If the bullet still makes complete sense, you probably just appended keywords. Rewrite it so the keywords are structurally necessary.
- Rewrite the entire sentence structure when needed to integrate keywords naturally. It should read like the candidate wrote it for this specific role.
- Use the JD's exact terminology when the candidate has equivalent experience:
  • JD says "CI/CD pipelines" and candidate "set up automated deployments" → write "Built CI/CD pipelines for automated deployments"
  • JD says "cross-functional collaboration" and candidate "worked with designers" → write "Collaborated cross-functionally with design and product teams to deliver..."
  • JD says "distributed systems" and candidate "built microservices" → write "Designed distributed systems using microservices architecture"
- Quantify achievements where possible (numbers, percentages, metrics)
- Reorder bullets within each role so the most JD-relevant ones come first
- Keep all real positions — do NOT remove any jobs or bullet points

### Education & Certifications
- Keep as-is unless reordering adds relevance

### Keyword Integration Strategy
1. First, identify the top 10-15 technical keywords and phrases from the JD (technologies, methodologies, tools, domain terms)
2. For each keyword, find the best place in the resume to naturally incorporate it
3. Restructure the sentence so the keyword is integral to the meaning, not decorative
4. Aim to mention each important JD keyword at least once across the entire resume
5. Use exact JD phrasing, not synonyms — ATS systems match exact terms
6. Never fabricate — only use a JD keyword if the candidate's actual experience supports it
7. If a keyword cannot be naturally integrated, it is better to omit it than to force it in awkwardly

### General
- Do NOT fabricate experience, skills, or achievements the candidate doesn't have
- Keep the tone professional and concise
- Optimize for ATS keyword scanning while remaining human-readable

## Output Format
Respond with ONLY valid JSON, no markdown fences:
{
  "jobTitle": "...",
  "personalInfo": {
    "fullName": "...",
    "email": "...",
    "phone": "...",
    "location": "...",
    "linkedin": "..."
  },
  "sections": [
    { "title": "Summary", "content": "..." },
    { "title": "Skills", "content": "..." },
    { "title": "Experience", "content": "..." },
    { "title": "Education", "content": "..." }
  ],
  "coverLetter": "..." // only if requested
}

The "jobTitle" field should contain the exact job title extracted from the job description (e.g., "Senior Software Engineer", "Product Manager"). If no clear job title is stated in the job description, omit the "jobTitle" field entirely — do NOT guess or fabricate one.

The "personalInfo" field should be extracted from the RESUME (not the job description). Extract the candidate's full name, email, phone number, city/province/country location (not full street address), and LinkedIn URL. Omit any field that is not clearly present in the resume. For location, use a clean format like "Langley, BC, Canada" — do not include street addresses or unit numbers.

Include all relevant sections. The "content" field should use plain text with newlines for formatting. Use **bold** markers for emphasis (e.g., company names, role titles). For experience entries, use this format:
**Company Name** — Role Title (Date Range)
• Achievement or responsibility
• Achievement or responsibility`;

interface TailorRequest {
  resume: string;
  jobDescription: string;
  generateCoverLetter: boolean;
  targetKeywords?: string[];
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

  // targetKeywords is optional; if present, must be an array of strings
  if ("targetKeywords" in b && b.targetKeywords !== undefined) {
    if (!Array.isArray(b.targetKeywords)) return false;
    if (b.targetKeywords.some((k: unknown) => typeof k !== "string")) return false;
  }
  return true;
}

function buildUserPrompt(
  resume: string,
  jobDescription: string,
  generateCoverLetter: boolean,
  targetKeywords?: string[]
): string {
  const keywordSection = targetKeywords && targetKeywords.length > 0
    ? `\n\nThe following ATS keywords were extracted from this job description. You MUST try to naturally incorporate as many of these as possible into the tailored resume (summary, skills, and experience bullets). Only use a keyword if the candidate's experience genuinely supports it:\n${targetKeywords.join(", ")}\n`
    : "";

  return `Here is the candidate's master resume:

---
${resume}
---

Here is the job description to tailor for:

---
${jobDescription}
---
${keywordSection}
${generateCoverLetter ? "Please also generate a cover letter that addresses any skill gaps and highlights the candidate's strongest relevant qualifications." : "Do NOT include a coverLetter field in the output."}

Respond with ONLY the JSON object, no markdown fences or extra text.`;
}

function buildAzureUrl(endpoint: string, deployment: string): string {
  // Remove trailing slash from endpoint if present
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${API_VERSION}`;
}

async function callAzureOpenAI(
  endpoint: string,
  apiKey: string,
  deployment: string,
  userPrompt: string
): Promise<NextResponse> {
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
      temperature: 0.7,
      top_p: 0.9,
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

function parseAndValidateResponse(text: string): NextResponse {
  let parsed: {
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
  };
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

  // Validate personalInfo: if present, must be an object with optional string fields
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

  // Post-process: remove AI-generated buzzwords and filler phrases
  const cleanedResult = cleanSections(parsed.sections);
  parsed.sections = cleanedResult.sections;

  if (parsed.coverLetter) {
    const cleanedCoverLetter = cleanAiPhrases(parsed.coverLetter);
    parsed.coverLetter = cleanedCoverLetter.text;
  }

  return NextResponse.json(parsed);
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

  const MAX_INPUT_LENGTH = 50_000;
  if (body.resume.length > MAX_INPUT_LENGTH || body.jobDescription.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `Input too large. Resume and job description must each be under ${MAX_INPUT_LENGTH.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  const { resume, jobDescription, generateCoverLetter, targetKeywords } = body;
  const userPrompt = buildUserPrompt(resume, jobDescription, generateCoverLetter, targetKeywords);

  try {
    return await callAzureOpenAI(endpoint, apiKey, deployment, userPrompt);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
