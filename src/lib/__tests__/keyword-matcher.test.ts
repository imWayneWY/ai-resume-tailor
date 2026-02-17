import {
  extractKeywords,
  calculateMatchScore,
  stemWord,
  isGenericCompound,
} from "@/lib/keyword-matcher";

describe("stemWord", () => {
  it("stems common suffixes", () => {
    expect(stemWord("optimization")).toBe("optim");
    expect(stemWord("optimized")).toBe("optim");
    expect(stemWord("optimizing")).toBe("optim");
    expect(stemWord("deployment")).toBe("deploy");
    expect(stemWord("deployed")).toBe("deploy");
    expect(stemWord("effectiveness")).toBe("effective");
    expect(stemWord("monitoring")).toBe("monitor");
  });

  it("does not stem short words", () => {
    expect(stemWord("go")).toBe("go");
    expect(stemWord("api")).toBe("api");
    expect(stemWord("aws")).toBe("aws");
  });

  it("does not stem tech keywords in allowlist", () => {
    expect(stemWord("ai")).toBe("ai");
    expect(stemWord("ml")).toBe("ml");
  });

  it("handles plurals", () => {
    expect(stemWord("systems")).toBe("system");
    expect(stemWord("pipelines")).toBe("pipeline");
  });

  it("does not remove 's' from words ending in 'ss'", () => {
    expect(stemWord("access")).toBe("access");
  });
});

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

  it("filters out resume-generic words", () => {
    const keywords = extractKeywords(
      "Developed and managed scalable React applications"
    );
    expect(keywords.has("developed")).toBe(false);
    expect(keywords.has("managed")).toBe(false);
    expect(keywords.has("react")).toBe(true);
    expect(keywords.has("scalable")).toBe(true);
  });

  it("extracts multi-word phrases", () => {
    const keywords = extractKeywords(
      "Experience with machine learning and CI/CD pipelines"
    );
    expect(keywords.has("machine learning")).toBe(true);
    expect(keywords.has("ci/cd")).toBe(true);
  });

  it("extracts known tech phrases", () => {
    const keywords = extractKeywords(
      "Built real-time distributed systems with server-side rendering"
    );
    expect(keywords.has("real-time")).toBe(true);
    expect(keywords.has("distributed systems")).toBe(true);
    expect(keywords.has("server-side rendering")).toBe(true);
  });

  it("does not extract phrases from substrings", () => {
    const keywords = extractKeywords("She draws well and has good focus");
    expect(keywords.has("aws")).toBe(false);
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

  it("handles tech keywords with dots", () => {
    const keywords = extractKeywords("Experience with Node.js and GraphQL APIs");
    expect(keywords.has("node.js")).toBe(true);
    expect(keywords.has("graphql")).toBe(true);
  });

  it("returns empty set for empty input", () => {
    const keywords = extractKeywords("");
    expect(keywords.size).toBe(0);
  });

  it("returns empty set for only stop words", () => {
    const keywords = extractKeywords("the and or but if with for");
    expect(keywords.size).toBe(0);
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

  it("matches word variants via stemming", () => {
    const jdKeywords = new Set(["optimization", "deployment", "monitoring"]);
    const result = calculateMatchScore(
      "Optimized performance and deployed services with real-time monitoring tools",
      jdKeywords
    );

    // "optimized" stems to "optim", "optimization" stems to "optim" → match
    // "deployed" stems to "deploy", "deployment" stems to "deploy" → match
    // "monitoring" is exact match
    expect(result.matchedKeywords).toContain("optimization");
    expect(result.matchedKeywords).toContain("deployment");
    expect(result.matchedKeywords).toContain("monitoring");
    expect(result.matchPercentage).toBe(100);
  });

  it("matches multi-word phrases in resume text", () => {
    const jdKeywords = new Set(["machine learning", "react"]);
    const result = calculateMatchScore(
      "Applied machine learning techniques using React",
      jdKeywords
    );

    expect(result.matchedKeywords).toContain("machine learning");
    expect(result.matchedKeywords).toContain("react");
    expect(result.matchPercentage).toBe(100);
  });

  it("does not match phrases that are not present", () => {
    const jdKeywords = new Set(["machine learning", "deep learning"]);
    const result = calculateMatchScore(
      "Built a machine learning pipeline",
      jdKeywords
    );

    expect(result.matchedKeywords).toContain("machine learning");
    expect(result.missedKeywords).toContain("deep learning");
    expect(result.matchPercentage).toBe(50);
  });

  it("matches phrase variants with different separators", () => {
    const jdKeywords = new Set(["ci/cd", "real-time"]);
    const result = calculateMatchScore(
      "Set up CI CD pipelines for real time monitoring",
      jdKeywords
    );

    expect(result.matchedKeywords).toContain("ci/cd");
    expect(result.matchedKeywords).toContain("real-time");
    expect(result.matchPercentage).toBe(100);
  });

  it("rounds match percentage to nearest integer", () => {
    const jdKeywords = new Set(["react", "typescript", "python"]);
    const result = calculateMatchScore("I use React daily", jdKeywords);

    // 1/3 = 33.33...% → 33%
    expect(result.matchPercentage).toBe(33);
  });
});

describe("extractKeywords — expanded stop words", () => {
  it("filters out generic English words from JD", () => {
    const keywords = extractKeywords(
      "Anyone can run this first available area currently"
    );
    expect(keywords.has("anyone")).toBe(false);
    expect(keywords.has("run")).toBe(false);
    expect(keywords.has("first")).toBe(false);
    expect(keywords.has("available")).toBe(false);
    expect(keywords.has("area")).toBe(false);
    expect(keywords.has("currently")).toBe(false);
  });

  it("filters out job posting boilerplate words", () => {
    const keywords = extractKeywords(
      "applicant applicants applying authorized encouraged employment hire rotation"
    );
    expect(keywords.has("applicant")).toBe(false);
    expect(keywords.has("applicants")).toBe(false);
    expect(keywords.has("applying")).toBe(false);
    expect(keywords.has("authorized")).toBe(false);
    expect(keywords.has("encouraged")).toBe(false);
    expect(keywords.has("employment")).toBe(false);
    expect(keywords.has("hire")).toBe(false);
    expect(keywords.has("rotation")).toBe(false);
  });

  it("filters out corporate buzzwords", () => {
    const keywords = extractKeywords(
      "impactful initiatives insights leadership ownership foster proactively"
    );
    expect(keywords.has("impactful")).toBe(false);
    expect(keywords.has("initiatives")).toBe(false);
    expect(keywords.has("insights")).toBe(false);
    expect(keywords.has("leadership")).toBe(false);
    expect(keywords.has("ownership")).toBe(false);
    expect(keywords.has("foster")).toBe(false);
    expect(keywords.has("proactively")).toBe(false);
  });

  it("filters out Canadian province names", () => {
    const keywords = extractKeywords(
      "Alberta British Columbia Ontario Saskatchewan Quebec"
    );
    expect(keywords.has("alberta")).toBe(false);
    expect(keywords.has("british")).toBe(false);
    expect(keywords.has("columbia")).toBe(false);
    expect(keywords.has("ontario")).toBe(false);
    expect(keywords.has("saskatchewan")).toBe(false);
    expect(keywords.has("quebec")).toBe(false);
  });

  it("filters out expanded resume-generic verbs", () => {
    const keywords = extractKeywords(
      "engaged analyzing enabled executed identified resolved streamlined"
    );
    expect(keywords.has("engaged")).toBe(false);
    expect(keywords.has("analyzing")).toBe(false);
    expect(keywords.has("enabled")).toBe(false);
    expect(keywords.has("executed")).toBe(false);
    expect(keywords.has("identified")).toBe(false);
    expect(keywords.has("resolved")).toBe(false);
    expect(keywords.has("streamlined")).toBe(false);
  });

  it("still keeps real tech keywords", () => {
    const keywords = extractKeywords(
      "React TypeScript Docker Kubernetes Python SQL agile scrum"
    );
    expect(keywords.has("react")).toBe(true);
    expect(keywords.has("typescript")).toBe(true);
    expect(keywords.has("docker")).toBe(true);
    expect(keywords.has("kubernetes")).toBe(true);
    expect(keywords.has("python")).toBe(true);
    expect(keywords.has("sql")).toBe(true);
    expect(keywords.has("agile")).toBe(true);
    expect(keywords.has("scrum")).toBe(true);
  });

  it("filters out generic adjectives", () => {
    const keywords = extractKeywords(
      "comprehensive robust reliable rapid significant"
    );
    expect(keywords.has("comprehensive")).toBe(false);
    expect(keywords.has("robust")).toBe(false);
    expect(keywords.has("reliable")).toBe(false);
    expect(keywords.has("rapid")).toBe(false);
    expect(keywords.has("significant")).toBe(false);
  });

  it("filters out generic nouns", () => {
    const keywords = extractKeywords(
      "areas details outcomes systems services topic"
    );
    expect(keywords.has("areas")).toBe(false);
    expect(keywords.has("details")).toBe(false);
    expect(keywords.has("outcomes")).toBe(false);
    expect(keywords.has("systems")).toBe(false);
    expect(keywords.has("services")).toBe(false);
    expect(keywords.has("topic")).toBe(false);
  });
});

describe("isGenericCompound", () => {
  it("identifies generic compound words", () => {
    expect(isGenericCompound("ai-augmented")).toBe(true);
    expect(isGenericCompound("ai-enabled")).toBe(true);
    expect(isGenericCompound("user-friendly")).toBe(true);
    expect(isGenericCompound("non-core")).toBe(true);
    expect(isGenericCompound("self-driven")).toBe(true);
  });

  it("keeps real tech compound terms", () => {
    expect(isGenericCompound("webpack")).toBe(false);
    expect(isGenericCompound("postgresql")).toBe(false);
    expect(isGenericCompound("redis")).toBe(false);
  });

  it("returns false for non-hyphenated words", () => {
    expect(isGenericCompound("react")).toBe(false);
    expect(isGenericCompound("typescript")).toBe(false);
  });

  it("filters compound words where all parts are stop words", () => {
    expect(isGenericCompound("on-call")).toBe(true);
  });
});

describe("extractKeywords — compound word filtering", () => {
  it("filters generic compound words from JD text", () => {
    const keywords = extractKeywords(
      "We need ai-augmented ai-enabled user-friendly non-core on-call engineers"
    );
    expect(keywords.has("ai-augmented")).toBe(false);
    expect(keywords.has("ai-enabled")).toBe(false);
    expect(keywords.has("user-friendly")).toBe(false);
    expect(keywords.has("non-core")).toBe(false);
    expect(keywords.has("on-call")).toBe(false);
  });

  it("still extracts known tech hyphenated phrases", () => {
    const keywords = extractKeywords(
      "Experience with real-time systems and cross-functional teams"
    );
    expect(keywords.has("real-time")).toBe(true);
    expect(keywords.has("cross-functional")).toBe(true);
  });
});
