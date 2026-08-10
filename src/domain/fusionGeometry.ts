import type { BeadProject } from "./types";

const MAX_IRREGULAR_OFFSET = 0.024;
const MAX_IRREGULAR_RADIUS_DELTA = 0.015;
const MAX_OWNERSHIP_BIAS = 0.045;
const DEFAULT_SAMPLE_COUNT = 96;
const MIN_SAMPLE_COUNT = 8;
const MAX_SAMPLE_COUNT = 512;

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
  ownershipBias: number;
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
  pressure: number,
  irregularity: number,
): FusionPoint {
  const amount =
    clamp01(irregularity) * smoothstep(0.08, 0.8, pressure);
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

function ownershipBiasFor(
  cell: GeometryCell,
  pressure: number,
  irregularity: number,
): number {
  return (
    signedCoordinateNoise(cell.row, cell.column, 4) *
    MAX_OWNERSHIP_BIAS *
    clamp01(irregularity) *
    smoothstep(0.35, 1, pressure)
  );
}

function outerRadiusFor(pressure: number): number {
  const fusedRadius = 0.47 + 0.03 * smoothstep(0, 1, pressure);
  const packedRawBoost =
    0.035 * (1 - smoothstep(0, 0.5, pressure));
  return fusedRadius + packedRawBoost;
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
  return (
    contactHalfFor(pressure, 0.39, 0.45) +
    0.08 * smoothstep(0.62, 1, pressure)
  );
}

function boundaryContactHalfFor(pressure: number): number {
  return (
    contactHalfFor(pressure, 0.31, 0.55) +
    0.105 * smoothstep(0.62, 1, pressure)
  );
}

function holeRadiusFor(pressure: number): number {
  return pressure === 1
    ? 0
    : 0.2 * Math.pow(1 - pressure, 0.72);
}

function junctionRadiusFor(pressure: number): number {
  return pressure === 1
    ? 0
    : 0.085 * Math.sqrt(1 - pressure);
}

function contactReachFor(
  pressure: number,
  irregularity: number,
): number {
  return (
    0.5 +
    0.012 * smoothstep(0.08, 1, pressure) +
    MAX_IRREGULAR_OFFSET *
      clamp01(irregularity) *
      smoothstep(0.08, 0.8, pressure)
  );
}

function variedContactHalf(
  base: number,
  first: GeometryCell,
  orientation: "horizontal" | "vertical",
  side: "negative" | "positive",
  supported: boolean,
  pressure: number,
  irregularity: number,
): number {
  const salt =
    (orientation === "horizontal" ? 20 : 30) +
    (side === "negative" ? 0 : 1);
  const amplitude = supported ? 0.012 : 0.026;
  const variation =
    signedCoordinateNoise(first.row, first.column, salt) *
    amplitude *
    clamp01(irregularity) *
    smoothstep(0.45, 1, pressure);
  return Math.max(0, Math.min(0.49, base + variation));
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
  irregularity: number,
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
  const negativeBase = negativeSupported
    ? internalHalf
    : boundaryHalf;
  const positiveBase = positiveSupported
    ? internalHalf
    : boundaryHalf;
  return {
    orientation: horizontal ? "horizontal" : "vertical",
    firstRow: first.row,
    firstColumn: first.column,
    negativeSupported,
    positiveSupported,
    negativeHalf: variedContactHalf(
      negativeBase,
      first,
      horizontal ? "horizontal" : "vertical",
      "negative",
      negativeSupported,
      pressure,
      irregularity,
    ),
    positiveHalf: variedContactHalf(
      positiveBase,
      first,
      horizontal ? "horizontal" : "vertical",
      "positive",
      positiveSupported,
      pressure,
      irregularity,
    ),
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
  fusionWeight: number,
): FusionPoint {
  const angleFromDiagonal = Math.abs(
    Math.atan2(Math.abs(localY), Math.abs(localX)) - Math.PI / 4,
  );
  const angularWeight =
    1 - smoothstep(Math.PI / 18, Math.PI / 4, angleFromDiagonal);
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
  centers: ReadonlyMap<string, FusionPoint>,
  columns: number,
  rows: number,
  sampleCount: number,
): FusionPoint[] {
  const center = centers.get(coordinateKey(cell.row, cell.column));
  if (!center) {
    throw new TypeError("Fusion contour centre is missing.");
  }
  const radius = outerRadiusFor(pressure);
  const shapeVariation =
    clamp01(irregularity) * smoothstep(0.22, 1, pressure);
  const radiusXDelta =
    signedCoordinateNoise(cell.row, cell.column, 2) *
    MAX_IRREGULAR_RADIUS_DELTA *
    shapeVariation;
  const radiusYDelta =
    signedCoordinateNoise(cell.row, cell.column, 3) *
    MAX_IRREGULAR_RADIUS_DELTA *
    shapeVariation;
  const contactReach = contactReachFor(pressure, irregularity);
  const right = lookup.get(coordinateKey(cell.row, cell.column + 1));
  const left = lookup.get(coordinateKey(cell.row, cell.column - 1));
  const below = lookup.get(coordinateKey(cell.row + 1, cell.column));
  const above = lookup.get(coordinateKey(cell.row - 1, cell.column));
  const profiles = {
    right: right
      ? contactProfile(cell, right, pressure, irregularity, lookup)
      : null,
    left: left
      ? contactProfile(cell, left, pressure, irregularity, lookup)
      : null,
    below: below
      ? contactProfile(cell, below, pressure, irregularity, lookup)
      : null,
    above: above
      ? contactProfile(cell, above, pressure, irregularity, lookup)
      : null,
  };
  const junctions = [
    {
      signX: 1,
      signY: 1,
      diagonal: hasCell(lookup, cell.row + 1, cell.column + 1),
      complete: Boolean(
        right &&
          below &&
          hasCell(lookup, cell.row + 1, cell.column + 1),
      ),
    },
    {
      signX: -1,
      signY: 1,
      diagonal: hasCell(lookup, cell.row + 1, cell.column - 1),
      complete: Boolean(
        left &&
          below &&
          hasCell(lookup, cell.row + 1, cell.column - 1),
      ),
    },
    {
      signX: 1,
      signY: -1,
      diagonal: hasCell(lookup, cell.row - 1, cell.column + 1),
      complete: Boolean(
        right &&
          above &&
          hasCell(lookup, cell.row - 1, cell.column + 1),
      ),
    },
    {
      signX: -1,
      signY: -1,
      diagonal: hasCell(lookup, cell.row - 1, cell.column - 1),
      complete: Boolean(
        left &&
          above &&
          hasCell(lookup, cell.row - 1, cell.column - 1),
      ),
    },
  ]
    .filter(({ diagonal }) => diagonal)
    .map(({ signX, signY, complete }) => ({
      signX,
      signY,
      fusionWeight: complete
        ? smoothstep(0.04, 0.7, pressure)
        : pressure === 1
          ? 1
          : 0,
    }))
    .filter(({ fusionWeight }) => fusionWeight > 0);
  const points: FusionPoint[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const angle = (Math.PI * 2 * index) / sampleCount;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    let localX = cosine * radius;
    let localY = sine * radius;
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
        junction.fusionWeight,
      );
      localX = bulged.x;
      localY = bulged.y;
    }
    localX += cosine * radiusXDelta;
    localY += sine * radiusYDelta;
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
    points.push({
      x: Math.max(0, Math.min(columns, x)),
      y: Math.max(0, Math.min(rows, y)),
    });
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
  sampleCount = DEFAULT_SAMPLE_COUNT,
): BeadFusionGeometry {
  if (
    !Number.isInteger(sampleCount) ||
    sampleCount < MIN_SAMPLE_COUNT ||
    sampleCount > MAX_SAMPLE_COUNT
  ) {
    throw new RangeError(
      `Fusion contour sample count must be an integer from ${MIN_SAMPLE_COUNT} to ${MAX_SAMPLE_COUNT}.`,
    );
  }
  const pressure = clamp01(compression / 100);
  const normalizedIrregularity = clamp01(irregularity / 100);
  const occupied: GeometryCell[] = project.cells.flatMap(
    (cell, cellIndex) =>
      cell.kind === "color"
        ? [
            {
              cellIndex,
              row: Math.floor(cellIndex / project.columns),
              column: cellIndex % project.columns,
            },
          ]
        : [],
  );
  const lookup = new Map(
    occupied.map((cell) => [
      coordinateKey(cell.row, cell.column),
      cell,
    ]),
  );
  const centers = new Map(
    occupied.map((cell) => [
      coordinateKey(cell.row, cell.column),
      centerFor(cell, pressure, normalizedIrregularity),
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
      contacts.push(
        contactProfile(
          cell,
          right,
          pressure,
          normalizedIrregularity,
          lookup,
        ),
      );
    }
    if (below) {
      contacts.push(
        contactProfile(
          cell,
          below,
          pressure,
          normalizedIrregularity,
          lookup,
        ),
      );
    }
  }
  const junctions = occupied.flatMap((cell) => {
    const cells = [
      lookup.get(coordinateKey(cell.row, cell.column)),
      lookup.get(coordinateKey(cell.row, cell.column + 1)),
      lookup.get(coordinateKey(cell.row + 1, cell.column)),
      lookup.get(coordinateKey(cell.row + 1, cell.column + 1)),
    ];
    const junctionCenters: FusionPoint[] = [];
    for (const junctionCell of cells) {
      if (!junctionCell) return [];
      const junctionCenter = centers.get(
        coordinateKey(junctionCell.row, junctionCell.column),
      );
      if (!junctionCenter) return [];
      junctionCenters.push(junctionCenter);
    }
    return [
      {
        x:
          junctionCenters.reduce(
            (sum, entry) => sum + entry.x,
            0,
          ) / 4,
        y:
          junctionCenters.reduce(
            (sum, entry) => sum + entry.y,
            0,
          ) / 4,
      },
    ];
  });
  return {
    contours: occupied.map((cell) => ({
      cellIndex: cell.cellIndex,
      row: cell.row,
      column: cell.column,
      center: centers.get(coordinateKey(cell.row, cell.column))!,
      ownershipBias: ownershipBiasFor(
        cell,
        pressure,
        normalizedIrregularity,
      ),
      points: contourPoints(
        cell,
        pressure,
        normalizedIrregularity,
        lookup,
        centers,
        project.columns,
        project.rows,
        sampleCount,
      ),
    })),
    contacts,
    junctions,
    junctionRadius: junctionRadiusFor(pressure),
    outerRadius: outerRadiusFor(pressure),
    holeRadius: holeRadiusFor(pressure),
  };
}
