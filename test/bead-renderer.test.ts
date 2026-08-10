import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createBeadProject } from "../src/domain/project";
import {
  renderBeadProject,
  type BeadRenderResult,
} from "../src/domain/renderer";
import type {
  BeadCell,
  RgbColor,
} from "../src/domain/types";

const RED: RgbColor = [230, 40, 50];
const BLUE: RgbColor = [20, 120, 210];

function makeProject(
  rows: number,
  columns: number,
  cells: BeadCell[],
) {
  return createBeadProject({
    projectId: `${rows}x${columns}`,
    moduleVersion: "1.0.0",
    now: "2026-07-30T00:00:00.000Z",
    rows,
    columns,
    palette: [RED, BLUE],
    cells,
  });
}

function alphaAt(
  result: BeadRenderResult,
  x: number,
  y: number,
): number {
  return result.data[(y * result.width + x) * 4 + 3];
}

function rgbAt(
  result: BeadRenderResult,
  x: number,
  y: number,
): RgbColor {
  const offset = (y * result.width + x) * 4;
  return [
    result.data[offset],
    result.data[offset + 1],
    result.data[offset + 2],
  ];
}

function opaqueCount(
  result: BeadRenderResult,
  bounds = {
    left: 0,
    top: 0,
    right: result.width,
    bottom: result.height,
  },
): number {
  let count = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      count += alphaAt(result, x, y) === 255 ? 1 : 0;
    }
  }
  return count;
}

