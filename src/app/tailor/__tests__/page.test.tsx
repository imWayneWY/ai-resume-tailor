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

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
  mockPush.mockClear();
  sessionStorageMock.clear();
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// Helper: upload a valid PDF and populate resume textarea
async function uploadResumePdf() {
  mockFetch.mockResolvedValueOnce(
    createMockResponse(
      JSON.stringify({ text: "John Doe\nSoftware Engineer\n5 years experience" }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const fileInput = screen.getByLabelText(/upload pdf resume/i);
  const file = new File(["pdf content"], "resume.pdf", {
    type: "application/pdf",
  });

  fireEvent.change(fileInput, { target: { files: [file] } });

  await waitFor(() => {
    expect(screen.getByText(/resume loaded successfully/i)).toBeInTheDocument();
  });
}

// ---------- tests ----------

describe("TailorPage", () => {
  it("renders the page heading", () => {
    render(<TailorPage />);
    expect(
      screen.getByRole("heading", { name: /tailor your resume/i })
    ).toBeInTheDocument();
  });

  it("renders PDF upload zone", () => {
    render(<TailorPage />);
    expect(screen.getByText(/drag & drop your resume pdf/i)).toBeInTheDocument();
  });

  it("renders job description textarea", () => {
    render(<TailorPage />);
    expect(
      screen.getByPlaceholderText(/paste the job description/i)
    ).toBeInTheDocument();
  });

  it("renders JD URL input", () => {
    render(<TailorPage />);
    expect(
      screen.getByPlaceholderText(/paste job posting url/i)
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

  it("enables submit button when resume is uploaded and JD has content", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    await uploadResumePdf();
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    const button = screen.getByRole("button", { name: /tailor resume/i });
    expect(button).toBeEnabled();
  });

  it("keeps submit button disabled when only JD is filled", async () => {
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

    render(<TailorPage />);

    await uploadResumePdf();
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    // Mock keyword extraction then tailor
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse(JSON.stringify({ keywords: ["react"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        createMockResponse(JSON.stringify(apiResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
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

    render(<TailorPage />);
    await uploadResumePdf();
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    // Keyword extraction succeeds, tailor fails
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse(JSON.stringify({ keywords: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ error: "API error (500)" }),
          {
            status: 502,
            headers: { "content-type": "application/json" },
          }
        )
      );

    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/API error/i);
    });
  });

  it("shows network error when fetch throws", async () => {
    const user = userEvent.setup();

    render(<TailorPage />);
    await uploadResumePdf();
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    mockFetch.mockRejectedValue(new Error("Network failure"));

    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/network error/i);
    });
  });

  // --- PDF upload tests ---
  it("shows error for non-PDF file", async () => {
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
    const bigContent = "a".repeat(10 * 1024 * 1024 + 1);
    const file = new File([bigContent], "big.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/too large/i);
  });

  it("shows success state after PDF upload", async () => {
    render(<TailorPage />);
    await uploadResumePdf();

    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
    expect(screen.getByText(/resume loaded successfully/i)).toBeInTheDocument();
  });

  it("shows error when PDF parsing API returns an error", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        JSON.stringify({ error: "Failed to parse PDF." }),
        { status: 422, headers: { "content-type": "application/json" } }
      )
    );

    render(<TailorPage />);

    const fileInput = screen.getByLabelText(/upload pdf resume/i);
    const file = new File(["bad pdf"], "bad.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/failed to parse pdf/i);
    });
  });

  it("shows parsing state while extracting PDF text", async () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<TailorPage />);

    const fileInput = screen.getByLabelText(/upload pdf resume/i);
    const file = new File(["pdf content"], "resume.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/extracting text from pdf/i)).toBeInTheDocument();
    });
  });

  // --- JD URL fetch tests ---
  it("renders fetch button disabled when URL is empty", () => {
    render(<TailorPage />);
    const fetchBtn = screen.getByRole("button", { name: /fetch/i });
    expect(fetchBtn).toBeDisabled();
  });

  it("fetches JD from URL and populates textarea", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste job posting url/i),
      "https://example.com/job"
    );

    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        JSON.stringify({ jobDescription: "Senior React Developer\nRequirements: 5+ years" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await user.click(screen.getByRole("button", { name: /fetch/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/paste the job description/i)).toHaveValue(
        "Senior React Developer\nRequirements: 5+ years"
      );
    });
  });

  it("shows error when JD URL fetch fails", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste job posting url/i),
      "https://example.com/not-a-job"
    );

    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        JSON.stringify({ error: "No job description found on this page." }),
        { status: 400, headers: { "content-type": "application/json" } }
      )
    );

    await user.click(screen.getByRole("button", { name: /fetch/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/no job description/i);
    });
  });

  it("shows loading state during JD fetch", async () => {
    const user = userEvent.setup();
    render(<TailorPage />);

    await user.type(
      screen.getByPlaceholderText(/paste job posting url/i),
      "https://example.com/job"
    );

    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    await user.click(screen.getByRole("button", { name: /fetch/i }));

    expect(screen.getByText(/fetching/i)).toBeInTheDocument();
  });

  // --- keyword passing ---
  it("passes extracted keywords to tailor API as targetKeywords", async () => {
    const user = userEvent.setup();
    const apiResponse = {
      sections: [{ title: "Summary", content: "Test" }],
    };

    render(<TailorPage />);
    await uploadResumePdf();
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    // Keyword extraction returns keywords, then tailor succeeds
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse(JSON.stringify({ keywords: ["react", "typescript", "node.js"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        createMockResponse(JSON.stringify(apiResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      // PDF parse was call 0, keyword extraction is next non-PDF call
      const tailorCallIdx = mockFetch.mock.calls.findIndex(
        (c: [string, ...unknown[]]) => c[0] === "/api/tailor"
      );
      const fetchBody = JSON.parse((mockFetch.mock.calls[tailorCallIdx][1] as { body: string }).body);
      expect(fetchBody.targetKeywords).toEqual(["react", "typescript", "node.js"]);
    });
  });

  it("still tailors successfully when keyword extraction fails", async () => {
    const user = userEvent.setup();
    const apiResponse = {
      sections: [{ title: "Summary", content: "Test" }],
    };

    render(<TailorPage />);
    await uploadResumePdf();
    await user.type(
      screen.getByPlaceholderText(/paste the job description/i),
      "Job desc"
    );

    // Keyword extraction fails, tailor succeeds
    mockFetch
      .mockRejectedValueOnce(new Error("keyword extraction failed"))
      .mockResolvedValueOnce(
        createMockResponse(JSON.stringify(apiResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    await user.click(
      screen.getByRole("button", { name: /tailor resume/i })
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/tailor/result");
    });
  });

  it("renders browse label for file upload", () => {
    render(<TailorPage />);
    expect(screen.getByText("browse")).toBeInTheDocument();
  });
});
