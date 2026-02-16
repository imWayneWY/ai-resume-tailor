import { cleanAiPhrases, cleanSections } from "@/lib/ai-phrase-cleaner";

describe("cleanAiPhrases", () => {
  it("replaces overused action verbs", () => {
    const result = cleanAiPhrases("Spearheaded the migration to cloud infrastructure");
    expect(result.text).toBe("Led the migration to cloud infrastructure");
    expect(result.replacedPhrases).toContain("spearheaded");
    expect(result.replacementCount).toBe(1);
  });

  it("replaces leveraged with used", () => {
    const result = cleanAiPhrases("Leveraged React and TypeScript to build the app");
    expect(result.text).toBe("Used React and TypeScript to build the app");
  });

  it("replaces utilized with used", () => {
    const result = cleanAiPhrases("Utilized Python for data analysis");
    expect(result.text).toBe("Used Python for data analysis");
  });

  it("replaces corporate buzzwords", () => {
    const result = cleanAiPhrases("Built a robust and cutting-edge solution");
    expect(result.text).toBe("Built a strong and modern solution");
    expect(result.replacedPhrases).toContain("robust");
    expect(result.replacedPhrases).toContain("cutting-edge");
  });

  it("removes filler phrases", () => {
    const result = cleanAiPhrases("Refactored the codebase in order to improve performance");
    expect(result.text).toBe("Refactored the codebase to improve performance");
  });

  it("replaces em-dashes with commas", () => {
    const result = cleanAiPhrases("Built the system \u2014 a complex distributed architecture");
    expect(result.text).toBe("Built the system, a complex distributed architecture");
  });

  it("handles multiple replacements in one text", () => {
    const result = cleanAiPhrases(
      "Spearheaded a paradigm shift by leveraging cutting-edge technology"
    );
    expect(result.text).toBe(
      "Led a change by using modern technology"
    );
    expect(result.replacementCount).toBe(4);
  });

  it("preserves text with no AI phrases", () => {
    const input = "Built a REST API using Node.js and PostgreSQL";
    const result = cleanAiPhrases(input);
    expect(result.text).toBe(input);
    expect(result.replacedPhrases).toHaveLength(0);
    expect(result.replacementCount).toBe(0);
  });

  it("is case-insensitive", () => {
    const result = cleanAiPhrases("LEVERAGED the framework");
    expect(result.text).toBe("Used the framework");
  });

  it("preserves capitalization of replacement when original is capitalized", () => {
    const result = cleanAiPhrases("Orchestrated the deployment pipeline");
    expect(result.text).toBe("Coordinated the deployment pipeline");
  });

  it("handles empty input", () => {
    const result = cleanAiPhrases("");
    expect(result.text).toBe("");
    expect(result.replacedPhrases).toHaveLength(0);
  });

  it("cleans up double spaces from replacements", () => {
    const result = cleanAiPhrases("Going forward we will improve");
    // "going forward" → "" leaves a double space
    expect(result.text).not.toContain("  ");
  });

  it("replaces multi-word phrases before single words", () => {
    const result = cleanAiPhrases("paradigm shift in the industry");
    expect(result.text).toBe("change in the industry");
    // Should match "paradigm shift" not just "paradigm"
  });
});

describe("cleanSections", () => {
  it("cleans all sections and aggregates stats", () => {
    const sections = [
      { title: "Summary", content: "Leveraged cutting-edge tech to build robust systems" },
      { title: "Experience", content: "Spearheaded the migration. Utilized Python daily." },
    ];

    const result = cleanSections(sections);

    expect(result.sections[0].content).toBe(
      "Used modern tech to build strong systems"
    );
    expect(result.sections[1].content).toBe(
      "Led the migration. Used Python daily."
    );
    expect(result.totalReplacements).toBeGreaterThanOrEqual(5);
    expect(result.allReplacedPhrases.length).toBeGreaterThan(0);
  });

  it("preserves section titles", () => {
    const sections = [
      { title: "Summary", content: "Leveraged React" },
    ];

    const result = cleanSections(sections);
    expect(result.sections[0].title).toBe("Summary");
  });

  it("deduplicates replaced phrases across sections", () => {
    const sections = [
      { title: "A", content: "Leveraged React" },
      { title: "B", content: "Leveraged Node.js" },
    ];

    const result = cleanSections(sections);
    // "leveraged" appears in both but should be listed once
    const leveragedCount = result.allReplacedPhrases.filter(
      (p) => p === "leveraged"
    ).length;
    expect(leveragedCount).toBe(1);
  });

  it("handles empty sections array", () => {
    const result = cleanSections([]);
    expect(result.sections).toHaveLength(0);
    expect(result.totalReplacements).toBe(0);
  });
});
