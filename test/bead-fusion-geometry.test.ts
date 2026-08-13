import { describe, expect, it } from "vitest";

import {
  buildBeadFusionGeometry,
  pointInContour,
  resolveBeadFusionCellDeformation,
  resolveBeadFusionSharedProfile,
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
  it("rejects non-finite public profile inputs before applying bounds", () => {
    const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

    for (const value of invalidValues) {
      expect(() => resolveBeadFusionSharedProfile(value, 50)).toThrowError(
        new TypeError("Bead fusion compression and irregularity must be finite percentages."),
      );
      expect(() => resolveBeadFusionSharedProfile(50, value)).toThrowError(
        new TypeError("Bead fusion compression and irregularity must be finite percentages."),
      );
      expect(() =>
        resolveBeadFusionCellDeformation(0, 0, value, 50),
      ).toThrowError(
        new TypeError("Bead fusion compression and irregularity must be finite percentages."),
      );
      expect(() =>
        resolveBeadFusionCellDeformation(0, 0, 50, value),
      ).toThrowError(
        new TypeError("Bead fusion compression and irregularity must be finite percentages."),
      );
    }
  });

  it("packs zero-fusion cylinders into narrow contact without filling the four-bead gap", () => {
    const geometry = buildBeadFusionGeometry(
      project(1, 2, [color(), color()]),
      0,
      0,
    );
    const left = geometry.contours[0];

    expect(geometry.outerRadius).toBeGreaterThan(0.5);
    expect(geometry.outerRadius).toBeLessThanOrEqual(0.51);
    expect(
      pointInContour({ x: 1, y: 0.55 }, left.points),
    ).toBe(true);
    expect(
      pointInContour({ x: 1, y: 0.58 }, left.points),
    ).toBe(false);

    const fourBeads = buildBeadFusionGeometry(
      project(2, 2, [color(), color(), color(), color()]),
      0,
      0,
    );
    expect(
      fourBeads.contours.some((contour) =>
        pointInContour({ x: 1, y: 1 }, contour.points),
      ),
    ).toBe(false);
    expect(fourBeads.holeRadius).toBeGreaterThan(0);
  });

  it("forms a broad constrained interior seam at standard ironing pressure", () => {
    const geometry = buildBeadFusionGeometry(
      project(
        3,
        3,
        Array.from({ length: 9 }, () => color()),
      ),
      50,
      0,
    );
    const supportedContact = geometry.contacts.find(
      (contact) =>
        contact.orientation === "horizontal" &&
        contact.firstRow === 1 &&
        contact.firstColumn === 0,
    );

    expect(supportedContact).toMatchObject({
      negativeSupported: true,
      positiveSupported: true,
    });
    expect(supportedContact!.negativeHalf).toBeGreaterThanOrEqual(0.27);
    expect(
      geometry.contours.some((contour) =>
        pointInContour({ x: 1, y: 1.22 }, contour.points),
      ),
    ).toBe(true);
  });

  it("keeps visible bead relief late into ironing without overgrowing the rim", () => {
    const input = project(2, 2, [
      color(),
      color(),
      color(),
      color(),
    ]);
    const raw = buildBeadFusionGeometry(input, 0, 0);
    const standard = buildBeadFusionGeometry(input, 50, 0);
    const nearTight = buildBeadFusionGeometry(input, 90, 0);
    const terminal = buildBeadFusionGeometry(input, 100, 0);

    expect(standard.holeRadius).toBeLessThanOrEqual(
      raw.holeRadius * 0.75,
    );
    expect(standard.holeRadius).toBeGreaterThan(0);
    expect(nearTight.junctionRadius).toBeGreaterThanOrEqual(0.025);
    expect(terminal.outerRadius).toBeLessThanOrEqual(0.505);
    expect(terminal.junctionRadius).toBe(0);
  });

  it("keeps only a shallow outer valley at 100% while closing the contact centre", () => {
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
    ).toBe(true);
    expect(
      geometry.contours.some((contour) =>
        pointInContour({ x: 1, y: 0.02 }, contour.points),
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
    expect(boundaryContact!.negativeHalf).toBeGreaterThan(0.4);
    expect(boundaryContact!.negativeHalf).toBeLessThan(0.43);
    expect(interiorContact!.positiveHalf).toBeGreaterThan(0.46);
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

  it("keeps raw cylinders on their peg centres and lets irregularity emerge during fusion", () => {
    const input = project(1, 2, [color(), color()]);
    const raw = buildBeadFusionGeometry(input, 0, 100);
    const fused = buildBeadFusionGeometry(input, 100, 100);

    expect(raw.contours.map(({ center }) => center)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 1.5, y: 0.5 },
    ]);
    expect(fused.contours.map(({ center }) => center)).not.toEqual(
      raw.contours.map(({ center }) => center),
    );
  });

  it("varies exposed contact valleys without turning the interior into random noise", () => {
    const input = project(1, 4, [
      color(),
      color(),
      color(),
      color(),
    ]);
    const regular = buildBeadFusionGeometry(input, 100, 0);
    const irregular = buildBeadFusionGeometry(input, 100, 100);
    const repeated = buildBeadFusionGeometry(input, 100, 100);
    const regularOuterHalves = regular.contacts.map(
      ({ negativeHalf }) => negativeHalf,
    );
    const irregularOuterHalves = irregular.contacts.map(
      ({ negativeHalf }) => negativeHalf,
    );

    expect(new Set(regularOuterHalves).size).toBe(1);
    expect(new Set(irregularOuterHalves).size).toBeGreaterThan(1);
    expect(Math.min(...irregularOuterHalves)).toBeGreaterThan(0.38);
    expect(Math.max(...irregularOuterHalves)).toBeLessThan(0.45);
    expect(repeated.contacts).toEqual(irregular.contacts);
    expect(
      irregular.contours.some(({ ownershipBias }) => ownershipBias !== 0),
    ).toBe(true);
  });

  it("moves a four-bead relief with the fused bead centres", () => {
    const input = project(2, 2, [
      color(),
      color(),
      color(),
      color(),
    ]);
    const regular = buildBeadFusionGeometry(input, 90, 0);
    const irregular = buildBeadFusionGeometry(input, 90, 100);

    expect(regular.junctions).toEqual([{ x: 1, y: 1 }]);
    expect(irregular.junctions).not.toEqual(regular.junctions);
    expect(Math.abs(irregular.junctions[0].x - 1)).toBeLessThan(0.04);
    expect(Math.abs(irregular.junctions[0].y - 1)).toBeLessThan(0.04);
  });

  it("keeps irregular outer flow inside the declared physical canvas", () => {
    const input = project(2, 2, [
      color(),
      color(),
      color(),
      color(),
    ]);
    const geometry = buildBeadFusionGeometry(input, 100, 100);

    for (const contour of geometry.contours) {
      for (const point of contour.points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(input.columns);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(input.rows);
      }
    }
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
