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

describe("Navbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
