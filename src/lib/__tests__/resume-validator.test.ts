import { validateTailoredResume } from "../resume-validator";

describe("validateTailoredResume", () => {
  const original = "Built a checkout flow using Jest and Playwright for testing. Led a team of 3 engineers.";

  it("flags banned phrases with context", () => {
    const tailored = [
      { title: "Summary", content: "A passionate and seasoned engineer who leveraged robust frameworks." },
    ];
    const result = validateTailoredResume(original, tailored, []);
    const phrases = result.bannedPhraseHits.map((h) => h.phrase);
    expect(phrases).toEqual(expect.arrayContaining(["passionate", "seasoned", "leveraged", "robust"]));
    expect(result.bannedPhraseHits[0].context.length).toBeGreaterThan(0);
  });

  it("returns no banned phrase hits for clean text", () => {
    const tailored = [{ title: "Summary", content: "Built a checkout flow using Jest and Playwright." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.bannedPhraseHits).toEqual([]);
  });

  it("flags tacked-on participle clauses", () => {
    const tailored = [
      { title: "Experience", content: "Built React components, enhancing user engagement across the app." },
    ];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.tackedOnClauseHits.length).toBeGreaterThan(0);
    expect(result.tackedOnClauseHits[0].clause).toMatch(/enhancing/i);
  });

  it("does not flag clean bullets without tacked-on clauses", () => {
    const tailored = [{ title: "Experience", content: "Built React components used by 10K daily active users." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.tackedOnClauseHits).toEqual([]);
  });

  it("flags keywords used more than twice", () => {
    const tailored = [
      {
        title: "Experience",
        content: "Used Playwright for testing. Playwright again here. And Playwright once more.",
      },
    ];
    const result = validateTailoredResume(original, tailored, ["Playwright"]);
    expect(result.overusedKeywords).toEqual([{ term: "Playwright", count: 3 }]);
  });

  it("does not flag keywords used twice or fewer", () => {
    const tailored = [{ title: "Experience", content: "Used Playwright for testing. Playwright again here." }];
    const result = validateTailoredResume(original, tailored, ["Playwright"]);
    expect(result.overusedKeywords).toEqual([]);
  });

  it("flags new numbers not present in the original", () => {
    const tailored = [{ title: "Experience", content: "Improved performance by 42%." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newNumbers).toContain("42%");
  });

  it("does not flag numbers that already existed in the original", () => {
    const tailored = [{ title: "Experience", content: "Led a team of 3 engineers." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newNumbers).toEqual([]);
  });

  it("flags new proper nouns not present in the original", () => {
    const tailored = [{ title: "Skills", content: "Experienced with Kubernetes and Snowflake." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newProperNouns).toEqual(expect.arrayContaining(["Kubernetes", "Snowflake"]));
  });

  it("does not flag proper nouns that already existed in the original", () => {
    const tailored = [{ title: "Experience", content: "I used Jest and Playwright for testing." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newProperNouns).toEqual([]);
  });
});
