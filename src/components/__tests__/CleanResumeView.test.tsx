import { render, screen } from "@testing-library/react";
import CleanResumeView from "../CleanResumeView";

describe("CleanResumeView", () => {
  it("renders the header, a single-paragraph Profile, and bullets starting with '• '", () => {
    const sections = [
      {
        title: "Profile",
        content:
          "Experienced software engineer with 5 years building web products. Focused on reliability and developer productivity. Open to new challenges.",
      },
      {
        title: "Experience",
        content: "**Acme Inc** — Engineer (2021 - 2023)\n• Built a checkout service.\n• Migrated billing to microservices.",
      },
    ];
    const personalInfo = {
      fullName: "Jordan Lee",
      email: "jordan.lee@example.com",
      phone: "555-0100",
      location: "Vancouver, BC",
    };

    render(<CleanResumeView sections={sections} personalInfo={personalInfo} jobTitle="Senior Software Engineer" />);

    // Header: name, job title, contact line.
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText(/jordan\.lee@example\.com/)).toBeInTheDocument();

    // Profile renders as ONE paragraph, not one row per sentence.
    const profileParagraph = screen.getByText(/Experienced software engineer with 5 years/);
    expect(profileParagraph.textContent).toContain("Focused on reliability and developer productivity.");
    expect(profileParagraph.textContent).toContain("Open to new challenges.");
    expect(profileParagraph.tagName.toLowerCase()).toBe("p");

    // Bullets render as a bullet marker + real space + text (not "•Built"
    // glued together) — the marker and text are separate nodes within the
    // bullet row, with a literal space between them.
    const bulletRow = screen.getByText(/Built a checkout service/).closest("p")!;
    expect(bulletRow.textContent).toBe("• Built a checkout service.");

    // Entry header is bold.
    const entryHeader = screen.getByText(/Acme Inc/);
    expect(entryHeader.closest("strong")).not.toBeNull();
  });

  it("omits the header entirely when no personal info or job title is provided", () => {
    const sections = [{ title: "Experience", content: "• Built things." }];
    render(<CleanResumeView sections={sections} />);
    expect(screen.queryByTestId("clean-resume-view")?.querySelector("h2")).toBeNull();
  });
});
