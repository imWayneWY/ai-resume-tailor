import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "../ThemeProvider";

// Helper component to expose theme context in tests
function ThemeDisplay() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("system")}>Set System</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockMatchMedia(prefersDark: boolean) {
    const listeners: Array<(e: MediaQueryListEvent) => void> = [];
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
      media: query,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    }));
    return listeners;
  }

  it("defaults to system theme", () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("system");
  });

  it("resolves to light when system prefers light", () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("resolves to dark when system prefers dark", () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("reads saved preference from localStorage", () => {
    localStorage.setItem("theme-preference", "dark");
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("saves preference to localStorage when changed", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    await user.click(screen.getByText("Set Dark"));

    expect(localStorage.getItem("theme-preference")).toBe("dark");
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("updates data-theme attribute when switching themes", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    await user.click(screen.getByText("Set Dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await user.click(screen.getByText("Set Light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("responds to system theme changes in system mode", () => {
    const listeners = mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("light");

    // Simulate system dark mode change
    act(() => {
      listeners.forEach((fn) =>
        fn({ matches: true } as MediaQueryListEvent)
      );
    });

    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("ignores invalid localStorage values", () => {
    localStorage.setItem("theme-preference", "invalid");
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("system");
  });

  it("throws when useTheme is used outside provider", () => {
    // Suppress console.error for this expected error
    const originalError = console.error;
    console.error = jest.fn();

    expect(() => render(<ThemeDisplay />)).toThrow(
      "useTheme must be used within a ThemeProvider"
    );

    console.error = originalError;
  });
});
