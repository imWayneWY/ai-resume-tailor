import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TailorPage from "../page";

// ---------- mocks ----------

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Helper to create a mock Response-like object (jsdom doesn't have Response)
function createMockResponse(body: string, init: { status: number; headers?: Record<string, string> }) {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    headers: {
      get: (name: string) => init.headers?.[name.toLowerCase()] ?? init.headers?.[name] ?? null,
    },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  };
}

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

// Mock sessionStorage
const sessionStorageMock = (() => {
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
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
});

// Mock localStorage
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
  mockFetch = jest.fn();
  global.fetch = mockFetch;
  mockPush.mockClear();
  sessionStorageMock.clear();
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  localStorageMock.clear();
  localStorageMock.getItem.mockClear();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------- tests ----------

describe("TailorPage", () => {
  it("renders the page heading", () => {
    render(<TailorPage />);
    expect(
      screen.getByRole("heading", { name: /tailor your resume/i })
    ).toBeInTheDocument();
  });

  it("renders resume textarea", () => {
    render(<TailorPage />);
    expect(
      screen.getByPlaceholderText(/paste your full resume/i)
    ).toBeInTheDocument();
  });

  it("renders job description textarea", () => {
    render(<TailorPage />);
    expect(
      screen.getByPlaceholderText(/paste the job description/i)
    ).toBeInTheDocument();
  });

  it("renders cover letter checkbox (unchecked by default)", () => {
    render(<TailorPage />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("renders submit button disabled by default", () => {
    render(<TailorPage />);
    const button = screen.getByRole("button", { name: /tailor resume/i });
    expect(button).toBeDisabled();
  });

  it("enables submit button when both fields have content", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    const button = screen.getByRole("button", { name: /tailor resume/i });
    expect(button).toBeEnabled();
  });

  it("keeps submit button disabled when only resume is filled", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );

    const button = screen.getByRole("button", { name: /tailor resume/i });
    expect(button).toBeDisabled();
  });

  it("keeps submit button disabled when only job description is filled", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    const button = screen.getByRole("button", { name: /tailor resume/i });
    expect(button).toBeDisabled();
  });

  it("toggles cover letter checkbox", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("submits and navigates to result on success", async () => {
    const user = userEvent.setup();
    const apiResponse = {
      sections: [{ title: "Summary", content: "Test" }],
    };
    mockFetch.mockResolvedValueOnce(
      createMockResponse(JSON.stringify(apiResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/tailor/result");
    });

    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      "tailorResult",
      JSON.stringify(apiResponse)
    );
  });

  it("shows error on API failure", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        JSON.stringify({ error: "Gemini API error (500)" }),
        {
          status: 502,
          headers: { "content-type": "application/json" },
        }
      )
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Gemini API error/i
      );
    });
  });

  it("shows generic error when API returns non-JSON error", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      createMockResponse("Internal Server Error", {
        status: 500,
        headers: { "content-type": "text/plain" },
      })
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong/i
      );
    });
  });

  it("shows network error when fetch throws", async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/network error/i);
    });
  });

  it("shows error when API returns 200 but non-JSON response", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      createMockResponse("", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /unexpected response/i
      );
    });
  });

  it("shows loading state during submission", async () => {
    const user = userEvent.setup();
    // Make fetch hang
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    expect(screen.getByText(/tailoring/i)).toBeInTheDocument();
  });

  it("disables textareas during loading", async () => {
    const user = userEvent.setup();
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    expect(screen.getByPlaceholderText(/paste your full resume/i)).toBeDisabled();
    expect(screen.getByPlaceholderText(/paste the job description/i)).toBeDisabled();
  });

  // --- File upload tests ---
  it("shows error for non-PDF file via file input", async () => {
    render(<TailorPage />);

    const fileInput = screen.getByLabelText(/upload pdf resume/i);
    const file = new File(["hello"], "test.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/only pdf/i);
  });

  it("shows error for empty PDF file", async () => {
    render(<TailorPage />);

    const fileInput = screen.getByLabelText(/upload pdf resume/i);
    const file = new File([], "empty.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/file is empty/i);
  });

  it("shows error for oversized file", async () => {
    render(<TailorPage />);

    const fileInput = screen.getByLabelText(/upload pdf resume/i);
    // Create a file > 10MB
    const bigContent = "a".repeat(10 * 1024 * 1024 + 1);
    const file = new File([bigContent], "big.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/too large/i);
  });

  it("sets placeholder text for valid PDF upload", async () => {
    render(<TailorPage />);

    const fileInput = screen.getByLabelText(/upload pdf resume/i);
    const file = new File(["pdf content"], "resume.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      screen.getByPlaceholderText(/paste your full resume/i)
    ).toHaveValue("[Uploaded: resume.pdf] — PDF parsing coming soon");
  });

  it("sends generateCoverLetter=true when checkbox is checked", async () => {
    const user = userEvent.setup();
    const apiResponse = {
      sections: [{ title: "Summary", content: "Test" }],
      coverLetter: "Dear...",
    };
    mockFetch.mockResolvedValueOnce(
      createMockResponse(JSON.stringify(apiResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.generateCoverLetter).toBe(true);
    });
  });

  it("sends correct request body to /api/tailor (no API key stored)", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        JSON.stringify({ sections: [{ title: "S", content: "C" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume text"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job description text"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: "My resume text",
          jobDescription: "Job description text",
          generateCoverLetter: false,
        }),
      });
    });
  });

  it("includes API key in request body when stored in localStorage", async () => {
    localStorageMock.setItem("gemini-api-key", "user-api-key-123");
    localStorageMock.getItem.mockClear();

    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        JSON.stringify({ sections: [{ title: "S", content: "C" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.apiKey).toBe("user-api-key-123");
    });
  });

  it("does not include apiKey field when no key in localStorage", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        JSON.stringify({ sections: [{ title: "S", content: "C" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste your full resume/i),
      "My resume"
    );
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );
    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.apiKey).toBeUndefined();
    });
  });

  it("renders drag and drop zone", () => {
    render(<TailorPage />);
    expect(screen.getByText(/drag & drop a pdf/i)).toBeInTheDocument();
  });

  it("renders browse label for file upload", () => {
    render(<TailorPage />);
    expect(screen.getByText("browse")).toBeInTheDocument();
  });
});
