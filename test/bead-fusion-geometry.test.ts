import { describe, expect, it } from "vitest";

import {
  buildBeadFusionGeometry,
  pointInContour,
} from "../src/domain/fusionGeometry";
import { createBeadProject } from "../src/domain/project";
import type { BeadCell, BeadProject } from "../src/domain/types";

function project(
  rows: number,
  columns: number,
  cells: BeadCell[],
): BeadProject {
  return createBeadProject({
    projectId: `geometry-${rows}x${columns}`,
    moduleVersion: "1.0.7",
    now: "2026-08-01T00:00:00.000Z",
    rows,
    columns,
    palette: [
      [224, 112, 118],
      [63, 82, 124],
    ],
    cells,
  });
}

const color = (paletteIndex = 0): BeadCell => ({
  kind: "color",
  paletteIndex,
});

describe("boundary-aware bead fusion geometry", () => {
  it("keeps a visible outer notch at 100% while closing the contact centre", () => {
    const geometry = buildBeadFusionGeometry(
      project(1, 2, [color(), color(1)]),
      100,
      0,
    );

    expect(
      geometry.contours.some((contour) =>
        pointInContour({ x: 1, y: 0.5 }, contour.points),
      ),
    ).toBe(true);
    expect(
      geometry.contours.some((contour) =>
        pointInContour({ x: 1, y: 0.12 }, contour.points),
      ),
    ).toBe(false);
    expect(geometry.holeRadius).toBe(0);
  });

  it("keeps boundary contact shoulders narrower than fully supported interior shoulders", () => {
    const boundary = buildBeadFusionGeometry(
      project(1, 2, [color(), color()]),
      100,
      0,
    );
    const interior = buildBeadFusionGeometry(
      project(2, 2, [color(), color(), color(), color()]),
      100,
      0,
    );
    const boundaryContact = boundary.contacts.find(
      (contact) => contact.orientation === "horizontal",
    );
    const interiorContact = interior.contacts.find(
      (contact) =>
        contact.orientation === "horizontal" &&
        contact.firstRow === 0,
    );

    expect(boundaryContact).toMatchObject({
      negativeSupported: false,
      positiveSupported: false,
    });
    expect(interiorContact).toMatchObject({
      negativeSupported: false,
      positiveSupported: true,
    });
    expect(interiorContact!.positiveHalf).toBeGreaterThan(
      boundaryContact!.positiveHalf,
    );
  });

  it("applies bounded deterministic whole-bead offsets only when requested", () => {
    const input = project(2, 2, [
      color(),
      color(),
      color(),
      color(),
    ]);
    const regular = buildBeadFusionGeometry(input, 55, 0);
    const defaulted = buildBeadFusionGeometry(input, 55);
    const irregular = buildBeadFusionGeometry(input, 55, 100);
    const repeated = buildBeadFusionGeometry(input, 55, 100);

    expect(defaulted).toEqual(regular);
    expect(repeated).toEqual(irregular);
    expect(irregular.contours).not.toEqual(regular.contours);
    for (const contour of irregular.contours) {
      const nominalX = contour.column + 0.5;
      const nominalY = contour.row + 0.5;
      expect(Math.abs(contour.center.x - nominalX)).toBeLessThanOrEqual(
        0.035,
      );
      expect(Math.abs(contour.center.y - nominalY)).toBeLessThanOrEqual(
        0.035,
      );
    }
    expect(irregular.contours[0]?.center.y).not.toBe(
      irregular.contours[1]?.center.y,
    );
  });

  it("describes four-bead reliefs for the vector preview until terminal fusion", () => {
    const input = project(2, 2, [
      color(),
      color(),
      color(),
      color(),
    ]);
    const standard = buildBeadFusionGeometry(input, 55, 0);
    const terminal = buildBeadFusionGeometry(input, 100, 0);

    expect(standard.junctions).toEqual([{ x: 1, y: 1 }]);
    expect(standard.junctionRadius).toBeGreaterThan(0);
    expect(terminal.junctions).toEqual([{ x: 1, y: 1 }]);
    expect(terminal.junctionRadius).toBe(0);
  });
});
