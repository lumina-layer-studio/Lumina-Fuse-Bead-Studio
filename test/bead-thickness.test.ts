import { describe, expect, it } from "vitest";

import { estimateBeadThicknessMm } from "../src/domain/beadThickness";

describe("fused bead thickness", () => {
  it("anchors a 2.6 mm bead to the measured practical states", () => {
    expect(estimateBeadThicknessMm(0, 2.6)).toBe(2.6);
    expect(estimateBeadThicknessMm(50, 2.6)).toBe(2.35);
    expect(estimateBeadThicknessMm(90, 2.6)).toBe(1.95);
    expect(estimateBeadThicknessMm(100, 2.6)).toBe(1.85);
  });

  it("decreases monotonically and scales for another bead pitch", () => {
    const values = Array.from({ length: 101 }, (_, compression) =>
      estimateBeadThicknessMm(compression, 2.6),
    );
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeLessThanOrEqual(values[index - 1]);
    }
    expect(estimateBeadThicknessMm(100, 5.2)).toBe(3.7);
  });
});
