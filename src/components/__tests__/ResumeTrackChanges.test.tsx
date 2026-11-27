import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumeTrackChanges from "../ResumeTrackChanges";

describe("MUST FIX 2 — Clean mode hides all diff markup", () => {
  it("in Clean mode, no deleted rows, added badge, warning icon, or deleted-section block appear, even with diff data present", async () => {
    const sections = [
      {
        title: "Experience",
        content:
          "• Built the checkout service.\n• Deployed it to production, used by 10,000 customers daily.\n• Shipped a brand new feature.",
      },
    ];
    const originalResume =
      "Experience\n• Built and deployed the checkout service used by 10,000 customers daily.\n• Maintained the legacy reporting dashboard.\n\nCertifications\nAWS Certified Solutions Architect";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );

    // Initially in Show changes mode — the deleted section block should be visible.
    expect(screen.getByTestId("deleted-section")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clean" }));

    expect(screen.queryByTestId("deleted-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("deleted-section")).not.toBeInTheDocument();
    expect(screen.queryByText("added")).not.toBeInTheDocument();
    expect(screen.queryByText("⚠")).not.toBeInTheDocument();
  });
});

describe("MUST FIX 4 — bold markup renders as <strong>, not raw asterisks", () => {
  it("renders **MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)** as bold text in Show changes mode", () => {
    const sections = [
      {
        title: "Experience",
        content: "**MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)**",
      },
    ];
    const originalResume = "Experience\n**MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)**";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );

    const strongEl = screen.getByText("MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)");
    expect(strongEl.tagName.toLowerCase()).toBe("strong");
    expect(screen.queryByText(/\*\*MICROSOFT/)).not.toBeInTheDocument();
  });

  it("renders bold markup in Clean mode too", async () => {
    const sections = [
      {
        title: "Experience",
        content: "**MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)**",
      },
    ];
    const originalResume = "Experience\nSome unrelated original text.";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clean" }));

    const strongEl = screen.getByText("MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)");
    expect(strongEl.tagName.toLowerCase()).toBe("strong");
  });
});

describe("MUST FIX 5 — fallback alignment pool suppresses deleted-row rendering", () => {
  it("a tailored section with no heading match in the original resume does NOT render deleted rows", () => {
    const sections = [
      {
        title: "Projects",
        content: "• Built a personal portfolio site using Next.js.",
      },
    ];
    // No "Projects" heading anywhere in the original — triggers fallback to
    // the whole-resume alignment pool, which would otherwise flood this
    // section with false "deleted" rows from unrelated original content.
    const originalResume =
      "Experience\n• Built and shipped many unrelated features.\n• Led a team of five engineers.\n• Migrated a legacy monolith to microservices.\n\nEducation\nState University, BS Computer Science";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );

    expect(screen.queryByTestId("deleted-row")).not.toBeInTheDocument();
  });
});

describe("ALSO FIX — inline edit textarea has an accessible label", () => {
  it("has an accessible name via aria-label/associated label", async () => {
    const sections = [
      {
        title: "Experience",
        content: "• Built the checkout service.",
      },
    ];
    const originalResume = "Experience\n• Built and deployed the checkout service used by 10,000 customers daily.";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );

    const user = userEvent.setup();
    const unitButton = screen.getByText(/the checkout service/).closest("button");
    expect(unitButton).toBeTruthy();
    await user.click(unitButton!);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const textarea = screen.getByRole("textbox", { name: /edit bullet text/i });
    expect(textarea).toBeInTheDocument();
  });
});
