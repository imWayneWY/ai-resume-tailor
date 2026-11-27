import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResumeTrackChanges, { type TrackChangesSection } from "../ResumeTrackChanges";

/** Stateful wrapper so interaction tests (edit/restore/revert) actually persist sections across re-renders, like the real page.tsx does. */
function StatefulResumeTrackChanges({
  initialSections,
  originalResume,
}: {
  initialSections: TrackChangesSection[];
  originalResume: string;
}) {
  const [sections, setSections] = useState(initialSections);
  return <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={setSections} />;
}

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

  it("renders a changed bold header fully bold with no raw asterisks visible in Show-changes mode (title changes inside bold wrapper)", () => {
    const sections = [
      {
        title: "Experience",
        content: "**MICROSOFT, VANCOUVER, Senior SDE2 (2023 - PRESENT)**",
      },
    ];
    const originalResume = "Experience\n**MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)**";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );

    // No raw, unmatched ** markers anywhere in the rendered output.
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    // The whole header unit is still rendered with bold styling.
    const container = screen.getByText("MICROSOFT,", { exact: false });
    const strongAncestor = container.closest("strong");
    expect(strongAncestor).not.toBeNull();
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

describe("ROUND 5 MUST FIX 2 — stable keys prevent a stale draft from landing on the wrong bullet", () => {
  it("saving an editor opened on a distinctive bullet still applies to that bullet after a Restore shifts indices above it", async () => {
    const sections = [
      {
        title: "Experience",
        content:
          "• Shipped the distinctive feature Zephyr.\n• Second unrelated bullet.\n• Third unrelated bullet.",
      },
    ];
    // Original has an extra bullet ABOVE the distinctive one that the
    // tailored content dropped entirely — restoring it will insert a new
    // unit before the distinctive bullet, shifting its index down.
    const originalResume =
      "Experience\n• Dropped bullet that will be restored.\n• Shipped the distinctive feature Zephyr.\n• Second unrelated bullet.\n• Third unrelated bullet.";

    render(
      <StatefulResumeTrackChanges initialSections={sections} originalResume={originalResume} />
    );

    const user = userEvent.setup();

    // Open the editor on the distinctive bullet (currently at index 0).
    const distinctiveButton = screen.getByText(/distinctive feature Zephyr/).closest("button");
    expect(distinctiveButton).toBeTruthy();
    await user.click(distinctiveButton!);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const textarea = screen.getByRole("textbox", { name: /edit bullet text/i });
    await user.clear(textarea);
    await user.type(textarea, "Shipped the distinctive feature Zephyr, rewritten.");

    // Now trigger Restore on the deleted row ABOVE it, which inserts a new
    // unit and shifts the distinctive bullet's positional index.
    const deletedRowButton = screen.getByText(/Dropped bullet that will be restored/).closest("button");
    expect(deletedRowButton).toBeTruthy();
    await user.click(deletedRowButton!);
    await user.click(screen.getByRole("button", { name: "Restore" }));

    // Now click Save on the still-open editor for the distinctive bullet.
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The saved text must land on the distinctive bullet, not whatever now
    // occupies its old positional index.
    expect(screen.getByText(/Shipped the distinctive feature Zephyr/)).toBeInTheDocument();
    expect(screen.getByText(/, rewritten/)).toBeInTheDocument();
    expect(screen.queryByText(/^Second unrelated bullet, rewritten/)).not.toBeInTheDocument();
  });
});

describe("ROUND 5 SHOULD FIX — empty section keeps a placeholder with Revert available", () => {
  it("renders a placeholder (not a dead-end blank section) when all units are removed", () => {
    const sections = [
      {
        title: "Summary",
        content: "",
      },
    ];
    const originalResume = "Summary\nOriginal summary sentence.";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );

    // With empty tailored content, there are no UnitRows — but the
    // deleted-row for the original sentence should still be clickable/visible.
    expect(screen.getByTestId("deleted-row")).toBeInTheDocument();
  });
});

describe("ROUND 6 SMALL — empty-section placeholder is interactive and lets the user add content back", () => {
  it("renders a clickable empty-section-placeholder (not a dead, non-interactive div) when the section is genuinely empty in both original and tailored content", () => {
    const sections = [
      {
        title: "Projects",
        content: "",
      },
    ];
    // No "Projects" content in the original resume either, so there's no
    // unmatched original unit — this exercises the genuinely-empty-section
    // branch (isEmptySection), not the deleted-row branch.
    const originalResume = "Experience\n• Built the checkout service.";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );

    expect(screen.getByTestId("empty-section-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("deleted-row")).not.toBeInTheDocument();
  });

  it("clicking the placeholder opens an inline editor; typing text and clicking Save inserts it into the now-empty section", async () => {
    const sections = [
      {
        title: "Projects",
        content: "",
      },
    ];
    const originalResume = "Experience\n• Built the checkout service.";
    const onSectionsChange = jest.fn();

    render(
      <ResumeTrackChanges
        sections={sections}
        originalResume={originalResume}
        onSectionsChange={onSectionsChange}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("empty-section-placeholder"));

    const textarea = screen.getByLabelText(/Add section content/i);
    await user.type(textarea, "Built a new side project from scratch.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSectionsChange).toHaveBeenCalled();
    const lastCall = onSectionsChange.mock.calls[onSectionsChange.mock.calls.length - 1][0];
    const projectsSection = lastCall.find((s: { title: string; content: string }) => s.title === "Projects");
    expect(projectsSection?.content).toContain("Built a new side project from scratch.");
  });
});

describe("ROUND 5 SMALL — Clean mode reflects the TAILORED text's own bold state, not the original's", () => {
  it("does NOT render bold in Clean mode when the tailored text stripped the bold markers the original had", async () => {
    const sections = [
      {
        title: "Experience",
        content: "MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)",
      },
    ];
    const originalResume = "Experience\n**MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)**";

    render(
      <ResumeTrackChanges sections={sections} originalResume={originalResume} onSectionsChange={() => {}} />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clean" }));

    const el = screen.getByText("MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)");
    expect(el.closest("strong")).toBeNull();
  });
});
