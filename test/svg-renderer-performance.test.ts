import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { createBeadProject } from "../src/domain/project";
import {
  buildBeadFusionPreviewSvg,
  renderBeadProjectSvg,
} from "../src/domain/svgRenderer";

function representativeProject(
  rows: number,
  columns: number,
  compression: number,
  irregularity: number,
) {
  const palette: Array<[number, number, number]> = [
    [0, 0, 0],
    [246, 185, 40],
    [49, 173, 116],
    [230, 40, 50],
    [20, 120, 210],
  ];
  return createBeadProject({
    projectId: `svg-performance-${rows}x${columns}`,
    moduleVersion: "1.0.8",
    now: "2026-08-05T00:00:00.000Z",
    rows,
    columns,
    palette,
    cells: Array.from({ length: rows * columns }, (_, index) =>
      index % 17 === 0 || index % 29 === 0
        ? ({ kind: "empty" } as const)
        : ({
            kind: "color",
            paletteIndex: index % palette.length,
          } as const),
    ),
    compression,
    irregularity,
  });
}

function svgHash(project: ReturnType<typeof representativeProject>) {
  return createHash("sha256")
    .update(renderBeadProjectSvg(project))
    .digest("hex");
}

describe("native SVG renderer performance", () => {
  it("preserves representative fusion geometry exactly", () => {
    const hashes = [
      svgHash(representativeProject(8, 9, 50, 0)),
      svgHash(representativeProject(8, 9, 83, 45)),
      svgHash(representativeProject(8, 9, 100, 45)),
    ];

    expect(hashes).toEqual([
      "dbbc640b49130c717987e0e2f25342980006dca7858bf124363dd6aad087d6a1",
      "f5356be38d4e5d01b28500fb57d283498538a04de21c30ebb6e6c106098d6135",
      "511f37c7f47609db96baf4446ae4d6b6765071bcd3fcaad9b73536d418598377",
    ]);
  });

  it("builds a large 32x39 pressure preview within the interaction budget", () => {
    const project = representativeProject(32, 39, 83, 45);
    buildBeadFusionPreviewSvg(
      representativeProject(4, 4, 83, 45),
    );

    const started = performance.now();
    buildBeadFusionPreviewSvg(project);
    const elapsedMs = performance.now() - started;

    expect(elapsedMs).toBeLessThan(500);
  });
});
