import { extractKeywords, calculateMatchScore } from "@/lib/keyword-matcher";

describe("extractKeywords", () => {
  it("extracts significant words from text", () => {
    const keywords = extractKeywords("React TypeScript Node.js Python");
    expect(keywords.has("react")).toBe(true);
    expect(keywords.has("typescript")).toBe(true);
    expect(keywords.has("node.js")).toBe(true);
    expect(keywords.has("python")).toBe(true);
  });

  it("filters out stop words", () => {
    const keywords = extractKeywords("the role requires strong experience with React");
    expect(keywords.has("the")).toBe(false);
    expect(keywords.has("role")).toBe(false);
    expect(keywords.has("strong")).toBe(false);
    expect(keywords.has("experience")).toBe(false);
    expect(keywords.has("react")).toBe(true);
  });

  it("filters out short words not in allowlist", () => {
    const keywords = extractKeywords("Go is a programming language by Google");
    // "is" is a stop word, "a" is a stop word, "by" is a stop word
    expect(keywords.has("is")).toBe(false);
    expect(keywords.has("programming")).toBe(true);
    expect(keywords.has("language")).toBe(true);
    expect(keywords.has("google")).toBe(true);
    // "go" is in the short keyword allowlist
    expect(keywords.has("go")).toBe(true);
  });

  it("filters out pure numbers", () => {
    const keywords = extractKeywords("5 years of React experience 2024");
    expect(keywords.has("5")).toBe(false);
    expect(keywords.has("2024")).toBe(false);
    expect(keywords.has("react")).toBe(true);
  });

  it("normalizes to lowercase", () => {
    const keywords = extractKeywords("React TYPESCRIPT Node.js");
    expect(keywords.has("react")).toBe(true);
    expect(keywords.has("typescript")).toBe(true);
  });

  it("handles tech keywords with dots and special chars", () => {
    const keywords = extractKeywords("Experience with Node.js and GraphQL APIs");
    expect(keywords.has("node.js")).toBe(true);
    expect(keywords.has("graphql")).toBe(true);
    expect(keywords.has("apis")).toBe(true);
  });

  it("returns empty set for empty input", () => {
    const keywords = extractKeywords("");
    expect(keywords.size).toBe(0);
  });

  it("returns empty set for only stop words", () => {
    const keywords = extractKeywords("the and or but if with for");
    expect(keywords.size).toBe(0);
  });

  it("keeps short tech keywords via allowlist", () => {
    const keywords = extractKeywords("Go R C AI ML CI CD");
    expect(keywords.has("go")).toBe(true);
    expect(keywords.has("r")).toBe(true);
    expect(keywords.has("c")).toBe(true);
    expect(keywords.has("ai")).toBe(true);
    expect(keywords.has("ml")).toBe(true);
    expect(keywords.has("ci")).toBe(true);
    expect(keywords.has("cd")).toBe(true);
  });
});

describe("calculateMatchScore", () => {
  it("calculates correct match percentage", () => {
    const jdKeywords = new Set(["react", "typescript", "node.js", "python"]);
    const result = calculateMatchScore("I know React and TypeScript well", jdKeywords);

    expect(result.matchCount).toBe(2);
    expect(result.totalKeywords).toBe(4);
    expect(result.matchPercentage).toBe(50);
    expect(result.matchedKeywords).toContain("react");
    expect(result.matchedKeywords).toContain("typescript");
    expect(result.missedKeywords).toContain("node.js");
    expect(result.missedKeywords).toContain("python");
  });

  it("returns 100% when all keywords match", () => {
    const jdKeywords = new Set(["react", "typescript"]);
    const result = calculateMatchScore(
      "Built applications with React and TypeScript",
      jdKeywords
    );

    expect(result.matchPercentage).toBe(100);
    expect(result.missedKeywords).toHaveLength(0);
  });

  it("returns 0% when no keywords match", () => {
    const jdKeywords = new Set(["python", "django", "flask"]);
    const result = calculateMatchScore(
      "Built applications with React and TypeScript",
      jdKeywords
    );

    expect(result.matchPercentage).toBe(0);
    expect(result.matchedKeywords).toHaveLength(0);
  });

  it("returns 0% for empty keywords set", () => {
    const jdKeywords = new Set<string>();
    const result = calculateMatchScore("Some resume text", jdKeywords);

    expect(result.matchPercentage).toBe(0);
    expect(result.totalKeywords).toBe(0);
  });

  it("returns sorted keyword lists", () => {
    const jdKeywords = new Set(["typescript", "react", "python", "aws"]);
    const result = calculateMatchScore(
      "Experience with React and AWS cloud services",
      jdKeywords
    );

    expect(result.matchedKeywords).toEqual(["aws", "react"]);
    expect(result.missedKeywords).toEqual(["python", "typescript"]);
  });

  it("rounds match percentage to nearest integer", () => {
    const jdKeywords = new Set(["react", "typescript", "python"]);
    const result = calculateMatchScore("I use React daily", jdKeywords);

    // 1/3 = 33.33...% → 33%
    expect(result.matchPercentage).toBe(33);
  });
});
