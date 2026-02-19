/**
 * @jest-environment node
 */
import { POST } from "../route";
import { NextRequest } from "next/server";

// --- mocks ---
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeAll(() => {
  process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-key";
  process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4.1-mini";
});

afterEach(() => {
  mockFetch.mockReset();
});

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/fetch-jd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/fetch-jd", () => {
  it("returns 400 for missing url", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing|invalid/i);
  });

  it("returns 400 for empty url string", async () => {
    const res = await POST(makeRequest({ url: "  " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid url format", async () => {
    const res = await POST(makeRequest({ url: "not-a-url" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid url/i);
  });

  it("returns 400 for non-http protocol", async () => {
    const res = await POST(makeRequest({ url: "ftp://example.com/job" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/http/i);
  });

  it("blocks localhost URLs (SSRF protection)", async () => {
    const res = await POST(makeRequest({ url: "http://localhost:6379/secret" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/internal|private/i);
  });

  it("blocks private IP ranges (SSRF protection)", async () => {
    const res = await POST(makeRequest({ url: "http://192.168.1.1/admin" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/internal|private/i);
  });

  it("blocks cloud metadata endpoints (SSRF protection)", async () => {
    const res = await POST(makeRequest({ url: "http://169.254.169.254/latest/meta-data/" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/internal|private/i);
  });

  it("returns 502 when page fetch fails", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not Found", { status: 404 })
    );

    const res = await POST(makeRequest({ url: "https://example.com/job" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/failed to fetch/i);
  });

  it("returns 400 when page content is too short", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Hi", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const res = await POST(makeRequest({ url: "https://example.com/job" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too short/i);
  });

  it("extracts job description from page content", async () => {
    const pageHtml = `<html><body><h1>Software Engineer</h1><p>We are looking for a software engineer with 5+ years experience in React and TypeScript. ${"x".repeat(100)}</p></body></html>`;

    // First call: page fetch
    mockFetch.mockResolvedValueOnce(
      new Response(pageHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    // Second call: Azure OpenAI
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  jobDescription: "Software Engineer\n\nWe are looking for a software engineer with 5+ years experience in React and TypeScript.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest({ url: "https://example.com/job" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobDescription).toContain("Software Engineer");
    expect(json.jobDescription).toContain("React and TypeScript");
  });

  it("returns error when AI finds no job description", async () => {
    const pageHtml = `<html><body><h1>About Us</h1><p>We are a company. ${"x".repeat(100)}</p></body></html>`;

    mockFetch.mockResolvedValueOnce(
      new Response(pageHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  error: "No job description found on this page.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest({ url: "https://example.com/about" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no job description/i);
  });

  it("returns 502 when Azure API fails", async () => {
    const pageHtml = `<html><body><p>Job posting content here that is long enough to pass the minimum check. ${"x".repeat(100)}</p></body></html>`;

    mockFetch.mockResolvedValueOnce(
      new Response(pageHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const res = await POST(makeRequest({ url: "https://example.com/job" }));
    expect(res.status).toBe(502);
  });

  it("returns 503 when Azure is not configured", async () => {
    const origEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    try {
      delete process.env.AZURE_OPENAI_ENDPOINT;

      const res = await POST(makeRequest({ url: "https://example.com/job" }));
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toMatch(/not configured/i);
    } finally {
      process.env.AZURE_OPENAI_ENDPOINT = origEndpoint;
    }
  });

  it("returns 400 for non-string url", async () => {
    const res = await POST(makeRequest({ url: 123 }));
    expect(res.status).toBe(400);
  });

  it("strips HTML tags before sending to LLM", async () => {
    const pageHtml = `<html><head><script>alert('hi')</script><style>.foo{}</style></head><body><h1>Engineer</h1><p>Description here. ${"x".repeat(100)}</p></body></html>`;

    mockFetch.mockResolvedValueOnce(
      new Response(pageHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  jobDescription: "Engineer\nDescription here.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await POST(makeRequest({ url: "https://example.com/job" }));
    expect(res.status).toBe(200);

    // Verify the LLM call doesn't contain script/style content
    const azureCall = mockFetch.mock.calls[1];
    const azureBody = JSON.parse(azureCall[1].body);
    const userMessage = azureBody.messages[1].content;
    expect(userMessage).not.toContain("alert");
    expect(userMessage).not.toContain(".foo");
  });
});
