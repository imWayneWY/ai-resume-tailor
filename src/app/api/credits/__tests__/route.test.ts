/**
 * @jest-environment node
 */
import { GET } from "../route";

// Mock Supabase server client
const mockGetUser = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn().mockImplementation(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
      from: jest.fn().mockReturnValue({
        select: mockSelect.mockReturnValue({
          eq: mockEq.mockReturnValue({
            single: mockSingle,
          }),
        }),
      }),
    })
  ),
}));

describe("GET /api/credits", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockSingle.mockReset();

    // Re-chain after reset
    mockSelect.mockReturnValue({ eq: mockEq.mockReturnValue({ single: mockSingle }) });
  });

  it("returns null balance for unauthenticated users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET();
    const json = await res.json();

    expect(json.balance).toBeNull();
    expect(json.authenticated).toBe(false);
  });

  it("returns balance for authenticated users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: { balance: 5 }, error: null });

    const res = await GET();
    const json = await res.json();

    expect(json.balance).toBe(5);
    expect(json.authenticated).toBe(true);
  });

  it("returns 0 balance when credits row doesn't exist", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });

    const res = await GET();
    const json = await res.json();

    expect(json.balance).toBe(0);
    expect(json.authenticated).toBe(true);
  });

  it("returns 500 on database error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "UNEXPECTED", message: "db error" },
    });

    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns null balance when auth errors", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "auth error" },
    });

    const res = await GET();
    const json = await res.json();

    expect(json.balance).toBeNull();
    expect(json.authenticated).toBe(false);
  });
});
