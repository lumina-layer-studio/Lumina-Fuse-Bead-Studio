import type { Raster } from "./types";
import { validateBeadProject } from "./project";
import type {
  BeadCell,
  BeadProject,
  RgbColor,
} from "./types";

const MAX_PIXELS_PER_CELL = 64;
const SCORE_EPSILON = 1e-12;
const OCCUPANCY_CACHE_RADIUS = 2;
const OWNER_TILE_SIZE = 3;
const OWNER_NONE = -1;
const OWNER_ROW_OFFSETS = Int8Array.from([
  -1, -1, -1,
  0, 0, 0,
  1, 1, 1,
]);
const OWNER_COLUMN_OFFSETS = Int8Array.from([
  -1, 0, 1,
  -1, 0, 1,
  -1, 0, 1,
]);

export interface BeadRenderOptions {
  compression: number;
  pixelsPerCell: number;
}

export interface BeadRenderResult extends Raster {
  palette: RgbColor[];
  compression: number;
  pixelsPerCell: number;
}

interface RenderGeometry {
  pressure: number;
  outerRadius: number;
  holeRadius: number;
  junctionRelief: number;
  superellipseExponent: number;
}

function validateOptions(options: BeadRenderOptions): void {
  if (
    !Number.isInteger(options.compression) ||
    options.compression < 0 ||
    options.compression > 100
  ) {
    throw new Error("Compression must be an integer from 0 to 100.");
  }
  if (
    !Number.isInteger(options.pixelsPerCell) ||
    options.pixelsPerCell < 1 ||
    options.pixelsPerCell > MAX_PIXELS_PER_CELL
  ) {
    throw new Error(
      `Pixels per cell must be an integer from 1 to ${MAX_PIXELS_PER_CELL}.`,
    );
  }
}

function buildGeometry(
  compression: number,
  pixelsPerCell: number,
): RenderGeometry {
  const pressure = compression / 100;
  const minimumVisibleRadius =
    Math.SQRT1_2 / pixelsPerCell + Number.EPSILON;
  return {
    pressure,
    outerRadius: 0.43 + 0.13 * pressure,
    holeRadius:
      compression === 100
        ? 0
        : Math.max(
            0.19 * Math.pow(1 - pressure, 0.72),
            minimumVisibleRadius,
          ),
    junctionRelief:
      compression === 100
        ? 0
        : Math.max(
            0.075 * Math.pow(1 - pressure, 1.35),
            minimumVisibleRadius,
          ),
    superellipseExponent: 2 + 6 * pressure,
  };
}

function isOccupied(cell: BeadCell): boolean {
  return cell.kind !== "empty";
}

function occupiedAt(
  occupancy: Uint8Array,
  rows: number,
  columns: number,
  row: number,
  column: number,
): boolean {
  return (
    row >= 0 &&
    column >= 0 &&
    row < rows &&
    column < columns &&
    occupancy[row * columns + column] === 1
  );
}

function contactBias(
  occupancy: Uint8Array,
  project: BeadProject,
  row: number,
  column: number,
  deltaX: number,
  deltaY: number,
  pressure: number,
): number {
  const radialDistance = Math.hypot(deltaX, deltaY);
  if (radialDistance === 0) {
    return 0;
  }
  const unitX = deltaX / radialDistance;
  const unitY = deltaY / radialDistance;
  const absoluteX = Math.abs(unitX);
  const absoluteY = Math.abs(unitY);
  const cardinalStrength = 0.03 + 0.05 * pressure;
  const diagonalStrength = 0.012 + 0.03 * pressure;
  let bias = 0;

  if (
    unitX > 0 &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      row,
      column + 1,
    )
  ) {
    bias += cardinalStrength * Math.pow(absoluteX, 4);
  } else if (
    unitX < 0 &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      row,
      column - 1,
    )
  ) {
    bias += cardinalStrength * Math.pow(absoluteX, 4);
  }

  if (
    unitY > 0 &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      row + 1,
      column,
    )
  ) {
    bias += cardinalStrength * Math.pow(absoluteY, 4);
  } else if (
    unitY < 0 &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      row - 1,
      column,
    )
  ) {
    bias += cardinalStrength * Math.pow(absoluteY, 4);
  }

  const diagonalRow = row + Math.sign(deltaY);
  const diagonalColumn = column + Math.sign(deltaX);
  if (
    deltaX !== 0 &&
    deltaY !== 0 &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      diagonalRow,
      diagonalColumn,
    )
  ) {
    const diagonalAlignment =
      Math.min(absoluteX, absoluteY) * Math.SQRT2;
    bias +=
      diagonalStrength *
      Math.pow(Math.min(1, diagonalAlignment), 3);
  }
  return bias;
}

