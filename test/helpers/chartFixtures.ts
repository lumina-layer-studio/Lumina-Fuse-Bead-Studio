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

export function makeGuidedNumberedChart(
  rows = 24,
  columns = 16,
  trailingGuideRows = 0,
): {
  raster: Raster;
  expectedGeometry: BeadGridGeometry;
  decorationCell: number;
  paleBeadCell: number;
} {
  const stride = 18;
  const guideColumns = 8;
  const rowLabelColumn = guideColumns;
  const dataColumnOffset = rowLabelColumn + 1;
  const sheetColumns = dataColumnOffset + columns;
  const sheetRows = rows + 1 + trailingGuideRows;
  const page = [247, 204, 161, OPAQUE] as const;
  const grid = [35, 35, 35, OPAQUE] as const;
  const raster = makeRaster(
    sheetColumns * stride,
    sheetRows * stride,
    page,
  );

  // The photographed sheet loses the two outer vertical borders and the
  // bottom border, while every interior line remains visible.
  for (let row = 0; row < sheetRows; row += 1) {
    const y = row * stride;
    for (let x = 0; x < raster.width; x += 1) {
      setPixel(raster, x, y, grid);
      setPixel(raster, x, y + 1, grid);
    }
  }
  for (let column = 1; column < sheetColumns; column += 1) {
    const x = column * stride;
    for (let y = 0; y < raster.height; y += 1) {
      setPixel(raster, x, y, grid);
      setPixel(raster, x + 1, y, grid);
    }
  }

  const drawLabel = (row: number, column: number): void => {
    const centreX = column * stride + Math.floor(stride / 2);
    const centreY = row * stride + Math.floor(stride / 2);
    for (let delta = -3; delta <= 3; delta += 1) {
      setPixel(raster, centreX + delta, centreY, grid);
      setPixel(raster, centreX, centreY + delta, grid);
    }
  };
  for (let row = 0; row < rows; row += 1) {
    drawLabel(row, rowLabelColumn);
  }
  for (let column = 0; column < columns; column += 1) {
    drawLabel(rows, dataColumnOffset + column);
  }

  const paleBeadCell = columns * 10 + 7;
  const decorationCell = columns - 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellIndex = row * columns + column;
      if (cellIndex === 0 || (row < 2 && column < 5)) {
        continue;
      }
      if (cellIndex === decorationCell) {
        const left = (dataColumnOffset + column) * stride + 2;
        const top = row * stride + 2;
        const right = (dataColumnOffset + column + 1) * stride;
        const bottom = (row + 1) * stride;
        for (let y = top; y < bottom; y += 1) {
          const normalizedY = (y - top) / Math.max(1, bottom - top - 1);
          const wedgeWidth = Math.round(
            5 + Math.abs(normalizedY - 0.5) * 8,
          );
          for (let x = right - wedgeWidth; x < right; x += 1) {
            setPixel(raster, x, y, [200, 135, 95, OPAQUE]);
          }
        }
        continue;
      }
      const fill =
        cellIndex === paleBeadCell
          ? ([248, 202, 160, OPAQUE] as const)
          : (row * 7 + column * 3) % 13 === 0
            ? ([55, 55, 55, OPAQUE] as const)
            : ([95, 155, 105, OPAQUE] as const);
      const left = (dataColumnOffset + column) * stride + 2;
      const top = row * stride + 2;
      const right = (dataColumnOffset + column + 1) * stride;
      const bottom = (row + 1) * stride;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          setPixel(raster, x, y, fill);
        }
      }
      drawLabel(row, dataColumnOffset + column);
    }
  }

  return {
    raster,
    expectedGeometry: {
      originX: dataColumnOffset * stride,
      originY: 0,
      cellWidth: stride,
      cellHeight: stride,
    },
    decorationCell,
    paleBeadCell,
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

export function makeImplicitMardChart(
  rows = 11,
  columns = 9,
  sparseArtwork = false,
): {
  raster: Raster;
  expectedGeometry: BeadGridGeometry;
} {
  const stride = 20;
  const axisCells = 1;
  const legendGap = 34;
  const legendHeight = 38;
  const width = (columns + axisCells * 2) * stride;
  const gridHeight = (rows + axisCells * 2) * stride;
  const raster = makeRaster(
    width,
    gridHeight + legendGap + legendHeight,
    [255, 255, 255, OPAQUE],
  );

  const paintRect = (
    left: number,
    top: number,
    rectWidth: number,
    rectHeight: number,
    color: readonly [number, number, number, number],
  ): void => {
    for (let y = top; y < top + rectHeight; y += 1) {
      for (let x = left; x < left + rectWidth; x += 1) {
        setPixel(raster, x, y, color);
      }
    }
  };
  const drawCode = (cellRow: number, cellColumn: number): void => {
    const left = cellColumn * stride + 6;
    const top = cellRow * stride + 7;
    paintRect(left, top, 2, 7, [30, 30, 30, OPAQUE]);
    paintRect(left + 5, top, 2, 7, [30, 30, 30, OPAQUE]);
  };

  for (let column = 1; column <= columns; column += 1) {
    drawCode(0, column);
    drawCode(rows + 1, column);
  }
  for (let row = 1; row <= rows; row += 1) {
    drawCode(row, 0);
    drawCode(row, columns + 1);
    for (let column = 1; column <= columns; column += 1) {
      const onArtworkBounds =
        row === 1 ||
        row === rows ||
        column === 1 ||
        column === columns;
      const insideSparseArtwork =
        row >= Math.ceil(rows * 0.18) &&
        row <= Math.floor(rows * 0.86) &&
        column >= Math.ceil(columns * 0.16) &&
        column <= Math.floor(columns * 0.82);
      if (
        !sparseArtwork &&
        (onArtworkBounds || (row + column) % 5 === 0)
      ) {
        paintRect(
          column * stride,
          row * stride,
          stride,
          stride,
          (row + column) % 2 === 0
            ? [221, 83, 94, OPAQUE]
            : [80, 163, 130, OPAQUE],
        );
      }
      if (!sparseArtwork || insideSparseArtwork) {
        if (sparseArtwork && (row + column) % 3 === 0) {
          paintRect(
            column * stride,
            row * stride,
            stride,
            stride,
            [80, 163, 130, OPAQUE],
          );
        }
        drawCode(row, column);
      }
    }
  }

  paintRect(18, gridHeight + legendGap, 54, 26, [221, 83, 94, OPAQUE]);
  paintRect(91, gridHeight + legendGap, 54, 26, [80, 163, 130, OPAQUE]);

  return {
    raster,
    expectedGeometry: {
      originX: stride,
      originY: stride,
      cellWidth: stride,
      cellHeight: stride,
    },
  };
}

export function resizeRasterNearest(
  source: Raster,
  scale: number,
): Raster {
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const raster = makeRaster(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(
        source.width - 1,
        Math.floor(x / scale),
      );
      const sourceY = Math.min(
        source.height - 1,
        Math.floor(y / scale),
      );
      const offset = (sourceY * source.width + sourceX) * 4;
      setPixel(raster, x, y, [
        source.data[offset],
        source.data[offset + 1],
        source.data[offset + 2],
        source.data[offset + 3],
      ]);
    }
  }
  return raster;
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
