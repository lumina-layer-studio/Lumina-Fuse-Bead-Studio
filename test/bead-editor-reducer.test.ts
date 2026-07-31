import { describe, expect, it } from "vitest";

import {
  beadEditorReducer,
  createBeadEditorState,
} from "../src/domain/editorReducer";
import { createBeadProject } from "../src/domain/project";
import type {
  BeadCell,
  BeadProject,
} from "../src/domain/types";

const NOW = "2026-07-30T00:00:00.000Z";
const RECOGNITION_NOW = "2026-07-29T00:00:00.000Z";

function makeProject(
  cells: BeadCell[] = Array.from(
    { length: 3 * 4 },
    () => ({ kind: "empty" }) as const,
  ),
): BeadProject {
  return createBeadProject({
    projectId: "editor",
    moduleVersion: "1.0.0",
    now: NOW,
    rows: 3,
    columns: 4,
    palette: [
      [230, 40, 50],
      [20, 120, 210],
    ],
    cells,
    confidenceIssues: [
      {
        cellIndex: 3,
        confidence: 0.4,
        reasons: ["overlay-obstruction"],
        resolved: false,
      },
    ],
  });
}

function makeCheckpointProject(): BeadProject {
  return createBeadProject({
    projectId: "editor",
    moduleVersion: "1.0.0",
    now: NOW,
    rows: 3,
    columns: 4,
    palette: [
      [230, 40, 50],
      [20, 120, 210],
    ],
    cells: [
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "transparent-support" },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "transparent-support" },
      { kind: "empty" },
    ],
    calibration: {
      inputMode: "ring-preview",
      crop: { x: 4, y: 6, width: 80, height: 60 },
      origin: { x: 2, y: 3 },
      orientation: {
        rotation: 90,
        flipHorizontal: true,
        flipVertical: false,
      },
      emptySelection: { kind: "sample", cellIndex: 1 },
      transparentSupportSampleCellIndex: 2,
    },
    confidenceIssues: [
      {
        cellIndex: 3,
        confidence: 0.4,
        reasons: ["overlay-obstruction"],
        resolved: false,
      },
    ],
    printMapping: {
      libraryId: "original-library",
      libraryLabel: "Original library",
      entries: [
        { sourcePaletteIndex: 0, colorEntryId: "original-red" },
        { sourcePaletteIndex: 1, colorEntryId: "original-blue" },
      ],
    },
  });
}

function makeRecognitionReplacement(): BeadProject {
  return createBeadProject({
    projectId: "editor",
    moduleVersion: "1.0.0",
    now: RECOGNITION_NOW,
    rows: 2,
    columns: 3,
    palette: [[12, 34, 56]],
    cells: [
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "transparent-support" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
    ],
    calibration: {
      inputMode: "numbered-grid",
      crop: { x: 1, y: 2, width: 30, height: 20 },
      origin: { x: 5, y: 7 },
      orientation: {
        rotation: 180,
        flipHorizontal: false,
        flipVertical: true,
      },
      emptySelection: { kind: "sample", cellIndex: 0 },
      transparentSupportSampleCellIndex: 2,
    },
    confidenceIssues: [
      {
        cellIndex: 4,
        confidence: 0.61,
        reasons: ["high-color-variance"],
        resolved: true,
      },
      {
        cellIndex: 2,
        confidence: 0.33,
        reasons: ["grid-misalignment"],
        resolved: false,
      },
    ],
    printMapping: {
      libraryId: "replacement-library",
      libraryLabel: "Replacement library",
      entries: [
        { sourcePaletteIndex: 0, colorEntryId: "replacement-gray" },
      ],
    },
  });
}

