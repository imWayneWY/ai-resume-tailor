import { redactText, redactSections, redactPersonalInfo } from "../redact";

describe("redactText", () => {
  it("replaces words with gibberish of same length", () => {
    const input = "Hello world";
    const result = redactText(input);
    // Same number of words
    expect(result.split(" ")).toHaveLength(2);
    // Words should be similar length
    const [w1, w2] = result.split(" ");
    expect(w1.length).toBe(5); // "Hello" = 5 chars
    expect(w2.length).toBe(5); // "world" = 5 chars
    // Should not be the original text
    expect(result).not.toBe(input);
  });

  it("preserves whitespace and line breaks", () => {
    const input = "Line one\nLine two\n\nLine four";
    const result = redactText(input);
    expect(result).toContain("\n");
    expect(result.split("\n")).toHaveLength(4);
  });

  it("preserves punctuation", () => {
    const input = "Hello, world! How are you?";
    const result = redactText(input);
    expect(result).toContain(",");
    expect(result).toContain("!");
    expect(result).toContain("?");
  });

  it("preserves numbers", () => {
    const input = "Built 5 apps in 2024";
    const result = redactText(input);
    expect(result).toContain("5");
    expect(result).toContain("2024");
  });

  it("capitalizes first letter when original is capitalized", () => {
    const input = "Hello";
    const result = redactText(input);
    expect(result[0]).toBe(result[0].toUpperCase());
  });

  it("returns empty string for empty input", () => {
    expect(redactText("")).toBe("");
  });

  it("preserves bullet points", () => {
    const input = "• Led team of 5 engineers\n• Built React components";
    const result = redactText(input);
    expect(result).toContain("•");
  });

  it("handles hyphenated words as single tokens", () => {
    const input = "self-taught full-stack developer";
    const result = redactText(input);
    // Hyphens should be preserved; each hyphenated word treated as one match
    const words = result.split(" ");
    expect(words).toHaveLength(3);
    expect(words[0]).toContain("-");
    expect(words[1]).toContain("-");
  });

  it("handles contractions", () => {
    const input = "don't I'm won't";
    const result = redactText(input);
    // Apostrophes should be preserved within words
    const words = result.split(" ");
    expect(words).toHaveLength(3);
    // Each word should contain an apostrophe
    expect(words[0]).toMatch(/'/);
    expect(words[1]).toMatch(/'/);
  });

  it("handles slash-separated words (e.g., CI/CD)", () => {
    const input = "CI/CD and/or frontend/backend";
    const result = redactText(input);
    // Slashes connect words into single tokens
    const words = result.split(" ");
    expect(words).toHaveLength(3);
    expect(words[0]).toContain("/");
    expect(words[2]).toContain("/");
  });
});

describe("redactSections", () => {
  it("redacts content but preserves titles", () => {
    const sections = [
      { title: "Summary", content: "Experienced software engineer" },
      { title: "Skills", content: "TypeScript, React, Node.js" },
    ];
    const result = redactSections(sections);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Summary");
    expect(result[1].title).toBe("Skills");
    expect(result[0].content).not.toContain("Experienced");
    expect(result[1].content).not.toContain("TypeScript");
  });
});

describe("redactPersonalInfo", () => {
  it("redacts all personal info fields", () => {
    const info = {
      fullName: "Yan Wei",
      email: "yan@example.com",
      phone: "604-555-1234",
      location: "Vancouver, BC",
      linkedin: "linkedin.com/in/yanwei",
    };
    const result = redactPersonalInfo(info);
    expect(result.fullName).not.toBe("Yan Wei");
    expect(result.email).not.toBe("yan@example.com");
    expect(result.email).toContain("@");
    expect(result.phone).toBe("***-***-****");
    expect(result.location).not.toBe("Vancouver, BC");
    expect(result.linkedin).toBe("linkedin.com/in/********");
  });

  it("handles undefined fields", () => {
    const info = { fullName: "Test User" };
    const result = redactPersonalInfo(info);
    expect(result.fullName).not.toBe("Test User");
    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it("preserves original email TLD", () => {
    const info = { email: "user@company.io" };
    const result = redactPersonalInfo(info);
    expect(result.email).toMatch(/\.io$/);
    expect(result.email).toContain("@");
  });

  it("preserves .edu TLD in email", () => {
    const info = { email: "student@university.edu" };
    const result = redactPersonalInfo(info);
    expect(result.email).toMatch(/\.edu$/);
  });
});
