import { NextRequest, NextResponse } from "next/server";
import type { ModelProvider } from "@/lib/constants";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are an expert resume writer and ATS (Applicant Tracking System) optimizer. Your job is to tailor a candidate's master resume to a specific job description.

Rules:
- Reorder, rewrite, and optimize resume content to match the job description
- Mirror keywords and phrases from the job description naturally
- Quantify achievements where possible (numbers, percentages, metrics)
- Remove irrelevant experience or de-emphasize it
- Keep the tone professional and concise
- Do NOT fabricate experience or skills the candidate doesn't have
- Optimize for ATS keyword scanning while remaining human-readable

Output format — respond with ONLY valid JSON, no markdown fences:
{
  "sections": [
    { "title": "Summary", "content": "..." },
    { "title": "Skills", "content": "..." },
    { "title": "Experience", "content": "..." },
    { "title": "Education", "content": "..." }
  ],
  "coverLetter": "..." // only if requested
}

Include all relevant sections. The "content" field should use plain text with newlines for formatting. For experience entries, use this format:
**Company Name** — Role Title (Date Range)
• Achievement or responsibility
• Achievement or responsibility`;

interface TailorRequest {
  resume: string;
  jobDescription: string;
  generateCoverLetter: boolean;
  apiKey?: string;
  provider?: ModelProvider;
}

function validateRequest(
  body: unknown
): body is TailorRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.resume === "string" &&
    b.resume.trim().length > 0 &&
    typeof b.jobDescription === "string" &&
    b.jobDescription.trim().length > 0 &&
    typeof b.generateCoverLetter === "boolean"
  );
}

function validateApiKeyField(body: unknown): boolean {
  if (!body || typeof body !== "object") return true;
  const b = body as Record<string, unknown>;
  if ("apiKey" in b && b.apiKey !== undefined && typeof b.apiKey !== "string") {
    return false;
  }
  return true;
}

function validateProviderField(body: unknown): boolean {
  if (!body || typeof body !== "object") return true;
  const b = body as Record<string, unknown>;
  if ("provider" in b && b.provider !== undefined) {
    return b.provider === "gemini" || b.provider === "groq";
  }
  return true;
}

function buildUserPrompt(
  resume: string,
  jobDescription: string,
  generateCoverLetter: boolean
): string {
  return `Here is the candidate's master resume:

---
${resume}
---

Here is the job description to tailor for:

---
${jobDescription}
---

${generateCoverLetter ? "Please also generate a cover letter that addresses any skill gaps and highlights the candidate's strongest relevant qualifications." : "Do NOT include a coverLetter field in the output."}

Respond with ONLY the JSON object, no markdown fences or extra text.`;
}

async function callGemini(
  apiKey: string,
  userPrompt: string
): Promise<NextResponse> {
  const encodedKey = encodeURIComponent(apiKey);

  const response = await fetch(`${GEMINI_API_URL}?key=${encodedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        responseMimeType: "application/json",
      },
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
      { error: `Gemini API error (${response.status})` },
      { status: 502 }
    );
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    return NextResponse.json(
      { error: "Unexpected response from Gemini" },
      { status: 502 }
    );
  }

  return parseAndValidateResponse(text);
}

async function callGroq(
  apiKey: string,
  userPrompt: string
): Promise<NextResponse> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
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
      { error: `Groq API error (${response.status})` },
      { status: 502 }
    );
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text) {
    return NextResponse.json(
      { error: "Unexpected response from Groq" },
      { status: 502 }
    );
  }

  return parseAndValidateResponse(text);
}

function parseAndValidateResponse(text: string): NextResponse {
  let parsed: { sections: { title: string; content: string }[]; coverLetter?: string };
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

  if (hasInvalidSection || hasInvalidCoverLetter) {
    return NextResponse.json(
      { error: "AI returned invalid resume structure" },
      { status: 502 }
    );
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

  if (!validateApiKeyField(body)) {
    return NextResponse.json(
      { error: "Invalid apiKey: must be a string" },
      { status: 400 }
    );
  }

  if (!validateProviderField(body)) {
    return NextResponse.json(
      { error: "Invalid provider: must be 'gemini' or 'groq'" },
      { status: 400 }
    );
  }

  const provider: ModelProvider = body.provider || "gemini";

  // Use client-provided API key, fall back to env variable
  const clientKey = body.apiKey?.trim();
  const envKey = provider === "groq" ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY;
  const rawApiKey = clientKey || envKey;

  if (!rawApiKey) {
    const providerName = provider === "groq" ? "Groq" : "Gemini";
    return NextResponse.json(
      { error: `No API key provided. Please add your ${providerName} API key in Settings, or configure a server default.` },
      { status: 401 }
    );
  }

  const MAX_INPUT_LENGTH = 50_000;
  if (body.resume.length > MAX_INPUT_LENGTH || body.jobDescription.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `Input too large. Resume and job description must each be under ${MAX_INPUT_LENGTH.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  const { resume, jobDescription, generateCoverLetter } = body;
  const userPrompt = buildUserPrompt(resume, jobDescription, generateCoverLetter);

  try {
    if (provider === "groq") {
      return await callGroq(rawApiKey, userPrompt);
    }
    return await callGemini(rawApiKey, userPrompt);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
