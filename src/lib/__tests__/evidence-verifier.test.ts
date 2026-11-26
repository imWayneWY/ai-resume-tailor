import { normalize, verifySupportedKeywords, type SupportedKeyword } from "../evidence-verifier";

describe("normalize", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalize("  Hello   World  \n")).toBe("hello world");
  });
});

describe("verifySupportedKeywords", () => {
  const originalResume = `Jane Doe
Skills: JavaScript, TypeScript, GraphQL, React

Experience
Built the Fantuan Reviews dashboard using GraphQL and React.`;

  it("counts an evidence quote found verbatim (after normalization) in the original resume as verified", () => {
    const supported: SupportedKeyword[] = [
      { term: "GraphQL", evidence: "Built the Fantuan Reviews dashboard using GraphQL and React." },
    ];

    const { verified, verifiedTerms } = verifySupportedKeywords(originalResume, supported);

    expect(verified).toEqual(supported);
    expect(verifiedTerms).toEqual(["GraphQL"]);
  });

  it("verifies evidence even with different whitespace/casing than the original (normalization-tolerant)", () => {
    const supported: SupportedKeyword[] = [
      { term: "GraphQL", evidence: "BUILT   the Fantuan Reviews dashboard using graphql and react." },
    ];

    const { verifiedTerms } = verifySupportedKeywords(originalResume, supported);
    expect(verifiedTerms).toEqual(["GraphQL"]);
  });

  it("discards an evidence quote that is NOT found in the original resume, and does not count it as verified", () => {
    const supported: SupportedKeyword[] = [
      { term: "Kubernetes", evidence: "Ran Kubernetes clusters in production." },
    ];

    const { verified, verifiedTerms } = verifySupportedKeywords(originalResume, supported);

    expect(verified).toEqual([]);
    expect(verifiedTerms).toEqual([]);
  });

  it("verifies only the entries whose evidence is found, from a mixed list", () => {
    const supported: SupportedKeyword[] = [
      { term: "GraphQL", evidence: "Built the Fantuan Reviews dashboard using GraphQL and React." },
      { term: "Kubernetes", evidence: "Ran Kubernetes clusters in production." },
    ];

    const { verified, verifiedTerms } = verifySupportedKeywords(originalResume, supported);

    expect(verifiedTerms).toEqual(["GraphQL"]);
    expect(verified).toHaveLength(1);
    expect(verified[0].term).toBe("GraphQL");
  });

  it("drops malformed entries (missing term/evidence, wrong types, empty strings) without throwing", () => {
    const supported = [
      { term: "GraphQL", evidence: "Built the Fantuan Reviews dashboard using GraphQL and React." },
      { term: "Missing evidence" },
      { evidence: "Missing term" },
      { term: 123, evidence: 456 },
      { term: "", evidence: "" },
      { term: "React", evidence: "   " },
      null,
      undefined,
      "not an object",
      42,
    ] as unknown as SupportedKeyword[];

    expect(() => verifySupportedKeywords(originalResume, supported)).not.toThrow();
    const { verified, verifiedTerms } = verifySupportedKeywords(originalResume, supported);
    expect(verifiedTerms).toEqual(["GraphQL"]);
    expect(verified).toEqual([
      { term: "GraphQL", evidence: "Built the Fantuan Reviews dashboard using GraphQL and React." },
    ]);
  });

  it("returns empty results for an empty supportedKeywords array", () => {
    const { verified, verifiedTerms } = verifySupportedKeywords(originalResume, []);
    expect(verified).toEqual([]);
    expect(verifiedTerms).toEqual([]);
  });

  it("rejects a too-short evidence quote even if it appears verbatim in the resume", () => {
    const supported: SupportedKeyword[] = [
      { term: "React", evidence: "React" },
      { term: "JavaScript", evidence: "a" },
    ];

    const { verified, verifiedTerms } = verifySupportedKeywords(originalResume, supported);

    expect(verified).toEqual([]);
    expect(verifiedTerms).toEqual([]);
  });

  it("accepts a valid-length real quote that supports the term", () => {
    const supported: SupportedKeyword[] = [
      { term: "GraphQL", evidence: "Built the Fantuan Reviews dashboard using GraphQL and React." },
    ];

    const { verified, verifiedTerms } = verifySupportedKeywords(originalResume, supported);

    expect(verified).toEqual(supported);
    expect(verifiedTerms).toEqual(["GraphQL"]);
  });
});
