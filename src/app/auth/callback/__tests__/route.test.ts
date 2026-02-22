/**
 * @jest-environment node
 */

// Mock Supabase server client
const mockExchangeCodeForSession = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mockExchangeCodeForSession,
      },
    }),
}));

import { GET } from "../route";

function makeRequest(url: string) {
  return new Request(url);
}

describe("auth callback route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirects to / on successful auth with no next param", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=abc")
    );

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("redirects to safe next path on successful auth", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=abc&next=/tailor")
    );

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/tailor");
  });

  it("blocks open redirect with absolute URL in next param", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?code=abc&next=https://evil.com"
      )
    );

    expect(res.status).toBe(307);
    // Should redirect to / not evil.com
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("blocks open redirect with protocol-relative URL in next param", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?code=abc&next=//evil.com"
      )
    );

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("redirects to login with error on auth failure", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: new Error("bad code"),
    });

    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback?code=bad")
    );

    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/auth/login");
    expect(url.searchParams.get("error")).toBe("auth_callback_failed");
  });

  it("redirects to login with error when no code provided", async () => {
    const res = await GET(
      makeRequest("http://localhost:3000/auth/callback")
    );

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/login");
  });
});
