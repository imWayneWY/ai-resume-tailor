/**
 * @jest-environment node
 */
import { POST } from "../route";

// ---------- mocks ----------

// Mock Supabase server client — default: authenticated user
const mockGetUser = jest.fn().mockResolvedValue({
  data: { user: { id: "test-user-123" } },
  error: null,
});

const mockRpc = jest.fn().mockResolvedValue({ data: true, error: null });

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn().mockImplementation(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
      rpc: mockRpc,
    })
  ),
}));

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

const validAzureResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          sections: [
            { title: "Summary", content: "Seasoned software engineer..." },
            { title: "Skills", content: "TypeScript, React, Node.js" },
          ],
        }),
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
  mockGetUser.mockClear();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "test-user-123" } },
    error: null,
  });
  mockRpc.mockClear();
  mockRpc.mockResolvedValue({ data: true, error: null });
  process.env.AZURE_OPENAI_ENDPOINT = "https://test-resource.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-azure-key";
  process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4.1-mini";
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
});

// ---------- tests ----------

describe("POST /api/tailor", () => {
  // --- Azure OpenAI config ---
  it("returns 503 when AZURE_OPENAI_ENDPOINT is not configured", async () => {
    delete process.env.AZURE_OPENAI_ENDPOINT;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/not configured/i);
  });

  it("returns 503 when AZURE_OPENAI_API_KEY is not configured", async () => {
    delete process.env.AZURE_OPENAI_API_KEY;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/not configured/i);
  });

  it("returns 503 when AZURE_OPENAI_DEPLOYMENT is not configured", async () => {
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/not configured/i);
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

  it("returns 400 when resume exceeds MAX_INPUT_LENGTH", async () => {
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

  // --- Azure OpenAI API integration ---
  it("builds correct Azure OpenAI URL", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe(
      "https://test-resource.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2025-01-01-preview"
    );
  });

  it("strips trailing slash from endpoint", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://test-resource.openai.azure.com/";
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("azure.com/openai/deployments");
    expect(url).not.toContain("azure.com//openai");
  });

  it("sends api-key header (not Bearer token)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.headers["api-key"]).toBe("test-azure-key");
    expect(fetchOptions.headers.Authorization).toBeUndefined();
  });

  it("sends correct request body format", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.messages).toHaveLength(2);
    expect(fetchBody.messages[0].role).toBe("system");
    expect(fetchBody.messages[1].role).toBe("user");
    expect(fetchBody.temperature).toBe(0.7);
    expect(fetchBody.top_p).toBe(0.9);
    expect(fetchBody.response_format).toEqual({ type: "json_object" });
  });

  it("returns tailored resume on successful response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
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
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [{ title: "Summary", content: "..." }],
                  coverLetter: "Dear Hiring Manager...",
                }),
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

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userText = fetchBody.messages[1].content;
    expect(userText).toMatch(/cover letter/i);
  });

  it("does not include coverLetter instruction when generateCoverLetter is false", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest({ ...validBody, generateCoverLetter: false }));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userText = fetchBody.messages[1].content;
    expect(userText).toMatch(/do not include a coverLetter/i);
  });

  it("returns 429 when rate limited", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Rate limited", { status: 429 })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/rate limited/i);
  });

  it("returns 502 on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/Azure OpenAI API error/i);
  });

  it("returns 502 when response has no content", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/unexpected response/i);
  });

  it("returns 502 when response is invalid JSON text", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "NOT VALID JSON" } },
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

  it("returns 502 when sections array is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ sections: [] }),
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
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [{ title: 123, content: null }],
                }),
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
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [{ title: "Summary", content: "..." }],
                  coverLetter: 12345,
                }),
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

  // --- AI phrase cleanup integration ---
  it("cleans AI buzzwords from response sections", async () => {
    const responseWithBuzzwords = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              sections: [
                {
                  title: "Summary",
                  content:
                    "Spearheaded the development of cutting-edge applications by leveraging robust frameworks.",
                },
                {
                  title: "Experience",
                  content:
                    "Utilized TypeScript in order to build holistic solutions.",
                },
              ],
            }),
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(responseWithBuzzwords), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.sections[0].content).not.toMatch(/spearheaded/i);
    expect(json.sections[0].content).not.toMatch(/cutting-edge/i);
    expect(json.sections[0].content).not.toMatch(/leveraging/i);
    expect(json.sections[0].content).not.toMatch(/robust/i);
    expect(json.sections[0].content).toContain("Led");
    expect(json.sections[0].content).toContain("modern");
    expect(json.sections[0].content).toContain("strong");

    expect(json.sections[1].content).not.toMatch(/utilized/i);
    expect(json.sections[1].content).not.toMatch(/in order to/i);
    expect(json.sections[1].content).not.toMatch(/holistic/i);
    expect(json.sections[1].content).toContain("Used");
    expect(json.sections[1].content).toContain("comprehensive");
  });

  it("cleans AI buzzwords from cover letter", async () => {
    const responseWithCoverLetter = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              sections: [
                { title: "Summary", content: "Software engineer" },
              ],
              coverLetter:
                "I am excited to facilitate the paradigm shift at your company.",
            }),
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(responseWithCoverLetter), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(
      makeRequest({ ...validBody, generateCoverLetter: true })
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.coverLetter).not.toMatch(/facilitate/i);
    expect(json.coverLetter).not.toMatch(/paradigm shift/i);
    expect(json.coverLetter).toContain("help");
    expect(json.coverLetter).toContain("change");
  });

  // --- targetKeywords support ---
  it("includes target keywords in user prompt when provided", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const bodyWithKeywords = {
      ...validBody,
      targetKeywords: ["react", "typescript", "ci/cd"],
    };
    await POST(makeRequest(bodyWithKeywords));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userText = fetchBody.messages[1].content;
    expect(userText).toContain("react");
    expect(userText).toContain("typescript");
    expect(userText).toContain("ci/cd");
    expect(userText).toMatch(/ATS keywords/i);
  });

  it("does not include keyword section when targetKeywords is not provided", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userText = fetchBody.messages[1].content;
    expect(userText).not.toMatch(/ATS keywords/i);
  });

  it("does not include keyword section when targetKeywords is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest({ ...validBody, targetKeywords: [] }));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userText = fetchBody.messages[1].content;
    expect(userText).not.toMatch(/ATS keywords/i);
  });

  it("accepts request without targetKeywords (backwards compatible)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
  });

  it("returns 400 when targetKeywords is not an array", async () => {
    const res = await POST(
      makeRequest({ ...validBody, targetKeywords: "react" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetKeywords contains non-strings", async () => {
    const res = await POST(
      makeRequest({ ...validBody, targetKeywords: ["react", 123] })
    );
    expect(res.status).toBe(400);
  });

  // --- jobTitle in response ---
  it("returns jobTitle when present in AI response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  jobTitle: "Senior Software Engineer",
                  sections: [
                    { title: "Summary", content: "Experienced developer" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobTitle).toBe("Senior Software Engineer");
  });

  it("returns 502 when jobTitle is not a string", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  jobTitle: 123,
                  sections: [
                    { title: "Summary", content: "Experienced developer" },
                  ],
                }),
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

  it("succeeds when jobTitle is absent from response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobTitle).toBeUndefined();
  });

  // --- personalInfo in response ---
  it("returns personalInfo when present in AI response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  personalInfo: {
                    fullName: "Yan Wei",
                    email: "im.weiyan@foxmail.com",
                    phone: "587-439-8687",
                    location: "Langley, BC, Canada",
                    linkedin: "linkedin.com/in/yan-wei-ca",
                  },
                  sections: [
                    { title: "Summary", content: "Experienced developer" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.personalInfo.fullName).toBe("Yan Wei");
    expect(json.personalInfo.email).toBe("im.weiyan@foxmail.com");
    expect(json.personalInfo.location).toBe("Langley, BC, Canada");
  });

  it("returns 502 when personalInfo has non-string fields", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  personalInfo: { fullName: 123 },
                  sections: [
                    { title: "Summary", content: "Experienced developer" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
  });

  it("succeeds when personalInfo is absent from response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.personalInfo).toBeUndefined();
  });

  // --- Auth-based redaction ---
  it("returns full results for authenticated users", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  personalInfo: { fullName: "Yan Wei", email: "test@example.com" },
                  sections: [
                    { title: "Summary", content: "Experienced software engineer" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.redacted).toBeUndefined();
    expect(json.personalInfo.fullName).toBe("Yan Wei");
    expect(json.sections[0].content).toContain("Experienced");
  });

  it("returns redacted results for unauthenticated users", async () => {
    // Mock unauthenticated user
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  personalInfo: { fullName: "Yan Wei", email: "test@example.com" },
                  sections: [
                    { title: "Summary", content: "Experienced software engineer with React skills" },
                  ],
                  coverLetter: "Dear Hiring Manager, I am writing to apply...",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.redacted).toBe(true);
    // Section titles should be preserved
    expect(json.sections[0].title).toBe("Summary");
    // Content should be redacted (not contain original words)
    expect(json.sections[0].content).not.toContain("Experienced");
    expect(json.sections[0].content).not.toContain("React");
    // Personal info should be redacted
    expect(json.personalInfo.fullName).not.toBe("Yan Wei");
    expect(json.personalInfo.email).not.toBe("test@example.com");
    // Cover letter should be stripped entirely
    expect(json.coverLetter).toBeUndefined();
  });

  it("preserves section structure in redacted results", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [
                    { title: "Summary", content: "One two three" },
                    { title: "Skills", content: "TypeScript React Node" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest(validBody));
    const json = await res.json();
    expect(json.redacted).toBe(true);
    expect(json.sections).toHaveLength(2);
    expect(json.sections[0].title).toBe("Summary");
    expect(json.sections[1].title).toBe("Skills");
  });

  it("treats auth errors as unauthenticated", async () => {
    mockGetUser.mockRejectedValueOnce(new Error("Auth service down"));

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [
                    { title: "Summary", content: "Experienced developer" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.redacted).toBe(true);
  });

  // --- Credit deduction ---
  it("deducts 1 credit for authenticated users on successful tailor", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(makeRequest(validBody));

    expect(mockRpc).toHaveBeenCalledWith("deduct_credit", {
      p_user_id: "test-user-123",
      p_jd_snippet: expect.any(String),
    });
  });

  it("returns 402 when authenticated user has no credits", async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.code).toBe("NO_CREDITS");
  });

  it("returns 500 when credit deduction has database error", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "DB connection failed" },
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/credits/i);
  });

  it("does not deduct credits for unauthenticated users", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [
                    { title: "Summary", content: "Experienced developer" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await POST(makeRequest(validBody));

    // rpc should NOT have been called — unauthenticated users don't spend credits
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes JD snippet (first 100 chars) to credit deduction", async () => {
    const longJD = "A".repeat(200);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(validAzureResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await POST(
      makeRequest({ ...validBody, jobDescription: longJD })
    );

    expect(mockRpc).toHaveBeenCalledWith("deduct_credit", {
      p_user_id: "test-user-123",
      p_jd_snippet: "A".repeat(100),
    });
  });
});
