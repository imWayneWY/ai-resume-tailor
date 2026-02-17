/**
 * @jest-environment node
 */
import { POST } from "../route";

// ---------- helpers ----------

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/extract-keywords", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function makeInvalidJsonRequest() {
  return new Request("http://localhost:3000/api/extract-keywords", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "NOT VALID JSON {{{",
  }) as unknown as import("next/server").NextRequest;
}

const validBody = {
  jobDescription: "Looking for a senior React engineer with TypeScript, Node.js, and AWS experience.",
};

const validAzureResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          keywords: ["aws", "node.js", "react", "typescript"],
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
  process.env.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-key";
  process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4.1-mini";
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
});

// ---------- validation ----------

describe("POST /api/extract-keywords", () => {
  describe("input validation", () => {
    it("returns 400 for invalid JSON", async () => {
      const res = await POST(makeInvalidJsonRequest());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 when jobDescription is missing", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Missing required field: jobDescription");
    });

    it("returns 400 when jobDescription is empty", async () => {
      const res = await POST(makeRequest({ jobDescription: "  " }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when jobDescription is not a string", async () => {
      const res = await POST(makeRequest({ jobDescription: 12345 }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when input exceeds max length", async () => {
      const res = await POST(
        makeRequest({ jobDescription: "x".repeat(50_001) })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/too large/i);
    });
  });

  // ---------- config ----------

  describe("configuration", () => {
    it("returns 503 when Azure endpoint is missing", async () => {
      delete process.env.AZURE_OPENAI_ENDPOINT;
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(503);
    });

    it("returns 503 when Azure API key is missing", async () => {
      delete process.env.AZURE_OPENAI_API_KEY;
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(503);
    });

    it("returns 503 when Azure deployment is missing", async () => {
      delete process.env.AZURE_OPENAI_DEPLOYMENT;
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(503);
    });
  });

  // ---------- Azure call ----------

  describe("Azure OpenAI integration", () => {
    it("constructs the correct Azure URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validAzureResponse,
      });

      await POST(makeRequest(validBody));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("test.openai.azure.com");
      expect(url).toContain("gpt-4.1-mini");
      expect(url).toContain("api-version=");
    });

    it("sends api-key header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validAzureResponse,
      });

      await POST(makeRequest(validBody));

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["api-key"]).toBe("test-key");
    });

    it("uses low temperature for keyword extraction", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validAzureResponse,
      });

      await POST(makeRequest(validBody));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.temperature).toBeLessThanOrEqual(0.3);
    });

    it("requests json_object response format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validAzureResponse,
      });

      await POST(makeRequest(validBody));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.response_format).toEqual({ type: "json_object" });
    });
  });

  // ---------- success ----------

  describe("successful extraction", () => {
    it("returns sorted, deduplicated, lowercase keywords", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  keywords: ["React", "TYPESCRIPT", "react", "Node.js", "AWS"],
                }),
              },
            },
          ],
        }),
      });

      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.keywords).toEqual(["aws", "node.js", "react", "typescript"]);
    });

    it("filters out empty strings", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  keywords: ["react", "", "  ", "typescript"],
                }),
              },
            },
          ],
        }),
      });

      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(body.keywords).toEqual(["react", "typescript"]);
    });

    it("handles non-string entries gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  keywords: ["react", 123, null, "typescript"],
                }),
              },
            },
          ],
        }),
      });

      const res = await POST(makeRequest(validBody));
      const body = await res.json();
      expect(body.keywords).toEqual(["react", "typescript"]);
    });
  });

  // ---------- error handling ----------

  describe("error handling", () => {
    it("returns 429 on rate limit", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(429);
    });

    it("returns 502 on Azure API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(502);
    });

    it("returns 502 when response has no content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {} }] }),
      });

      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(502);
    });

    it("returns 502 when response is not valid JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "not json {{{" } }],
        }),
      });

      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(502);
    });

    it("returns 502 when keywords is not an array", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ keywords: "not-an-array" }),
              },
            },
          ],
        }),
      });

      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(502);
    });

    it("returns 500 when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(500);
    });
  });
});
