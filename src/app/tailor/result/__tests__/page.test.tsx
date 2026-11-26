import React, { type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResultPage from "../page";

// ---------- mocks ----------

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// Mock @react-pdf/renderer (dynamic import in component)
jest.mock("@react-pdf/renderer", () => ({
  pdf: jest.fn(() => ({
    toBlob: jest.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
  })),
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

  it("renders resume sections from sessionStorage", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    // Should show section titles in both preview and edit
    expect(screen.getAllByText("Summary")).toHaveLength(2);
    expect(screen.getAllByText("Skills")).toHaveLength(2);
    expect(screen.getAllByText("Experience")).toHaveLength(2);
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

  it("renders section content in preview and edit", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    // Content appears in both preview (as text) and edit (as textarea value)
    // so use getAllByText
    expect(screen.getAllByText("Experienced developer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("TypeScript, React, Node.js").length).toBeGreaterThanOrEqual(1);
  });

  it("renders editable textareas for each section", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    // 6 inputs (fullName, email, phone, location, linkedin, jobTitle) + 3 section textareas = 9 textboxes
    const textareas = screen.getAllByRole("textbox");
    expect(textareas).toHaveLength(9);

    // Section textareas are the last 3
    const sectionTextareas = textareas.slice(6);
    expect(sectionTextareas[0]).toHaveValue("Experienced developer");
    expect(sectionTextareas[1]).toHaveValue("TypeScript, React, Node.js");
  });

  it("updates preview when editing a section", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    // Section textareas start after 6 input fields
    const textareas = screen.getAllByRole("textbox");
    const summaryTextarea = textareas[6];
    await user.clear(summaryTextarea);
    await user.type(summaryTextarea, "Updated summary");

    // Updated text appears in both preview and textarea
    expect(screen.getAllByText("Updated summary").length).toBeGreaterThanOrEqual(1);
  });

  it("persists edits to sessionStorage", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    // Section textareas start after 6 input fields
    const textareas = screen.getAllByRole("textbox");
    const summaryTextarea = textareas[6];
    await user.clear(summaryTextarea);
    await user.type(summaryTextarea, "New content");

    await waitFor(() => {
      expect(sessionStorageMock.setItem).toHaveBeenCalled();
      // Find the tailorResult setItem call (not tailorPersonalInfo)
      const calls = sessionStorageMock.setItem.mock.calls;
      const resultCall = calls.filter((c: string[]) => c[0] === "tailorResult").pop();
      expect(resultCall).toBeDefined();
      const saved = JSON.parse(resultCall![1]);
      expect(saved.sections[0].content).toBe("New content");
    });
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
    // With no sessionStorage data, the component has no valid result
    // and redirects to /tailor via the useEffect
    render(<ResultPage />);
    expect(mockReplace).toHaveBeenCalledWith("/tailor");
  });

  it("renders personal info in preview when provided", () => {
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

    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText(/jane@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/555-1234/)).toBeInTheDocument();
    expect(screen.getByText(/Vancouver, BC/)).toBeInTheDocument();
  });

  it("renders job title in preview when returned by API", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      jobTitle: "Senior Software Engineer",
      personalInfo: {
        fullName: "Jane Smith",
      },
    });
    render(<ResultPage />);

    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
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

  it("updates preview when editing personal info", async () => {
    const user = userEvent.setup();
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    const nameInput = screen.getByPlaceholderText("Full Name");
    await user.type(nameInput, "John Doe");

    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("renders LinkedIn field in edit panel", () => {
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

  it("shows LinkedIn in preview contact line", () => {
    sessionStore.tailorResult = JSON.stringify({
      ...validResult,
      personalInfo: {
        fullName: "Jane Smith",
        email: "jane@test.com",
        phone: "",
        location: "",
        linkedin: "linkedin.com/in/janesmith",
      },
    });
    render(<ResultPage />);

    expect(screen.getByText(/linkedin\.com\/in\/janesmith/)).toBeInTheDocument();
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

  it("shows Download PDF button", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    render(<ResultPage />);

    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
  });

  describe("ChangesDiff accept/reject", () => {
    const resultWithChanges = {
      ...validResult,
      sections: [
        { title: "Summary", content: "Built scalable systems." },
      ],
      changes: [
        {
          section: "Summary",
          original: "Built things.",
          revised: "Built scalable systems.",
          reason: "Clarified scope.",
          jdTermsUsed: ["scalable"],
        },
      ],
    };

    it("rejecting then accepting a change restores the revised text", async () => {
      const user = userEvent.setup();
      sessionStore.tailorResult = JSON.stringify(resultWithChanges);
      render(<ResultPage />);

      const rejectButton = screen.getByRole("button", { name: /reject/i });
      await user.click(rejectButton);

      // After reject, the section content should show the original text.
      await waitFor(() => {
        expect(screen.getAllByText(/Built things\./).length).toBeGreaterThan(0);
      });

      const acceptButton = screen.getByRole("button", { name: /accept/i });
      await user.click(acceptButton);

      // After accept, the revised text should be restored.
      await waitFor(() => {
        expect(screen.getAllByText(/Built scalable systems\./).length).toBeGreaterThan(0);
      });
    });

    it("shows a manual-edit message when rejecting a change whose revised text no longer matches", async () => {
      const user = userEvent.setup();
      const resultWithStaleChange = {
        ...resultWithChanges,
        sections: [{ title: "Summary", content: "Something else entirely." }],
      };
      sessionStore.tailorResult = JSON.stringify(resultWithStaleChange);
      render(<ResultPage />);

      const rejectButton = screen.getByRole("button", { name: /reject/i });
      await user.click(rejectButton);

      await waitFor(() => {
        expect(
          screen.getByText(/this line was edited\. please update it manually\./i)
        ).toBeInTheDocument();
      });
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
