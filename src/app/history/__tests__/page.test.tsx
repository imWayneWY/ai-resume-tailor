import { render, screen } from "@testing-library/react";
import HistoryPage from "../page";

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("History page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<HistoryPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows sign in message when unauthorized", async () => {
    mockFetch.mockResolvedValueOnce({ status: 401, ok: false });
    render(<HistoryPage />);
    expect(
      await screen.findByText("Please sign in to view your history.")
    ).toBeInTheDocument();
    expect(screen.getByText("Sign in →")).toHaveAttribute(
      "href",
      "/auth/login"
    );
  });

  it("shows empty state when no history", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ history: [] }),
    });
    render(<HistoryPage />);
    expect(
      await screen.findByText("No tailoring history yet.")
    ).toBeInTheDocument();
    expect(screen.getByText("Tailor your first resume →")).toHaveAttribute(
      "href",
      "/tailor"
    );
  });

  it("renders history entries with scores", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        history: [
          {
            id: "h1",
            created_at: "2026-02-23T10:30:00Z",
            jd_snippet: "Senior React Developer needed...",
            before_score: 15,
            after_score: 72,
            credits_used: 1,
          },
        ],
      }),
    });
    render(<HistoryPage />);

    expect(
      await screen.findByText("Senior React Developer needed...")
    ).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("(+57)")).toBeInTheDocument();
  });

  it("shows dash when scores are null", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        history: [
          {
            id: "h1",
            created_at: "2026-02-23T10:30:00Z",
            jd_snippet: "Some job",
            before_score: null,
            after_score: null,
            credits_used: 1,
          },
        ],
      }),
    });
    render(<HistoryPage />);

    expect(await screen.findByText("Some job")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows error on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    render(<HistoryPage />);
    expect(
      await screen.findByText("Failed to load history.")
    ).toBeInTheDocument();
  });
});
