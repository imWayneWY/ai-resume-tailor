import { curveScore, scoreLabel } from "../score-curve";

describe("curveScore", () => {
  it("returns 0 for raw 0", () => {
    expect(curveScore(0)).toBe(0);
  });

  it("returns 100 for raw 100", () => {
    expect(curveScore(100)).toBe(100);
  });

  it("boosts mid-range scores into a more impressive range", () => {
    // Raw 50 should become ~71
    const curved50 = curveScore(50);
    expect(curved50).toBeGreaterThanOrEqual(70);
    expect(curved50).toBeLessThanOrEqual(72);
  });

  it("boosts low scores moderately", () => {
    // Raw 17 → ~41
    const curved17 = curveScore(17);
    expect(curved17).toBeGreaterThanOrEqual(40);
    expect(curved17).toBeLessThanOrEqual(42);
  });

  it("boosts a typical tailored score significantly", () => {
    // Raw 57 → ~76
    const curved57 = curveScore(57);
    expect(curved57).toBeGreaterThanOrEqual(75);
    expect(curved57).toBeLessThanOrEqual(76);
  });

  it("clamps negative values to 0", () => {
    expect(curveScore(-10)).toBe(0);
  });

  it("clamps values above 100", () => {
    expect(curveScore(150)).toBe(100);
  });

  it("produces monotonically increasing results", () => {
    let prev = curveScore(0);
    for (let raw = 1; raw <= 100; raw++) {
      const current = curveScore(raw);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });
});

describe("scoreLabel", () => {
  it("returns Weak for very low scores", () => {
    expect(scoreLabel(0)).toBe("Weak");
    expect(scoreLabel(29)).toBe("Weak");
  });

  it("returns Fair for low-mid scores", () => {
    expect(scoreLabel(30)).toBe("Fair");
    expect(scoreLabel(49)).toBe("Fair");
  });

  it("returns Good for mid scores", () => {
    expect(scoreLabel(50)).toBe("Good");
    expect(scoreLabel(69)).toBe("Good");
  });

  it("returns Strong for high scores", () => {
    expect(scoreLabel(70)).toBe("Strong");
    expect(scoreLabel(84)).toBe("Strong");
  });

  it("returns Excellent for very high scores", () => {
    expect(scoreLabel(85)).toBe("Excellent");
    expect(scoreLabel(100)).toBe("Excellent");
  });
});
