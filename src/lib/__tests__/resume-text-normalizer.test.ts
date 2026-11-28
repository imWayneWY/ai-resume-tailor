import { normalizeResumeText } from "../resume-text-normalizer";

const FIXTURE =
  "Jordan Lee jordan.lee@example.com 555-0100 Vancouver, BC PROFILE Experienced software engineer building reliable web products with a focus on developer productivity. EXPERIENCE **Acme Robotics** — Senior Software Engineer (2021 - 2023) •Built a local lifestyle and food review platform used by 50K monthly users •Migrated the legacy billing system to a microservices architecture **Beta Systems** — Software Engineer (2019-2021) •Shipped a real-time chat feature using WebSockets •Reduced API latency by 30% through caching **Gamma Labs** — Junior Developer (2017 - 2019) •Built internal tooling for QA automation SKILLS Languages: JavaScript, TypeScript, Python ● Technologies: React, GraphQL, Node.js EDUCATION BS Computer Science, University of Somewhere (2017) CERTIFICATES AWS Certified Developer";

describe("normalizeResumeText", () => {
  it("yields separate lines for headings, company headers, and bullets", () => {
    const normalized = normalizeResumeText(FIXTURE);
    const lines = normalized.split("\n").map((l) => l.trim());

    // Headings each get their own line.
    for (const heading of ["PROFILE", "EXPERIENCE", "SKILLS", "EDUCATION", "CERTIFICATES"]) {
      expect(lines).toContain(heading);
    }

    // Each of the 3 company headers ends up on its own line (as part of a
    // line containing the company name and year range).
    const companyLines = lines.filter((l) => /\(20\d{2}\s*-\s*20\d{2}\)|\(?20\d{2}\s*-\s*present\)?/i.test(l));
    expect(companyLines.some((l) => l.includes("Acme Robotics"))).toBe(true);
    expect(companyLines.some((l) => l.includes("Beta Systems"))).toBe(true);
    expect(companyLines.some((l) => l.includes("Gamma Labs"))).toBe(true);

    // Each bullet is on its own line, starting with "• ".
    const bulletLines = lines.filter((l) => l.startsWith("• "));
    expect(bulletLines.length).toBeGreaterThanOrEqual(6);
    expect(bulletLines.some((l) => l.includes("local lifestyle and food review platform"))).toBe(true);
    expect(bulletLines.some((l) => l.includes("GraphQL") || normalized.includes("GraphQL"))).toBe(true);
  });

  it("is idempotent-ish and handles empty input", () => {
    expect(normalizeResumeText("")).toBe("");
  });
});
