import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from "polygon-clipping";

import {
  buildBeadFusionGeometry,
  type BeadFusionContour,
  type BeadFusionGeometry,
  type FusionPoint,
} from "./fusionGeometry";
import {
  calculatePhysicalSize,
  validateBeadProject,
} from "./project";
import type { BeadProject, RgbColor } from "./types";

const SVG_ORIGIN = "workshop-handoff";
const RELIEF_SAMPLE_COUNT = 128;
const SURFACE_CONTOUR_SAMPLE_COUNT = 24;
const SURFACE_RELIEF_SAMPLE_COUNT = 16;
const OWNER_DISTANCE_EPSILON = 1e-12;
const TERMINAL_SEAM_STROKE_WIDTH = 0.02;

function unitCircle(sampleCount: number): FusionPoint[] {
  return Array.from(
    { length: sampleCount },
    (_, index): FusionPoint => {
      const angle = (Math.PI * 2 * index) / sampleCount;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    },
  );
}

const RELIEF_UNIT_CIRCLE = unitCircle(RELIEF_SAMPLE_COUNT);
const SURFACE_RELIEF_UNIT_CIRCLE = unitCircle(
  SURFACE_RELIEF_SAMPLE_COUNT,
);

export interface BeadFusionSvgPath {
  cellIndex: number;
  d: string;
  fill: string;
  strokeWidth: number;
}

export interface BeadFusionPreviewSvg {
  paths: BeadFusionSvgPath[];
  reliefD: string;
}

interface BeadFusionGeometryIndex {
  contoursByCellIndex: ReadonlyMap<number, BeadFusionContour>;
  junctionsByGridPoint: ReadonlyMap<string, FusionPoint>;
}

function gridPointKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function indexFusionGeometry(
  geometry: BeadFusionGeometry,
): BeadFusionGeometryIndex {
  return {
    contoursByCellIndex: new Map(
      geometry.contours.map((contour) => [
        contour.cellIndex,
        contour,
      ]),
    ),
    junctionsByGridPoint: new Map(
      geometry.junctions.map((junction) => [
        gridPointKey(
          Math.round(junction.y),
          Math.round(junction.x),
        ),
        junction,
      ]),
    ),
  };
}

function rgbFill(color: RgbColor): string {
  return `rgb(${color[0]},${color[1]},${color[2]})`;
}

function formatCoordinate(value: number): string {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function asClosedRing(points: readonly FusionPoint[]): Ring {
  const ring = points.map(({ x, y }): Pair => [x, y]);
  if (ring.length > 0) ring.push([...ring[0]] as Pair);
  return ring;
}

function distanceMargin(
  point: FusionPoint,
  owner: BeadFusionContour,
  competitor: BeadFusionContour,
): number {
  return (
    (point.x - competitor.center.x) ** 2 +
    (point.y - competitor.center.y) ** 2 -
    competitor.ownershipBias -
    (point.x - owner.center.x) ** 2 -
    (point.y - owner.center.y) ** 2 +
    owner.ownershipBias
  );
}

function intersectBisector(
  start: FusionPoint,
  end: FusionPoint,
  startMargin: number,
  endMargin: number,
): FusionPoint {
  const denominator = startMargin - endMargin;
  const amount =
    Math.abs(denominator) <= OWNER_DISTANCE_EPSILON
      ? 0.5
      : startMargin / denominator;
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

function clipToNearestCenter(
  subject: readonly FusionPoint[],
  owner: BeadFusionContour,
  competitor: BeadFusionContour,
): FusionPoint[] {
  if (subject.length === 0) return [];
  const result: FusionPoint[] = [];
  let start = subject[subject.length - 1];
  let startMargin = distanceMargin(start, owner, competitor);
  let startInside = startMargin >= -OWNER_DISTANCE_EPSILON;
  for (const end of subject) {
    const endMargin = distanceMargin(end, owner, competitor);
    const endInside = endMargin >= -OWNER_DISTANCE_EPSILON;
    if (endInside !== startInside) {
      result.push(
        intersectBisector(
          start,
          end,
          startMargin,
          endMargin,
        ),
      );
    }
    if (endInside) result.push(end);
    start = end;
    startMargin = endMargin;
    startInside = endInside;
  }
  return result;
}

function ownershipRegion(
  contour: BeadFusionContour,
  index: BeadFusionGeometryIndex,
  columns: number,
  rows: number,
): Polygon {
  let region: FusionPoint[] = [
    { x: 0, y: 0 },
    { x: columns, y: 0 },
    { x: columns, y: rows },
    { x: 0, y: rows },
  ];
  const firstRow = Math.max(0, contour.row - 1);
  const lastRow = Math.min(rows - 1, contour.row + 1);
  const firstColumn = Math.max(0, contour.column - 1);
  const lastColumn = Math.min(columns - 1, contour.column + 1);
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (
      let column = firstColumn;
      column <= lastColumn;
      column += 1
    ) {
      const competitor = index.contoursByCellIndex.get(
        row * columns + column,
      );
      if (!competitor || competitor.cellIndex === contour.cellIndex) {
        continue;
      }
      region = clipToNearestCenter(
        region,
        contour,
        competitor,
      );
      if (region.length < 3) break;
    }
    if (region.length < 3) break;
  }
  return region.length >= 3 ? [asClosedRing(region)] : [];
}

function clippedContourPoints(
  contour: BeadFusionContour,
  index: BeadFusionGeometryIndex,
  columns: number,
  rows: number,
): FusionPoint[] {
  let points = contour.points;
  const firstRow = Math.max(0, contour.row - 1);
  const lastRow = Math.min(rows - 1, contour.row + 1);
  const firstColumn = Math.max(0, contour.column - 1);
  const lastColumn = Math.min(columns - 1, contour.column + 1);
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (
      let column = firstColumn;
      column <= lastColumn;
      column += 1
    ) {
      const competitor = index.contoursByCellIndex.get(
        row * columns + column,
      );
      if (!competitor || competitor.cellIndex === contour.cellIndex) {
        continue;
      }
      points = clipToNearestCenter(points, contour, competitor);
      if (points.length < 3) return [];
    }
  }
  return points;
}

