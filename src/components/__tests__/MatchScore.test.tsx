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

  it("renders numeric score values (not percentages)", () => {
    render(<MatchScore {...defaultProps} />);
    // Should show raw numbers, not percentages
    const percentages = screen.queryAllByText(/%$/);
    expect(percentages.length).toBe(0);
    // Verify numeric score values are actually rendered
    const numericValues = screen.getAllByText(/^\d+$/);
    expect(numericValues.length).toBeGreaterThanOrEqual(2);
  });

  it("does not show keyword count text in UI", () => {
    render(<MatchScore {...defaultProps} />);
    expect(screen.queryByText(/keywords matched/)).not.toBeInTheDocument();
  });

  it("does not show missed keywords in UI", () => {
    render(<MatchScore {...defaultProps} />);
    expect(screen.queryByText(/keywords not in resume/)).not.toBeInTheDocument();
  });

  it("logs matched and missed keywords to console", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    try {
      render(<MatchScore {...defaultProps} />);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[MatchScore] Matched keywords:",
        expect.any(String)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "[MatchScore] Unmatched keywords:",
        expect.any(String)
      );
    } finally {
      consoleSpy.mockRestore();
    }
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

    // Improvement shows as "+N" (raw number, not percentage)
    const improvement = screen.getByText(/^\+\d+$/);
    expect(improvement).toBeInTheDocument();
  });

  it("does not show improvement indicator when scores are equal", () => {
    const propsWithNoImprovement = {
      originalResume: "React TypeScript",
      tailoredResume: "React TypeScript",
      jobDescription: "React TypeScript",
    };

    render(<MatchScore {...propsWithNoImprovement} />);

    const improvement = screen.queryByText(/^\+\d+$/);
    expect(improvement).not.toBeInTheDocument();
  });

});
