import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../ThemeToggle";

// Mock useTheme
const mockSetTheme = jest.fn();
let mockTheme = "system";

jest.mock("../ThemeProvider", () => ({
  useTheme: () => ({
    theme: mockTheme,
    resolvedTheme: mockTheme === "dark" ? "dark" : "light",
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = "system";
  });

  it("renders with system theme label by default", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /system theme/i });
    expect(button).toBeInTheDocument();
  });

  it("shows light mode label when theme is light", () => {
    mockTheme = "light";
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: /light mode/i })
    ).toBeInTheDocument();
  });

  it("shows dark mode label when theme is dark", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: /dark mode/i })
    ).toBeInTheDocument();
  });

  it("cycles from system to light on click", async () => {
    mockTheme = "system";
    const user = userEvent.setup();

    render(<ThemeToggle />);
    await user.click(screen.getByRole("button"));

    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("cycles from light to dark on click", async () => {
    mockTheme = "light";
    const user = userEvent.setup();

    render(<ThemeToggle />);
    await user.click(screen.getByRole("button"));

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("cycles from dark to system on click", async () => {
    mockTheme = "dark";
    const user = userEvent.setup();

    render(<ThemeToggle />);
    await user.click(screen.getByRole("button"));

    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });
});
