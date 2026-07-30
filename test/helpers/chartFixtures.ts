import type {
  BeadGridGeometry,
  Raster,
  RgbColor,
} from "../../src/domain/types";
import {
  makeHardPixelFixture,
  makeNumberedGridFixture,
  makeRaster,
  makeRingFixture,
  setPixel,
} from "./beadFixtures";

const OPAQUE = 255;

function copyRaster(
  source: Raster,
  target: Raster,
  offsetX: number,
  offsetY: number,
): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      setPixel(target, x + offsetX, y + offsetY, [
        source.data[sourceOffset],
        source.data[sourceOffset + 1],
        source.data[sourceOffset + 2],
        source.data[sourceOffset + 3],
      ]);
    }
  }
}

export function makeLabeledNumberedChart(
  rows: number,
  columns: number,
): {
  raster: Raster;
  geometry: BeadGridGeometry;
  watermarkCell: number;
  whiteBeadCell: number;
} {
  const watermarkCell = columns + 3;
  const whiteBeadCell = columns + 1;
  const grid = makeNumberedGridFixture({
    rows,
    columns,
    gridLineWidth: rows >= 50 ? 3 : 2,
    watermarkCells: [watermarkCell],
    whiteBeadCells: [whiteBeadCell],
  });
  const margin = 12;
  const raster = makeRaster(
    grid.width + margin * 2,
    grid.height + margin * 2,
    [250, 250, 250, OPAQUE],
  );
  copyRaster(grid, raster, margin, margin);

  // Deterministic coordinate ticks and a diagonal page watermark outside cells.
  for (let column = 0; column < columns; column += 1) {
    const x = margin + column * 18 + 6;
    for (let y = 2; y < 8; y += 1) {
      setPixel(raster, x + (y % 2), y, [55, 55, 55, OPAQUE]);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    const y = margin + row * 18 + 6;
    for (let x = 2; x < 8; x += 1) {
      setPixel(raster, x, y + (x % 2), [55, 55, 55, OPAQUE]);
    }
  }

  return {
    raster,
    geometry: {
      originX: margin,
      originY: margin,
      cellWidth: 18,
      cellHeight: 18,
    },
    watermarkCell,
    whiteBeadCell,
  };
}

export function makeGeneratedHardPixelChart(
  rows: number,
  columns: number,
  scale: 1 | 4 | 8 | 16,
): Raster {
  const palette: RgbColor[] = [
    [248, 248, 248],
    [231, 61, 78],
    [51, 126, 224],
    [246, 185, 40],
    [49, 173, 116],
  ];
  const cellColors = Array.from(
    { length: rows * columns },
    (_, index) => palette[index === 0 ? 0 : 1 + (index % 4)],
  );
  return makeHardPixelFixture({
    rows,
    columns,
    scale,
    cellColors,
  });
}

export function makeTransparentHardPixelChart(): Raster {
  const raster = makeGeneratedHardPixelChart(2, 3, 8);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 16; x < 24; x += 1) {
      setPixel(raster, x, y, [0, 0, 0, 0]);
    }
  }
  return raster;
}

export function makeNearTieHardPixelChart(): Raster {
  const raster = makeGeneratedHardPixelChart(2, 2, 16);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 16; x < 32; x += 1) {
      setPixel(
        raster,
        x,
        y,
        x % 2 === 0
          ? [220, 45, 55, OPAQUE]
          : [212, 49, 59, OPAQUE],
      );
    }
  }
  return raster;
}

export function makeTwoPatternCanvas(): {
  raster: Raster;
  firstCrop: { x: number; y: number; width: number; height: number };
  secondCrop: { x: number; y: number; width: number; height: number };
} {
  const first = makeGeneratedHardPixelChart(3, 4, 8);
  const second = makeGeneratedHardPixelChart(4, 3, 8);
  const gap = 20;
  const raster = makeRaster(
    first.width + second.width + gap,
    Math.max(first.height, second.height),
  );
  copyRaster(first, raster, 0, 0);
  copyRaster(second, raster, first.width + gap, 0);
  return {
    raster,
    firstCrop: { x: 0, y: 0, width: first.width, height: first.height },
    secondCrop: {
      x: first.width + gap,
      y: 0,
      width: second.width,
      height: second.height,
    },
  };
}

export function makeWhiteOnWhiteChart(rows: number, columns: number): Raster {
  return makeRaster(columns * 8, rows * 8, [255, 255, 255, OPAQUE]);
}

export function makeNonSquareChart(rows: number, columns: number): Raster {
  return makeHardPixelFixture({
    rows,
    columns,
    cellWidth: 12,
    cellHeight: 8,
  });
}

export function makeGeneratedRingChart(rows: number, columns: number): Raster {
  return makeRingFixture({ rows, columns, supportCellIndex: 2 });
}
