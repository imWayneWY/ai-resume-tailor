import { NextRequest, NextResponse } from "next/server";

const API_VERSION = "2025-01-01-preview";

const SYSTEM_PROMPT = `You are a job description extractor. Given the raw text content of a job posting webpage, extract ONLY the job description.

## Rules
- Extract the job title, company name, location, and full description including responsibilities, requirements, qualifications, and benefits
- Remove navigation elements, headers, footers, ads, and other non-JD content
- Keep the original formatting (bullet points, sections) as plain text
- If the page does not contain a job description, respond with: {"error": "No job description found on this page."}
- Respond with ONLY valid JSON, no markdown fences:

{
  "jobDescription": "Full extracted job description text here..."
}`;

function getAzureConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    return null;
  }
  return { endpoint, apiKey, deployment };
}

export async function POST(request: NextRequest) {
  const config = getAzureConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Azure OpenAI is not configured. Please contact the administrator." },
      { status: 503 }
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  const { url } = body;
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json(
      { error: "Missing or invalid 'url' field." },
      { status: 400 }
    );
  }

  // Basic URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return NextResponse.json(
      { error: "Invalid URL format." },
      { status: 400 }
    );
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: "Only HTTP and HTTPS URLs are supported." },
      { status: 400 }
    );
  }

  // SSRF protection: block private/internal addresses
  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "metadata.google.internal"];
  const blockedPrefixes = ["10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
    "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.",
    "172.28.", "172.29.", "172.30.", "172.31.", "192.168.", "169.254."];

  if (blockedHosts.includes(hostname) || blockedPrefixes.some(p => hostname.startsWith(p))) {
    return NextResponse.json(
      { error: "URLs pointing to internal or private network addresses are not allowed." },
      { status: 400 }
    );
  }

  // Fetch the page content
  let pageText: string;
  try {
    const response = await fetch(url.trim(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ResumeAIBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL (HTTP ${response.status}).` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/") && !contentType.includes("html") && !contentType.includes("json")) {
      return NextResponse.json(
        { error: "URL does not point to a text/HTML page." },
        { status: 400 }
      );
    }

    pageText = await response.text();
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError"
      ? "URL fetch timed out (15 seconds)."
      : "Failed to fetch URL.";
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }

  // Strip HTML tags for a cleaner LLM input (basic approach)
  const cleanText = pageText
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate to avoid token limits (keep first ~15k chars)
  const truncated = cleanText.slice(0, 15000);

  if (truncated.length < 50) {
    return NextResponse.json(
      { error: "Page content too short — might not be a job posting." },
      { status: 400 }
    );
  }

  // Use LLM to extract the job description
  const azureUrl = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${API_VERSION}`;

  let azureResponse: Response;
  try {
    azureResponse = await fetch(azureUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extract the job description from this page:\n\n${truncated}` },
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to AI service." },
      { status: 500 }
    );
  }

  if (!azureResponse.ok) {
    console.debug("[fetch-jd] Azure API error:", azureResponse.status);
    return NextResponse.json(
      { error: "AI service error. Please try again." },
      { status: 502 }
    );
  }

  const azureData = await azureResponse.json();
  const content = azureData?.choices?.[0]?.message?.content;

  if (!content) {
    return NextResponse.json(
      { error: "AI returned empty response." },
      { status: 502 }
    );
  }

  let parsed: { jobDescription?: string; error?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse AI response." },
      { status: 502 }
    );
  }

  if (parsed.error) {
    return NextResponse.json(
      { error: parsed.error },
      { status: 400 }
    );
  }

  if (typeof parsed.jobDescription !== "string" || !parsed.jobDescription.trim()) {
    return NextResponse.json(
      { error: "No job description could be extracted." },
      { status: 502 }
    );
  }

  return NextResponse.json({ jobDescription: parsed.jobDescription });
}
