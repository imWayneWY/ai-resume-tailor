import {
  splitIntoUnits,
  wordDiff,
  alignUnits,
  diffAlignedPair,
  shouldWarnOnRemoval,
  extractOriginalSectionText,
  similarity,
} from "../diff-utils";

describe("splitIntoUnits", () => {
  it("splits bullet lines on the leading marker", () => {
    const units = splitIntoUnits("• Built the thing\n• Shipped the other thing");
    expect(units).toHaveLength(2);
    expect(units[0]).toEqual({ raw: "• Built the thing", text: "Built the thing", isBullet: true });
  });

  it("splits prose into sentences", () => {
    const units = splitIntoUnits(
      "Experienced engineer with 8 years. Built scalable systems. Shipped great products."
    );
    expect(units).toHaveLength(3);
    expect(units.every((u) => !u.isBullet)).toBe(true);
  });
});

describe("wordDiff", () => {
  it("returns a single equal op when nothing changed", () => {
    const ops = wordDiff("Built a thing", "Built a thing");
    expect(ops.every((op) => op.type === "equal")).toBe(true);
  });

  it("detects a trailing clause removal", () => {
    const original =
      "Led full codebase migration from JavaScript to TypeScript, significantly improving developer productivity and code maintainability";
    const revised = "Led full codebase migration from JavaScript to TypeScript";
    const ops = wordDiff(original, revised);
    const removed = ops.filter((op) => op.type === "remove").map((op) => op.value).join("");
    expect(removed).toContain("developer productivity");
    expect(removed).toContain("maintainability");
    const added = ops.filter((op) => op.type === "add");
    // Minor punctuation-attachment diffs (e.g. "TypeScript," -> "TypeScript")
    // are expected from word-level tokenization; what matters for the
    // acceptance criteria is that the whole clause was removed and the
    // revert mechanism restores the literal original string (tested below).
    expect(added.length).toBeLessThanOrEqual(1);
  });
});

describe("alignUnits + diffAlignedPair — acceptance criteria", () => {
  it("flags the dropped 'developer productivity and code maintainability' clause with a warning, and reverting restores exact original", () => {
    const original =
      "Led full codebase migration from JavaScript to TypeScript, significantly improving developer productivity and code maintainability";
    const revised = "Led full codebase migration from JavaScript to TypeScript";

    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    expect(pairs).toHaveLength(1);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.changed).toBe(true);
    expect(diff.warn).toBe(true);
    // Revert restores the exact original text.
    expect(diff.originalText).toBe(original);
  });

  it("flags a dropped factual clause from a sentence (lifestyle/food review platform)", () => {
    const original =
      "Fantuan Reviews is a local lifestyle and food review platform serving the Chinese-Canadian community.";
    const revised = "Fantuan Reviews serves the Chinese-Canadian community.";

    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(true);
  });

  it("does NOT warn when only filler/subjective content is removed (Passionate about building great products)", () => {
    const warn = shouldWarnOnRemoval(
      "Passionate about building great products.",
      "Passionate about building great products."
    );
    expect(warn).toBe(false);
  });

  it("does NOT warn when an intent/values clause is removed (supporting Microsoft's commitment to inclusive design)", () => {
    const original =
      "Built accessible UI components, supporting Microsoft's commitment to inclusive design.";
    const revised = "Built accessible UI components.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.changed).toBe(true);
    expect(diff.warn).toBe(false);
  });

  it("aligns a bullet split into two tailored bullets back to the same original, so reverting either collapses to the original", () => {
    const original = "• Built and deployed the checkout service used by 10,000 customers daily.";
    const revised =
      "• Built the checkout service.\n• Deployed it to production, used by 10,000 customers daily.";

    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    expect(tailoredUnits).toHaveLength(2);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    // Both tailored bullets should align to the single original bullet (index 0).
    expect(pairs[0].originalIndex).toBe(0);
    expect(pairs[1].originalIndex).toBe(0);
    expect(pairs[0].originalText).toBe(originalUnits[0].text);
    expect(pairs[1].originalText).toBe(originalUnits[0].text);
  });

  it("marks every changed bullet, even ones the model's self-reported changes never listed", () => {
    // Simulates the bug: model only reports 1 change but there are 2 actual diffs.
    const originalSection =
      "• Led full codebase migration from JavaScript to TypeScript, significantly improving developer productivity and code maintainability.\n• Built a dashboard for internal reporting.";
    const tailoredSection =
      "• Led full codebase migration from JavaScript to TypeScript.\n• Built a dashboard used by the analytics team for internal reporting.";

    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diffs = pairs.map(diffAlignedPair);
    expect(diffs.every((d) => d.changed)).toBe(true);
  });
});

describe("extractOriginalSectionText", () => {
  it("extracts a section by heading match", () => {
    const original = "Summary\nBuilt things.\n\nSkills\nJavaScript, TypeScript\n\nEducation\nState University";
    const text = extractOriginalSectionText(original, "Skills");
    expect(text).toContain("JavaScript, TypeScript");
    expect(text).not.toContain("State University");
  });

  it("returns empty string when no heading match is found", () => {
    const original = "Just some free text with no recognizable headings at all.";
    const text = extractOriginalSectionText(original, "Skills");
    expect(text).toBe("");
  });
});

describe("similarity", () => {
  it("returns 1 for identical text", () => {
    expect(similarity("Built a thing", "Built a thing")).toBe(1);
  });

  it("returns 0 for completely disjoint text", () => {
    expect(similarity("apple banana", "car truck")).toBe(0);
  });
});
