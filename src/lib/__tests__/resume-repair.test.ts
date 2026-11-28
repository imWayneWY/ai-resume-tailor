import { restoreMissingSkills, repairDroppedFacts, type TailoredSection, type RepairCallResult } from "../resume-repair";

describe("restoreMissingSkills (part B)", () => {
  it("appends a skill the model dropped (GraphQL) to the best-fitting existing category line", () => {
    const normalizedOriginal =
      "Summary\nBuilt things.\n\nSkills\nLanguages: JavaScript, TypeScript\nBackend: Node.js, GraphQL, Express\n\nEducation\nState University";
    const tailoredSections: TailoredSection[] = [
      { title: "Skills", content: "Languages: TypeScript, JavaScript\nBackend: Node.js, Express" },
    ];

    const { sections, restoredSkills } = restoreMissingSkills(normalizedOriginal, tailoredSections);

    expect(restoredSkills).toContain("GraphQL");
    const skillsSection = sections.find((s) => s.title === "Skills")!;
    expect(skillsSection.content).toContain("GraphQL");
  });

  it("falls back to an Other: line when no existing category fits", () => {
    const normalizedOriginal = "Skills\nMisc: Astrology\n\nEducation\nState University";
    const tailoredSections: TailoredSection[] = [{ title: "Skills", content: "Languages: TypeScript" }];

    const { sections, restoredSkills } = restoreMissingSkills(normalizedOriginal, tailoredSections);

    expect(restoredSkills).toContain("Astrology");
    const skillsSection = sections.find((s) => s.title === "Skills")!;
    expect(skillsSection.content).toMatch(/Other:.*Astrology/);
  });

  it("restores nothing when every original skill is already present", () => {
    const normalizedOriginal = "Skills\nLanguages: JavaScript, TypeScript";
    const tailoredSections: TailoredSection[] = [{ title: "Skills", content: "Languages: TypeScript, JavaScript" }];

    const { sections, restoredSkills } = restoreMissingSkills(normalizedOriginal, tailoredSections);

    expect(restoredSkills).toEqual([]);
    expect(sections).toEqual(tailoredSections);
  });
});

describe("repairDroppedFacts (part C)", () => {
  it("repairs a bullet that dropped 'a local lifestyle and food review platform' when the repair LLM call succeeds", async () => {
    const normalizedOriginal =
      "Experience\n**Acme Inc** — Engineer (2021 - 2023)\n• Built a local lifestyle and food review platform used by 50K monthly users.";
    const tailoredSections: TailoredSection[] = [
      {
        title: "Experience",
        content: "**Acme Inc** — Engineer (2021 - 2023)\n• Built a platform used by 50K monthly users.",
      },
    ];

    const callRepairLlm = jest.fn(
      async (flagged): Promise<RepairCallResult> => {
        const repaired = new Map<number, string>();
        for (const f of flagged) {
          repaired.set(f.id, "Built a local lifestyle and food review platform used by 50K monthly users.");
        }
        return { repaired };
      }
    );

    const { sections, repairedBullets } = await repairDroppedFacts(normalizedOriginal, tailoredSections, callRepairLlm);

    expect(callRepairLlm).toHaveBeenCalledTimes(1);
    const experienceSection = sections.find((s) => s.title === "Experience")!;
    expect(experienceSection.content).toContain("a local lifestyle and food review platform");
    expect(repairedBullets.some((b) => b.includes("local lifestyle and food review platform"))).toBe(true);
  });

  it("falls back to the exact original bullet text when the repair call fails", async () => {
    const normalizedOriginal =
      "Experience\n**Acme Inc** — Engineer (2021 - 2023)\n• Built a local lifestyle and food review platform used by 50K monthly users.";
    const tailoredSections: TailoredSection[] = [
      {
        title: "Experience",
        content: "**Acme Inc** — Engineer (2021 - 2023)\n• Built a platform used by 50K monthly users.",
      },
    ];

    const callRepairLlm = jest.fn(async (): Promise<RepairCallResult> => {
      throw new Error("Azure OpenAI unavailable");
    });

    const { sections, repairedBullets } = await repairDroppedFacts(normalizedOriginal, tailoredSections, callRepairLlm);

    const experienceSection = sections.find((s) => s.title === "Experience")!;
    expect(experienceSection.content).toContain(
      "Built a local lifestyle and food review platform used by 50K monthly users."
    );
    expect(repairedBullets.length).toBeGreaterThan(0);
  });

  it("falls back to the original bullet text when the repair candidate STILL drops the phrase", async () => {
    const normalizedOriginal =
      "Experience\n**Acme Inc** — Engineer (2021 - 2023)\n• Built a local lifestyle and food review platform used by 50K monthly users.";
    const tailoredSections: TailoredSection[] = [
      {
        title: "Experience",
        content: "**Acme Inc** — Engineer (2021 - 2023)\n• Built a platform used by 50K monthly users.",
      },
    ];

    const callRepairLlm = jest.fn(
      async (flagged): Promise<RepairCallResult> => {
        const repaired = new Map<number, string>();
        for (const f of flagged) {
          // Repair candidate still omits the dropped phrase.
          repaired.set(f.id, "Built a great platform used by 50K monthly users.");
        }
        return { repaired };
      }
    );

    const { sections } = await repairDroppedFacts(normalizedOriginal, tailoredSections, callRepairLlm);

    const experienceSection = sections.find((s) => s.title === "Experience")!;
    expect(experienceSection.content).toContain(
      "Built a local lifestyle and food review platform used by 50K monthly users."
    );
  });

  it("does not call the repair LLM at all when nothing was dropped", async () => {
    const normalizedOriginal = "Experience\n**Acme Inc** — Engineer (2021 - 2023)\n• Built a platform.";
    const tailoredSections: TailoredSection[] = [
      { title: "Experience", content: "**Acme Inc** — Engineer (2021 - 2023)\n• Built a platform." },
    ];

    const callRepairLlm = jest.fn(async (): Promise<RepairCallResult> => ({ repaired: new Map() }));

    const { repairedBullets } = await repairDroppedFacts(normalizedOriginal, tailoredSections, callRepairLlm);

    expect(callRepairLlm).not.toHaveBeenCalled();
    expect(repairedBullets).toEqual([]);
  });
});
