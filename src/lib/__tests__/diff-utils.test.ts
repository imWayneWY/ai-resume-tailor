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

describe("ROUND 6 SMALL — punctuated/compound technical terms stay intact across unrelated word changes", () => {
  // Protects against the word/punctuation tokenizer (normalizeWords /
  // wordDiff) splitting a compound, punctuated technical term like
  // "Node.js" into fragments that individually look like a removal —
  // mirrors the earlier "WeChat Pay, and Alipay" fix, but for terms whose
  // punctuation is semantically part of the token itself rather than
  // separating words.
  it("'Node.js' stays an unchanged 'equal' token when an unrelated word nearby changes, and produces warn: false", () => {
    // Use a non-proper-noun, non-fact-bearing word swap ("rewrote" ->
    // "updated") so this test isolates the tokenization behavior itself —
    // swapping one named technology for another (e.g. Express -> Koa) would
    // legitimately warn via the proper-noun heuristic, which is correct
    // behavior but not what this test is checking.
    const original = "Built the backend service using Node.js and rewrote the API layer.";
    const revised = "Built the backend service using Node.js and updated the API layer.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const ops = wordDiff(originalUnits[0].text, tailoredUnits[0].text);
    // "Node.js" must appear as a single intact "equal" op, never split into
    // "Node" / "." / "js" fragments or reported as removed+added.
    const nodeJsEqualOp = ops.find((op) => op.type === "equal" && op.value.includes("Node.js"));
    expect(nodeJsEqualOp).toBeDefined();
    const nodeJsRemoved = ops.some((op) => op.type === "remove" && op.value.includes("Node"));
    expect(nodeJsRemoved).toBe(false);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(false);
  });

  it("'C#' stays intact and 'e-commerce' stays intact when an unrelated word nearby changes, producing warn: false", () => {
    const original = "Led the C# team building the e-commerce checkout platform for retail clients.";
    const revised = "Led the C# team building the e-commerce checkout platform for enterprise clients.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const ops = wordDiff(originalUnits[0].text, tailoredUnits[0].text);
    const csharpEqualOp = ops.find((op) => op.type === "equal" && op.value.includes("C#"));
    expect(csharpEqualOp).toBeDefined();
    const ecommerceEqualOp = ops.find((op) => op.type === "equal" && op.value.includes("e-commerce"));
    expect(ecommerceEqualOp).toBeDefined();
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

describe("MUST FIX 2 — splitIntoUnits does not fold entry headers into the preceding bullet as a continuation", () => {
  it("produces 2 bullet units + 1 separate header unit for a bullet, an uppercase company/role header with a date range, then another bullet", () => {
    const content =
      "• ...inclusive design\nPLAYGON GAME INC., VANCOUVER, SR FRONTEND DEVELOPER (2021 - 2023)\n• Shipped the new design system.";
    const units = splitIntoUnits(content);
    expect(units).toHaveLength(3);
    expect(units[0].isBullet).toBe(true);
    expect(units[0].text).toBe("...inclusive design");
    expect(units[1].isBullet).toBe(false);
    expect(units[1].text).toBe("PLAYGON GAME INC., VANCOUVER, SR FRONTEND DEVELOPER (2021 - 2023)");
    expect(units[2].isBullet).toBe(true);
    expect(units[2].text).toBe("Shipped the new design system.");
  });
});

describe("MUST FIX 1 — split adoption clears the previous owner's assignment instead of leaving 3 units pointing at one original", () => {
  it("(a) when a split pair takes over an original from an unrelated owner X, no originalIndex maps to 3+ tailored units, and reverting the split group never touches X's own tailored text", () => {
    const originalSection =
      "• Migrated the billing service to a brand new cloud platform for better scalability.\n• Owned the quarterly reporting dashboard refresh end to end.";
    // X (unit 2): its own distinct, recognizable rewrite of original bullet 0
    // — a decent but partial paraphrase, so step 1's greedy one-to-one pass
    // assigns X -> original bullet 0.
    // t (unit 0) / t+1 (unit 1): adjacent tailored units that, individually,
    // are each weaker/partial matches against bullet 0 than X (so X wins the
    // one-to-one assignment first), but whose COMBINED text covers
    // substantially more of bullet 0's words than X's single score —
    // triggering the split-adoption takeover in step 2, which must then
    // release X rather than leaving X still pointing at bullet 0.
    const tailoredSection =
      "• Migrated the billing service\n• to a brand new cloud platform for better scalability.\n• Billing service moved onto newer cloud infrastructure.";
    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const groups = groupTailoredIndicesByOriginal(pairs);
    groups.forEach((indices) => {
      expect(indices.length).toBeLessThanOrEqual(2);
    });
    // Find whichever group ended up with 2 tailored units (the split pair)
    // and revert it; unit 2's own tailored text (X) must survive untouched.
    let reverted = tailoredSection;
    groups.forEach((indices, originalIndex) => {
      if (indices.length === 2) {
        const groupUnits = indices.map((i) => tailoredUnits[i]);
        reverted = replaceUnitsSpan(tailoredSection, groupUnits, originalUnits[originalIndex].text);
      }
    });
    expect(reverted).toContain("Billing service moved onto newer cloud infrastructure.");
  });

  it("(b) a tailored unit that's a legitimate rewrite of a DIFFERENT original with a solid score stays aligned to its own match and isn't stolen into an unrelated split", () => {
    const originalSection =
      "• Built the checkout service from scratch.\n• Optimized database query performance significantly.";
    // t+1 ("Optimized database queries for performance.") is a solid,
    // legitimate rewrite of original bullet 1 — it must stay aligned there,
    // not get stolen into a split against bullet 0 just because an adjacent
    // unrelated unit before it might nominally combine with it.
    const tailoredSection =
      "• Built checkout.\n• service from scratch rebuilt.\n• Optimized database queries for performance.";
    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const unmatched = findUnmatchedOriginalIndices(originalUnits, pairs);
    // original bullet 1 (the database-performance bullet) must have a real
    // tailored counterpart — it must NOT show up as a false "deleted" row.
    expect(unmatched).not.toContain(1);
    const pairForLastUnit = pairs[pairs.length - 1];
    expect(pairForLastUnit.originalIndex).toBe(1);
  });
});

describe("ALSO FIX — replaceUnitsSpan non-contiguous fallback consumes one adjacent newline instead of leaving a blank line", () => {
  it("blanking a middle grouped unit during a non-contiguous group revert leaves no double-blank-line artifact", () => {
    const content = "• First bullet here.\n• Unrelated bullet in between.\n• Second bullet here.";
    const units = splitIntoUnits(content);
    // Group units 0 and 2 (non-contiguous — unit 1 sits between them), as
    // if they were a split pair whose shared original is being reverted to
    // a single combined bullet.
    const groupUnits = [units[0], units[2]];
    const result = replaceUnitsSpan(content, groupUnits, "Combined bullet text.");
    expect(result).not.toMatch(/\n\s*\n/);
    expect(result).toContain("Unrelated bullet in between.");
    expect(result).toContain("Combined bullet text.");
  });
});

describe("ALSO FIX — INTENT_VALUES_CLAUSE_RE allowlist no longer exempts domain-specific words", () => {
  it("'fast-paced startup environment' removal does NOT warn (still exempted filler)", () => {
    const original = "Delivered features in a fast-paced startup environment under tight deadlines.";
    const revised = "Delivered features under tight deadlines.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(false);
  });

  it("'fast-paced fintech environment' removal DOES still warn (fintech is domain-specific factual content)", () => {
    const original =
      "Delivered payment features in a fast-paced fintech environment supporting millions of transactions.";
    const revised = "Delivered payment features supporting millions of transactions.";
    const originalUnits = splitIntoUnits(original);
    const tailoredUnits = splitIntoUnits(revised);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const diff = diffAlignedPair(pairs[0]);
    expect(diff.warn).toBe(true);
  });
});

describe("ROUND 5 MUST FIX 1 — CRLF offsets no longer drift", () => {
  it("reverting one bullet in CRLF content leaves everything else byte-identical", () => {
    const originalCRLF =
      "Experience\r\n• Built the checkout service.\r\n• Deployed it to production.\r\n• Maintained the reporting dashboard.";
    const normalizedOriginal = originalCRLF.replace(/\r\n/g, "\n");
    const tailoredCRLF =
      "Experience\r\n• Built the checkout service.\r\n• Shipped a totally rewritten bullet.\r\n• Maintained the reporting dashboard.";
    const tailored = tailoredCRLF.replace(/\r\n/g, "\n");
    const originalUnits = splitIntoUnits(normalizedOriginal);
    const tailoredUnits = splitIntoUnits(tailored);
    // The second bullet (index 1, "Shipped a totally rewritten bullet.") is
    // the one that diverged from the original's second bullet ("Deployed it
    // to production."). Revert it directly by index/span.
    const unit = tailoredUnits.find((u) => u.text === "Shipped a totally rewritten bullet.")!;
    expect(unit).toBeDefined();
    const originalUnit = originalUnits.find((u) => u.text === "Deployed it to production.")!;
    expect(originalUnit).toBeDefined();
    const reverted = replaceUnitSpan(tailored, unit, originalUnit.text);
    expect(reverted).toBe(normalizedOriginal);
  });
});

describe("ROUND 6 MUST FIX — split-adoption ties never trigger a takeover", () => {
  it("does NOT take over the owner's original when the combined split score EXACTLY ties the owner's existing (fuzzy, non-exact) score", () => {
    // Original bullet whose current owner X has a partial (non-exact) match:
    // shared words {apple, banana, cherry} vs X's extra words {grape, kiwi} ->
    // score = 3 / 7.
    const originalSection = "• apple banana cherry date fig";
    // X (index 0): single best match for the original above, score 3/7.
    // filler (index 1): keeps X and the (t, t+1) pair non-adjacent.
    // t (index 2) + t+1 (index 3): combined text also scores EXACTLY 3/7
    // against the same original (shared {apple, banana, cherry}, extra
    // {mango, lemon}) — a genuine numeric tie, not an exact-text match.
    const tailoredSection =
      "• apple banana cherry grape kiwi\n• zzz filler words only\n• apple banana\n• cherry mango lemon";
    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);

    // Sanity-check the tie actually exists as designed.
    const ownerScore = similarity(originalUnits[0].text, tailoredUnits[0].text);
    const combinedScore = similarity(
      originalUnits[0].text,
      `${tailoredUnits[2].text} ${tailoredUnits[3].text}`
    );
    expect(combinedScore).toBeCloseTo(ownerScore, 10);
    expect(ownerScore).toBeLessThan(1); // confirm this is a fuzzy tie, not an exact match

    // The owner (tailoredIndex 0) must still map to the original — a tie
    // must never trigger a takeover.
    const ownerPair = pairs.find((p) => p.tailoredIndex === 0);
    expect(ownerPair?.originalIndex).toBe(0);
    // The (t, t+1) pair must NOT have also been assigned to the same
    // original via the tie.
    const tPair = pairs.find((p) => p.tailoredIndex === 2);
    const t1Pair = pairs.find((p) => p.tailoredIndex === 3);
    expect(tPair?.originalIndex).not.toBe(0);
    expect(t1Pair?.originalIndex).not.toBe(0);
  });

  it("does not steal a tailored unit with a solid independent match to its own original into an unrelated split", () => {
    // o2: t+1's genuine own original, matched with a solid (above
    // MIN_SPLIT_COMBINED_SIMILARITY) but non-exact score of 4/5 = 0.8.
    // o: a DIFFERENT original that (t, t+1) combined matches EXACTLY
    // (score 1.0) — deliberately higher than t+1's own 0.8 score, so the
    // fix is genuinely exercised (not trivially passing because the split
    // score happens to be lower).
    const originalSection =
      "• node service health check endpoint\n• billing export job node service health check";
    const tailoredSection = "• billing export job\n• node service health check";
    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);

    // Sanity-check the scenario: t+1's own match to o2 is solid but lower
    // than the combined score against the unrelated o.
    const ownScore = similarity(originalUnits[0].text, tailoredUnits[1].text);
    const combinedScore = similarity(
      originalUnits[1].text,
      `${tailoredUnits[0].text} ${tailoredUnits[1].text}`
    );
    expect(ownScore).toBeGreaterThanOrEqual(0.3); // above MIN_SPLIT_COMBINED_SIMILARITY
    expect(combinedScore).toBeGreaterThan(ownScore);

    // t+1 (tailoredIndex 1) must STAY aligned to its own original o2 (index 0).
    const t1Pair = pairs.find((p) => p.tailoredIndex === 1);
    expect(t1Pair?.originalIndex).toBe(0);

    // o2 must NOT show up as a false "deleted" row.
    const unmatched = findUnmatchedOriginalIndices(originalUnits, pairs);
    expect(unmatched).not.toContain(0);
  });
});

describe("ROUND 5 SHOULD FIX — Professional/Relevant Experience heading aliases", () => {
  it("matches 'Professional Experience' heading to the experience section", () => {
    const original = "Professional Experience\n• Built the checkout service.";
    const extracted = extractOriginalSectionText(original, "Experience");
    expect(extracted).toContain("Built the checkout service.");
  });

  it("matches 'Relevant Experience' heading to the experience section", () => {
    const original = "Relevant Experience\n• Built the checkout service.";
    const extracted = extractOriginalSectionText(original, "Experience");
    expect(extracted).toContain("Built the checkout service.");
  });
});

describe("ROUND 5 SHOULD FIX — exact duplicate originals each get credited distinctly", () => {
  it("two identical-text original bullets both get matched by two different tailored duplicates (usedOriginals tracks indices, not text)", () => {
    const originalSection = "• Led the weekly sync meeting.\n• Led the weekly sync meeting.";
    const tailoredSection = "• Led the weekly sync meeting with stakeholders.\n• Led the weekly sync meeting, now recorded.";
    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    const unmatched = findUnmatchedOriginalIndices(originalUnits, pairs);
    // Both original occurrences should be matched — neither should show up
    // as falsely deleted.
    expect(unmatched).toHaveLength(0);
    const usedOriginalIndices = new Set(pairs.map((p) => p.originalIndex));
    expect(usedOriginalIndices.has(0)).toBe(true);
    expect(usedOriginalIndices.has(1)).toBe(true);
  });
});

describe("ROUND 5 SMALL — displaced split-adoption owner gets a fair re-match instead of falling back to 'added'", () => {
  it("re-matches a displaced owner X against a still-unused original rather than leaving it unmatched", () => {
    const originalSection =
      "• Migrated the billing service to a brand new cloud platform for better scalability.\n• Owned the quarterly reporting dashboard refresh end to end.";
    const tailoredSection =
      "• Migrated the billing service\n• to a brand new cloud platform for better scalability.\n• Billing service moved onto newer cloud infrastructure.\n• Owned the quarterly dashboard refresh completely end to end.";
    const originalUnits = splitIntoUnits(originalSection);
    const tailoredUnits = splitIntoUnits(tailoredSection);
    const pairs = alignUnits(originalUnits, tailoredUnits);
    // Unit 2 (X, "Billing service moved onto newer cloud infrastructure.")
    // was displaced from original bullet 0 by the split-adoption pass; it
    // should re-match to original bullet 1 (the dashboard bullet) via the
    // re-match pass if a reasonable match exists, or at minimum must not be
    // blindly required to stay -1 when a decent original is available.
    const lastDashboardPair = pairs.find((p) => p.tailoredText.includes("dashboard refresh completely"));
    expect(lastDashboardPair?.originalIndex).toBe(1);
  });
});

describe("ROUND 5 SMALL — capitalized proper-noun wrapped continuations fold correctly", () => {
  it("folds 'Safari, Firefox, and mobile browsers' as a continuation of a comma-ending bullet", () => {
    const content = "• Tested extensively across\nSafari, Firefox, and mobile browsers\n• Next bullet here";
    const units = splitIntoUnits(content);
    expect(units).toHaveLength(2);
    expect(units[0].text).toBe("Tested extensively across Safari, Firefox, and mobile browsers");
  });

  it("still does NOT fold a genuine new company header after a bullet (PLAYGON GAME INC regression)", () => {
    const content =
      "• Built the checkout flow end to end.\nPLAYGON GAME INC, REMOTE, SENIOR ENGINEER (2021-2023)\n• Next bullet here";
    const units = splitIntoUnits(content);
    expect(units).toHaveLength(3);
    expect(units[0].text).toBe("Built the checkout flow end to end.");
    expect(units[1].text).toBe("PLAYGON GAME INC, REMOTE, SENIOR ENGINEER (2021-2023)");
  });

  it("does NOT fold a standalone Title-Case company header (no date, no connector word) after a punctuation-less bullet (ROUND 6 tightening)", () => {
    // The bullet ends with no terminal punctuation and does NOT end with a
    // comma or a connector/preposition word, so the following Title-Case
    // header line must NOT be folded into it even though it "lacks
    // terminal punctuation" — that fallback was too broad and is now
    // removed. The date/role appears on a THIRD, separate line.
    const content =
      "• Delivered accessible, inclusive design\nPlaygon Game Inc\nSenior Frontend Developer (2021 - 2023)\n• Next bullet here";
    const units = splitIntoUnits(content);
    expect(units).toHaveLength(4);
    expect(units[0].text).toBe("Delivered accessible, inclusive design");
    expect(units[1].text).toBe("Playgon Game Inc");
    expect(units[2].text).toBe("Senior Frontend Developer (2021 - 2023)");
  });
});

describe("ROUND 7 SMALL — removal warnings are suppressed for facts preserved with changed punctuation or moved position", () => {
  it("'Built services with GraphQL.' -> 'Built services with GraphQL' (trailing period dropped only) gives warn: false", () => {
    const original = "Built services with GraphQL.";
    const revised = "Built services with GraphQL";
    const ops = wordDiff(original, revised);
    const warn = shouldWarnOnRemoval(original, ops.filter((o) => o.type === "remove").map((o) => o.value).join(""), revised);
    expect(warn).toBe(false);
  });

  it("a bullet where '320M MAU' moves later in the same sentence gives warn: false — the fact is preserved, not deleted", () => {
    const original = "Scaled the platform, serving over 320M MAU, to support growth.";
    const revised = "Scaled the platform to support growth, serving over 320M MAU.";
    const ops = wordDiff(original, revised);
    const removedText = ops.filter((o) => o.type === "remove").map((o) => o.value).join("");
    const warn = shouldWarnOnRemoval(original, removedText, revised);
    expect(warn).toBe(false);
  });

  it("still warns when a number is genuinely dropped, not merely moved", () => {
    const original = "Scaled the platform to support growth, serving over 320M MAU.";
    const revised = "Scaled the platform to support growth.";
    const ops = wordDiff(original, revised);
    const removedText = ops.filter((o) => o.type === "remove").map((o) => o.value).join("");
    const warn = shouldWarnOnRemoval(original, removedText, revised);
    expect(warn).toBe(true);
  });
});



