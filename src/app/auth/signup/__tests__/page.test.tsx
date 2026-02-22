import { render, screen } from "@testing-library/react";
import SignupPage from "../page";

// Mock next/navigation (not used by SignupPage but may be needed by dependencies)
jest.mock("next/navigation", () => ({}));

// Mock Supabase client
const mockSignUp = jest.fn();
const mockSignInWithOAuth = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

describe("SignupPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders signup form", () => {
    render(<SignupPage />);

    expect(
      screen.getByRole("heading", { name: /create an account/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument();
  });

  it("renders Google OAuth button", () => {
    render(<SignupPage />);

    expect(
      screen.getByRole("button", { name: /continue with google/i })
    ).toBeInTheDocument();
  });

  it("renders link to login page", () => {
    render(<SignupPage />);

    const loginLink = screen.getByRole("link", { name: /sign in/i });
    expect(loginLink).toHaveAttribute("href", "/auth/login");
  });

  it("has required fields with minimum password length", () => {
    render(<SignupPage />);

    expect(screen.getByLabelText(/^email$/i)).toBeRequired();
    expect(screen.getByLabelText(/^password$/i)).toBeRequired();
    expect(screen.getByLabelText(/confirm password/i)).toBeRequired();
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      "minLength",
      "6"
    );
  });
});
