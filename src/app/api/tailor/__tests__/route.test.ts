/**
 * @jest-environment node
 */
import { POST } from "../route";

// ---------- helpers ----------

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function makeInvalidJsonRequest() {
  return new Request("http://localhost:3000/api/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "NOT VALID JSON {{{",
  }) as unknown as import("next/server").NextRequest;
}

const validBody = {
  resume: "I am a software engineer with 5 years experience...",
  jobDescription: "Looking for a senior engineer at ACME Corp...",
  generateCoverLetter: false,
};

const validGeminiResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              sections: [
                { title: "Summary", content: "Seasoned software engineer..." },
                { title: "Skills", content: "TypeScript, React, Node.js" },
              ],
            }),
          },
        ],
      },
    },
  ],
};

// ---------- mocks ----------

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
  process.env.GEMINI_API_KEY = "test-api-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.GEMINI_API_KEY;
});

// ---------- tests ----------

describe("POST /api/tailor", () => {
  // --- Config / env ---
  it("returns 401 when no API key is available (no client key, no env key)", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/no api key provided/i);
  });

  it("uses client-provided apiKey when present", async () => {
    delete process.env.GEMINI_API_KEY;
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(
      makeRequest({ ...validBody, apiKey: "client-key-123" })
    );
    expect(res.status).toBe(200);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=client-key-123");
  });

  it("falls back to env key when client apiKey is not provided", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=test-api-key");
  });

  it("prefers client apiKey over env key", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(
      makeRequest({ ...validBody, apiKey: "client-preferred" })
    );
    expect(res.status).toBe(200);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=client-preferred");
    expect(url).not.toContain("key=test-api-key");
  });

  it("falls back to env key when client apiKey is empty string", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(
      makeRequest({ ...validBody, apiKey: "   " })
    );
    expect(res.status).toBe(200);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=test-api-key");
  });

  it("returns 400 when apiKey is not a string", async () => {
    const res = await POST(
      makeRequest({ ...validBody, apiKey: 12345 })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid apiKey/i);
  });

  // --- Input validation ---
  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(makeInvalidJsonRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("returns 400 when resume is missing", async () => {
    const res = await POST(
      makeRequest({ jobDescription: "desc", generateCoverLetter: false })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when jobDescription is missing", async () => {
    const res = await POST(
      makeRequest({ resume: "my resume", generateCoverLetter: false })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when generateCoverLetter is missing", async () => {
    const res = await POST(
      makeRequest({ resume: "my resume", jobDescription: "desc" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when resume is empty string", async () => {
    const res = await POST(
      makeRequest({ resume: "   ", jobDescription: "desc", generateCoverLetter: false })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when jobDescription is empty string", async () => {
    const res = await POST(
      makeRequest({ resume: "resume", jobDescription: "  ", generateCoverLetter: false })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when body is null", async () => {
    const req = new Request("http://localhost:3000/api/tailor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    }) as unknown as import("next/server").NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when input exceeds MAX_INPUT_LENGTH", async () => {
    const longString = "x".repeat(50_001);
    const res = await POST(
      makeRequest({ resume: longString, jobDescription: "desc", generateCoverLetter: false })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too large/i);
  });

  it("returns 400 when jobDescription exceeds MAX_INPUT_LENGTH", async () => {
    const longString = "x".repeat(50_001);
    const res = await POST(
      makeRequest({ resume: "resume", jobDescription: longString, generateCoverLetter: false })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too large/i);
  });

  // --- Gemini API integration ---
  it("returns tailored resume on successful Gemini response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sections).toHaveLength(2);
    expect(json.sections[0].title).toBe("Summary");
    expect(json.sections[1].title).toBe("Skills");
  });

  it("sends cover letter instruction when generateCoverLetter is true", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      sections: [{ title: "Summary", content: "..." }],
                      coverLetter: "Dear Hiring Manager...",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const bodyWithCover = { ...validBody, generateCoverLetter: true };
    const res = await POST(makeRequest(bodyWithCover));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.coverLetter).toBeDefined();

    // Verify the prompt sent to Gemini includes cover letter instruction
    const fetchCall = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchCall[1].body);
    const userText = fetchBody.contents[0].parts[0].text;
    expect(userText).toMatch(/cover letter/i);
  });

  it("returns 429 when Gemini rate limits", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Rate limited", { status: 429 })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/rate limited/i);
  });

  it("returns 502 on non-ok Gemini response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/Gemini API error/i);
  });

  it("returns 502 when Gemini response has no text", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/unexpected response/i);
  });

  it("returns 502 when Gemini returns invalid JSON text", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "NOT VALID JSON" }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/failed to parse/i);
  });

  it("returns 502 when Gemini returns empty sections array", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ sections: [] }) }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/invalid resume structure/i);
  });

  it("returns 502 when sections have invalid shape", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      sections: [{ title: 123, content: null }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/invalid resume structure/i);
  });

  it("returns 502 when coverLetter is not a string", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      sections: [{ title: "Summary", content: "..." }],
                      coverLetter: 12345,
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/invalid resume structure/i);
  });

  it("returns 500 when fetch itself throws (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/internal server error/i);
  });

  it("passes the API key as a query parameter to Gemini", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=test-api-key");
  });

  it("URL-encodes the API key in the Gemini request URL", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest({ ...validBody, apiKey: "key&with=special?chars" }));

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("key=key%26with%3Dspecial%3Fchars");
  });

  it("sends correct generation config to Gemini", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.generationConfig.temperature).toBe(0.7);
    expect(fetchBody.generationConfig.topP).toBe(0.9);
    expect(fetchBody.generationConfig.responseMimeType).toBe(
      "application/json"
    );
  });

  it("does not include coverLetter instruction when generateCoverLetter is false", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validGeminiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest({ ...validBody, generateCoverLetter: false }));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userText = fetchBody.contents[0].parts[0].text;
    expect(userText).toMatch(/do not include a coverLetter/i);
  });
});
