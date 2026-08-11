import { describe, expect, it } from "vitest";

import { estimateBeadThicknessMm } from "../src/domain/beadThickness";
import {
  buildBeadFusionGeometry,
  resolveBeadFusionCellDeformation,
  resolveBeadFusionSharedProfile,
} from "../src/domain/fusionGeometry";
import { buildFastBeadPreviewModel } from "../src/domain/fastPreviewModel";
import { buildPhysicalPreviewLayout } from "../src/domain/physicalPreviewModel";
import { createBeadProject } from "../src/domain/project";

function makeProject(
  overrides: Partial<Parameters<typeof createBeadProject>[0]> = {},
) {
  return createBeadProject({
    projectId: "fast-preview-model-test",
    moduleVersion: "1.0.8-dev.34",
    now: "2026-08-12T00:00:00.000Z",
    rows: 2,
    columns: 3,
    beadPitchMm: 2.6,
    compression: 65,
    irregularity: 80,
    palette: [
      [240, 50, 70],
      [30, 120, 220],
    ],
    cells: [
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
      { kind: "color", paletteIndex: 0 },
    ],
    ...overrides,
  });
}

function slotFor(
  model: ReturnType<typeof buildFastBeadPreviewModel>,
  cellIndex: number,
) {
  const slot = model.slots[cellIndex];
  if (!slot) throw new Error(`Missing preview slot ${cellIndex}.`);
  return slot;
}

describe("fast fused bead preview model", () => {
  it("shares exact fusion radii and finished thickness", () => {
    const project = makeProject();
    const geometry = buildBeadFusionGeometry(
      project,
      project.compression,
      project.irregularity,
    );
    const profile = resolveBeadFusionSharedProfile(
      project.compression,
      project.irregularity,
    );
    const model = buildFastBeadPreviewModel(project);

    expect(model.outerRadiusMm).toBeCloseTo(
      geometry.outerRadius * project.beadPitchMm,
      8,
    );
    expect(model.holeRadiusMm).toBeCloseTo(
      geometry.holeRadius * project.beadPitchMm,
      8,
    );
    expect(model.contactReachMm).toBeCloseTo(
      profile.contactReach * project.beadPitchMm,
      8,
    );
    expect(model.heightMm).toBe(
      estimateBeadThicknessMm(project.compression, project.beadPitchMm),
    );
  });

  it("uses stable canonical irregular deformation for isolated cells", () => {
    const project = makeProject({
      rows: 1,
      columns: 1,
      cells: [{ kind: "color", paletteIndex: 0 }],
    });
    const profile = resolveBeadFusionSharedProfile(
      project.compression,
      project.irregularity,
    );
    const deformation = resolveBeadFusionCellDeformation(
      0,
      0,
      project.compression,
      project.irregularity,
    );
    const first = buildFastBeadPreviewModel(project);
    const second = buildFastBeadPreviewModel(project);
    const slot = slotFor(first, 0);

    expect(second).toEqual(first);
    expect(slot.xMm).toBeCloseTo(
      (deformation.center.x - project.columns / 2) * project.beadPitchMm,
      8,
    );
    expect(slot.zMm).toBeCloseTo(
      (deformation.center.y - project.rows / 2) * project.beadPitchMm,
      8,
    );
    expect(slot.scaleX).toBeCloseTo(
      (profile.outerRadius + deformation.radiusXDelta) /
        profile.outerRadius,
      8,
    );
    expect(slot.scaleZ).toBeCloseTo(
      (profile.outerRadius + deformation.radiusYDelta) /
        profile.outerRadius,
      8,
    );
  });

  it("joins orthogonal neighbours while preserving canonical exposed extents", () => {
    const project = makeProject({
      rows: 1,
      columns: 2,
      compression: 0,
      irregularity: 0,
      cells: [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
      ],
    });
    const model = buildFastBeadPreviewModel(project);
    const profile = resolveBeadFusionSharedProfile(0, 0);
    const left = slotFor(model, 0);
    const right = slotFor(model, 1);
    const radiusMm = profile.outerRadius * project.beadPitchMm;

    expect(left.xMm + radiusMm * left.scaleX).toBeGreaterThanOrEqual(
      right.xMm - radiusMm * right.scaleX,
    );
    expect(left.xMm - radiusMm * left.scaleX).toBeCloseTo(
      -project.beadPitchMm / 2 - radiusMm,
      8,
    );
    expect(right.xMm + radiusMm * right.scaleX).toBeCloseTo(
      project.beadPitchMm / 2 + radiusMm,
      8,
    );
  });

  it("keeps empty cells invisible and clones palette RGB values", () => {
    const project = makeProject();
    const model = buildFastBeadPreviewModel(project);
    const colored = slotFor(model, 0);
    const empty = slotFor(model, 2);

    expect(empty).toMatchObject({ visible: false, color: null });
    expect(colored).toMatchObject({ visible: true, color: [240, 50, 70] });
    expect(colored.color).not.toBe(project.palette[0]);
    if (colored.color) colored.color[0] = 1;
    expect(project.palette[0]).toEqual([240, 50, 70]);
  });

  it("accepts a reusable physical layout without changing the model", () => {
    const project = makeProject();
    const layout = buildPhysicalPreviewLayout(project);

    expect(buildFastBeadPreviewModel(project, layout)).toEqual(
      buildFastBeadPreviewModel(project),
    );
  });
});
