import sitemap from "../sitemap";

describe("sitemap", () => {
  it("returns an array of sitemap entries", () => {
    const entries = sitemap();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("includes the homepage with highest priority", () => {
    const entries = sitemap();
    const home = entries.find((e) => e.priority === 1);
    expect(home).toBeDefined();
    expect(home!.url).not.toContain("/tailor");
  });

  it("includes the /tailor page", () => {
    const entries = sitemap();
    const tailor = entries.find((e) => e.url.endsWith("/tailor"));
    expect(tailor).toBeDefined();
    expect(tailor!.priority).toBe(0.9);
  });

  it("includes auth pages with lower priority", () => {
    const entries = sitemap();
    const login = entries.find((e) => e.url.endsWith("/auth/login"));
    const signup = entries.find((e) => e.url.endsWith("/auth/signup"));
    expect(login).toBeDefined();
    expect(signup).toBeDefined();
    expect(login!.priority).toBe(0.5);
  });

  it("uses fixed dates for lastModified (not dynamic new Date())", () => {
    const before = Date.now();
    const entries = sitemap();
    // All entries should have the same fixed date, not the current time
    const dates = entries.map((e) => (e.lastModified as Date).getTime());
    const unique = new Set(dates);
    expect(unique.size).toBe(1);
    // The fixed date should NOT be close to "now"
    expect(dates[0]).toBeLessThan(before - 60_000);
  });

  it("uses BASE_URL fallback when env var is not set", () => {
    const entries = sitemap();
    expect(entries[0].url).toContain("ai-resume-tailor-blond.vercel.app");
  });
});
