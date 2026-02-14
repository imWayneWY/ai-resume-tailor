import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "../page";

// ---------- localStorage mock ----------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

beforeEach(() => {
  localStorageMock.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
});

// ---------- tests ----------

describe("SettingsPage", () => {
  it("renders the page heading", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /settings/i })
      ).toBeInTheDocument();
    });
  });

  it("renders the API key input as password type", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const input = screen.getByLabelText(/gemini api key/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "password");
    });
  });

  it("renders the privacy notice", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/stored locally in your browser/i)
      ).toBeInTheDocument();
    });
  });

  it("renders Save and Clear buttons", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /clear/i })
      ).toBeInTheDocument();
    });
  });

  it("Save button is disabled when input is empty", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });
  });

  it("enables Save button when a key is entered", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/gemini api key/i), "test-key-123");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("saves the API key to localStorage and shows confirmation", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/gemini api key/i), "my-secret-key");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "gemini-api-key",
      "my-secret-key"
    );
    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });

  it("loads existing API key from localStorage on mount", async () => {
    localStorageMock.setItem("gemini-api-key", "pre-existing-key");
    localStorageMock.setItem.mockClear();

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toHaveValue(
        "pre-existing-key"
      );
    });
  });

  it("clears the API key from localStorage", async () => {
    localStorageMock.setItem("gemini-api-key", "key-to-clear");
    localStorageMock.setItem.mockClear();

    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toHaveValue(
        "key-to-clear"
      );
    });

    await user.click(screen.getByRole("button", { name: /clear/i }));

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("gemini-api-key");
    expect(screen.getByLabelText(/gemini api key/i)).toHaveValue("");
  });

  it("hides the saved confirmation when input changes after save", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/gemini api key/i), "some-key");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/gemini api key/i), "x");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("trims whitespace from the key before saving", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/gemini api key/i),
      "  spaced-key  "
    );
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "gemini-api-key",
      "spaced-key"
    );
  });
});