function circlePolygon(
  center: FusionPoint,
  radius: number,
  unitCirclePoints: readonly FusionPoint[] = RELIEF_UNIT_CIRCLE,
): Polygon {
  const points = unitCirclePoints.map(
    (point): FusionPoint => ({
      x: center.x + point.x * radius,
      y: center.y + point.y * radius,
    }),
  );
  return [asClosedRing(points)];
}

function reliefPolygons(
  contour: BeadFusionContour,
  geometry: BeadFusionGeometry,
  index: BeadFusionGeometryIndex,
  unitCirclePoints: readonly FusionPoint[] = RELIEF_UNIT_CIRCLE,
): Polygon[] {
  const reliefs: Polygon[] = [];
  if (geometry.holeRadius > 0) {
    reliefs.push(
      circlePolygon(
        contour.center,
        geometry.holeRadius,
        unitCirclePoints,
      ),
    );
  }
  if (geometry.junctionRadius > 0) {
    for (let row = contour.row; row <= contour.row + 1; row += 1) {
      for (
        let column = contour.column;
        column <= contour.column + 1;
        column += 1
      ) {
        const junction = index.junctionsByGridPoint.get(
          gridPointKey(row, column),
        );
        if (junction) {
          reliefs.push(
            circlePolygon(
              junction,
              geometry.junctionRadius,
              unitCirclePoints,
            ),
          );
        }
      }
    }
  }
  return reliefs;
}

function printableContour(
  contour: BeadFusionContour,
  geometry: BeadFusionGeometry,
  index: BeadFusionGeometryIndex,
  columns: number,
  rows: number,
  unitCirclePoints: readonly FusionPoint[] = RELIEF_UNIT_CIRCLE,
): MultiPolygon {
  const owned = polygonClipping.intersection(
    [[asClosedRing(contour.points)]],
    ownershipRegion(contour, index, columns, rows),
  );
  if (owned.length === 0) return [];
  const reliefs = reliefPolygons(
    contour,
    geometry,
    index,
    unitCirclePoints,
  );
  return reliefs.length === 0
    ? owned
    : polygonClipping.difference(owned, ...reliefs);
}

