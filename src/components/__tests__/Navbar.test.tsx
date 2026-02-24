import { render, screen } from "@testing-library/react";
import { Navbar } from "../Navbar";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

// Mock ThemeToggle (it uses useTheme which needs ThemeProvider)
jest.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <button aria-label="System theme">Theme</button>,
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

    const signInLink = await screen.findByRole("link", { name: /sign in/i });
    expect(signInLink).toHaveAttribute("href", "/auth/login");
  });

  it("shows user menu when authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: {},
        },
      },
    });

    render(<Navbar />);

    // UserMenu shows email
    expect(await screen.findByText("test@example.com")).toBeInTheDocument();
  });

  it("shows Get Started link on non-tailor pages", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);

    await screen.findByRole("link", { name: /sign in/i });
    expect(
      screen.getByRole("link", { name: /get started/i })
    ).toBeInTheDocument();
  });

  it("does not fetch credits when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<Navbar />);

    await screen.findByRole("link", { name: /sign in/i });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches credits when authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: {},
        },
      },
    });

    render(<Navbar />);

    await screen.findByText("test@example.com");
    expect(mockFetch).toHaveBeenCalledWith("/api/credits");
  });

  it("handles credits fetch failure gracefully", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: {},
        },
      },
    });
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<Navbar />);

    // Should still show user email without crashing
    expect(await screen.findByText("test@example.com")).toBeInTheDocument();
  });
});
