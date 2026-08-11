import { describe, expect, it } from "vitest";

import {
  BeadProjectValidationError,
  calculatePhysicalSize,
  createBeadProject,
  createBeadRecipeSource,
  decodeBeadCellsRle,
  encodeBeadCellsRle,
  expandAutoCanvasAroundCell,
  restoreBeadProjectFromRecipeSource,
  trimEmptyBorder,
  validateBeadProject,
} from "../src/domain/project";
import type {
  BeadCell,
  BeadProject,
  RgbColor,
} from "../src/domain/types";

const NOW = "2026-07-30T00:00:00.000Z";
const PALETTE: RgbColor[] = [
  [230, 40, 50],
  [20, 120, 210],
];

function makeProject(
  overrides: Partial<BeadProject> = {},
): BeadProject {
  return createBeadProject({
    projectId: "project-1",
    moduleVersion: "1.0.0",
    now: NOW,
    rows: 2,
    columns: 3,
    palette: PALETTE,
    cells: [
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "empty" },
    ],
    ...overrides,
  });
}

function expectInvalid(
  project: unknown,
  code: string,
): void {
  try {
    validateBeadProject(project);
    throw new Error("expected project validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BeadProjectValidationError);
    expect((error as BeadProjectValidationError).code).toBe(code);
  }
}

describe("bead project model", () => {
  it("creates a versioned project with the approved physical defaults", () => {
    const project = makeProject();

    expect(project).toMatchObject({
      schemaVersion: "bead-project/v1",
      renderSchemaVersion: "bead-render/v1",
      moduleId: "lumina.bead-pattern",
      moduleVersion: "1.0.0",
      projectId: "project-1",
      createdAt: NOW,
      updatedAt: NOW,
      beadPitchMm: 2.6,
      compression: 50,
      irregularity: 0,
    });
    expect(validateBeadProject(project)).toBe(project);
    expect("printMapping" in project).toBe(false);
  });

  it("accepts prerelease and build metadata used by Workshop packages", () => {
    const project = makeProject({
      moduleVersion: "1.0.2-dev.4+desktop.qa",
    });
    const recipe = createBeadRecipeSource(project);
    const restored = restoreBeadProjectFromRecipeSource(recipe, {
      now: NOW,
      projectId: "restored-prerelease",
    });

    expect(validateBeadProject(project)).toBe(project);
    expect(recipe.moduleVersion).toBe("1.0.2-dev.4+desktop.qa");
    expect(restored.moduleVersion).toBe(
      "1.0.2-dev.4+desktop.qa",
    );
  });

  it("rejects numeric prerelease identifiers with leading zeroes", () => {
    const project = makeProject();
    expectInvalid(
      { ...project, moduleVersion: "1.0.0-01" },
      "invalid-project",
    );
  });

  it("keeps optional print mapping separate while preserving explicit null", () => {
    const withoutMapping = makeProject();
    const explicitNull = makeProject({ printMapping: null });
    const mapped = makeProject({
      printMapping: {
        libraryId: "lut:official",
        libraryLabel: "Official LUT",
        entries: [
          { sourcePaletteIndex: 0, colorEntryId: "official-red" },
          { sourcePaletteIndex: 1, colorEntryId: "official-blue" },
        ],
      },
    });

    expect("printMapping" in withoutMapping).toBe(false);
    expect(explicitNull.printMapping).toBeNull();
    expect(validateBeadProject(mapped).printMapping).toEqual(
      mapped.printMapping,
    );
    expectInvalid(
      {
        ...mapped,
        printMapping: {
          ...mapped.printMapping,
          entries: [
            { sourcePaletteIndex: 99, colorEntryId: "outside" },
          ],
        },
      },
      "invalid-print-mapping",
    );
  });

  it("trims only all-empty outer rows and columns", () => {
    const cells: BeadCell[] = Array.from(
      { length: 4 * 5 },
      () => ({ kind: "empty" }) as const,
    );
    cells[1 * 5 + 1] = { kind: "color", paletteIndex: 1 };
    cells[1 * 5 + 2] = { kind: "color", paletteIndex: 0 };
    cells[2 * 5 + 3] = { kind: "color", paletteIndex: 1 };

    const project = createBeadProject({
      projectId: "trim",
      moduleVersion: "1.0.0",
      now: NOW,
      rows: 4,
      columns: 5,
      palette: PALETTE,
      cells,
      confidenceIssues: [
        {
          cellIndex: 1 * 5 + 2,
          confidence: 0.4,
          reasons: ["overlay-obstruction"],
          resolved: false,
        },
      ],
    });

    const trimmed = trimEmptyBorder(project);

    expect(trimmed.rows).toBe(2);
    expect(trimmed.columns).toBe(3);
    expect(trimmed.cells).toEqual([
      { kind: "color", paletteIndex: 1 },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
    ]);
    expect(trimmed.confidenceIssues[0]?.cellIndex).toBe(1);
    expect(project.rows).toBe(4);
    expect(project.columns).toBe(5);
  });

  it("keeps an all-empty matrix valid for editing", () => {
    const project = createBeadProject({
      projectId: "empty",
      moduleVersion: "1.0.0",
      now: NOW,
      rows: 2,
      columns: 2,
      palette: PALETTE,
    });

    expect(trimEmptyBorder(project)).toBe(project);
  });

  it("expands an auto canvas around an edge cell without moving its artwork", () => {
    const cells: BeadCell[] = Array.from(
      { length: 4 * 4 },
      () => ({ kind: "empty" }) as const,
    );
    cells[0] = { kind: "color", paletteIndex: 1 };
    const project = createBeadProject({
      projectId: "auto-canvas",
      moduleVersion: "1.0.0",
      now: NOW,
      rows: 4,
      columns: 4,
      palette: PALETTE,
      cells,
      canvasMode: "auto-expand",
      confidenceIssues: [{
        cellIndex: 0,
        confidence: 0.4,
        reasons: ["overlay-obstruction"],
        resolved: false,
      }],
    });

    const expanded = expandAutoCanvasAroundCell(project, 0);

    expect(expanded.project.rows).toBe(12);
    expect(expanded.project.columns).toBe(12);
    expect(expanded.cellIndex).toBe(8 * 12 + 8);
    expect(expanded.project.cells[expanded.cellIndex]).toEqual({
      kind: "color",
      paletteIndex: 1,
    });
    expect(expanded.project.confidenceIssues[0]?.cellIndex).toBe(
      expanded.cellIndex,
    );
    expect(project.rows).toBe(4);
    expect(project.columns).toBe(4);
  });

  it("keeps fixed and maximum-size canvases bounded", () => {
    const fixed = makeProject();
    expect(expandAutoCanvasAroundCell(fixed, 0).project).toBe(fixed);

    const maximum = createBeadProject({
      projectId: "maximum-auto-canvas",
      moduleVersion: "1.0.0",
      now: NOW,
      rows: 128,
      columns: 128,
      palette: PALETTE,
      canvasMode: "auto-expand",
    });
    const expanded = expandAutoCanvasAroundCell(maximum, 0);
    expect(expanded.project).toBe(maximum);
    expect(expanded.cellIndex).toBe(0);
  });

  it("calculates exact decimal dimensions from logical grid pitch", () => {
    expect(calculatePhysicalSize(makeProject(), 2.6)).toEqual({
      widthMm: 7.8,
      heightMm: 5.2,
    });
  });

  it("uses one 2.6 mm pitch per cell independent of compression", () => {
    const project = createBeadProject({
      projectId: "physical-size",
      moduleVersion: "1.0.0",
      now: NOW,
      rows: 12,
      columns: 20,
      beadPitchMm: 2.6,
    });

    expect(calculatePhysicalSize(project, project.beadPitchMm)).toEqual({
      widthMm: 52,
      heightMm: 31.2,
    });
    const fullyCompressed = { ...project, compression: 100 };
    expect(
      calculatePhysicalSize(fullyCompressed, project.beadPitchMm),
    ).toEqual({
      widthMm: 52,
      heightMm: 31.2,
    });
  });

  it("encodes empty and color cells with stable RLE", () => {
    const cells: BeadCell[] = [
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
    ];

    const encoded = encodeBeadCellsRle(cells);

    expect(encoded).toEqual([
      [-1, 2],
      [0, 2],
      [-1, 2],
      [1, 1],
    ]);
    expect(decodeBeadCellsRle(encoded, cells.length)).toEqual(cells);
  });

  it("rejects the retired transparent-support cell kind", () => {
    const project = makeProject({
      cells: [
        { kind: "empty" },
        { kind: "color", paletteIndex: 0 },
        { kind: "empty" },
        { kind: "color", paletteIndex: 1 },
        { kind: "empty" },
        { kind: "empty" },
      ],
    });

    expectInvalid(
      {
        ...project,
        cells: [
          ...project.cells.slice(0, 2),
          { kind: "transparent-support" },
          ...project.cells.slice(3),
        ],
      },
      "invalid-cell",
    );
  });

  it("rejects the retired transparent-support RLE token", () => {
    expect(() => decodeBeadCellsRle([[-2, 1]], 1)).toThrow(
      BeadProjectValidationError,
    );
  });

  it("rejects malformed project dimensions, cells, palette, pitch, and pressure", () => {
    const project = makeProject();

    expectInvalid({ ...project, rows: 129 }, "invalid-dimensions");
    expectInvalid(
      { ...project, cells: project.cells.slice(1) },
      "cell-count-mismatch",
    );
    expectInvalid(
      {
        ...project,
        cells: [
          ...project.cells.slice(0, 1),
          { kind: "color", paletteIndex: 9 },
          ...project.cells.slice(2),
        ],
      },
      "invalid-palette-index",
    );
    expectInvalid(
      { ...project, palette: [[300, 0, 0]] },
      "invalid-palette",
    );
    expectInvalid({ ...project, beadPitchMm: 0.49 }, "invalid-pitch");
    expectInvalid({ ...project, compression: 50.5 }, "invalid-compression");
    expectInvalid({ ...project, irregularity: 100.5 }, "invalid-irregularity");
    expectInvalid({ ...project, irregularity: -1 }, "invalid-irregularity");
    expectInvalid(
      { ...project, canvasMode: "endless" },
      "invalid-canvas-mode",
    );
  });

  it("round-trips an editable matrix through the source-only recipe payload", () => {
    const project = makeProject({
      source: {
        fileName: "private-pattern.png",
        mimeType: "image/png",
        blob: new Blob(["private-source-bytes"], { type: "image/png" }),
        pixelWidth: 120,
        pixelHeight: 80,
      },
      calibration: {
        inputMode: "numbered-grid",
        crop: { x: 4, y: 8, width: 100, height: 60 },
        origin: { x: 0.25, y: 0.5 },
        orientation: {
          rotation: 90,
          flipHorizontal: true,
          flipVertical: false,
        },
        emptySelection: { kind: "sample", cellIndex: 0 },
      },
      beadPitchMm: 2.6,
      compression: 84,
      irregularity: 67,
    });

    const source = createBeadRecipeSource(project);
    const serialized = JSON.stringify(source);
    const restored = restoreBeadProjectFromRecipeSource(source, {
      projectId: "imported-project",
      now: "2026-07-30T01:00:00.000Z",
    });

    expect(serialized).not.toContain("private-pattern.png");
    expect(serialized).not.toContain("private-source-bytes");
    expect(restored).toMatchObject({
      projectId: "imported-project",
      source: null,
      rows: project.rows,
      columns: project.columns,
      palette: project.palette,
      cells: project.cells,
      beadPitchMm: 2.6,
      compression: 84,
      irregularity: 67,
      confidenceIssues: [],
      calibration: {
        inputMode: "numbered-grid",
        orientation: {
          rotation: 90,
          flipHorizontal: true,
          flipVertical: false,
        },
      },
    });
    expect(source.payload).toMatchObject({ irregularity: 67 });
  });

  it("round-trips the auto-expanding canvas mode through a recipe", () => {
    const source = createBeadRecipeSource(
      makeProject({ canvasMode: "auto-expand" }),
    );
    const restored = restoreBeadProjectFromRecipeSource(source, {
      projectId: "restored-auto-canvas",
      now: NOW,
    });

    expect(source.payload).toMatchObject({ canvasMode: "auto-expand" });
    expect(restored.canvasMode).toBe("auto-expand");
  });

  it("rejects recipe payloads for another module or with incomplete RLE", () => {
    const source = createBeadRecipeSource(makeProject());

    expect(() =>
      restoreBeadProjectFromRecipeSource({
        ...source,
        moduleId: "other.module",
      }),
    ).toThrowError(BeadProjectValidationError);

    expect(() =>
      restoreBeadProjectFromRecipeSource({
        ...source,
        payload: {
          ...source.payload,
          cellsRle: [[0, 1]],
        },
      }),
    ).toThrowError(BeadProjectValidationError);
  });
});
