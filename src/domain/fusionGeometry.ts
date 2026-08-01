import type { BeadProject } from "./types";

const MAX_IRREGULAR_OFFSET = 0.035;
const DEFAULT_SAMPLE_COUNT = 96;

interface GeometryCell {
  cellIndex: number;
  row: number;
  column: number;
}

export interface FusionPoint {
  x: number;
  y: number;
}

export interface BeadFusionContour {
  cellIndex: number;
  row: number;
  column: number;
  center: FusionPoint;
  points: FusionPoint[];
}

export interface BeadFusionContact {
  orientation: "horizontal" | "vertical";
  firstRow: number;
  firstColumn: number;
  negativeSupported: boolean;
  positiveSupported: boolean;
  negativeHalf: number;
  positiveHalf: number;
}

export interface BeadFusionGeometry {
  contours: BeadFusionContour[];
  contacts: BeadFusionContact[];
  junctions: FusionPoint[];
  junctionRadius: number;
  outerRadius: number;
  holeRadius: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function coordinateKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function signedCoordinateNoise(
  row: number,
  column: number,
  salt: number,
): number {
  let hash = Math.imul(row + 101, 374761393);
  hash ^= Math.imul(column + 307, 668265263);
  hash ^= Math.imul(salt + 17, 1274126177);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 2147483647.5 - 1;
}

function centerFor(
  cell: GeometryCell,
  irregularity: number,
): FusionPoint {
  const amount = clamp01(irregularity);
  return {
    x:
      cell.column +
      0.5 +
      signedCoordinateNoise(cell.row, cell.column, 0) *
        MAX_IRREGULAR_OFFSET *
        amount,
    y:
      cell.row +
      0.5 +
      signedCoordinateNoise(cell.row, cell.column, 1) *
        MAX_IRREGULAR_OFFSET *
        amount,
  };
}

function outerRadiusFor(pressure: number): number {
  return 0.405 + 0.125 * smoothstep(0, 1, pressure);
}

function contactHalfFor(
  pressure: number,
  maximumHalf: number,
  exponent: number,
): number {
  const firstContactHalf = 0.035;
  const firstContact =
    firstContactHalf * smoothstep(0, 0.08, pressure);
  const ironing = Math.pow(
    smoothstep(0.08, 1, pressure),
    exponent,
  );
  return (
    firstContact +
    (maximumHalf - firstContactHalf) * ironing
  );
}

function internalContactHalfFor(pressure: number): number {
  return contactHalfFor(pressure, 0.34, 0.6);
}

function boundaryContactHalfFor(pressure: number): number {
  return contactHalfFor(pressure, 0.28, 0.65);
}

function holeRadiusFor(pressure: number): number {
  return 0.19 * (1 - smoothstep(0.35, 1, pressure));
}

function contactReachFor(
  pressure: number,
  irregularity: number,
): number {
  return (
    0.5 +
    0.02 * smoothstep(0.7, 1, pressure) +
    MAX_IRREGULAR_OFFSET * clamp01(irregularity)
  );
}

function hasCell(
  lookup: ReadonlyMap<string, GeometryCell>,
  row: number,
  column: number,
): boolean {
  return lookup.has(coordinateKey(row, column));
}

function contactProfile(
  firstInput: GeometryCell,
  secondInput: GeometryCell,
  pressure: number,
  lookup: ReadonlyMap<string, GeometryCell>,
): BeadFusionContact {
  const horizontal =
    firstInput.row === secondInput.row &&
    Math.abs(firstInput.column - secondInput.column) === 1;
  const vertical =
    firstInput.column === secondInput.column &&
    Math.abs(firstInput.row - secondInput.row) === 1;
  if (!horizontal && !vertical) {
    throw new TypeError(
      "Fusion contacts require orthogonally adjacent beads.",
    );
  }
  const shouldSwap =
    (horizontal && firstInput.column > secondInput.column) ||
    (vertical && firstInput.row > secondInput.row);
  const first = shouldSwap ? secondInput : firstInput;
  const second = shouldSwap ? firstInput : secondInput;
  const negativeSupported = horizontal
    ? hasCell(lookup, first.row - 1, first.column) &&
      hasCell(lookup, second.row - 1, second.column)
    : hasCell(lookup, first.row, first.column - 1) &&
      hasCell(lookup, second.row, second.column - 1);
  const positiveSupported = horizontal
    ? hasCell(lookup, first.row + 1, first.column) &&
      hasCell(lookup, second.row + 1, second.column)
    : hasCell(lookup, first.row, first.column + 1) &&
      hasCell(lookup, second.row, second.column + 1);
  const internalHalf = internalContactHalfFor(pressure);
  const boundaryHalf = boundaryContactHalfFor(pressure);
  return {
    orientation: horizontal ? "horizontal" : "vertical",
    firstRow: first.row,
    firstColumn: first.column,
    negativeSupported,
    positiveSupported,
    negativeHalf: negativeSupported ? internalHalf : boundaryHalf,
    positiveHalf: positiveSupported ? internalHalf : boundaryHalf,
  };
}

function deformToContact(
  current: number,
  target: number,
  transverse: number,
  contactHalf: number,
  radius: number,
  pressure: number,
): number {
  if (contactHalf <= 0) return current;
  const shoulderHalf = Math.min(
    radius,
    contactHalf + 0.04 + 0.06 * smoothstep(0.08, 1, pressure),
  );
  const distance = Math.abs(transverse);
  const weight =
    distance <= contactHalf
      ? 1
      : 1 - smoothstep(contactHalf, shoulderHalf, distance);
  return current + (target - current) * weight;
}

function bulgeTowardJunction(
  localX: number,
  localY: number,
  radius: number,
  contactReach: number,
  pressure: number,
): FusionPoint {
  const angleFromDiagonal = Math.abs(
    Math.atan2(Math.abs(localY), Math.abs(localX)) - Math.PI / 4,
  );
  const angularWeight =
    1 - smoothstep(Math.PI / 18, Math.PI / 4, angleFromDiagonal);
  const fusionWeight = smoothstep(0.55, 1, pressure);
  const cosine = localX / radius;
  const sine = localY / radius;
  const squareRadius =
    contactReach / Math.max(Math.abs(cosine), Math.abs(sine));
  const bulgedRadius =
    radius +
    (Math.max(radius, squareRadius) - radius) *
      angularWeight *
      fusionWeight;
  return {
    x: cosine * bulgedRadius,
    y: sine * bulgedRadius,
  };
}

function contourPoints(
  cell: GeometryCell,
  pressure: number,
  irregularity: number,
  lookup: ReadonlyMap<string, GeometryCell>,
): FusionPoint[] {
  const center = centerFor(cell, irregularity);
  const radius = outerRadiusFor(pressure);
  const contactReach = contactReachFor(pressure, irregularity);
  const right = lookup.get(coordinateKey(cell.row, cell.column + 1));
  const left = lookup.get(coordinateKey(cell.row, cell.column - 1));
  const below = lookup.get(coordinateKey(cell.row + 1, cell.column));
  const above = lookup.get(coordinateKey(cell.row - 1, cell.column));
  const profiles = {
    right: right
      ? contactProfile(cell, right, pressure, lookup)
      : null,
    left: left ? contactProfile(cell, left, pressure, lookup) : null,
    below: below
      ? contactProfile(cell, below, pressure, lookup)
      : null,
    above: above
      ? contactProfile(cell, above, pressure, lookup)
      : null,
  };
  const junctions = [
    {
      signX: 1,
      signY: 1,
      complete: Boolean(
        right &&
          below &&
          hasCell(lookup, cell.row + 1, cell.column + 1),
      ),
    },
    {
      signX: -1,
      signY: 1,
      complete: Boolean(
        left &&
          below &&
          hasCell(lookup, cell.row + 1, cell.column - 1),
      ),
    },
    {
      signX: 1,
      signY: -1,
      complete: Boolean(
        right &&
          above &&
          hasCell(lookup, cell.row - 1, cell.column + 1),
      ),
    },
    {
      signX: -1,
      signY: -1,
      complete: Boolean(
        left &&
          above &&
          hasCell(lookup, cell.row - 1, cell.column - 1),
      ),
    },
  ].filter(({ complete }) => complete);
  const points: FusionPoint[] = [];

  for (let index = 0; index < DEFAULT_SAMPLE_COUNT; index += 1) {
    const angle = (Math.PI * 2 * index) / DEFAULT_SAMPLE_COUNT;
    let localX = Math.cos(angle) * radius;
    let localY = Math.sin(angle) * radius;
    const junction = junctions.find(
      ({ signX, signY }) =>
        Math.sign(localX) === signX && Math.sign(localY) === signY,
    );
    if (junction) {
      const bulged = bulgeTowardJunction(
        localX,
        localY,
        radius,
        contactReach,
        pressure,
      );
      localX = bulged.x;
      localY = bulged.y;
    }
    let x = center.x + localX;
    let y = center.y + localY;

    if (profiles.right && localX > 0) {
      const half =
        localY < 0
          ? profiles.right.negativeHalf
          : profiles.right.positiveHalf;
      x = deformToContact(
        x,
        center.x + contactReach,
        localY,
        half,
        radius,
        pressure,
      );
    }
    if (profiles.left && localX < 0) {
      const half =
        localY < 0
          ? profiles.left.negativeHalf
          : profiles.left.positiveHalf;
      x = deformToContact(
        x,
        center.x - contactReach,
        localY,
        half,
        radius,
        pressure,
      );
    }
    if (profiles.below && localY > 0) {
      const half =
        localX < 0
          ? profiles.below.negativeHalf
          : profiles.below.positiveHalf;
      y = deformToContact(
        y,
        center.y + contactReach,
        localX,
        half,
        radius,
        pressure,
      );
    }
    if (profiles.above && localY < 0) {
      const half =
        localX < 0
          ? profiles.above.negativeHalf
          : profiles.above.positiveHalf;
      y = deformToContact(
        y,
        center.y - contactReach,
        localX,
        half,
        radius,
        pressure,
      );
    }
    points.push({ x, y });
  }
  return points;
}

function pointOnSegment(
  point: FusionPoint,
  first: FusionPoint,
  second: FusionPoint,
): boolean {
  const cross =
    (point.y - first.y) * (second.x - first.x) -
    (point.x - first.x) * (second.y - first.y);
  if (Math.abs(cross) > 1e-9) return false;
  const dot =
    (point.x - first.x) * (second.x - first.x) +
    (point.y - first.y) * (second.y - first.y);
  if (dot < 0) return false;
  const lengthSquared =
    (second.x - first.x) ** 2 + (second.y - first.y) ** 2;
  return dot <= lengthSquared;
}

export function pointInContour(
  point: FusionPoint,
  contour: readonly FusionPoint[],
): boolean {
  let inside = false;
  for (
    let index = 0, previous = contour.length - 1;
    index < contour.length;
    previous = index, index += 1
  ) {
    const currentPoint = contour[index];
    const previousPoint = contour[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) *
          (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function buildBeadFusionGeometry(
  project: BeadProject,
  compression: number,
  irregularity = 0,
): BeadFusionGeometry {
  const pressure = clamp01(compression / 100);
  const normalizedIrregularity = clamp01(irregularity / 100);
  const occupied: GeometryCell[] = project.cells.flatMap(
    (cell, cellIndex) =>
      cell.kind === "empty"
        ? []
        : [
            {
              cellIndex,
              row: Math.floor(cellIndex / project.columns),
              column: cellIndex % project.columns,
            },
          ],
  );
  const lookup = new Map(
    occupied.map((cell) => [
      coordinateKey(cell.row, cell.column),
      cell,
    ]),
  );
  const contacts: BeadFusionContact[] = [];
  for (const cell of occupied) {
    const right = lookup.get(
      coordinateKey(cell.row, cell.column + 1),
    );
    const below = lookup.get(
      coordinateKey(cell.row + 1, cell.column),
    );
    if (right) {
      contacts.push(contactProfile(cell, right, pressure, lookup));
    }
    if (below) {
      contacts.push(contactProfile(cell, below, pressure, lookup));
    }
  }
  const junctions = occupied.flatMap((cell) =>
    hasCell(lookup, cell.row, cell.column + 1) &&
    hasCell(lookup, cell.row + 1, cell.column) &&
    hasCell(lookup, cell.row + 1, cell.column + 1)
      ? [{ x: cell.column + 1, y: cell.row + 1 }]
      : [],
  );
  return {
    contours: occupied.map((cell) => ({
      cellIndex: cell.cellIndex,
      row: cell.row,
      column: cell.column,
      center: centerFor(cell, normalizedIrregularity),
      points: contourPoints(
        cell,
        pressure,
        normalizedIrregularity,
        lookup,
      ),
    })),
    contacts,
    junctions,
    junctionRadius:
      compression === 100
        ? 0
        : 0.075 * Math.pow(1 - pressure, 1.35),
    outerRadius: outerRadiusFor(pressure),
    holeRadius: holeRadiusFor(pressure),
  };
}
