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
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "empty" },
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
      { kind: "empty" },
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

function makeHighIndexReplacement(): BeadProject {
  return createBeadProject({
    projectId: "editor",
    moduleVersion: "1.0.0",
    now: RECOGNITION_NOW,
    rows: 2,
    columns: 4,
    palette: [
      [12, 34, 56],
      [78, 90, 12],
      [34, 56, 78],
      [90, 12, 34],
    ],
    cells: [
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 1 },
      { kind: "color", paletteIndex: 2 },
      { kind: "color", paletteIndex: 3 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
    ],
    confidenceIssues: [
      {
        cellIndex: 1,
        confidence: 0.61,
        reasons: ["high-color-variance"],
        resolved: true,
      },
      {
        cellIndex: 6,
        confidence: 0.33,
        reasons: ["grid-misalignment"],
        resolved: false,
      },
      {
        cellIndex: 7,
        confidence: 0.29,
        reasons: ["jpeg-near-tie"],
        resolved: false,
      },
    ],
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

  it("paints and erases with reversible patches", () => {
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

  it("flood-erases only the clicked four-neighbour region as one undo", () => {
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
      tool: "eraseFill",
      cellIndex: 0,
    });

    expect(state.present.cells).toEqual([
      { kind: "empty" },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
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
      tool: "paint",
      cellIndex: 1,
      paletteIndex: 0,
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

  it("updates pressure, irregularity, pitch, and custom palette colors without corrupting edit history", () => {
    let state = createBeadEditorState(makeProject());
    state = beadEditorReducer(state, {
      type: "set-compression",
      compression: 84,
      updatedAt: "2026-07-30T00:02:00.000Z",
    });
    state = beadEditorReducer(state, {
      type: "set-irregularity",
      irregularity: 67,
      updatedAt: "2026-07-30T00:02:01.000Z",
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
    expect(state.present.irregularity).toBe(67);
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
    expect(
      beadEditorReducer(state, {
        type: "set-irregularity",
        irregularity: 101,
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
    expect(historyEntry.beforeProject).toEqual(original);
    expect(historyEntry.beforeProject).not.toBe(original);
    expect(historyEntry.afterProject).toEqual(replacement);
    expect(historyEntry.afterProject).not.toBe(replacement);
  });

  it("deeply isolates project checkpoints from caller and present mutations", () => {
    const original = makeCheckpointProject();
    const sourceBlob = new Blob(["recognition-source"], {
      type: "image/png",
    });
    const replacement: BeadProject = {
      ...makeRecognitionReplacement(),
      source: {
        fileName: "recognition.png",
        mimeType: "image/png",
        blob: sourceBlob,
        pixelWidth: 300,
        pixelHeight: 200,
      },
    };
    let state = createBeadEditorState(original);

    state = beadEditorReducer(state, {
      type: "replace-project",
      project: replacement,
    });
    const storedEntry = state.past[0];
    if (!storedEntry || storedEntry.kind !== "project") {
      throw new Error("Expected a project history entry.");
    }
    expect(storedEntry.beforeProject).not.toBe(original);
    expect(storedEntry.afterProject).not.toBe(replacement);
    expect(storedEntry.afterProject.source).not.toBe(
      replacement.source,
    );
    expect(storedEntry.afterProject.source?.blob).toBe(sourceBlob);
    expect(storedEntry.afterProject.calibration).not.toBe(
      replacement.calibration,
    );
    expect(storedEntry.afterProject.calibration.crop).not.toBe(
      replacement.calibration.crop,
    );
    expect(storedEntry.afterProject.calibration.origin).not.toBe(
      replacement.calibration.origin,
    );
    expect(storedEntry.afterProject.calibration.orientation).not.toBe(
      replacement.calibration.orientation,
    );
    expect(
      storedEntry.afterProject.calibration.emptySelection,
    ).not.toBe(replacement.calibration.emptySelection);
    expect(storedEntry.afterProject.palette).not.toBe(
      replacement.palette,
    );
    expect(storedEntry.afterProject.palette[0]).not.toBe(
      replacement.palette[0],
    );
    expect(storedEntry.afterProject.cells).not.toBe(
      replacement.cells,
    );
    expect(storedEntry.afterProject.cells[0]).not.toBe(
      replacement.cells[0],
    );
    expect(storedEntry.afterProject.confidenceIssues[0]).not.toBe(
      replacement.confidenceIssues[0],
    );
    expect(
      storedEntry.afterProject.confidenceIssues[0].reasons,
    ).not.toBe(replacement.confidenceIssues[0].reasons);
    expect(storedEntry.afterProject.printMapping).not.toBe(
      replacement.printMapping,
    );
    expect(
      storedEntry.afterProject.printMapping?.entries[0],
    ).not.toBe(replacement.printMapping?.entries[0]);
    expect(state.present.palette).not.toBe(
      storedEntry.afterProject.palette,
    );

    replacement.source!.fileName = "mutated.png";
    replacement.calibration.crop!.x = 99;
    replacement.calibration.origin.x = 98;
    replacement.calibration.orientation.rotation = 270;
    replacement.calibration.emptySelection = {
      kind: "sample",
      cellIndex: 5,
    };
    replacement.palette[0][0] = 97;
    replacement.cells[0] = { kind: "color", paletteIndex: 0 };
    replacement.confidenceIssues[0].reasons[0] =
      "jpeg-near-tie";
    replacement.printMapping!.entries[0].colorEntryId =
      "mutated-mapping";
    original.palette[0][0] = 1;
    original.cells[0] = { kind: "empty" };
    original.calibration.origin.x = 96;
    original.printMapping!.entries[0].colorEntryId =
      "mutated-original";

    expect(state.present.source?.fileName).toBe("recognition.png");
    expect(state.present.calibration.crop?.x).toBe(1);
    expect(state.present.calibration.origin.x).toBe(5);
    expect(state.present.calibration.orientation.rotation).toBe(180);
    expect(state.present.calibration.emptySelection).toEqual({
      kind: "sample",
      cellIndex: 0,
    });
    expect(state.present.palette[0][0]).toBe(12);
    expect(state.present.cells[0]).toEqual({ kind: "empty" });
    expect(
      state.present.confidenceIssues[0].reasons[0],
    ).toBe("high-color-variance");
    expect(
      state.present.printMapping?.entries[0].colorEntryId,
    ).toBe("replacement-gray");
    expect(storedEntry.afterProject.palette[0][0]).toBe(12);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.palette[0][0]).toBe(230);
    expect(state.present.cells[0]).toEqual({
      kind: "color",
      paletteIndex: 0,
    });
    expect(state.present.calibration.origin.x).toBe(2);
    expect(
      state.present.printMapping?.entries[0].colorEntryId,
    ).toBe("original-red");
    const futureEntry = state.future[0];
    if (!futureEntry || futureEntry.kind !== "project") {
      throw new Error("Expected a project history entry.");
    }
    state.present.palette[0][0] = 201;
    state.present.calibration.origin.x = 42;
    expect(futureEntry.beforeProject.palette[0][0]).toBe(230);
    expect(futureEntry.beforeProject.calibration.origin.x).toBe(2);

    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present.palette[0][0]).toBe(12);
    expect(state.present.calibration.origin.x).toBe(5);
    const pastEntry = state.past[0];
    if (!pastEntry || pastEntry.kind !== "project") {
      throw new Error("Expected a project history entry.");
    }
    state.present.palette[0][0] = 202;
    state.present.calibration.origin.x = 43;
    expect(pastEntry.afterProject.palette[0][0]).toBe(12);
    expect(pastEntry.afterProject.calibration.origin.x).toBe(5);
  });

  it("preserves non-history replacement edits across checkpoint undo and redo", () => {
    let state = createBeadEditorState(makeCheckpointProject());
    state = beadEditorReducer(state, {
      type: "replace-project",
      project: makeRecognitionReplacement(),
    });
    state = beadEditorReducer(state, {
      type: "set-compression",
      compression: 88,
      updatedAt: "2026-07-30T02:00:00.000Z",
    });
    state = beadEditorReducer(state, {
      type: "set-bead-pitch",
      beadPitchMm: 3.1,
    });
    state = beadEditorReducer(state, {
      type: "add-palette-color",
      color: [210, 180, 140],
    });
    state = beadEditorReducer(state, {
      type: "set-print-mapping",
      printMapping: {
        libraryId: "edited-library",
        libraryLabel: "Edited library",
        entries: [
          {
            sourcePaletteIndex: 0,
            colorEntryId: "edited-gray",
          },
          {
            sourcePaletteIndex: 1,
            colorEntryId: "edited-sand",
          },
        ],
      },
    });
    const editedReplacement = structuredClone(state.present);

    state = beadEditorReducer(state, { type: "undo" });
    state = beadEditorReducer(state, { type: "redo" });

    expect(state.present).toEqual(editedReplacement);
    expect(state.present.compression).toBe(88);
    expect(state.present.beadPitchMm).toBe(3.1);
    expect(state.present.palette.at(-1)).toEqual([210, 180, 140]);
    expect(state.present.printMapping).toEqual({
      libraryId: "edited-library",
      libraryLabel: "Edited library",
      entries: [
        {
          sourcePaletteIndex: 0,
          colorEntryId: "edited-gray",
        },
        {
          sourcePaletteIndex: 1,
          colorEntryId: "edited-sand",
        },
      ],
    });
  });

  it("preserves non-history original edits across redo and the next undo", () => {
    let state = createBeadEditorState(makeCheckpointProject());
    state = beadEditorReducer(state, {
      type: "replace-project",
      project: makeRecognitionReplacement(),
    });
    state = beadEditorReducer(state, { type: "undo" });
    state = beadEditorReducer(state, {
      type: "set-compression",
      compression: 73,
      updatedAt: "2026-07-30T03:00:00.000Z",
    });
    const editedOriginal = structuredClone(state.present);

    state = beadEditorReducer(state, { type: "redo" });
    state = beadEditorReducer(state, { type: "undo" });

    expect(state.present).toEqual(editedOriginal);
    expect(state.present.compression).toBe(73);
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

  it("keeps the latest project timestamp across replace undo and redo", () => {
    const cases = [
      {
        replacementUpdatedAt: RECOGNITION_NOW,
        expectedUpdatedAt: NOW,
      },
      {
        replacementUpdatedAt: NOW,
        expectedUpdatedAt: NOW,
      },
      {
        replacementUpdatedAt: "2026-07-31T00:00:00.000Z",
        expectedUpdatedAt: "2026-07-31T00:00:00.000Z",
      },
    ];

    for (const testCase of cases) {
      const replacement: BeadProject = {
        ...makeRecognitionReplacement(),
        updatedAt: testCase.replacementUpdatedAt,
      };
      let state = createBeadEditorState(makeCheckpointProject());

      state = beadEditorReducer(state, {
        type: "replace-project",
        project: replacement,
      });
      expect(state.present.updatedAt).toBe(
        testCase.expectedUpdatedAt,
      );

      state = beadEditorReducer(state, { type: "undo" });
      expect(state.present.updatedAt).toBe(
        testCase.expectedUpdatedAt,
      );

      state = beadEditorReducer(state, { type: "redo" });
      expect(state.present.updatedAt).toBe(
        testCase.expectedUpdatedAt,
      );
    }
  });

  it("normalizes project-specific palette and issue focus across checkpoint undo and redo", () => {
    const original = makeCheckpointProject();
    const replacement = makeHighIndexReplacement();
    let state = createBeadEditorState(original);

    state = beadEditorReducer(state, {
      type: "replace-project",
      project: replacement,
    });
    state = beadEditorReducer(state, {
      type: "set-palette",
      paletteIndex: 3,
    });
    state = beadEditorReducer(state, {
      type: "select-issue",
      issueIndex: 2,
    });

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.rows).toBe(original.rows);
    expect(state.activePaletteIndex).toBe(0);
    expect(state.selectedIssueIndex).toBe(0);
    expect(state.selectedCellIndex).toBe(3);

    state = beadEditorReducer(state, {
      type: "set-palette",
      paletteIndex: 1,
    });
    state = beadEditorReducer(state, {
      type: "select-cell",
      cellIndex: 11,
    });
    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present.rows).toBe(replacement.rows);
    expect(state.activePaletteIndex).toBe(0);
    expect(state.selectedIssueIndex).toBe(1);
    expect(state.selectedCellIndex).toBe(6);
  });

  it("keeps patch timestamps monotonic after checkpoint round trips", () => {
    const patchUpdatedAt = "2026-07-30T02:00:00.000Z";
    const replacementUpdatedAt = "2026-07-30T03:00:00.000Z";
    const originalUpdatedAt = "2026-07-30T04:00:00.000Z";
    let state = createBeadEditorState(makeCheckpointProject());

    state = beadEditorReducer(state, {
      type: "replace-project",
      project: makeRecognitionReplacement(),
    });
    state = beadEditorReducer(state, {
      type: "apply-tool",
      tool: "paint",
      cellIndex: 0,
      paletteIndex: 0,
      updatedAt: patchUpdatedAt,
    });
    state = beadEditorReducer(state, {
      type: "set-compression",
      compression: 88,
      updatedAt: replacementUpdatedAt,
    });
    expect(state.present.cells[0]).toEqual({
      kind: "color",
      paletteIndex: 0,
    });
    expect(state.present.compression).toBe(88);
    expect(state.past.map((entry) => entry.kind)).toEqual([
      "project",
      "patch",
    ]);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.cells[0]).toEqual({ kind: "empty" });
    expect(state.present.compression).toBe(88);
    expect(state.past.map((entry) => entry.kind)).toEqual([
      "project",
    ]);
    expect(state.future.map((entry) => entry.kind)).toEqual([
      "patch",
    ]);

    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.rows).toBe(3);
    expect(state.present.compression).toBe(50);
    expect(state.present.printMapping?.libraryId).toBe(
      "original-library",
    );
    expect(state.past).toEqual([]);
    expect(state.future.map((entry) => entry.kind)).toEqual([
      "project",
      "patch",
    ]);

    state = beadEditorReducer(state, {
      type: "set-compression",
      compression: 73,
      updatedAt: originalUpdatedAt,
    });
    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present.rows).toBe(2);
    expect(state.present.cells[0]).toEqual({ kind: "empty" });
    expect(state.present.compression).toBe(88);
    expect(state.present.printMapping?.libraryId).toBe(
      "replacement-library",
    );
    expect(state.present.updatedAt).toBe(originalUpdatedAt);
    expect(state.past.map((entry) => entry.kind)).toEqual([
      "project",
    ]);
    expect(state.future.map((entry) => entry.kind)).toEqual([
      "patch",
    ]);

    state = beadEditorReducer(state, { type: "redo" });
    const firstRedoPatchUpdatedAt = state.present.updatedAt;
    expect(state.present.cells[0]).toEqual({
      kind: "color",
      paletteIndex: 0,
    });
    expect(state.present.compression).toBe(88);
    expect(state.past.map((entry) => entry.kind)).toEqual([
      "project",
      "patch",
    ]);
    expect(state.future).toEqual([]);

    state = beadEditorReducer(state, { type: "undo" });
    state = beadEditorReducer(state, { type: "undo" });
    expect(state.present.rows).toBe(3);
    expect(state.present.compression).toBe(73);
    expect(state.present.updatedAt).toBe(originalUpdatedAt);
    expect(state.past).toEqual([]);
    expect(state.future.map((entry) => entry.kind)).toEqual([
      "project",
      "patch",
    ]);

    state = beadEditorReducer(state, { type: "redo" });
    state = beadEditorReducer(state, { type: "redo" });
    expect(state.present.rows).toBe(2);
    expect(state.present.cells[0]).toEqual({
      kind: "color",
      paletteIndex: 0,
    });
    expect(state.present.compression).toBe(88);
    expect(state.past.map((entry) => entry.kind)).toEqual([
      "project",
      "patch",
    ]);
    expect(state.future).toEqual([]);
    expect(firstRedoPatchUpdatedAt).toBe(originalUpdatedAt);
    expect(state.present.updatedAt).toBe(originalUpdatedAt);
  });

  it("preserves print mapping tri-state through project checkpoints", () => {
    const cases = ["absent", "undefined", "null"] as const;

    for (const mappingState of cases) {
      const replacement = makeRecognitionReplacement();
      if (mappingState === "absent") {
        delete replacement.printMapping;
      } else if (mappingState === "undefined") {
        replacement.printMapping = undefined;
      } else {
        replacement.printMapping = null;
      }
      const expectedHasOwn = mappingState !== "absent";
      const expectedValue =
        mappingState === "null" ? null : undefined;
      const expectMappingState = (project: BeadProject): void => {
        expect(
          Object.prototype.hasOwnProperty.call(
            project,
            "printMapping",
          ),
        ).toBe(expectedHasOwn);
        expect(project.printMapping).toBe(expectedValue);
      };
      let state = createBeadEditorState(makeCheckpointProject());

      state = beadEditorReducer(state, {
        type: "replace-project",
        project: replacement,
      });
      expectMappingState(state.present);
      const pastEntry = state.past[0];
      if (!pastEntry || pastEntry.kind !== "project") {
        throw new Error("Expected a project history entry.");
      }
      expectMappingState(pastEntry.afterProject);

      state = beadEditorReducer(state, { type: "undo" });
      expect(state.present.printMapping?.libraryId).toBe(
        "original-library",
      );
      const futureEntry = state.future[0];
      if (!futureEntry || futureEntry.kind !== "project") {
        throw new Error("Expected a project history entry.");
      }
      expectMappingState(futureEntry.afterProject);

      state = beadEditorReducer(state, { type: "redo" });
      expectMappingState(state.present);
    }
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
