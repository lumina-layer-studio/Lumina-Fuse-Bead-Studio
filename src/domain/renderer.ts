import {
  buildBeadFusionGeometry,
  type BeadFusionContour,
  type BeadFusionGeometry,
} from "./fusionGeometry";
import { validateBeadProject } from "./project";
import type {
  BeadProject,
  Raster,
  RgbColor,
} from "./types";

const MAX_PIXELS_PER_CELL = 64;
const OWNER_NONE = -1;
const SCORE_EPSILON = 1e-12;

export interface BeadRenderOptions {
  compression: number;
  pixelsPerCell: number;
}

export interface BeadRenderResult extends Raster {
  palette: RgbColor[];
  compression: number;
  irregularity: number;
  pixelsPerCell: number;
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

function contourBounds(contour: BeadFusionContour): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of contour.points) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  return { left, right, top, bottom };
}

function scanlineIntersections(
  contour: BeadFusionContour,
  gridY: number,
): number[] {
  const intersections: number[] = [];
  const { points } = contour;
  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index, index += 1
  ) {
    const first = points[previous];
    const second = points[index];
    if ((first.y > gridY) === (second.y > gridY)) continue;
    intersections.push(
      first.x +
        ((gridY - first.y) * (second.x - first.x)) /
          (second.y - first.y),
    );
  }
  intersections.sort((left, right) => left - right);
  return intersections;
}

function claimPixel(
  ownerIndices: Int32Array,
  ownerScores: Float64Array,
  width: number,
  x: number,
  y: number,
  gridX: number,
  gridY: number,
  contour: BeadFusionContour,
): void {
  const offset = y * width + x;
  const score =
    (gridX - contour.center.x) ** 2 +
    (gridY - contour.center.y) ** 2;
  if (
    score < ownerScores[offset] - SCORE_EPSILON ||
    (Math.abs(score - ownerScores[offset]) <= SCORE_EPSILON &&
      (ownerIndices[offset] === OWNER_NONE ||
        contour.cellIndex < ownerIndices[offset]))
  ) {
    ownerIndices[offset] = contour.cellIndex;
    ownerScores[offset] = score;
  }
}

function rasterizeContour(
  contour: BeadFusionContour,
  pixelsPerCell: number,
  width: number,
  height: number,
  ownerIndices: Int32Array,
  ownerScores: Float64Array,
): void {
  const bounds = contourBounds(contour);
  const firstY = Math.max(
    0,
    Math.ceil(bounds.top * pixelsPerCell - 0.5),
  );
  const lastY = Math.min(
    height - 1,
    Math.floor(bounds.bottom * pixelsPerCell - 0.5),
  );
  for (let y = firstY; y <= lastY; y += 1) {
    const gridY = (y + 0.5) / pixelsPerCell;
    const intersections = scanlineIntersections(contour, gridY);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const firstX = Math.max(
        0,
        Math.ceil(intersections[index] * pixelsPerCell - 0.5),
      );
      const lastX = Math.min(
        width - 1,
        Math.floor(intersections[index + 1] * pixelsPerCell - 0.5),
      );
      for (let x = firstX; x <= lastX; x += 1) {
        claimPixel(
          ownerIndices,
          ownerScores,
          width,
          x,
          y,
          (x + 0.5) / pixelsPerCell,
          gridY,
          contour,
        );
      }
    }
  }
}

function clearCircle(
  ownerIndices: Int32Array,
  width: number,
  height: number,
  pixelsPerCell: number,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  if (radius <= 0) return;
  const firstX = Math.max(
    0,
    Math.ceil((centerX - radius) * pixelsPerCell - 0.5),
  );
  const lastX = Math.min(
    width - 1,
    Math.floor((centerX + radius) * pixelsPerCell - 0.5),
  );
  const firstY = Math.max(
    0,
    Math.ceil((centerY - radius) * pixelsPerCell - 0.5),
  );
  const lastY = Math.min(
    height - 1,
    Math.floor((centerY + radius) * pixelsPerCell - 0.5),
  );
  const radiusSquared = radius * radius;
  for (let y = firstY; y <= lastY; y += 1) {
    const gridY = (y + 0.5) / pixelsPerCell;
    for (let x = firstX; x <= lastX; x += 1) {
      const gridX = (x + 0.5) / pixelsPerCell;
      if (
        (gridX - centerX) ** 2 + (gridY - centerY) ** 2 <
        radiusSquared
      ) {
        ownerIndices[y * width + x] = OWNER_NONE;
      }
    }
  }
}