function ringPath(ring: Ring): string {
  const last = ring.at(-1);
  const first = ring[0];
  const points =
    last &&
    first &&
    last[0] === first[0] &&
    last[1] === first[1]
      ? ring.slice(0, -1)
      : ring;
  return `${points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"} ${formatCoordinate(x)} ${formatCoordinate(y)}`,
    )
    .join(" ")} Z`;
}

function multiPolygonPath(geometry: MultiPolygon): string {
  return geometry
    .flatMap((polygon) => polygon.map(ringPath))
    .join(" ");
}

function reliefCirclePath(
  center: FusionPoint,
  radius: number,
): string {
  const centerX = formatCoordinate(center.x);
  const centerY = formatCoordinate(center.y);
  const left = formatCoordinate(center.x - radius);
  const right = formatCoordinate(center.x + radius);
  const formattedRadius = formatCoordinate(radius);
  return `M ${right} ${centerY} A ${formattedRadius} ${formattedRadius} 0 1 0 ${left} ${centerY} A ${formattedRadius} ${formattedRadius} 0 1 0 ${right} ${centerY} Z`;
}

export function buildBeadFusionPreviewSvg(
  input: BeadProject,
): BeadFusionPreviewSvg {
  const project = validateBeadProject(input);
  const geometry = buildBeadFusionGeometry(
    project,
    project.compression,
    project.irregularity ?? 0,
  );
  const geometryIndex = indexFusionGeometry(geometry);
  const pathsByFill = new Map<
    string,
    { firstCellIndex: number; parts: string[] }
  >();

  for (const contour of geometry.contours) {
    const cell = project.cells[contour.cellIndex];
    if (cell.kind !== "color") continue;
    const points = clippedContourPoints(
      contour,
      geometryIndex,
      project.columns,
      project.rows,
    );
    if (points.length < 3) continue;
    const d = ringPath(asClosedRing(points));
    const fill = rgbFill(project.palette[cell.paletteIndex]);
    const grouped = pathsByFill.get(fill);
    if (grouped) {
      grouped.parts.push(d);
    } else {
      pathsByFill.set(fill, {
        firstCellIndex: contour.cellIndex,
        parts: [d],
      });
    }
  }

  const reliefParts: string[] = [];
  if (geometry.holeRadius > 0) {
    for (const contour of geometry.contours) {
      reliefParts.push(
        reliefCirclePath(contour.center, geometry.holeRadius),
      );
    }
  }
  if (geometry.junctionRadius > 0) {
    for (const junction of geometry.junctions) {
      reliefParts.push(
        reliefCirclePath(junction, geometry.junctionRadius),
      );
    }
  }

  return {
    paths: [...pathsByFill.entries()].map(
      ([fill, { firstCellIndex, parts }]) => ({
        cellIndex: firstCellIndex,
        d: parts.join(" "),
        fill,
        strokeWidth:
          project.compression === 100
            ? TERMINAL_SEAM_STROKE_WIDTH
            : 0,
      }),
    ),
    reliefD: reliefParts.join(" "),
  };
}

function printablePathsForGeometry(
  project: BeadProject,
  geometry: BeadFusionGeometry,
  reliefUnitCircle: readonly FusionPoint[],
): BeadFusionSvgPath[] {
  const geometryIndex = indexFusionGeometry(geometry);
  const pathsByFill = new Map<
    string,
    { firstCellIndex: number; parts: string[] }
  >();

  for (const contour of geometry.contours) {
    const cell = project.cells[contour.cellIndex];
    if (cell.kind !== "color") continue;
    const d = multiPolygonPath(
      printableContour(
        contour,
        geometry,
        geometryIndex,
        project.columns,
        project.rows,
        reliefUnitCircle,
      ),
    );
    if (d.length === 0) continue;
    const fill = rgbFill(project.palette[cell.paletteIndex]);
    const grouped = pathsByFill.get(fill);
    if (grouped) {
      grouped.parts.push(d);
    } else {
      pathsByFill.set(fill, {
        firstCellIndex: contour.cellIndex,
        parts: [d],
      });
    }
  }

  return [...pathsByFill.entries()].map(
    ([fill, { firstCellIndex, parts }]) => ({
      cellIndex: firstCellIndex,
      d: parts.join(" "),
      fill,
      strokeWidth:
        project.compression === 100
          ? TERMINAL_SEAM_STROKE_WIDTH
          : 0,
    }),
  );
}

function svgPathsForProject(
  project: BeadProject,
): BeadFusionSvgPath[] {
  const geometry = buildBeadFusionGeometry(
    project,
    project.compression,
    project.irregularity ?? 0,
  );
  return printablePathsForGeometry(
    project,
    geometry,
    RELIEF_UNIT_CIRCLE,
  );
}

function surfacePathsForProject(
  project: BeadProject,
): BeadFusionSvgPath[] {
  const geometry = buildBeadFusionGeometry(
    project,
    project.compression,
    project.irregularity ?? 0,
    SURFACE_CONTOUR_SAMPLE_COUNT,
  );
  return printablePathsForGeometry(
    project,
    geometry,
    SURFACE_RELIEF_UNIT_CIRCLE,
  );
}

/**
 * Builds low-detail canonical fusion surfaces for interactive 3D extrusion.
 * 构建供交互式三维挤出使用的低细节标准压合表面。
 */
export function buildBeadFusionSurfacePaths(
  input: BeadProject,
): BeadFusionSvgPath[] {
  return surfacePathsForProject(validateBeadProject(input));
}

export function buildBeadFusionSvgPaths(
  input: BeadProject,
): BeadFusionSvgPath[] {
  return svgPathsForProject(validateBeadProject(input));
}

export function renderBeadProjectSvg(input: BeadProject): string {
  const project = validateBeadProject(input);
  const physicalSize = calculatePhysicalSize(
    project,
    project.beadPitchMm,
  );
  const paths = svgPathsForProject(project);

  return `<svg xmlns="http://www.w3.org/2000/svg" data-lumina-origin="${SVG_ORIGIN}" width="${formatCoordinate(physicalSize.widthMm)}mm" height="${formatCoordinate(physicalSize.heightMm)}mm" viewBox="0 0 ${project.columns} ${project.rows}" shape-rendering="geometricPrecision">${paths.map(({ d, fill, strokeWidth }) => `<path d="${d}" fill="${fill}" fill-rule="evenodd"${strokeWidth > 0 ? ` stroke="${fill}" stroke-width="${formatCoordinate(strokeWidth)}" stroke-linejoin="round" paint-order="stroke fill"` : ""}/>`).join("")}</svg>`;
}

export function encodeBeadProjectSvg(input: BeadProject): ArrayBuffer {
  return Uint8Array.from(
    new TextEncoder().encode(renderBeadProjectSvg(input)),
  ).buffer;
}
