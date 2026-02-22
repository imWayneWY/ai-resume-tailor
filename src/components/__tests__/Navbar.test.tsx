import { render, screen } from "@testing-library/react";
import { Navbar } from "../Navbar";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock Supabase client
const mockGetUser = jest.fn();
const mockOnAuthStateChange = jest.fn().mockReturnValue({
  data: { subscription: { unsubscribe: jest.fn() } },
});

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

// Mock fetch for credits API
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("Navbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ balance: 5 }),
    });
  });

  it("renders the app title", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);

    expect(
      screen.getByRole("link", { name: /ai resume tailor/i })
    ).toBeInTheDocument();
  });

  it("shows sign in link when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);

    // Wait for auth state to load
    const signInLink = await screen.findByRole("link", { name: /sign in/i });
    expect(signInLink).toHaveAttribute("href", "/auth/login");
  });

  it("shows user name and sign out when authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: { full_name: "Test User" },
        },
      },
    });

    render(<Navbar />);

    expect(await screen.findByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("falls back to email prefix for display name", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "hello@example.com",
          user_metadata: {},
        },
      },
    });

    render(<Navbar />);

    expect(await screen.findByText("hello")).toBeInTheDocument();
  });

  it("shows settings link", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);

    expect(
      screen.getByRole("link", { name: /settings/i })
    ).toBeInTheDocument();
  });

  // --- Credits display ---
  it("shows credits badge when authenticated with balance > 0", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: { full_name: "Test User" },
        },
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ balance: 3 }),
    });

    render(<Navbar />);

    expect(await screen.findByText("3 credits")).toBeInTheDocument();
  });

  it("shows red credits badge when balance is 0", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: { full_name: "Test User" },
        },
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ balance: 0 }),
    });

    render(<Navbar />);

    const badge = await screen.findByText("0 credits");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/red/);
  });

  it("shows singular 'credit' when balance is 1", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: { full_name: "Test User" },
        },
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ balance: 1 }),
    });

    render(<Navbar />);

    expect(await screen.findByText("1 credit")).toBeInTheDocument();
  });

  it("does not show credits badge when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);

    await screen.findByRole("link", { name: /sign in/i });
    expect(screen.queryByText(/credit/i)).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles credits fetch failure gracefully", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: { full_name: "Test User" },
        },
      },
    });
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<Navbar />);

    // Should still show user name without crashing
    expect(await screen.findByText("Test User")).toBeInTheDocument();
    // Credits badge should not appear
    expect(screen.queryByText(/credit/i)).not.toBeInTheDocument();
  });
});
