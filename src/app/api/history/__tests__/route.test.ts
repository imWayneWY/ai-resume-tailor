/**
 * @jest-environment node
 */
import { GET } from "../route";

// Mock Supabase server client
const mockGetUser = jest.fn();
const mockSelect = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

describe("GET /api/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns usage history for authenticated user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const mockHistory = [
      {
        id: "h1",
        created_at: "2026-02-23T10:00:00Z",
        jd_snippet: "Senior React Developer...",
        before_score: 15,
        after_score: 72,
        credits_used: 1,
      },
      {
        id: "h2",
        created_at: "2026-02-22T08:00:00Z",
        jd_snippet: "Full Stack Engineer...",
        before_score: 20,
        after_score: 65,
        credits_used: 1,
      },
    ];

    mockLimit.mockResolvedValue({ data: mockHistory, error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.history).toHaveLength(2);
    expect(json.history[0].before_score).toBe(15);
    expect(json.history[0].after_score).toBe(72);
    expect(mockFrom).toHaveBeenCalledWith("usage_history");
  });

  it("returns 500 on database error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockLimit.mockResolvedValue({
      data: null,
      error: { message: "db error" },
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to fetch history");
  });

  it("returns empty array when no history exists", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockLimit.mockResolvedValue({ data: [], error: null });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.history).toEqual([]);
  });
});