describe("bead editor reducer", () => {
  it("focuses the first unresolved confidence issue on entry", () => {
    const current = makeProject();
    current.confidenceIssues = [
      {
        cellIndex: 1,
        confidence: 0.38,
        reasons: ["overlay-obstruction"],
        resolved: true,
      },
      {
        cellIndex: 7,
        confidence: 0.42,
        reasons: ["jpeg-near-tie"],
        resolved: false,
      },
    ];

    const state = createBeadEditorState(current);

    expect(state.selectedIssueIndex).toBe(1);
    expect(state.selectedCellIndex).toBe(7);
  });

  it("paints, erases, and places transparent support with reversible patches", () => {
    let state = createBeadEditorState(makeProject());

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "paint",
      cellIndex: 3,
      paletteIndex: 1,
      updatedAt: "2026-07-30T00:01:00.000Z",
    });
    expect(state.present.cells[3]).toEqual({
      kind: "color",
      paletteIndex: 1,
    });
    expect(state.present.confidenceIssues[0]?.resolved).toBe(true);
    expect(state.past).toHaveLength(1);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.cells[3]).toEqual({ kind: "empty" });
    expect(state.present.confidenceIssues[0]?.resolved).toBe(false);

    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present.cells[3]).toEqual({
      kind: "color",
      paletteIndex: 1,
    });
    expect(state.present.confidenceIssues[0]?.resolved).toBe(true);

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "erase",
      cellIndex: 3,
    });
    expect(state.present.cells[3]).toEqual({ kind: "empty" });

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "support",
      cellIndex: 3,
    });
    expect(state.present.cells[3]).toEqual({
      kind: "transparent-support",
    });
  });

  it("flood-fills only the four-neighbour connected target region", () => {
    const cells: BeadCell[] = [
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
    ];
    let state = createBeadEditorState(makeProject(cells));

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "fill",
      cellIndex: 0,
      paletteIndex: 1,
    });

    expect(state.present.cells).toEqual([
      { kind: "color", paletteIndex: 1 },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
    ]);
    const historyEntry = state.past[0];
    expect(historyEntry?.kind).toBe("patch");
    if (!historyEntry || historyEntry.kind !== "patch") {
      throw new Error("Expected a patch history entry.");
    }
    expect(historyEntry.cellPatches).toHaveLength(3);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.cells).toEqual(cells);
  });

  it("uses the eyedropper without adding undo history", () => {
    const cells = makeProject().cells.slice();
    cells[5] = { kind: "color", paletteIndex: 1 };
    let state = createBeadEditorState(makeProject(cells));

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "eyedropper",
      cellIndex: 5,
    });

    expect(state.activePaletteIndex).toBe(1);
    expect(state.activeTool).toBe("paint");
    expect(state.selectedCellIndex).toBe(5);
    expect(state.past).toEqual([]);
  });

  it("does not create history for unchanged or invalid edits and clears redo after a new edit", () => {
    let state = createBeadEditorState(makeProject());

    const unchanged = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "erase",
      cellIndex: 0,
    });
    expect(unchanged).toBe(state);

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "paint",
      cellIndex: 0,
      paletteIndex: 0,
    });
    state = beadEditorReducer(state, { type: "undo" });
    expect(state.future).toHaveLength(1);

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "support",
      cellIndex: 1,
    });
    expect(state.future).toEqual([]);
    expect(
      beadEditorReducer(state, {
        type: "apply-tool",
        tool: "paint",
        cellIndex: 999,
        paletteIndex: 999,
      }),
    ).toBe(state);
  });

  it("selects and explicitly resolves confidence issues", () => {
    let state = createBeadEditorState(makeProject());

    state = beadEditorReducer(state, {
      type: "select-issue",
      issueIndex: 0,
    });
    expect(state.selectedIssueIndex).toBe(0);
    expect(state.selectedCellIndex).toBe(3);

    state = beadEditorReducer(state, {
      type: "set-issue-resolved",
      issueIndex: 0,
      resolved: true,
    });
    expect(state.present.confidenceIssues[0]?.resolved).toBe(true);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.confidenceIssues[0]?.resolved).toBe(false);
  });

  it("updates pressure, pitch, and custom palette colors without corrupting edit history", () => {
    let state = createBeadEditorState(makeProject());
    state = beadEditorReducer(state, {
      type: "set-compression",
      compression: 84,
      updatedAt: "2026-07-30T00:02:00.000Z",
    });
    state = beadEditorReducer(state, {
      type: "set-bead-pitch",
      beadPitchMm: 2.5,
    });
    state = beadEditorReducer(state, {
      type: "add-palette-color",
      color: [12, 34, 56],
    });

    expect(state.present.compression).toBe(84);
    expect(state.present.beadPitchMm).toBe(2.5);
    expect(state.present.palette.at(-1)).toEqual([12, 34, 56]);
    expect(state.activePaletteIndex).toBe(2);
    expect(state.activeTool).toBe("paint");
    expect(state.past).toEqual([]);
    expect(
      beadEditorReducer(state, {
        type: "set-compression",
        compression: 101,
      }),
    ).toBe(state);
  });

  it("replaces the whole project and resets palette and issue focus", () => {
    const original = makeCheckpointProject();
    const replacement = makeRecognitionReplacement();
    let state = createBeadEditorState(original);
    state = beadEditorReducer(state, {
      type: "set-palette",
      paletteIndex: 1,
    });

    state = beadEditorReducer(state, {
      type: "replace-project",
      project: replacement,
    });

    expect(state.present.rows).toBe(2);
    expect(state.present.columns).toBe(3);
    expect(state.present.palette).toEqual(replacement.palette);
    expect(state.present.cells).toEqual(replacement.cells);
    expect(state.activePaletteIndex).toBe(0);
    expect(state.selectedIssueIndex).toBe(1);
    expect(state.selectedCellIndex).toBe(2);
    expect(state.past).toHaveLength(1);
    expect(state.future).toEqual([]);
    const historyEntry = state.past[0];
    expect(historyEntry?.kind).toBe("project");
    if (!historyEntry || historyEntry.kind !== "project") {
      throw new Error("Expected a project history entry.");
    }
    expect(historyEntry.beforeProject).toBe(original);
    expect(historyEntry.afterProject).toBe(replacement);
  });

  it("undoes and redoes complete project checkpoints without regressing updatedAt", () => {
    const original = makeCheckpointProject();
    const replacement = makeRecognitionReplacement();
    let state = createBeadEditorState(original);

    state = beadEditorReducer(state, {
      type: "replace-project",
      project: replacement,
    });
    expect(state.past.map((entry) => entry.kind)).toEqual([
      "project",
    ]);
    expect(state.present.updatedAt).toBe(NOW);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present).toEqual(original);

    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present).toEqual({
      ...replacement,
      updatedAt: NOW,
    });
  });

  it("keeps patch history safe across a project checkpoint boundary", () => {
    const original = makeCheckpointProject();
    const replacement = makeRecognitionReplacement();
    let state = createBeadEditorState(original);

    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "paint",
      cellIndex: 1,
      paletteIndex: 1,
    });
    const paintedCells = state.present.cells;
    state = beadEditorReducer(state, {
      type: "replace-project",
      project: replacement,
    });
    expect(state.past.map((entry) => entry.kind)).toEqual([
      "patch",
      "project",
    ]);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.cells).toEqual(paintedCells);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.cells).toEqual(original.cells);

    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present.cells).toEqual(paintedCells);

    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present.cells).toEqual(replacement.cells);
    expect(state.present.rows).toBe(replacement.rows);
    expect(state.present.columns).toBe(replacement.columns);
  });
});
