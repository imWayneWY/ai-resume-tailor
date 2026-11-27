import { validateTailoredResume, flagLargeDeletion } from "../resume-validator";

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

  it("does not flag a capitalized verb at the start of a bullet as a new proper noun", () => {
    const tailored = [
      { title: "Experience", content: "• Built a checkout flow using Stripe." },
    ];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newProperNouns).not.toContain("Built");
  });

  it("does not flag a capitalized verb at the start of a line or after a period as a new proper noun", () => {
    const tailored = [
      {
        title: "Experience",
        content: "Shipped a new onboarding flow. Fixed a critical bug in checkout.",
      },
    ];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newProperNouns).not.toContain("Shipped");
    expect(result.newProperNouns).not.toContain("Fixed");
  });

  it("flags a new proper noun that appears mid-sentence", () => {
    const tailored = [
      { title: "Skills", content: "Experienced with Kubernetes and Snowflake." },
    ];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newProperNouns).toEqual(expect.arrayContaining(["Kubernetes", "Snowflake"]));
  });

  it("does not flag a word that appears case-insensitively anywhere in the original resume", () => {
    const tailored = [{ title: "Experience", content: "Built the JEST test suite from scratch." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newProperNouns).not.toContain("JEST");
  });

  it("adds word boundaries to the banned-phrase regex so it does not match a longer word", () => {
    const tailored = [{ title: "Summary", content: "Works dynamically across teams." }];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.bannedPhraseHits).toEqual([]);
  });

  it("adds word boundaries to the keyword overuse counter so it does not match a longer word", () => {
    const tailored = [
      {
        title: "Experience",
        content: "Used JavaScript extensively. JavaScript again. JavaScript once more.",
      },
    ];
    const result = validateTailoredResume(original, tailored, ["Java"]);
    expect(result.overusedKeywords).toEqual([]);
  });

  it("excludes the Skills section from the keyword overuse count", () => {
    const tailored = [
      {
        title: "Skills",
        content: "Playwright, Playwright, Playwright, Playwright",
      },
      {
        title: "Experience",
        content: "Used Playwright for testing.",
      },
    ];
    const result = validateTailoredResume(original, tailored, ["Playwright"]);
    expect(result.overusedKeywords).toEqual([]);
  });

  it("does not flag a Skills category label before a colon as a new proper noun, but still flags a genuinely new/fabricated proper noun elsewhere", () => {
    const tailored = [
      {
        title: "Skills",
        content: "Backend & Cloud: AWS, Docker",
      },
      {
        title: "Experience",
        content: "Deployed services using Snowflake for analytics.",
      },
    ];
    const result = validateTailoredResume(original, tailored, []);
    expect(result.newProperNouns).not.toContain("Cloud");
    expect(result.newProperNouns).not.toContain("Backend");
    expect(result.newProperNouns).toContain("Snowflake");
  });

  it("flags a skill dropped from the tailored Skills section", () => {
    const originalWithSkills =
      "Summary\nBuilt things.\n\nSkills\nLanguages: JavaScript, TypeScript, GraphQL\nTools: Docker, Git";
    const tailored = [
      { title: "Skills", content: "Languages: JavaScript, TypeScript\nTools: Docker, Git" },
    ];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toContain("GraphQL");
  });

  it("does not flag any dropped skills when everything is preserved", () => {
    const originalWithSkills =
      "Summary\nBuilt things.\n\nSkills\nLanguages: JavaScript, TypeScript, GraphQL\nTools: Docker, Git";
    const tailored = [
      { title: "Skills", content: "Languages: TypeScript, JavaScript, GraphQL\nTools: Git, Docker" },
    ];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toEqual([]);
  });

  it("does not flag skills with punctuation (C#, C++, .NET, Node.js) as dropped when present", () => {
    const originalWithSkills =
      "Summary\nBuilt things.\n\nSkills\nLanguages: C#, C++, .NET, Node.js";
    const tailored = [
      { title: "Skills", content: "Languages: C#, C++, .NET, Node.js" },
    ];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toEqual([]);
  });

  it("flags C# as dropped when removed from the tailored Skills section", () => {
    const originalWithSkills =
      "Summary\nBuilt things.\n\nSkills\nLanguages: C#, C++, .NET, Node.js";
    const tailored = [
      { title: "Skills", content: "Languages: C++, .NET, Node.js" },
    ];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toContain("C#");
  });

  it("does not cut the Skills section short on a single-item line like 'Azure'", () => {
    const originalWithSkills =
      "Summary\nBuilt things.\n\nSkills\nAzure\nDocker, Git\n\nExperience\nDid stuff.";
    const tailored = [{ title: "Skills", content: "Azure, Docker, Git" }];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toEqual([]);
  });

  it("captures same-line 'Skills: React, TypeScript' heading content", () => {
    const originalWithSkills = "Summary\nBuilt things.\n\nSkills: React, TypeScript\n\nExperience\nDid stuff.";
    const tailored = [{ title: "Skills", content: "React, TypeScript" }];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toEqual([]);
  });

  it("recognizes 'Technical Skills' and 'Technologies' as valid Skills headings", () => {
    const originalTechnicalSkills = "Summary\nBuilt things.\n\nTechnical Skills\nReact, TypeScript\n\nExperience\nDid stuff.";
    const tailoredTechnical = [{ title: "Skills", content: "React, TypeScript" }];
    const resultTechnical = validateTailoredResume(originalTechnicalSkills, tailoredTechnical, []);
    expect(resultTechnical.droppedSkills).toEqual([]);

    const originalTechnologies = "Summary\nBuilt things.\n\nTechnologies\nReact, TypeScript\n\nExperience\nDid stuff.";
    const tailoredTechnologies = [{ title: "Skills", content: "React, TypeScript" }];
    const resultTechnologies = validateTailoredResume(originalTechnologies, tailoredTechnologies, []);
    expect(resultTechnologies.droppedSkills).toEqual([]);
  });
  it("drops exactly GraphQL (no label false-positives) from a bullet-separated single-line Skills section", () => {
    const originalWithSkills =
      "SKILLS\n- Languages: Typescript, Javascript, C#, Python, HTML, CSS • Technologies: React, Next.js, Redux, Styled Components, CSS Modules, Jest, React Testing Library, GraphQL, Playwright, Cypress, Node.js, Azure, Git, Yarn, webpack";
    const tailored = [
      {
        title: "Skills",
        content:
          "Languages: Typescript, Javascript, C#, Python, HTML, CSS\nTechnologies: React, Next.js, Redux, Styled Components, CSS Modules, Jest, React Testing Library, Playwright, Cypress, Node.js, Azure, Git, Yarn, webpack",
      },
    ];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toEqual(["GraphQL"]);
  });

  it("drops exactly GraphQL from a real-production-shaped Skills line that starts with a bullet character (•), not a hyphen", () => {
    const originalWithSkills =
      "SKILLS\n• Languages: Typescript, Javascript, C#, Python, HTML, CSS • Technologies: React, Next.js, Redux, Styled Components, CSS Modules, Jest, React Testing Library, GraphQL, Playwright, Cypress, Node.js, Azure, Git, Yarn, webpack";
    const tailored = [
      {
        title: "Skills",
        content:
          "Languages: Typescript, Javascript, C#, Python, HTML, CSS\nTechnologies: React, Next.js, Redux, Styled Components, CSS Modules, Jest, React Testing Library, Playwright, Cypress, Node.js, Azure, Git, Yarn, webpack",
      },
    ];
    const bulletResult = validateTailoredResume(originalWithSkills, tailored, []);
    expect(bulletResult.droppedSkills).toEqual(["GraphQL"]);
  });


  it("drops no skills (including no label false-positives) when GraphQL is kept, even with extra spacing around separators", () => {
    const originalWithSkills =
      "SKILLS\n-   Languages:  Typescript, Javascript, C#, Python, HTML, CSS  •  Technologies:  React, Next.js, Redux, Styled Components, CSS Modules, Jest, React Testing Library, GraphQL, Playwright, Cypress, Node.js, Azure, Git, Yarn, webpack";
    const tailored = [
      {
        title: "Skills",
        content:
          "Languages: Typescript, Javascript, C#, Python, HTML, CSS\nTechnologies: React, Next.js, Redux, Styled Components, CSS Modules, Jest, React Testing Library, GraphQL, Playwright, Cypress, Node.js, Azure, Git, Yarn, webpack",
      },
    ];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toEqual([]);
  });

  it("stops the uppercase SKILLS section at an uppercase EDUCATION heading and doesn't bleed into CERTIFICATES", () => {
    const originalWithSkills =
      "SKILLS\nLanguages: JavaScript, TypeScript, GraphQL\n\nEDUCATION\nState University — B.S. Computer Science\n\nCERTIFICATES\nAWS Certified Solutions Architect";
    const tailored = [
      { title: "Skills", content: "Languages: JavaScript, TypeScript, GraphQL" },
    ];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.droppedSkills).toEqual([]);
    // Confirm the heading boundary works by also checking a drop still
    // triggers (bleeding into EDUCATION/CERTIFICATES would hide false info).
    const tailoredMissing = [{ title: "Skills", content: "Languages: JavaScript, TypeScript" }];
    const resultMissing = validateTailoredResume(originalWithSkills, tailoredMissing, []);
    expect(resultMissing.droppedSkills).toContain("GraphQL");
    expect(resultMissing.droppedSkills).not.toContain("State University");
    expect(resultMissing.droppedSkills).not.toContain("AWS Certified Solutions Architect");
  });

  it("sets skillsSectionNotFound to true when the original has substantial content but no Skills heading", () => {
    const originalNoSkillsHeading =
      "SUMMARY\nExperienced software engineer with 8 years building scalable web applications across fintech and e-commerce.\n\nEXPERIENCE\nACME Corp — Senior Engineer (2020-2024)\nBuilt and maintained core services used by millions of users daily.";
    const tailored = [{ title: "Summary", content: "Experienced software engineer." }];
    const result = validateTailoredResume(originalNoSkillsHeading, tailored, []);
    expect(result.skillsSectionNotFound).toBe(true);
  });

  it("sets skillsSectionNotFound to false in the normal case where a Skills heading is found", () => {
    const originalWithSkills =
      "Summary\nBuilt things.\n\nSkills\nLanguages: JavaScript, TypeScript, GraphQL\nTools: Docker, Git";
    const tailored = [{ title: "Skills", content: "Languages: JavaScript, TypeScript, GraphQL\nTools: Docker, Git" }];
    const result = validateTailoredResume(originalWithSkills, tailored, []);
    expect(result.skillsSectionNotFound).toBe(false);
  });
});

describe("flagLargeDeletion", () => {
  it("flags when a full sentence is dropped", () => {
    const original =
      "Developed a multi-method checkout flow supporting credit card, WeChat Pay and Alipay. Improved conversion for the platform's core transaction pipeline.";
    const revised =
      "Developed a multi-method checkout flow supporting credit card, WeChat Pay and Alipay.";
    expect(flagLargeDeletion(original, revised)).toBe(true);
  });

  it("does not flag a pure adjective removal", () => {
    const original = "Built high-impact features for the team.";
    const revised = "Built features for the team.";
    expect(flagLargeDeletion(original, revised)).toBe(false);
  });

  it("always flags when a short bullet is fully emptied", () => {
    const original = "Led onboarding.";
    const revised = "";
    expect(flagLargeDeletion(original, revised)).toBe(true);
  });
});