function superellipseDistance(
  deltaX: number,
  deltaY: number,
  exponent: number,
): number {
  return Math.pow(
    Math.pow(Math.abs(deltaX), exponent) +
      Math.pow(Math.abs(deltaY), exponent),
    1 / exponent,
  );
}

function isJunctionRelief(
  occupancy: Uint8Array,
  project: BeadProject,
  gridX: number,
  gridY: number,
  radius: number,
): boolean {
  const junctionColumn = Math.round(gridX);
  const junctionRow = Math.round(gridY);
  if (
    junctionColumn <= 0 ||
    junctionRow <= 0 ||
    junctionColumn >= project.columns ||
    junctionRow >= project.rows ||
    Math.hypot(
      gridX - junctionColumn,
      gridY - junctionRow,
    ) > radius
  ) {
    return false;
  }
  return (
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      junctionRow - 1,
      junctionColumn - 1,
    ) &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      junctionRow - 1,
      junctionColumn,
    ) &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      junctionRow,
      junctionColumn - 1,
    ) &&
    occupiedAt(
      occupancy,
      project.rows,
      project.columns,
      junctionRow,
      junctionColumn,
    )
  );
}

function writeColor(
  data: Uint8ClampedArray,
  pixelOffset: number,
  color: RgbColor,
): void {
  data[pixelOffset] = color[0];
  data[pixelOffset + 1] = color[1];
  data[pixelOffset + 2] = color[2];
  data[pixelOffset + 3] = 255;
}

function renderTerminalPressure(
  project: BeadProject,
  pixelsPerCell: number,
  data: Uint8ClampedArray,
  width: number,
): void {
  for (let row = 0; row < project.rows; row += 1) {
    for (let column = 0; column < project.columns; column += 1) {
      const cell = project.cells[row * project.columns + column];
      if (cell.kind !== "color") {
        continue;
      }
      const color = project.palette[cell.paletteIndex];
      const startX = column * pixelsPerCell;
      const startY = row * pixelsPerCell;
      for (let localY = 0; localY < pixelsPerCell; localY += 1) {
        let offset =
          ((startY + localY) * width + startX) * 4;
        for (let localX = 0; localX < pixelsPerCell; localX += 1) {
          writeColor(data, offset, color);
          offset += 4;
        }
      }
    }
  }
}

function candidateScore(
  occupancy: Uint8Array,
  project: BeadProject,
  row: number,
  column: number,
  deltaX: number,
  deltaY: number,
  geometry: RenderGeometry,
): number | null {
  if (Math.hypot(deltaX, deltaY) < geometry.holeRadius) {
    return null;
  }
  const score =
    superellipseDistance(
      deltaX,
      deltaY,
      geometry.superellipseExponent,
    ) -
    contactBias(
      occupancy,
      project,
      row,
      column,
      deltaX,
      deltaY,
      geometry.pressure,
    );
  return score <= geometry.outerRadius ? score : null;
}

function occupancyNeighborhoodKey(
  occupancy: Uint8Array,
  project: BeadProject,
  logicalRow: number,
  logicalColumn: number,
): number {
  let key = 0;
  let bit = 0;
  for (
    let rowOffset = -OCCUPANCY_CACHE_RADIUS;
    rowOffset <= OCCUPANCY_CACHE_RADIUS;
    rowOffset += 1
  ) {
    for (
      let columnOffset = -OCCUPANCY_CACHE_RADIUS;
      columnOffset <= OCCUPANCY_CACHE_RADIUS;
      columnOffset += 1
    ) {
      if (
        occupiedAt(
          occupancy,
          project.rows,
          project.columns,
          logicalRow + rowOffset,
          logicalColumn + columnOffset,
        )
      ) {
        key |= 1 << bit;
      }
      bit += 1;
    }
  }
  return key;
}

