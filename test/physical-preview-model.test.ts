import { describe, expect, it } from "vitest";

import { estimateBeadThicknessMm } from "../src/domain/beadThickness";
import { buildBeadFusionGeometry } from "../src/domain/fusionGeometry";
import { buildPhysicalPreviewModel } from "../src/domain/physicalPreviewModel";
import { createBeadProject } from "../src/domain/project";
import {
  buildBeadFusionSurfacePaths,
  buildBeadFusionSvgPaths,
  type BeadFusionSvgPath,
} from "../src/domain/svgRenderer";

function makeProject(
  overrides: Partial<Parameters<typeof createBeadProject>[0]> = {},
) {
  return createBeadProject({
    projectId: "physical-preview-test",
    moduleVersion: "1.0.0",
    now: "2026-08-10T00:00:00.000Z",
    rows: 2,
    columns: 3,
    beadPitchMm: 2.6,
    compression: 0,
    palette: [
      [240, 50, 70],
      [30, 120, 220],
    ],
    cells: [
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
      { kind: "color", paletteIndex: 0 },
    ],
    ...overrides,
  });
}

function buildModel(project: ReturnType<typeof makeProject>) {
  const surfacePaths = buildBeadFusionSurfacePaths(project);
  return buildPhysicalPreviewModel(project, surfacePaths);
}

function pathCoordinateCommandCount(d: string): number {
  return d.match(/\b[ML]\b/g)?.length ?? 0;
}

function pathTopology(paths: readonly BeadFusionSvgPath[]) {
  return paths.map(({ cellIndex, d, fill, strokeWidth }) => ({
    cellIndex,
    fill,
    strokeWidth,
    rings: d.match(/\bM\b/g)?.length ?? 0,
  }));
}

describe("canonical 3D preview surface", () => {
  it("supports a low-detail contour count without changing the canonical default", () => {
    const project = makeProject();

    expect(buildBeadFusionGeometry(project, 50, 0).contours[0].points).toHaveLength(
      96,
    );
    expect(
      buildBeadFusionGeometry(project, 50, 0, 24).contours[0].points,
    ).toHaveLength(24);
  });

  it("rejects invalid contour sample counts instead of returning degenerate geometry", () => {
    const project = makeProject();

    for (const sampleCount of [0, -1, 2.5, Number.NaN]) {
      expect(() =>
        buildBeadFusionGeometry(project, 50, 0, sampleCount)
      ).toThrow(RangeError);
    }
  });

  it("embeds low-detail bead holes in each surface path", () => {
    const project = makeProject({
      rows: 1,
      columns: 1,
      compression: 50,
      palette: [[240, 50, 70]],
      cells: [{ kind: "color", paletteIndex: 0 }],
    });
    const openHole = buildBeadFusionSurfacePaths(project);
    const closedHole = buildBeadFusionSurfacePaths({
      ...project,
      compression: 100,
    });

    expect(openHole).toHaveLength(1);
    expect(openHole[0].fill).toBe("rgb(240,50,70)");
    expect(pathCoordinateCommandCount(openHole[0].d)).toBe(24 + 16);
    expect(pathCoordinateCommandCount(closedHole[0].d)).toBe(24);
  });

  it.each([0, 50, 100])(
    "keeps the %i%% canonical surface and board independent of project id",
    (compression) => {
      const first = makeProject({
        projectId: "surface-first",
        compression,
        irregularity: 73,
        rows: 2,
        columns: 2,
        cells: [
          { kind: "color", paletteIndex: 0 },
          { kind: "color", paletteIndex: 1 },
          { kind: "color", paletteIndex: 1 },
          { kind: "color", paletteIndex: 0 },
        ],
      });
      const second = makeProject({
        projectId: "surface-second",
        compression,
        irregularity: 73,
        rows: 2,
        columns: 2,
        cells: [
          { kind: "color", paletteIndex: 0 },
          { kind: "color", paletteIndex: 1 },
          { kind: "color", paletteIndex: 1 },
          { kind: "color", paletteIndex: 0 },
        ],
      });
      const firstSurface = buildBeadFusionSurfacePaths(first);
      const secondSurface = buildBeadFusionSurfacePaths(second);
      const canonical = buildBeadFusionSvgPaths(first);
      const firstModel = buildPhysicalPreviewModel(first, firstSurface);
      const secondModel = buildPhysicalPreviewModel(second, secondSurface);

      expect(firstSurface).toEqual(secondSurface);
      expect(pathTopology(firstSurface)).toEqual(pathTopology(canonical));
      expect(firstModel.surfacePaths).toEqual(firstSurface);
      expect(secondModel.surfacePaths).toEqual(firstSurface);
      expect(firstModel.board).toEqual(secondModel.board);
    },
  );
});

describe("physical 3D preview model", () => {
  it("adds a preview-only board and every nominal peg without changing artwork dimensions", () => {
    const project = makeProject();
    const model = buildModel(project);

    expect(model.widthMm).toBe(7.8);
    expect(model.depthMm).toBe(5.2);
    expect(model.heightMm).toBe(estimateBeadThicknessMm(0, 2.6));
    expect(model.beadPitchMm).toBe(2.6);
    expect(model.board).toMatchObject({
      widthMm: 15.6,
      depthMm: 13,
      thicknessMm: expect.any(Number),
      cornerRadiusMm: expect.any(Number),
      pegRadiusMm: expect.any(Number),
      pegHeightMm: expect.any(Number),
    });
    expect(model.board.thicknessMm).toBeGreaterThan(0);
    expect(model.board.cornerRadiusMm).toBeGreaterThan(0);
    expect(model.board.pegRadiusMm).toBeGreaterThan(0);
    expect(model.board.pegHeightMm).toBeGreaterThan(0);
    expect(model.board.widthMm).toBeGreaterThan(model.widthMm);
    expect(model.board.depthMm).toBeGreaterThan(model.depthMm);
    expect(model.board.pegs).toHaveLength(project.rows * project.columns);
    expect(model.board.pegs[0]).toEqual({
      cellIndex: 0,
      xMm: -2.6,
      zMm: -1.3,
    });
    expect(model.board.pegs[1]).toEqual({
      cellIndex: 1,
      xMm: 0,
      zMm: -1.3,
    });
    expect(model.board.pegs[5]).toEqual({
      cellIndex: 5,
      xMm: 2.6,
      zMm: 1.3,
    });
  });

  it("keeps board dimensions outside the finished artwork thickness contract", () => {
    const raw = buildModel(makeProject({ compression: 0 }));
    const fused = buildModel(makeProject({ compression: 100 }));

    expect(raw.widthMm).toBe(fused.widthMm);
    expect(raw.depthMm).toBe(fused.depthMm);
    expect(raw.board).toEqual(fused.board);
    expect(raw.heightMm).toBe(estimateBeadThicknessMm(0, 2.6));
    expect(fused.heightMm).toBe(estimateBeadThicknessMm(100, 2.6));
    expect(fused.heightMm).not.toBe(
      estimateBeadThicknessMm(100, 2.6) + fused.board.thicknessMm,
    );
  });
});