describe("bead pressure renderer", () => {
  it("shrinks the centre hole and closes it only at terminal pressure", () => {
    const project = makeProject(1, 1, [
      { kind: "color", paletteIndex: 0 },
    ]);

    const light = renderBeadProject(project, {
      compression: 0,
      pixelsPerCell: 32,
    });
    const standard = renderBeadProject(project, {
      compression: 50,
      pixelsPerCell: 32,
    });
    const almostTight = renderBeadProject(project, {
      compression: 99,
      pixelsPerCell: 32,
    });
    const tight = renderBeadProject(project, {
      compression: 100,
      pixelsPerCell: 32,
    });

    expect(alphaAt(light, 16, 16)).toBe(0);
    expect(alphaAt(standard, 16, 16)).toBe(0);
    expect(alphaAt(almostTight, 16, 16)).toBe(0);
    expect(alphaAt(tight, 16, 16)).toBe(255);
    expect(opaqueCount(light)).toBeLessThan(opaqueCount(standard));
    expect(opaqueCount(standard)).toBeLessThan(opaqueCount(tight));
  });

  it("keeps the four-bead junction open before 100 and closes it at 100", () => {
    const project = makeProject(
      2,
      2,
      Array.from(
        { length: 4 },
        () => ({ kind: "color", paletteIndex: 0 }) as const,
      ),
    );

    const standard = renderBeadProject(project, {
      compression: 50,
      pixelsPerCell: 32,
    });
    const almostTight = renderBeadProject(project, {
      compression: 99,
      pixelsPerCell: 32,
    });
    const tight = renderBeadProject(project, {
      compression: 100,
      pixelsPerCell: 32,
    });

    expect(alphaAt(standard, 32, 32)).toBe(0);
    expect(alphaAt(almostTight, 32, 32)).toBe(0);
    expect(alphaAt(tight, 32, 32)).toBe(255);
  });

  it("fuses diagonal bead bodies at terminal pressure without closing them early", () => {
    const project = makeProject(2, 2, [
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
    ]);
    const almostTight = renderBeadProject(project, {
      compression: 99,
      pixelsPerCell: 64,
    });

    expect(alphaAt(almostTight, 63, 63)).toBe(0);
    expect(alphaAt(almostTight, 64, 64)).toBe(0);
    for (const irregularity of [0, 44, 100]) {
      const tight = renderBeadProject(
        { ...project, irregularity },
        { compression: 100, pixelsPerCell: 64 },
      );
      for (const [x, y] of [
        [63, 63],
        [64, 63],
        [63, 64],
        [64, 64],
      ]) {
        expect(alphaAt(tight, x, y)).toBe(255);
      }
    }
  });

  it("keeps a visible four-bead dent at high but non-terminal pressure", () => {
    const rendered = renderBeadProject(
      makeProject(
        2,
        2,
        Array.from(
          { length: 4 },
          () => ({ kind: "color", paletteIndex: 0 }) as const,
        ),
      ),
      { compression: 90, pixelsPerCell: 64 },
    );

    expect(alphaAt(rendered, 62, 63)).toBe(0);
    expect(alphaAt(rendered, 61, 63)).toBe(255);
  });

  it("closes the contact centre without turning the entire shared edge into a square wall", () => {
    const sameColor = renderBeadProject(
      makeProject(1, 2, [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 0 },
      ]),
      { compression: 100, pixelsPerCell: 32 },
    );
    const differentColors = renderBeadProject(
      makeProject(1, 2, [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
      ]),
      { compression: 100, pixelsPerCell: 32 },
    );

    expect(alphaAt(sameColor, 31, 16)).toBe(255);
    expect(alphaAt(sameColor, 32, 16)).toBe(255);
    expect(alphaAt(sameColor, 31, 0)).toBe(0);
    expect(alphaAt(sameColor, 32, 0)).toBe(0);
    expect(rgbAt(differentColors, 31, 16)).toEqual(RED);
    expect(rgbAt(differentColors, 32, 16)).toEqual(BLUE);
  });

  it("keeps rounded exposed bead corners even at terminal pressure", () => {
    const rendered = renderBeadProject(
      makeProject(2, 2, [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 0 },
      ]),
      { compression: 100, pixelsPerCell: 32 },
    );

    expect(alphaAt(rendered, 0, 0)).toBe(0);
    expect(alphaAt(rendered, 63, 0)).toBe(0);
    expect(alphaAt(rendered, 32, 32)).toBe(255);
  });

  it("renders optional irregular compression deterministically without changing the canvas", () => {
    const regularProject = makeProject(2, 3, [
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 1 },
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 1 },
      { kind: "empty" },
    ]);
    const irregularProject = {
      ...regularProject,
      irregularity: 100,
    };
    const regular = renderBeadProject(regularProject, {
      compression: 55,
      pixelsPerCell: 32,
    });
    const irregular = renderBeadProject(irregularProject, {
      compression: 55,
      pixelsPerCell: 32,
    });
    const repeated = renderBeadProject(irregularProject, {
      compression: 55,
      pixelsPerCell: 32,
    });

    expect(irregular).toMatchObject({
      width: regular.width,
      height: regular.height,
      irregularity: 100,
    });
    expect(irregular.data).not.toEqual(regular.data);
    expect(repeated.data).toEqual(irregular.data);
  });

  it("writes only binary alpha and exact palette bytes", () => {
    const rendered = renderBeadProject(
      makeProject(2, 2, [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
        { kind: "empty" },
        { kind: "empty" },
      ]),
      { compression: 63, pixelsPerCell: 16 },
    );
    const allowed = new Set([RED.join(","), BLUE.join(",")]);

    for (let offset = 0; offset < rendered.data.length; offset += 4) {
      const alpha = rendered.data[offset + 3];
      expect([0, 255]).toContain(alpha);
      if (alpha === 0) {
        expect([...rendered.data.slice(offset, offset + 3)]).toEqual([
          0, 0, 0,
        ]);
      } else {
        expect(
          allowed.has(
            [
              rendered.data[offset],
              rendered.data[offset + 1],
              rendered.data[offset + 2],
            ].join(","),
          ),
        ).toBe(true);
      }
    }
  });

  it("keeps pressure-field pixels deterministic for mixed neighborhoods", () => {
    const cells: BeadCell[] = Array.from(
      { length: 30 },
      (_, index) => {
        if (index % 7 === 0) {
          return { kind: "empty" };
        }
        if (index % 11 === 0) {
          return { kind: "empty" };
        }
        return { kind: "color", paletteIndex: index % 2 };
      },
    );
    const project = makeProject(5, 6, cells);
    const hash = createHash("sha256");
    const previewHash = createHash("sha256");

    for (const compression of [0, 35, 80, 99]) {
      hash.update(
        renderBeadProject(project, {
          compression,
          pixelsPerCell: 16,
        }).data,
      );
      previewHash.update(
        renderBeadProject(project, {
          compression,
          pixelsPerCell: 12,
        }).data,
      );
    }

    const firstHash = hash.digest("hex");
    const firstPreviewHash = previewHash.digest("hex");
    const repeatedHash = createHash("sha256");
    const repeatedPreviewHash = createHash("sha256");
    for (const compression of [0, 35, 80, 99]) {
      repeatedHash.update(
        renderBeadProject(project, {
          compression,
          pixelsPerCell: 16,
        }).data,
      );
      repeatedPreviewHash.update(
        renderBeadProject(project, {
          compression,
          pixelsPerCell: 12,
        }).data,
      );
    }
    expect(repeatedHash.digest("hex")).toBe(firstHash);
    expect(repeatedPreviewHash.digest("hex")).toBe(
      firstPreviewHash,
    );
  });
});
