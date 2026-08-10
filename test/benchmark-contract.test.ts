// @vitest-environment node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const THREE_PREVIEW_METRICS = [
  "fusionSurface911Ms",
  "fusionSurface3532Ms",
  "threeGeometry3532Ms",
  "threeGeometry3532Bytes",
  "physicalPreview3532Ms",
  "physicalPreview16384Ms",
] as const;

describe("benchmark contract", () => {
  it("reports budgeted fusion-surface and 3D-geometry costs", async () => {
    const execution = spawnSync(
      process.execPath,
      ["scripts/benchmark.mjs", "--check-regression"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(execution.status, execution.stderr).toBe(0);
    const result: Record<string, unknown> = JSON.parse(execution.stdout);
    const budget: Record<string, unknown> = JSON.parse(
      await readFile("benchmarks/ci-budget.json", "utf8"),
    );

    for (const metric of THREE_PREVIEW_METRICS) {
      expect(result[metric]).toSatisfy(
        (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0,
      );
      expect(budget[metric]).toSatisfy(
        (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0,
      );
      expect(result[metric]).toBeLessThanOrEqual(budget[metric] as number);
    }
  });
});
