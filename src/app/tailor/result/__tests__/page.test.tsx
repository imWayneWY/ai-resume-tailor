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
    sessionStore.tailorResult = JSON.stringify(validResult);
    sessionStore.tailorPersonalInfo = JSON.stringify({
      fullName: "Jane Smith",
      email: "jane@example.com",
      phone: "555-1234",
      location: "Vancouver, BC",
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
    });
    sessionStore.tailorPersonalInfo = JSON.stringify({
      fullName: "Jane Smith",
      email: "",
      phone: "",
      location: "",
    });
    render(<ResultPage />);

    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
  });

  it("renders editable personal info fields", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    sessionStore.tailorPersonalInfo = JSON.stringify({
      fullName: "Jane Smith",
      email: "jane@example.com",
      phone: "",
      location: "",
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
    sessionStore.tailorResult = JSON.stringify(validResult);
    sessionStore.tailorPersonalInfo = JSON.stringify({
      fullName: "Jane Smith",
      email: "",
      phone: "",
      location: "",
      linkedin: "linkedin.com/in/janesmith",
    });
    render(<ResultPage />);

    expect(screen.getByPlaceholderText("linkedin.com/in/johndoe")).toHaveValue("linkedin.com/in/janesmith");
  });

  it("shows LinkedIn in preview contact line", () => {
    sessionStore.tailorResult = JSON.stringify(validResult);
    sessionStore.tailorPersonalInfo = JSON.stringify({
      fullName: "Jane Smith",
      email: "jane@test.com",
      phone: "",
      location: "",
      linkedin: "linkedin.com/in/janesmith",
    });
    render(<ResultPage />);

    expect(screen.getByText(/linkedin\.com\/in\/janesmith/)).toBeInTheDocument();
  });
});