function isOccupied(project: BeadProject, row: number, column: number): boolean {
  return (
    row >= 0 &&
    column >= 0 &&
    row < project.rows &&
    column < project.columns &&
    project.cells[row * project.columns + column].kind !== "empty"
  );
}

function clearReliefs(
  project: BeadProject,
  geometry: BeadFusionGeometry,
  compression: number,
  pixelsPerCell: number,
  width: number,
  height: number,
  ownerIndices: Int32Array,
): void {
  if (compression === 100) return;
  const minimumVisibleRadius =
    Math.SQRT1_2 / pixelsPerCell + Number.EPSILON;
  const pressure = compression / 100;
  const holeRadius = Math.max(
    geometry.holeRadius,
    minimumVisibleRadius,
  );
  for (const contour of geometry.contours) {
    clearCircle(
      ownerIndices,
      width,
      height,
      pixelsPerCell,
      contour.center.x,
      contour.center.y,
      holeRadius,
    );
  }
  const junctionRadius = Math.max(
    0.075 * Math.pow(1 - pressure, 1.35),
    minimumVisibleRadius,
  );
  for (let row = 1; row < project.rows; row += 1) {
    for (let column = 1; column < project.columns; column += 1) {
      if (
        isOccupied(project, row - 1, column - 1) &&
        isOccupied(project, row - 1, column) &&
        isOccupied(project, row, column - 1) &&
        isOccupied(project, row, column)
      ) {
        clearCircle(
          ownerIndices,
          width,
          height,
          pixelsPerCell,
          column,
          row,
          junctionRadius,
        );
      }
    }
  }
}

function renderOwners(
  project: BeadProject,
  geometry: BeadFusionGeometry,
  compression: number,
  pixelsPerCell: number,
  width: number,
  height: number,
): Uint8ClampedArray {
  const ownerIndices = new Int32Array(width * height);
  ownerIndices.fill(OWNER_NONE);
  const ownerScores = new Float64Array(width * height);
  ownerScores.fill(Number.POSITIVE_INFINITY);
  for (const contour of geometry.contours) {
    rasterizeContour(
      contour,
      pixelsPerCell,
      width,
      height,
      ownerIndices,
      ownerScores,
    );
  }
  clearReliefs(
    project,
    geometry,
    compression,
    pixelsPerCell,
    width,
    height,
    ownerIndices,
  );

  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixelIndex = 0; pixelIndex < ownerIndices.length; pixelIndex += 1) {
    const ownerIndex = ownerIndices[pixelIndex];
    if (ownerIndex === OWNER_NONE) continue;
    const owner = project.cells[ownerIndex];
    if (owner.kind === "color") {
      writeColor(
        data,
        pixelIndex * 4,
        project.palette[owner.paletteIndex],
      );
    }
  }
  return data;
}

export function renderBeadProject(
  input: BeadProject,
  options: BeadRenderOptions,
): BeadRenderResult {
  const project = validateBeadProject(input);
  validateOptions(options);
  const irregularity =
    project.irregularity ?? 0;
  const width = project.columns * options.pixelsPerCell;
  const height = project.rows * options.pixelsPerCell;
  const geometry = buildBeadFusionGeometry(
    project,
    options.compression,
    irregularity,
  );

  return {
    width,
    height,
    data: renderOwners(
      project,
      geometry,
      options.compression,
      options.pixelsPerCell,
      width,
      height,
    ),
    palette: project.palette.map(
      (color) => [...color] as RgbColor,
    ),
    compression: options.compression,
    irregularity,
    pixelsPerCell: options.pixelsPerCell,
  };
}
