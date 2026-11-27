import {
  splitIntoUnits,
  wordDiff,
  alignUnits,
  diffAlignedPair,
  shouldWarnOnRemoval,
  extractOriginalSectionText,
  similarity,
  findUnmatchedOriginalIndices,
  findMissingOriginalSections,
  groupTailoredIndicesByOriginal,
  replaceUnitSpan,
  replaceUnitsSpan,
  insertUnitAfter,
} from "../diff-utils";

describe("splitIntoUnits", () => {
  it("splits bullet lines on the leading marker", () => {
    const units = splitIntoUnits("• Built the thing\n• Shipped the other thing");
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ raw: "• Built the thing", text: "Built the thing", isBullet: true });
  });

  it("preserves terminal punctuation when splitting prose into sentences", () => {
    const units = splitIntoUnits("I have experience with TypeScript. Currently building things.");
    expect(units).toHaveLength(2);
    expect(units[0].text).toBe("I have experience with TypeScript.");
    expect(units[0].raw).toBe("I have experience with TypeScript.");
    expect(units[1].text).toBe("Currently building things.");
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

  it("does NOT warn when only filler/subjective content is removed (Passionate, high-impact, seamless, dynamic)", () => {
    const original = "Passionate, high-impact, seamless, dynamic engineer delivering software solutions.";
    const removed = "Passionate, high-impact, seamless, dynamic";
    const warn = shouldWarnOnRemoval(original, removed);
    expect(warn).toBe(false);
  });

  it("DOES warn when real factual content like 'component design' is removed, proving the filler list isn't overfit", () => {
    const original = "Owned component design for the checkout flow.";
    const revised = "Owned for the checkout flow.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(true);
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

describe("MUST FIX 1 — fully deleted original bullets/sections are visible and restorable", () => {
  it("renders an unmatched original bullet as a deleted row, and restoring it puts it back in original order", () => {
    const originalSection = "• First bullet about Alpha.\n• Second bullet about Beta.\n• Third bullet about Gamma.";
    const tailoredSection = "• First bullet about Alpha.\n• Second bullet about Beta.";

    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const unmatched = findUnmatchedOriginalIndices(originalUnits, pairs);
    expect(unmatched).toEqual([2]);

    const deletedUnit = originalUnits[unmatched[0]];
    expect(deletedUnit.text).toContain("Gamma");

    // Restoring: insert after the last matched tailored unit (index 1).
    const afterUnit = tailoredUnits[1];
    const restored = insertUnitAfter(tailoredSection, afterUnit, deletedUnit.raw);
    const restoredUnits = splitIntoUnits(restored);
    expect(restoredUnits).toHaveLength(3);
    expect(restoredUnits[2].text).toContain("Gamma");
    expect(restoredUnits[0].text).toContain("Alpha");
    expect(restoredUnits[1].text).toContain("Beta");
  });

  it("finds whole original sections missing from the tailored sections array", () => {
    const original =
      "Summary\nBuilt things.\n\nCertifications\nAWS Certified Solutions Architect\n\nSkills\nJavaScript, TypeScript";
    const tailoredSections = [
      { title: "Summary" },
      { title: "Skills" },
    ];
    const missing = findMissingOriginalSections(original, tailoredSections);
    expect(missing).toHaveLength(1);
    expect(missing[0].heading.toLowerCase()).toBe("certifications");
    expect(missing[0].content).toContain("AWS Certified Solutions Architect");
    expect(missing[0].insertIndex).toBe(1);
  });
});

describe("MUST FIX 2 — revert/edit preserves exact formatting via targeted span replace", () => {
  it("reverting one sentence in a 3-sentence Summary leaves the other two sentences and surrounding punctuation/whitespace byte-for-byte unchanged", () => {
    const content = "Experienced engineer with 8 years. Built scalable systems. Shipped great products.";
    const units = splitIntoUnits(content);
    expect(units).toHaveLength(3);
    // Revert the middle sentence to some original text.
    const originalText = "Built robust, scalable distributed systems.";
    const reverted = replaceUnitSpan(content, units[1], originalText);
    expect(reverted).toBe(
      "Experienced engineer with 8 years. Built robust, scalable distributed systems. Shipped great products."
    );
  });

  it("reverting one bullet in a multi-entry Experience section preserves blank lines and other bullets byte-for-byte", () => {
    const content =
      "ACME Corp — Senior Engineer\n• Built the checkout flow.\n• Shipped the payments API.\n\nWidgetCo — Engineer\n• Maintained the legacy system.";
    const units = splitIntoUnits(content);
    const bulletUnit = units.find((u) => u.text.includes("checkout"));
    expect(bulletUnit).toBeDefined();
    const reverted = replaceUnitSpan(content, bulletUnit!, "Owned the entire checkout flow end-to-end.");
    expect(reverted).toBe(
      "ACME Corp — Senior Engineer\n• Owned the entire checkout flow end-to-end.\n• Shipped the payments API.\n\nWidgetCo — Engineer\n• Maintained the legacy system."
    );
  });
});

describe("MUST FIX 3 — reverting a split bullet collapses the whole group, no duplication", () => {
  it("reverting either half of a split bullet (via group-level revert) leaves exactly one bullet matching the original", () => {
    const original = "• Built and deployed the checkout service used by 10,000 customers daily.";
    const revised =
      "• Built the checkout service.\n• Deployed it to production, used by 10,000 customers daily.";

    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const groups = groupTailoredIndicesByOriginal(pairs);
    const groupIndices = groups.get(0)!;
    expect(groupIndices).toEqual([0, 1]);

    const groupUnits = groupIndices.map((i) => tailoredUnits[i]);
    const result = replaceUnitsSpan(revised, groupUnits, originalUnits[0].text);
    const resultUnits = splitIntoUnits(result);
    expect(resultUnits).toHaveLength(1);
    expect(resultUnits[0].text).toBe(originalUnits[0].text);
  });
});

describe("ALSO FIX — hyphenated filler tokens normalize as one token", () => {
  it("treats 'high-impact' as a single token so it matches the filler-word check", () => {
    const original = "Delivered high-impact improvements to the platform.";
    const removed = "high-impact";
    expect(shouldWarnOnRemoval(original, removed)).toBe(false);
  });
});

describe("ALSO FIX — proper-noun sentence-initial check uses position in ORIGINAL text, not the removed fragment", () => {
  it("still warns on a removed mid-sentence proper noun even when it is the first word of the removed chunk", () => {
    const original = "Built the backend using GraphQL and Node.js for the API layer.";
    const removed = "GraphQL and";
    expect(shouldWarnOnRemoval(original, removed)).toBe(true);
  });
});

describe("MUST FIX 1 — alignment is one-to-one by default; group revert never deletes unrelated bullets", () => {
  it("two DIFFERENT tailored bullets that each mention a shared phrase ('Teams chat') align to THEIR OWN correct originals, not falsely grouped", () => {
    const originalSection =
      "• Rolled out Teams chat integration for the support desk.\n• Migrated the billing pipeline to a new vendor.";
    const tailoredSection =
      "• Rolled out Teams chat integration to streamline support desk workflows.\n• Migrated the entire billing pipeline over to a new, modern vendor using Teams chat for rollout coordination.";

    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);

    // Each tailored bullet should align to its OWN originating bullet —
    // one-to-one — not both collapse onto the "Teams chat" original.
    expect(pairs[0].originalIndex).toBe(0);
    expect(pairs[1].originalIndex).toBe(1);
    expect(pairs[0].originalIndex).not.toBe(pairs[1].originalIndex);

    const groups = groupTailoredIndicesByOriginal(pairs);
    // No group should contain both tailored indices.
    groups.forEach((indices) => {
      expect(indices).not.toEqual(expect.arrayContaining([0, 1]));
    });
  });

  it("a genuine split-bullet case still gets grouped and reverts correctly to one bullet", () => {
    const original = "• Built and deployed the checkout service used by 10,000 customers daily.";
    const revised =
      "• Built the checkout service.\n• Deployed it to production, used by 10,000 customers daily.";

    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    expect(pairs[0].originalIndex).toBe(0);
    expect(pairs[1].originalIndex).toBe(0);

    const groups = groupTailoredIndicesByOriginal(pairs);
    const groupIndices = groups.get(0)!;
    expect(groupIndices).toEqual([0, 1]);

    const groupUnits = groupIndices.map((i) => tailoredUnits[i]);
    const result = replaceUnitsSpan(revised, groupUnits, originalUnits[0].text);
    const resultUnits = splitIntoUnits(result);
    expect(resultUnits).toHaveLength(1);
    expect(resultUnits[0].text).toBe(originalUnits[0].text);
  });

  it("reverting a split group never removes an intervening, unrelated bullet physically between the group's units", () => {
    // Construct tailored content where the two units that align to the SAME
    // original (a real split) are NOT adjacent in the tailored content —
    // an unrelated bullet sits physically between them. Group revert must
    // only touch the group's own spans, never the span in between.
    const content =
      "• Alpha half of the split bullet about reporting dashboards.\n• An unrelated bullet about something completely different.\n• Beta half of the split bullet about reporting dashboards.";
    const units = splitIntoUnits(content);
    expect(units).toHaveLength(3);

    // Simulate group containing units[0] and units[2] (non-adjacent).
    const groupUnits = [units[0], units[2]];
    const result = replaceUnitsSpan(content, groupUnits, "Combined reporting dashboard bullet.");
    const resultUnits = splitIntoUnits(result);

    // The unrelated bullet must survive untouched.
    expect(resultUnits.some((u) => u.text.includes("unrelated bullet"))).toBe(true);
    // The combined replacement text appears exactly once.
    const combinedCount = resultUnits.filter((u) => u.text === "Combined reporting dashboard bullet.").length;
    expect(combinedCount).toBe(1);
    // Total unit count: the unrelated bullet + the single combined bullet.
    expect(resultUnits).toHaveLength(2);
  });
});

describe("MUST FIX 3 — punctuation-only changes don't trigger a false warning", () => {
  it("'WeChat Pay and Alipay' -> 'WeChat Pay, and Alipay' (comma insertion only) produces warn: false", () => {
    const original = "Integrated with WeChat Pay and Alipay for checkout.";
    const revised = "Integrated with WeChat Pay, and Alipay for checkout.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(false);
  });
});

describe("ALSO FIX — INTENT_VALUES_CLAUSE_RE tolerance and new alternative", () => {
  it("does NOT warn when 'in a fast-paced STARTUP environment' is removed (extra word tolerance)", () => {
    const original = "Delivered features in a fast-paced startup environment under tight deadlines.";
    const revised = "Delivered features under tight deadlines.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(false);
  });

  it("does NOT warn when 'to deliver an immersive user experience' intent clause is removed", () => {
    const original = "Redesigned the checkout flow to deliver an immersive user experience for shoppers.";
    const revised = "Redesigned the checkout flow for shoppers.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(false);
  });
});

describe("ALSO FIX — splitIntoUnits joins a PDF-wrapped bullet continuation line into the preceding bullet", () => {
  it("produces ONE unit for a bullet line followed by a non-bullet continuation line", () => {
    const content = "• Led the migration of the legacy billing\nsystem to a new cloud-native platform.";
    const units = splitIntoUnits(content);
    expect(units).toHaveLength(1);
    expect(units[0].isBullet).toBe(true);
    expect(units[0].text).toContain("Led the migration of the legacy billing");
    expect(units[0].text).toContain("system to a new cloud-native platform.");
  });
});

describe("ALSO FIX — insertUnitAfter uses newline separator for bullets even into single-bullet/no-newline content", () => {
  it("inserts a bullet after another bullet using \\n, never concatenating onto one line", () => {
    const content = "• Only bullet in this section.";
    const units = splitIntoUnits(content);
    const result = insertUnitAfter(content, units[0], "• Restored bullet text.");
    expect(result).toBe("• Only bullet in this section.\n• Restored bullet text.");
    const resultUnits = splitIntoUnits(result);
    expect(resultUnits).toHaveLength(2);
  });
});

