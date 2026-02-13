import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured" },
      { status: 500 }
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

  const MAX_INPUT_LENGTH = 50_000;
  if (body.resume.length > MAX_INPUT_LENGTH || body.jobDescription.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `Input too large. Resume and job description must each be under ${MAX_INPUT_LENGTH.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  const { resume, jobDescription, generateCoverLetter } = body;

  const userPrompt = `Here is the candidate's master resume:

---
${resume}
---

Here is the job description to tailor for:

---
${jobDescription}
---

${generateCoverLetter ? "Please also generate a cover letter that addresses any skill gaps and highlights the candidate's strongest relevant qualifications." : "Do NOT include a coverLetter field in the output."}

Respond with ONLY the JSON object, no markdown fences or extra text.`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
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
      // Consume body to prevent memory leak
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

    // Parse the JSON from Gemini's response
    let parsed: { sections: { title: string; content: string }[]; coverLetter?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    // Validate structure
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
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
