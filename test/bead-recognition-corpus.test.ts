import { describe, expect, it } from "vitest";

import {
  classifyPattern,
  cropRaster,
  recognizeBeadPattern,
  suggestGrid,
} from "../src/domain/recognition";
import type {
  BeadInputMode,
  Raster,
  RecognitionRequest,
} from "../src/domain/types";
import {
  makeGeneratedHardPixelChart,
  makeGeneratedRingChart,
  makeGuidedNumberedChart,
  makeLabeledNumberedChart,
  makeNearTieHardPixelChart,
  makeNonSquareChart,
  makeTransparentHardPixelChart,
  makeTwoPatternCanvas,
  makeWhiteOnWhiteChart,
} from "./helpers/chartFixtures";

function recognize(
  source: Raster,
  mode: BeadInputMode,
  rows: number,
  columns: number,
  emptyCellIndex = 0,
  transparentSupportSampleCellIndex: number | null = null,
): ReturnType<typeof recognizeBeadPattern> {
  const suggestion = suggestGrid(source, mode);
  const geometry =
    suggestion.rows === rows && suggestion.columns === columns
      ? suggestion.geometry
      : {
          originX: 0,
          originY: 0,
          cellWidth: source.width / columns,
          cellHeight: source.height / rows,
        };
  const request: RecognitionRequest = {
    source,
    mode,
    rows,
    columns,
    geometry,
    emptySelection: { kind: "sample", cellIndex: emptyCellIndex },
    transparentSupportSampleCellIndex,
    orientation: {
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    },
  };
  return recognizeBeadPattern(request);
}

describe("generated chart recognition corpus", () => {
  it("classifies labeled numbered, hard-pixel, and ring charts", () => {
    const numbered = makeLabeledNumberedChart(17, 23);
    const hardPixel = makeGeneratedHardPixelChart(52, 52, 8);
    const rings = makeGeneratedRingChart(37, 37);

    expect(classifyPattern(numbered.raster).mode).toBe("numbered-grid");
    expect(classifyPattern(hardPixel).mode).toBe("hard-pixel");
    expect(classifyPattern(rings).mode).toBe("ring-preview");
  });

  it.each([
    [23, 17, 8],
    [37, 37, 8],
    [52, 52, 8],
    [78, 78, 4],
    [104, 104, 4],
  ] as const)(
    "recognizes a bounded %sx%s hard-pixel matrix",
    (columns, rows, scale) => {
      const source = makeGeneratedHardPixelChart(rows, columns, scale);
      const suggestion = suggestGrid(source, "hard-pixel");
      const result = recognize(source, "hard-pixel", rows, columns);

      expect(suggestion).toMatchObject({
        rows,
        columns,
        validSquareGrid: true,
      });
      expect(result.rows).toBe(rows);
      expect(result.columns).toBe(columns);
      expect(result.cells).toHaveLength(rows * columns);
      expect(result.cells[0]).toEqual({ kind: "empty" });
      expect(result.palette.length).toBeGreaterThanOrEqual(4);
    },
  );

  it("preserves transparent support as a distinct calibrated cell", () => {
    const result = recognize(
      makeTransparentHardPixelChart(),
      "hard-pixel",
      2,
      3,
      0,
      2,
    );

    expect(result.cells[0]).toEqual({ kind: "empty" });
    expect(result.cells[2]).toEqual({ kind: "transparent-support" });
  });

  it("keeps white numbered beads and reports the generated watermark", () => {
    const fixture = makeLabeledNumberedChart(17, 23);
    const result = recognizeBeadPattern({
      source: fixture.raster,
      mode: "numbered-grid",
      rows: 17,
      columns: 23,
      geometry: fixture.geometry,
      emptySelection: { kind: "sample", cellIndex: 0 },
      transparentSupportSampleCellIndex: null,
      orientation: {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      },
    });

    expect(result.cells[fixture.whiteBeadCell]?.kind).toBe("color");
    expect(result.confidenceIssues).toHaveLength(1);
    expect(
      result.confidenceIssues.map((issue) => issue.cellIndex),
    ).toEqual([fixture.watermarkCell]);
    expect(result.confidenceIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cellIndex: fixture.watermarkCell,
          reasons: expect.arrayContaining(["overlay-obstruction"]),
        }),
      ]),
    );
  });

  it("trims numbered guide axes and keeps the complete data matrix", () => {
    const fixture = makeGuidedNumberedChart();
    const suggestion = suggestGrid(fixture.raster, "numbered-grid");

    expect(suggestion).toMatchObject({
      rows: 24,
      columns: 16,
      geometry: fixture.expectedGeometry,
      validSquareGrid: true,
    });

    const result = recognizeBeadPattern({
      source: fixture.raster,
      mode: "numbered-grid",
      rows: suggestion.rows,
      columns: suggestion.columns,
      geometry: suggestion.geometry,
      emptySelection: { kind: "sample", cellIndex: 0 },
      transparentSupportSampleCellIndex: null,
      orientation: {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      },
    });

    expect(result.cells).toHaveLength(24 * 16);
    expect(result.cells[fixture.decorationCell]).toEqual({
      kind: "empty",
    });
    expect(result.cells[fixture.paleBeadCell]?.kind).toBe("color");
    expect(result.confidenceIssues).toEqual([]);
  });

  it("trims blank guide rows below an internal numbered axis", () => {
    const fixture = makeGuidedNumberedChart(21, 16, 3);
    const suggestion = suggestGrid(fixture.raster, "numbered-grid");

    expect(suggestion).toMatchObject({
      rows: 21,
      columns: 16,
      geometry: fixture.expectedGeometry,
      validSquareGrid: true,
    });
  });

  it("flags a controlled JPEG-like near tie for manual review", () => {
    const result = recognize(
      makeNearTieHardPixelChart(),
      "hard-pixel",
      2,
      2,
    );

    expect(result.confidenceIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cellIndex: 1,
          reasons: expect.arrayContaining(["jpeg-near-tie"]),
        }),
      ]),
    );
  });

  it("requires cropping when one canvas contains two patterns", () => {
    const fixture = makeTwoPatternCanvas();
    const first = cropRaster(fixture.raster, fixture.firstCrop);
    const second = cropRaster(fixture.raster, fixture.secondCrop);

    expect(suggestGrid(first, "hard-pixel")).toMatchObject({
      rows: 3,
      columns: 4,
    });
    expect(suggestGrid(second, "hard-pixel")).toMatchObject({
      rows: 4,
      columns: 3,
    });
  });

  it("does not invent unrecoverable white-on-white occupancy", () => {
    const source = makeWhiteOnWhiteChart(4, 4);
    const result = recognize(source, "hard-pixel", 4, 4);

    expect(classifyPattern(source).mode).toBe("ambiguous");
    expect(result.cells.every((cell) => cell.kind === "empty")).toBe(true);
  });

  it("marks non-square calibration as unsupported", () => {
    const source = makeNonSquareChart(5, 7);
    const suggestion = suggestGrid(source, "hard-pixel");

    expect(suggestion.validSquareGrid).toBe(false);
  });
});
