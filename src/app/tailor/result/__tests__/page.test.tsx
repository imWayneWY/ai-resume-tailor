import React, { type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResultPage, { type Section } from "../page";

// ---------- mocks ----------

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// Capture the ReactElement/props passed into pdf(<ResumePdf ... />) so we
// can assert the PDF always gets the CURRENT/clean text, never diff-marked
// text. (@react-pdf/renderer's `pdf()` is mocked below and never actually
// renders the element tree, so we can't rely on the ResumePdf mock being
// invoked — we capture directly from the element passed to pdf().)
let capturedPdfProps: Record<string, unknown> | null = null;

// Mock @react-pdf/renderer (dynamic import in component)
jest.mock("@react-pdf/renderer", () => ({
  pdf: jest.fn((element: { props: Record<string, unknown> }) => {
    capturedPdfProps = element.props;
    return {
      toBlob: jest.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
    };
  }),
  Document: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

jest.mock("@/components/ResumePdf", () => ({
  __esModule: true,
  default: () => <div data-testid="resume-pdf">PDF</div>,
}));

const validResult = {
  sections: [
    { title: "Summary", content: "Experienced developer" },
    { title: "Skills", content: "TypeScript, React, Node.js" },
    { title: "Experience", content: "ACME Corp — Senior Engineer (2020-2024)\n• Built things" },
  ],
};

const resultWithCoverLetter = {
  ...validResult,
  coverLetter: "Dear Hiring Manager,\n\nI am writing to apply...",
};

// Mock sessionStorage
let sessionStore: Record<string, string> = {};
const sessionStorageMock = {
  getItem: jest.fn((key: string) => sessionStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    sessionStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete sessionStore[key];
  }),
  clear: jest.fn(() => {
    sessionStore = {};
  }),
};

Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
  writable: true,
});

beforeEach(() => {
  sessionStore = {};
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  capturedPdfProps = null;
});

// ---------- tests ----------

describe("ResultPage", () => {
  it("redirects to /tailor when no result in sessionStorage", () => {
    render(<ResultPage />);
    expect(mockReplace).toHaveBeenCalledWith("/tailor");
  });

  it("redirects to /tailor when sessionStorage has invalid JSON", () => {
    sessionStore.tailorResult = "NOT VALID JSON";
    render(<ResultPage />);
    expect(mockReplace).toHaveBeenCalledWith("/tailor");
  });

  it("redirects to /tailor when sections array is empty", () => {
    sessionStore.tailorResult = JSON.stringify({ sections: [] });
    render(<ResultPage />);
    expect(mockReplace).toHaveBeenCalledWith("/tailor");
  });

  it("redirects to /tailor when sections have invalid shape", () => {
    sessionStore.tailorResult = JSON.stringify({
      sections: [{ title: 123, content: null }],
    });
    render(<ResultPage />);
    expect(mockReplace).toHaveBeenCalledWith("/tailor");
  });

  it("renders resume section titles in the Resume block", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();
  });

  it("renders FitSummary without throwing when tailorLlmKeywords is a legacy string[] from an older session", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    sessionStore.tailorOriginalResume = "I know React and TypeScript";
    sessionStore.tailorJobDescription = "React, TypeScript";
    sessionStore.tailorLlmKeywords = JSON.stringify(["react", "typescript"]);

    expect(() => render(<ResultPage />)).not.toThrow();
    expect(screen.getByText("Fit summary")).toBeInTheDocument();
  });

  it("renders without throwing when stored validation is missing droppedSkills (legacy result)", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      validation: {
        bannedPhraseHits: [],
        tackedOnClauseHits: [],
        overusedKeywords: [],
        newNumbers: [],
        newProperNouns: [],
        // droppedSkills intentionally omitted (legacy stored result)
      },
    });
    expect(() => render(<ResultPage />)).not.toThrow();
  });

  it("renders without throwing when stored validation is missing multiple array fields", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      validation: {},
    });
    expect(() => render(<ResultPage />)).not.toThrow();
  });

  it("renders section content in the Resume block", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    expect(screen.getByText("Experienced developer")).toBeInTheDocument();
    expect(document.body.textContent).toContain("TypeScript, React, Node.js");
  });

  it("renders Back button that navigates to /tailor", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    const backButton = screen.getByRole("button", { name: /back/i });
    await user.click(backButton);

    expect(mockPush).toHaveBeenCalledWith("/tailor");
  });

  it("renders Download PDF button", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    expect(
      screen.getByRole("button", { name: /download pdf/i })
    ).toBeInTheDocument();
  });

  it("passes current (unmodified) section text to ResumePdf on download, never diff-marked text", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    const downloadButton = screen.getByRole("button", { name: /download pdf/i });
    await user.click(downloadButton);

    await waitFor(() => {
      expect(capturedPdfProps).not.toBeNull();
    });
    const props = capturedPdfProps as unknown as { sections: Section[] };
    expect(props.sections).toEqual(validResult.sections);
    // No diff markup characters should ever appear in what's handed to the PDF.
    for (const section of props.sections) {
      expect(section.content).not.toMatch(/<del>|<ins>/);
    }
  });

  it("does not render cover letter section when not present", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    expect(screen.queryByText(/cover letter/i)).not.toBeInTheDocument();
  });

  it("renders collapsible cover letter section when present", () => {
    sessionStore.tailorResult = JSON.stringify(resultWithCoverLetter);
    render(<ResultPage />);

    const coverLetterButton = screen.getByRole("button", {
      name: /cover letter/i,
    });
    expect(coverLetterButton).toBeInTheDocument();
    expect(coverLetterButton).toHaveAttribute("aria-expanded", "false");
  });

  it("expands cover letter on click", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(resultWithCoverLetter);
    render(<ResultPage />);

    const coverLetterButton = screen.getByRole("button", {
      name: /cover letter/i,
    });
    await user.click(coverLetterButton);

    expect(coverLetterButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/I am writing to apply/i)
    ).toBeInTheDocument();
  });

  it("collapses cover letter on second click", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(resultWithCoverLetter);
    render(<ResultPage />);

    const coverLetterButton = screen.getByRole("button", {
      name: /cover letter/i,
    });
    await user.click(coverLetterButton);
    expect(coverLetterButton).toHaveAttribute("aria-expanded", "true");

    await user.click(coverLetterButton);
    expect(coverLetterButton).toHaveAttribute("aria-expanded", "false");
  });

  it("shows heading and description", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    expect(
      screen.getByRole("heading", { name: /tailored resume/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/review and edit your tailored resume/i)
    ).toBeInTheDocument();
  });

  it("redirects to /tailor when result is null (no sessionStorage data)", () => {
    render(<ResultPage />);
    expect(mockReplace).toHaveBeenCalledWith("/tailor");
  });

  it("renders personal info in header form when provided", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      personalInfo: {
        fullName: "Jane Smith",
        email: "jane@example.com",
        phone: "555-1234",
        location: "Vancouver, BC",
      },
    });
    render(<ResultPage />);

    expect(screen.getByPlaceholderText("Full Name")).toHaveValue("Jane Smith");
    expect(screen.getByPlaceholderText("Email")).toHaveValue("jane@example.com");
    expect(screen.getByPlaceholderText("Phone")).toHaveValue("555-1234");
    expect(screen.getByPlaceholderText("Location")).toHaveValue("Vancouver, BC");
  });

  it("renders job title in header form when returned by API", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      jobTitle: "Senior Software Engineer",
      personalInfo: {
        fullName: "Jane Smith",
      },
    });
    render(<ResultPage />);

    expect(screen.getByPlaceholderText("e.g., Senior Software Engineer")).toHaveValue(
      "Senior Software Engineer"
    );
  });

  it("renders editable personal info fields", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      personalInfo: {
        fullName: "Jane Smith",
        email: "jane@example.com",
        phone: "",
        location: "",
      },
    });
    render(<ResultPage />);

    expect(screen.getByPlaceholderText("Full Name")).toHaveValue("Jane Smith");
    expect(screen.getByPlaceholderText("Email")).toHaveValue("jane@example.com");
  });

  it("renders editable job title field", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      jobTitle: "Product Manager",
    });
    render(<ResultPage />);

    expect(screen.getByPlaceholderText("e.g., Senior Software Engineer")).toHaveValue("Product Manager");
  });

  it("updates name field as the user types", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    const nameInput = screen.getByPlaceholderText("Full Name");
    await user.type(nameInput, "John Doe");

    expect(nameInput).toHaveValue("John Doe");
  });

  it("renders LinkedIn field in header form", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      personalInfo: {
        fullName: "Jane Smith",
        email: "",
        phone: "",
        location: "",
        linkedin: "linkedin.com/in/janesmith",
      },
    });
    render(<ResultPage />);

    expect(screen.getByPlaceholderText("linkedin.com/in/johndoe")).toHaveValue("linkedin.com/in/janesmith");
  });

  it("uses LLM-extracted personal info from API response", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      personalInfo: {
        fullName: "Yan Wei",
        email: "im.weiyan@foxmail.com",
        phone: "587-439-8687",
        location: "Langley, BC, Canada",
        linkedin: "linkedin.com/in/yan-wei-ca",
      },
    });
    render(<ResultPage />);

    expect(screen.getByPlaceholderText("Full Name")).toHaveValue("Yan Wei");
    expect(screen.getByPlaceholderText("Email")).toHaveValue("im.weiyan@foxmail.com");
    expect(screen.getByPlaceholderText("Phone")).toHaveValue("587-439-8687");
    expect(screen.getByPlaceholderText("Location")).toHaveValue("Langley, BC, Canada");
    expect(screen.getByPlaceholderText("linkedin.com/in/johndoe")).toHaveValue("linkedin.com/in/yan-wei-ca");
  });

  describe("Resume block — diff/revert", () => {
    const resultWithRealDiff = {
      ...validResult,
      sections: [
        {
          title: "Experience",
          content:
            "• Led full codebase migration from JavaScript to TypeScript",
        },
      ],
    };

    it("shows the Resume block with Show changes / Clean toggle", () => {
      sessionStore.tailorResult = JSON.stringify(resultWithRealDiff);
      sessionStore.tailorOriginalResume =
        "Experience\n• Led full codebase migration from JavaScript to TypeScript, significantly improving developer productivity and code maintainability";
      render(<ResultPage />);

      expect(screen.getByRole("button", { name: "Show changes" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Clean" })).toBeInTheDocument();
    });

    it("clicking a changed bullet reveals a Revert option that restores the exact original text", async () => {
      const user = userEvent.setup();
      sessionStore.tailorResult = JSON.stringify(resultWithRealDiff);
      sessionStore.tailorOriginalResume =
        "Experience\n• Led full codebase migration from JavaScript to TypeScript, significantly improving developer productivity and code maintainability";
      render(<ResultPage />);

      // Click the changed bullet to open its popover.
      const bulletText = screen.getByText(/Led full codebase migration/);
      await user.click(bulletText);

      const revertButton = await screen.findByRole("button", { name: /revert/i });
      await user.click(revertButton);

      await waitFor(() => {
        expect(
          screen.getByText(/significantly improving developer productivity and code maintainability/)
        ).toBeInTheDocument();
      });
    });

    it("editing a bullet persists the updated content to sessionStorage's tailorResult, and survives a simulated reload", async () => {
      const user = userEvent.setup();
      sessionStore.tailorResult = JSON.stringify(resultWithRealDiff);
      sessionStore.tailorOriginalResume =
        "Experience\n• Led full codebase migration from JavaScript to TypeScript, significantly improving developer productivity and code maintainability";
      const { unmount } = render(<ResultPage />);

      const bulletText = screen.getByText(/Led full codebase migration/);
      await user.click(bulletText);

      const editButton = await screen.findByRole("button", { name: /^edit$/i });
      await user.click(editButton);

      const textarea = screen.getByDisplayValue(/Led full codebase migration/);
      await user.clear(textarea);
      await user.type(textarea, "Led the TypeScript migration end-to-end.");

      const saveButton = await screen.findByRole("button", { name: /^save$/i });
      await user.click(saveButton);

      await waitFor(() => {
        const stored = JSON.parse(sessionStore.tailorResult);
        expect(stored.sections[0].content).toContain("Led the TypeScript migration end-to-end.");
      });

      // Simulate a reload: unmount, re-read from sessionStorage, re-render.
      unmount();
      render(<ResultPage />);
      const reloaded = JSON.parse(sessionStore.tailorResult);
      expect(reloaded.sections[0].content).toContain("Led the TypeScript migration end-to-end.");
    });

    it("unchanged bullets are also clickable/editable, not just changed ones", async () => {
      const user = userEvent.setup();
      const unchangedResult = {
        ...validResult,
        sections: [{ title: "Experience", content: "• Built the checkout flow." }],
      };
      sessionStore.tailorResult = JSON.stringify(unchangedResult);
      sessionStore.tailorOriginalResume = "Experience\n• Built the checkout flow.";
      render(<ResultPage />);

      const bulletText = screen.getByText(/Built the checkout flow/);
      await user.click(bulletText);

      expect(await screen.findByRole("button", { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^revert$/i })).not.toBeInTheDocument();
    });
  });

  describe("regeneration accumulates confirmed facts", () => {
    const resultWithMissingKeywords = {
      ...validResult,
      missingKeywords: [
        { term: "Kubernetes", question: "Have you used Kubernetes?" },
        { term: "GraphQL", question: "Have you used GraphQL?" },
      ],
    };

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("includes both rounds' confirmations in the second request's confirmedFacts", async () => {
      const user = userEvent.setup();
      sessionStore.tailorResult = JSON.stringify(resultWithMissingKeywords);

      const mockResponse = (data: unknown) => ({
        ok: true,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify(data),
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(resultWithMissingKeywords))
        .mockResolvedValueOnce(mockResponse(resultWithMissingKeywords));

      render(<ResultPage />);

      // Round 1: confirm Kubernetes
      const kubernetesCheckbox = screen.getByLabelText("Kubernetes");
      await user.click(kubernetesCheckbox);
      const explanationInputs = screen.getAllByPlaceholderText(
        /one sentence explaining your experience/i
      );
      await user.type(explanationInputs[0], "Ran EKS clusters in production.");

      const regenerateButton = screen.getByRole("button", {
        name: /regenerate with confirmed facts/i,
      });
      await user.click(regenerateButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      // Round 2: confirm GraphQL. MissingKeywords doesn't remount (same
      // missingKeywords list key), so the Kubernetes checkbox/explanation
      // from round 1 remain checked.
      const explanationInputs2 = screen.getAllByPlaceholderText(
        /one sentence explaining your experience/i
      );
      const graphqlCheckbox = screen.getByLabelText("GraphQL");
      await user.click(graphqlCheckbox);
      await user.type(explanationInputs2[1], "Built GraphQL APIs with Apollo.");

      const regenerateButton2 = screen.getByRole("button", {
        name: /regenerate with confirmed facts/i,
      });
      await user.click(regenerateButton2);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      });

      const secondCallBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body
      );
      expect(secondCallBody.confirmedFacts).toContain("Kubernetes: Ran EKS clusters in production.");
      expect(secondCallBody.confirmedFacts).toContain("GraphQL: Built GraphQL APIs with Apollo.");
    });
  });
});
