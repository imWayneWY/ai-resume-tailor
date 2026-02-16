import React from "react";
import { render, screen } from "@testing-library/react";
import MatchScore from "@/components/MatchScore";

describe("MatchScore", () => {
  const defaultProps = {
    originalResume: "I am a software developer with React experience",
    tailoredResume:
      "Experienced software developer specializing in React and TypeScript with Node.js backend development",
    jobDescription:
      "We need a developer with React, TypeScript, Node.js, and Python experience",
  };

  it("renders the JD Match Score heading", () => {
    render(<MatchScore {...defaultProps} />);
    expect(screen.getByText("JD Match Score")).toBeInTheDocument();
  });

  it("renders Before and After labels", () => {
    render(<MatchScore {...defaultProps} />);
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });

  it("renders percentage values", () => {
    render(<MatchScore {...defaultProps} />);
    // Should show percentage numbers — exact values depend on keyword extraction
    const percentages = screen.getAllByText(/%$/);
    expect(percentages.length).toBeGreaterThanOrEqual(2);
  });

  it("shows keywords matched count", () => {
    render(<MatchScore {...defaultProps} />);
    expect(screen.getByText(/keywords matched/)).toBeInTheDocument();
  });

  it("shows missed keywords section when there are misses", () => {
    render(<MatchScore {...defaultProps} />);
    expect(
      screen.getByText(/keywords not in resume/)
    ).toBeInTheDocument();
  });

  it("does not crash with empty inputs", () => {
    render(
      <MatchScore
        originalResume=""
        tailoredResume=""
        jobDescription=""
      />
    );
    expect(screen.getByText("JD Match Score")).toBeInTheDocument();
  });

  it("shows improvement indicator when after score is higher", () => {
    const propsWithGuaranteedImprovement = {
      originalResume: "React",
      tailoredResume: "React TypeScript Node.js Python",
      jobDescription: "React TypeScript Node.js Python",
    };

    render(<MatchScore {...propsWithGuaranteedImprovement} />);

    // When the tailored resume matches more JD keywords than the original,
    // the component should render a positive improvement like "+X%".
    const improvement = screen.getByText(/^\+\d+%$/);
    expect(improvement).toBeInTheDocument();
  });

  it("does not show improvement indicator when scores are equal", () => {
    const propsWithNoImprovement = {
      originalResume: "React TypeScript",
      tailoredResume: "React TypeScript",
      jobDescription: "React TypeScript",
    };

    render(<MatchScore {...propsWithNoImprovement} />);

    const improvement = screen.queryByText(/^\+\d+%$/);
    expect(improvement).not.toBeInTheDocument();
  });
});
