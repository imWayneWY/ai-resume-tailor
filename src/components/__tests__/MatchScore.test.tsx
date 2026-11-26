import React from "react";
import { render, screen } from "@testing-library/react";
import MatchScore from "@/components/MatchScore";
import { curveScore } from "@/lib/score-curve";

describe("MatchScore", () => {
  const defaultProps = {
    originalResume: "I am a software developer with React experience",
    tailoredResume:
      "Experienced software developer specializing in React and TypeScript with Node.js backend development",
    jobDescription:
      "We need a developer with React, TypeScript, Node.js, and Python experience",
  };

  it("renders the keyword coverage heading", () => {
    render(<MatchScore {...defaultProps} />);
    expect(
      screen.getByText("Keyword coverage backed by real experience")
    ).toBeInTheDocument();
  });

  it("renders Before and After labels", () => {
    render(<MatchScore {...defaultProps} />);
    expect(screen.getAllByText(/Before/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/After/).length).toBeGreaterThan(0);
  });

  it("renders 0-100 score values (not raw counts or percentages)", () => {
    render(<MatchScore {...defaultProps} />);
    // Should show numbers without % symbol
    const percentages = screen.queryAllByText(/%$/);
    expect(percentages.length).toBe(0);
    // Verify numeric score values are actually rendered (0-100 scale)
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
    const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
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
    expect(
      screen.getByText("Keyword coverage backed by real experience")
    ).toBeInTheDocument();
  });

  it("does not show an improvement indicator (before/after use different scoring methods)", () => {
    const propsWithGuaranteedImprovement = {
      originalResume: "React",
      tailoredResume: "React TypeScript Node.js Python",
      jobDescription: "React TypeScript Node.js Python",
    };

    render(<MatchScore {...propsWithGuaranteedImprovement} />);

    // No "+N" improvement indicator is rendered anymore.
    const improvement = screen.queryByText(/^\+\d+$/);
    expect(improvement).not.toBeInTheDocument();
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

  it("excludes missingKeywords terms from the backed coverage score", () => {
    const props = {
      originalResume: "React",
      tailoredResume: "React TypeScript Node.js Python",
      jobDescription: "React TypeScript Node.js Python",
      missingKeywords: [
        { term: "typescript", question: "Have you used TypeScript?" },
        { term: "python", question: "Have you used Python?" },
      ],
    };

    render(<MatchScore {...props} />);
    // Backed coverage = JD keywords matched in the ORIGINAL resume (just
    // "react" out of 4 total JD keywords) plus any confirmed keywords (none
    // here) — i.e. 1/4 = 25%, curved.
    const scoreCircles = screen.getAllByText(/^\d+$/);
    const afterScoreText = scoreCircles[scoreCircles.length - 1].textContent;
    const afterScoreNum = Number(afterScoreText);
    const expected = curveScore(Math.round((1 / 4) * 100));
    expect(afterScoreNum).toBe(expected);
  });

  it("does not count a confirmed term that doesn't map to a JD keyword", () => {
    const props = {
      originalResume: "React",
      tailoredResume: "React TypeScript Node.js Python",
      jobDescription: "React TypeScript Node.js Python",
      confirmedKeywords: ["kubernetes"],
    };

    render(<MatchScore {...props} />);
    // "kubernetes" isn't a JD keyword, so backed coverage should be unchanged
    // from the baseline (1/4 = 25%, curved) — the unmatched confirmed term
    // must not inflate the score.
    const scoreCircles = screen.getAllByText(/^\d+$/);
    const afterScoreText = scoreCircles[scoreCircles.length - 1].textContent;
    const afterScoreNum = Number(afterScoreText);
    const expected = curveScore(Math.round((1 / 4) * 100));
    expect(afterScoreNum).toBe(expected);
  });

  it("includes confirmed keywords in the backed coverage score", () => {
    const props = {
      originalResume: "React",
      tailoredResume: "React TypeScript Node.js Python",
      jobDescription: "React TypeScript Node.js Python",
      confirmedKeywords: ["typescript", "node.js", "python"],
    };

    render(<MatchScore {...props} />);
    // All 4 JD keywords are now backed (1 from original resume + 3 confirmed) -> 100%.
    const scoreCircles = screen.getAllByText(/^\d+$/);
    const afterScoreText = scoreCircles[scoreCircles.length - 1].textContent;
    expect(Number(afterScoreText)).toBe(100);
  });

  describe("LLM keywords", () => {
    it("uses llmKeywords when provided", () => {
      const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
      try {
        render(
          <MatchScore
            originalResume="I know React"
            tailoredResume="I know React and TypeScript"
            jobDescription="anything here"
            llmKeywords={["react", "typescript"]}
          />
        );
        // Should log that LLM keywords are used
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("LLM")
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it("falls back to regex when llmKeywords is empty", () => {
      const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
      try {
        render(
          <MatchScore
            originalResume="I know React"
            tailoredResume="I know React"
            jobDescription="React TypeScript"
            llmKeywords={[]}
          />
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("regex")
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it("falls back to regex when llmKeywords is undefined", () => {
      const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
      try {
        render(
          <MatchScore
            originalResume="I know React"
            tailoredResume="I know React"
            jobDescription="React TypeScript"
          />
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("regex")
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it("matches LLM keywords against resume text using stemming", () => {
      const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
      try {
        render(
          <MatchScore
            originalResume="I am optimizing React applications"
            tailoredResume="I am optimizing React applications with TypeScript"
            jobDescription="anything"
            llmKeywords={["react", "typescript", "optimization", "kubernetes"]}
          />
        );
        // Check that matched keywords include react and typescript
        const matchedCall = consoleSpy.mock.calls.find(
          (c) => typeof c[0] === "string" && c[0].includes("Matched keywords")
        );
        expect(matchedCall).toBeDefined();
        const matchedStr = matchedCall![1] as string;
        expect(matchedStr).toContain("react");
        expect(matchedStr).toContain("typescript");
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe("server before score", () => {
    it("uses server before score when provided, recomputes after score from missingKeywords", () => {
      render(
        <MatchScore
          originalResume="no keywords here"
          tailoredResume="React TypeScript Node.js"
          jobDescription="React TypeScript Node.js"
          serverBeforeScore={25}
          serverAfterScore={78}
        />
      );

      // Should render the server-provided before score.
      expect(screen.getByText("25")).toBeInTheDocument();
    });

    it("logs server scores to console", () => {
      const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
      try {
        render(
          <MatchScore
            originalResume="anything"
            tailoredResume="React"
            jobDescription="React"
            serverBeforeScore={10}
            serverAfterScore={90}
          />
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("server-computed scores")
        );
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it("falls back to client-side scoring when server scores are not provided", () => {
      render(
        <MatchScore
          originalResume="React"
          tailoredResume="React TypeScript Node.js Python"
          jobDescription="React TypeScript Node.js Python"
        />
      );

      // Before and After labels should render with client-computed scores
      expect(screen.getAllByText(/Before/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/After/).length).toBeGreaterThan(0);
    });
  });

});
