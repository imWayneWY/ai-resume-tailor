import React from "react";
import { render, screen } from "@testing-library/react";
import FitSummary from "@/components/FitSummary";

describe("FitSummary", () => {
  const defaultKeywords = [
    { term: "React", category: "technical" as const, required: true },
    { term: "TypeScript", category: "technical" as const, required: true },
    { term: "Docker", category: "technical" as const, required: false },
    { term: "communication", category: "soft" as const, required: false },
  ];

  it("renders the fit summary heading", () => {
    render(
      <FitSummary
        originalResume="I know React"
        jobDescription="React, TypeScript, Docker, communication"
        llmKeywords={defaultKeywords}
      />
    );
    expect(screen.getByText("Fit summary")).toBeInTheDocument();
  });

  it("renders Required and Nice-to-have groupings", () => {
    render(
      <FitSummary
        originalResume="I know React"
        jobDescription="React, TypeScript, Docker"
        llmKeywords={defaultKeywords}
      />
    );
    expect(screen.getByText(/Required: \d+ \/ 2 backed/)).toBeInTheDocument();
    expect(screen.getByText(/Nice-to-have: \d+ \/ 1 backed/)).toBeInTheDocument();
  });

  it("excludes soft-category keywords from both groups", () => {
    render(
      <FitSummary
        originalResume="I know React and have great communication skills"
        jobDescription="React, TypeScript, Docker, communication"
        llmKeywords={defaultKeywords}
      />
    );
    expect(screen.queryByText(/communication/)).not.toBeInTheDocument();
  });

  it("marks a term backed when verifiedSupportedKeywords includes it", () => {
    render(
      <FitSummary
        originalResume="I have never mentioned these terms"
        jobDescription="React, TypeScript, Docker"
        llmKeywords={defaultKeywords}
        verifiedSupportedKeywords={["React", "TypeScript"]}
      />
    );
    // Both required terms backed -> "Required: 2 / 2 backed"
    expect(screen.getByText("Required: 2 / 2 backed")).toBeInTheDocument();
  });

  it("marks a term backed when confirmedKeywords includes it", () => {
    render(
      <FitSummary
        originalResume="no matches here"
        jobDescription="React, TypeScript, Docker"
        llmKeywords={defaultKeywords}
        confirmedKeywords={["docker"]}
      />
    );
    expect(screen.getByText("Nice-to-have: 1 / 1 backed")).toBeInTheDocument();
  });

  it("falls back to matching against the original resume text", () => {
    render(
      <FitSummary
        originalResume="I have built things with React and TypeScript"
        jobDescription="React, TypeScript, Docker"
        llmKeywords={defaultKeywords}
      />
    );
    expect(screen.getByText("Required: 2 / 2 backed")).toBeInTheDocument();
  });

  it("renders an unbacked chip as a clickable button wired to onReviewTerm", () => {
    const onReviewTerm = jest.fn();
    render(
      <FitSummary
        originalResume="nothing matches"
        jobDescription="React, TypeScript, Docker"
        llmKeywords={defaultKeywords}
        onReviewTerm={onReviewTerm}
      />
    );
    const unbackedButton = screen.getByRole("button", { name: /React/ });
    unbackedButton.click();
    expect(onReviewTerm).toHaveBeenCalledWith("React");
  });

  it("falls back to regex extraction when llmKeywords is not provided", () => {
    render(
      <FitSummary
        originalResume="I know React"
        jobDescription="React TypeScript Docker"
      />
    );
    expect(screen.getByText("Fit summary")).toBeInTheDocument();
  });

  it("computes a weighted rollup score favoring required keywords", () => {
    render(
      <FitSummary
        originalResume="I know React and TypeScript"
        jobDescription="React, TypeScript, Docker"
        llmKeywords={defaultKeywords}
      />
    );
    // required backed = 2, nice-to-have backed = 0 -> (2*2 + 0*1) / (2*2 + 1*1) * 100 = 80
    expect(screen.getByText("80")).toBeInTheDocument();
  });
});
