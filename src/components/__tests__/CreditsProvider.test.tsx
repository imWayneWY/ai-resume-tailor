import { render, screen, act, waitFor } from "@testing-library/react";
import { CreditsProvider, useCredits } from "../CreditsProvider";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function TestConsumer() {
  const { credits, isAuthenticated, loading } = useCredits();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="credits">{String(credits)}</span>
    </div>
  );
}

describe("CreditsProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches credits on mount and provides values", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: true, balance: 7 }),
    });

    render(
      <CreditsProvider>
        <TestConsumer />
      </CreditsProvider>
    );

    // Initially loading
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    // After fetch resolves
    expect(await screen.findByText("false")).toBeInTheDocument();
    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    expect(screen.getByTestId("credits")).toHaveTextContent("7");
  });

  it("sets unauthenticated when API returns 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    render(
      <CreditsProvider>
        <TestConsumer />
      </CreditsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("credits")).toHaveTextContent("null");
  });

  it("handles fetch failure gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(
      <CreditsProvider>
        <TestConsumer />
      </CreditsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });
    // Should not crash
    expect(screen.getByTestId("credits")).toHaveTextContent("null");
  });

  it("refreshes on credits-updated event", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, balance: 5 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, balance: 4 }),
      });

    render(
      <CreditsProvider>
        <TestConsumer />
      </CreditsProvider>
    );

    expect(await screen.findByText("5")).toBeInTheDocument();

    // Dispatch event to trigger refresh
    await act(async () => {
      window.dispatchEvent(new Event("credits-updated"));
    });

    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