function buildOwnerTile(
  occupancy: Uint8Array,
  project: BeadProject,
  logicalRow: number,
  logicalColumn: number,
  pixelsPerCell: number,
  geometry: RenderGeometry,
): Int8Array {
  const owners = new Int8Array(
    pixelsPerCell * pixelsPerCell,
  );
  owners.fill(OWNER_NONE);
  const minimumRow = Math.max(0, logicalRow - 1);
  const maximumRow = Math.min(
    project.rows - 1,
    logicalRow + 1,
  );
  const minimumColumn = Math.max(0, logicalColumn - 1);
  const maximumColumn = Math.min(
    project.columns - 1,
    logicalColumn + 1,
  );

  for (let localY = 0; localY < pixelsPerCell; localY += 1) {
    const y = logicalRow * pixelsPerCell + localY;
    const gridY = (y + 0.5) / pixelsPerCell;
    for (let localX = 0; localX < pixelsPerCell; localX += 1) {
      const x = logicalColumn * pixelsPerCell + localX;
      const gridX = (x + 0.5) / pixelsPerCell;
      if (
        isJunctionRelief(
          occupancy,
          project,
          gridX,
          gridY,
          geometry.junctionRelief,
        )
      ) {
        continue;
      }

      let ownerIndex = -1;
      let ownerScore = Number.POSITIVE_INFINITY;
      let ownerRow = -1;
      let ownerColumn = -1;

      for (let row = minimumRow; row <= maximumRow; row += 1) {
        const deltaY = gridY - (row + 0.5);
        if (Math.abs(deltaY) > 0.75) {
          continue;
        }
        for (
          let column = minimumColumn;
          column <= maximumColumn;
          column += 1
        ) {
          const index = row * project.columns + column;
          if (occupancy[index] === 0) {
            continue;
          }
          const deltaX = gridX - (column + 0.5);
          if (Math.abs(deltaX) > 0.75) {
            continue;
          }
          const score = candidateScore(
            occupancy,
            project,
            row,
            column,
            deltaX,
            deltaY,
            geometry,
          );
          if (
            score !== null &&
            (score < ownerScore - SCORE_EPSILON ||
              (Math.abs(score - ownerScore) <= SCORE_EPSILON &&
                (ownerIndex < 0 || index < ownerIndex)))
          ) {
            ownerIndex = index;
            ownerScore = score;
            ownerRow = row;
            ownerColumn = column;
          }
        }
      }

      if (ownerIndex >= 0) {
        owners[localY * pixelsPerCell + localX] =
          (ownerRow - logicalRow + 1) * OWNER_TILE_SIZE +
          (ownerColumn - logicalColumn + 1);
      }
    }
  }
  return owners;
}

function renderPressureField(
  project: BeadProject,
  pixelsPerCell: number,
  data: Uint8ClampedArray,
  width: number,
  geometry: RenderGeometry,
): void {
  const occupancy = Uint8Array.from(
    project.cells,
    (cell) => (isOccupied(cell) ? 1 : 0),
  );
  const ownerTileCache = new Map<number, Int8Array>();

  for (let logicalRow = 0; logicalRow < project.rows; logicalRow += 1) {
    for (
      let logicalColumn = 0;
      logicalColumn < project.columns;
      logicalColumn += 1
    ) {
      const logicalCell =
        project.cells[
          logicalRow * project.columns + logicalColumn
        ];
      if (logicalCell.kind === "transparent-support") {
        continue;
      }
      const cacheKey = occupancyNeighborhoodKey(
        occupancy,
        project,
        logicalRow,
        logicalColumn,
      );
      let ownerTile = ownerTileCache.get(cacheKey);
      if (ownerTile === undefined) {
        ownerTile = buildOwnerTile(
          occupancy,
          project,
          logicalRow,
          logicalColumn,
          pixelsPerCell,
          geometry,
        );
        ownerTileCache.set(cacheKey, ownerTile);
      }

      const startX = logicalColumn * pixelsPerCell;
      const startY = logicalRow * pixelsPerCell;
      for (let localY = 0; localY < pixelsPerCell; localY += 1) {
        for (let localX = 0; localX < pixelsPerCell; localX += 1) {
          const ownerCode =
            ownerTile[localY * pixelsPerCell + localX];
          if (ownerCode === OWNER_NONE) {
            continue;
          }
          const ownerRow =
            logicalRow + OWNER_ROW_OFFSETS[ownerCode];
          const ownerColumn =
            logicalColumn + OWNER_COLUMN_OFFSETS[ownerCode];
          const owner =
            project.cells[
              ownerRow * project.columns + ownerColumn
            ];
          if (owner.kind === "color") {
            writeColor(
              data,
              (
                (startY + localY) * width +
                startX +
                localX
              ) * 4,
              project.palette[owner.paletteIndex],
            );
          }
        }
      }
    }
  }
}

export function renderBeadProject(
  input: BeadProject,
  options: BeadRenderOptions,
): BeadRenderResult {
  const project = validateBeadProject(input);
  validateOptions(options);
  const width = project.columns * options.pixelsPerCell;
  const height = project.rows * options.pixelsPerCell;
  const data = new Uint8ClampedArray(width * height * 4);

  if (options.compression === 100) {
    renderTerminalPressure(
      project,
      options.pixelsPerCell,
      data,
      width,
    );
  } else {
    renderPressureField(
      project,
      options.pixelsPerCell,
      data,
      width,
      buildGeometry(
        options.compression,
        options.pixelsPerCell,
      ),
    );
  }

  return {
    width,
    height,
    data,
    palette: project.palette.map(
      (color) => [...color] as RgbColor,
    ),
    compression: options.compression,
    pixelsPerCell: options.pixelsPerCell,
  };
}
