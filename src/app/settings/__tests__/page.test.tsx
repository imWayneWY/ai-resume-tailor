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

  it("renders the Gemini API key input as password type", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const input = screen.getByLabelText(/gemini api key/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "password");
    });
  });

  it("renders the Groq API key input as password type", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const input = screen.getByLabelText(/groq api key/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "password");
    });
  });

  it("renders the Model Provider selector", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const select = screen.getByLabelText(/model provider/i);
      expect(select).toBeInTheDocument();
    });
  });

  it("defaults to Gemini provider", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const select = screen.getByLabelText(/model provider/i) as HTMLSelectElement;
      expect(select.value).toBe("gemini");
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

  it("enables Save button when a Gemini key is entered", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/gemini api key/i), "test-key-123");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("saves all settings to localStorage and shows confirmation", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/gemini api key/i), "my-gemini-key");
    await user.type(screen.getByLabelText(/groq api key/i), "my-groq-key");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "gemini-api-key",
      "my-gemini-key"
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "groq-api-key",
      "my-groq-key"
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "model-provider",
      "gemini"
    );
    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });

  it("saves selected provider to localStorage", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/model provider/i)).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/model provider/i), "groq");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "model-provider",
      "groq"
    );
  });

  it("loads existing settings from localStorage on mount", async () => {
    localStorageMock.setItem("gemini-api-key", "pre-existing-gemini-key");
    localStorageMock.setItem("groq-api-key", "pre-existing-groq-key");
    localStorageMock.setItem("model-provider", "groq");
    localStorageMock.setItem.mockClear();

    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toHaveValue(
        "pre-existing-gemini-key"
      );
      expect(screen.getByLabelText(/groq api key/i)).toHaveValue(
        "pre-existing-groq-key"
      );
      const select = screen.getByLabelText(/model provider/i) as HTMLSelectElement;
      expect(select.value).toBe("groq");
    });
  });

  it("clears all settings from localStorage", async () => {
    localStorageMock.setItem("gemini-api-key", "key-to-clear");
    localStorageMock.setItem("groq-api-key", "groq-key-to-clear");
    localStorageMock.setItem("model-provider", "groq");
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
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("groq-api-key");
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("model-provider");
    expect(screen.getByLabelText(/gemini api key/i)).toHaveValue("");
    expect(screen.getByLabelText(/groq api key/i)).toHaveValue("");
    const select = screen.getByLabelText(/model provider/i) as HTMLSelectElement;
    expect(select.value).toBe("gemini");
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

  it("hides the saved confirmation when provider changes after save", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/model provider/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/model provider/i), "groq");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("trims whitespace from keys before saving", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText(/gemini api key/i),
      "  spaced-key  "
    );
    await user.type(
      screen.getByLabelText(/groq api key/i),
      "  groq-spaced  "
    );
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "gemini-api-key",
      "spaced-key"
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "groq-api-key",
      "groq-spaced"
    );
  });

  it("shows error when localStorage.setItem throws", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/gemini api key/i), "some-key");

    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceeded");
    });

    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/failed to save/i);
  });

  it("shows error when localStorage.removeItem throws", async () => {
    localStorageMock.setItem("gemini-api-key", "some-key");
    localStorageMock.setItem.mockClear();

    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/gemini api key/i)).toHaveValue("some-key");
    });

    localStorageMock.removeItem.mockImplementationOnce(() => {
      throw new Error("Storage disabled");
    });

    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/failed to clear/i);
  });

  it("still loads page when localStorage.getItem throws", async () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error("Storage disabled");
    });

    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /settings/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/gemini api key/i)).toHaveValue("");
  });

  it("shows Groq option in provider selector", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const select = screen.getByLabelText(/model provider/i);
      const options = select.querySelectorAll("option");
      const optionValues = Array.from(options).map((o) => o.textContent);
      expect(optionValues).toContain("Gemini");
      expect(optionValues).toContain("Groq");
    });
  });

  it("can switch provider to Groq", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/model provider/i)).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/model provider/i), "groq");
    const select = screen.getByLabelText(/model provider/i) as HTMLSelectElement;
    expect(select.value).toBe("groq");
  });

  it("ignores invalid provider values in localStorage", async () => {
    localStorageMock.setItem("model-provider", "invalid-provider");
    localStorageMock.setItem.mockClear();

    render(<SettingsPage />);
    await waitFor(() => {
      const select = screen.getByLabelText(/model provider/i) as HTMLSelectElement;
      expect(select.value).toBe("gemini");
    });
  });
});
