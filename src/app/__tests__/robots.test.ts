import robots from "../robots";

describe("robots", () => {
  it("returns a robots config object", () => {
    const config = robots();
    expect(config).toBeDefined();
    expect(config.rules).toBeDefined();
  });

  it("allows all user agents to crawl /", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const mainRule = rules.find((r) => r.userAgent === "*");
    expect(mainRule).toBeDefined();
    expect(mainRule!.allow).toBe("/");
  });

  it("disallows /api/", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const mainRule = rules.find((r) => r.userAgent === "*");
    expect(mainRule!.disallow).toContain("/api/");
  });

  it("includes a sitemap URL", () => {
    const config = robots();
    expect(config.sitemap).toContain("/sitemap.xml");
  });

  it("uses BASE_URL fallback when env var is not set", () => {
    const config = robots();
    expect(config.sitemap).toContain("ai-resume-tailor-blond.vercel.app");
  });
});
