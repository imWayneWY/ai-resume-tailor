import { render, screen } from "@testing-library/react";
import { Navbar } from "../Navbar";
import { CreditsProvider } from "../CreditsProvider";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
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

function renderNavbar() {
  return render(
    <CreditsProvider>
      <Navbar />
    </CreditsProvider>
  );
}

describe("Navbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, balance: 5 }),
    });
  });

  it("renders the app title", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    renderNavbar();

    expect(
      screen.getByRole("link", { name: /ai resume tailor/i })
    ).toBeInTheDocument();
  });

  it("shows sign in link when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false }),
    });

    renderNavbar();

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

    renderNavbar();

    expect(await screen.findByText("test@example.com")).toBeInTheDocument();
  });

  it("shows Get Started link on non-tailor pages", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false }),
    });

    renderNavbar();

    await screen.findByRole("link", { name: /sign in/i });
    expect(
      screen.getByRole("link", { name: /get started/i })
    ).toBeInTheDocument();
  });

  it("fetches credits via CreditsProvider on mount", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          user_metadata: {},
        },
      },
    });

    renderNavbar();

    await screen.findByText("test@example.com");
    // CreditsProvider fetches credits on mount
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

    renderNavbar();

    // Should still show user email without crashing
    expect(await screen.findByText("test@example.com")).toBeInTheDocument();
  });
});
