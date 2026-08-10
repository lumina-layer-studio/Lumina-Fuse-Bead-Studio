import type { Raster } from "./types";
import {
  MAX_BEAD_GRID_SIZE,
  type BeadCell,
  type BeadConfidenceIssue,
  type BeadConfidenceReason,
  type BeadGridGeometry,
  type BeadInputMode,
  type BeadOrientation,
  type GridSuggestion,
  type PatternClassification,
  type RecognitionRequest,
  type RecognitionResult,
  type RgbColor,
} from "./types";

const GRID_DARK_LUMINANCE = 80;
const HOLE_DARK_LUMINANCE = 70;
const COLOR_CHANGE_THRESHOLD_SQUARED = 20 * 20;
const PALETTE_MERGE_THRESHOLD_SQUARED = 12 * 12;
const NUMBERED_LABEL_STRUCTURE_RATIO = 0.01;
const NUMBERED_LABEL_SIDE_STRUCTURE_RATIO = 0.002;
const IMPLICIT_GRID_EDGE_DELTA = 28;
const IMPLICIT_GRID_MIN_PITCH = 8;
const IMPLICIT_GRID_MAX_PITCH = 96;
const IMPLICIT_GRID_MIN_CORRELATION = 0.42;
const IMPLICIT_GRID_BACKGROUND_DISTANCE_SQUARED = 24 * 24;
const IMPLICIT_PERIODIC_EDGE_DELTA = 12;
const IMPLICIT_DIRECTIONAL_EDGE_DELTA = 8;

interface PixelSample {
  color: RgbColor;
  alpha: number;
  x: number;
  y: number;
}

interface CellSample {
  color: RgbColor;
  variance: number;
  dominantRatio: number;
  structureRatio: number;
  centralStructureRatio: number;
  centralLeftStructureRatio: number;
  centralRightStructureRatio: number;
  peripheralStructureRatio: number;
  centreDark: boolean;
}

interface LineDetection {
  positions: number[];
  spacing: number;
  consistency: number;
}

interface HoleComponent {
  centreX: number;
  centreY: number;
  width: number;
  height: number;
  area: number;
}

interface NumberedGuideTrim {
  rows: number;
  columns: number;
  geometry: BeadGridGeometry;
  confidence: number;
}

interface ImplicitGridPitch {
  pitch: number;
  confidence: number;
  inferredAlternating?: boolean;
  preferLineLattice?: boolean;
  fallbackPitch?: { pitch: number; confidence: number };
}

interface ImplicitGridCandidate {
  suggestion: GridSuggestion;
  evidence: number;
  axisSupport?: 1 | 2;
}

interface ImplicitCoordinateFrame {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
  confidence: number;
  axisSupport: 1 | 2;
}

interface ImplicitPeriodicRegion {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  confidence: number;
}

interface ImplicitBrightPanel {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  confidence: number;
}

function fail(message: string): never {
  throw new Error(message);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validateRaster(source: Raster): void {
  if (
    !Number.isInteger(source.width) ||
    !Number.isInteger(source.height) ||
    source.width <= 0 ||
    source.height <= 0 ||
    source.data.length !== source.width * source.height * 4
  ) {
    fail("Raster dimensions do not match RGBA data.");
  }
}

function pixelOffset(source: Raster, x: number, y: number): number {
  return (y * source.width + x) * 4;
}

function readPixel(
  source: Raster,
  x: number,
  y: number,
): PixelSample {
  const safeX = clamp(Math.trunc(x), 0, source.width - 1);
  const safeY = clamp(Math.trunc(y), 0, source.height - 1);
  const offset = pixelOffset(source, safeX, safeY);
  return {
    color: [
      source.data[offset],
      source.data[offset + 1],
      source.data[offset + 2],
    ],
    alpha: source.data[offset + 3],
    x: safeX,
    y: safeY,
  };
}

function luminance(color: RgbColor): number {
  return color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;
}

function colorDistanceSquared(
  left: RgbColor,
  right: RgbColor,
): number {
  const red = left[0] - right[0];
  const green = left[1] - right[1];
  const blue = left[2] - right[2];
  return red * red + green * green + blue * blue;
}

function pixelDifferenceSquared(
  left: PixelSample,
  right: PixelSample,
): number {
  const alpha = left.alpha - right.alpha;
  return colorDistanceSquared(left.color, right.color) + alpha * alpha;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function medianColor(samples: readonly PixelSample[]): RgbColor {
  if (samples.length === 0) {
    return [0, 0, 0];
  }
  return [
    Math.round(median(samples.map((sample) => sample.color[0]))),
    Math.round(median(samples.map((sample) => sample.color[1]))),
    Math.round(median(samples.map((sample) => sample.color[2]))),
  ];
}

function dominantColor(samples: readonly PixelSample[]): {
  color: RgbColor;
  ratio: number;
} {
  if (samples.length === 0) {
    return { color: [0, 0, 0], ratio: 0 };
  }
  const counts = new Map<string, { count: number; color: RgbColor }>();
  for (const sample of samples) {
    const key = sample.color.join(",");
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { count: 1, color: [...sample.color] as RgbColor });
    }
  }
  const winner = [...counts.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.color[0] - right.color[0] ||
      left.color[1] - right.color[1] ||
      left.color[2] - right.color[2],
  )[0];
  if (!winner) {
    return { color: medianColor(samples), ratio: 0 };
  }
  return {
    color: winner.color,
    ratio: winner.count / samples.length,
  };
}

function groupConsecutive(positions: readonly number[]): number[] {
  if (positions.length === 0) {
    return [];
  }
  const groups: number[][] = [[positions[0]]];
  for (let index = 1; index < positions.length; index += 1) {
    const current = positions[index];
    const group = groups[groups.length - 1];
    if (current === group[group.length - 1] + 1) {
      group.push(current);
    } else {
      groups.push([current]);
    }
  }
  return groups.map((group) => group[0]);
}

function lineConsistency(positions: readonly number[]): {
  spacing: number;
  consistency: number;
} {
  if (positions.length < 2) {
    return { spacing: 0, consistency: 0 };
  }
  const gaps = positions
    .slice(1)
    .map((position, index) => position - positions[index]);
  const spacing = median(gaps);
  if (spacing <= 0) {
    return { spacing: 0, consistency: 0 };
  }
  const meanError =
    gaps.reduce((sum, gap) => sum + Math.abs(gap - spacing), 0) /
    gaps.length;
  return {
    spacing,
    consistency: clamp(1 - meanError / spacing, 0, 1),
  };
}

function detectDarkLines(
  source: Raster,
  axis: "x" | "y",
): LineDetection {
  const length = axis === "x" ? source.width : source.height;
  const crossLength = axis === "x" ? source.height : source.width;
  const darkPositions: number[] = [];
  for (let coordinate = 0; coordinate < length; coordinate += 1) {
    let dark = 0;
    for (let cross = 0; cross < crossLength; cross += 1) {
      const pixel =
        axis === "x"
          ? readPixel(source, coordinate, cross)
          : readPixel(source, cross, coordinate);
      if (
        pixel.alpha >= 128 &&
        luminance(pixel.color) <= GRID_DARK_LUMINANCE
      ) {
        dark += 1;
      }
    }
    if (dark / crossLength >= 0.58) {
      darkPositions.push(coordinate);
    }
  }
  const positions = groupConsecutive(darkPositions);
  const { spacing, consistency } = lineConsistency(positions);
  return { positions, spacing, consistency };
}

function inferredEdgePositions(
  positions: readonly number[],
  spacing: number,
  dimension: number,
): number[] {
  if (positions.length < 2 || spacing <= 0) {
    return [...positions];
  }
  const completed = [...positions];
  const leadingGap = completed[0];
  if (leadingGap / spacing >= 0.85 && leadingGap / spacing <= 1.15) {
    completed.unshift(0);
  }
  const trailingGap = dimension - completed[completed.length - 1];
  if (
    trailingGap / spacing >= 0.85 &&
    trailingGap / spacing <= 1.15
  ) {
    completed.push(dimension);
  }
  return completed;
}

function approximateCellColorMode(
  samples: readonly CellSample[],
): RgbColor {
  const lowStructure = samples.filter(
    (sample) => sample.structureRatio < 0.035,
  );
  const candidates =
    lowStructure.length >= 4 ? lowStructure : [...samples];
  const clusters: Array<{ colors: RgbColor[]; representative: RgbColor }> = [];
  for (const sample of candidates) {
    const existing = clusters.find(
      (cluster) =>
        colorDistanceSquared(cluster.representative, sample.color) <=
        COLOR_CHANGE_THRESHOLD_SQUARED,
    );
    if (existing) {
      existing.colors.push(sample.color);
    } else {
      clusters.push({
        colors: [sample.color],
        representative: sample.color,
      });
    }
  }
  const largest = clusters.sort(
    (left, right) => right.colors.length - left.colors.length,
  )[0];
  if (!largest) {
    return [0, 0, 0];
  }
  return [
    Math.round(median(largest.colors.map((color) => color[0]))),
    Math.round(median(largest.colors.map((color) => color[1]))),
    Math.round(median(largest.colors.map((color) => color[2]))),
  ];
}

function numberedGuideTrim(
  source: Raster,
  vertical: LineDetection,
  horizontal: LineDetection,
): NumberedGuideTrim | null {
  const xPositions = inferredEdgePositions(
    vertical.positions,
    vertical.spacing,
    source.width,
  );
  const yPositions = inferredEdgePositions(
    horizontal.positions,
    horizontal.spacing,
    source.height,
  );
  const sheetColumns = xPositions.length - 1;
  const sheetRows = yPositions.length - 1;
  if (sheetColumns < 4 || sheetRows < 4) {
    return null;
  }

  const samples: CellSample[][] = Array.from(
    { length: sheetRows },
    (_unused, row) =>
      Array.from({ length: sheetColumns }, (_unusedColumn, column) =>
        sampleNumberedCell(source, {
          left: xPositions[column],
          top: yPositions[row],
          right: xPositions[column + 1],
          bottom: yPositions[row + 1],
        }),
      ),
  );
  const backgroundColor = approximateCellColorMode(samples.flat());
  const isAxisLabel = (sample: CellSample): boolean =>
    colorDistanceSquared(sample.color, backgroundColor) <=
      COLOR_CHANGE_THRESHOLD_SQUARED &&
    sample.structureRatio >= 0.035 &&
    sample.structureRatio <= 0.45;
  const isRegularInterval = (
    positions: readonly number[],
    index: number,
    spacing: number,
  ): boolean => {
    if (spacing <= 0) {
      return true;
    }
    const interval = positions[index + 1] - positions[index];
    return interval / spacing >= 0.78 && interval / spacing <= 1.22;
  };
  const candidates: Array<{
    columnStart: number;
    columnEnd: number;
    rowStart: number;
    rowEnd: number;
    confidence: number;
    area: number;
  }> = [];
  const axisSpan = (
    values: readonly boolean[],
    start: number,
    end: number,
  ): { start: number; end: number; density: number } | null => {
    const span = densestLabelSpan(values.slice(start, end));
    if (!span || span.density < 0.8) {
      return null;
    }
    return {
      start: span.start + start,
      end: span.end + start,
      density: span.density,
    };
  };
  for (
    let rowLabelColumn = 0;
    rowLabelColumn < sheetColumns;
    rowLabelColumn += 1
  ) {
    for (let axisRow = 0; axisRow < sheetRows; axisRow += 1) {
      const intersection = samples[axisRow][rowLabelColumn];
      if (
        colorDistanceSquared(intersection.color, backgroundColor) >
          COLOR_CHANGE_THRESHOLD_SQUARED ||
        intersection.structureRatio >= 0.035
      ) {
        continue;
      }
      const horizontalLabels = samples[axisRow].map(
        (sample, column) =>
          isAxisLabel(sample) &&
          isRegularInterval(
            xPositions,
            column,
            vertical.spacing,
          ),
      );
      const verticalLabels = samples.map(
        (row, sampleRow) =>
          isAxisLabel(row[rowLabelColumn]) &&
          isRegularInterval(
            yPositions,
            sampleRow,
            horizontal.spacing,
          ),
      );
      const horizontalSpans = [
        axisSpan(horizontalLabels, 0, rowLabelColumn),
        axisSpan(
          horizontalLabels,
          rowLabelColumn + 1,
          sheetColumns,
        ),
      ].filter(
        (
          span,
        ): span is { start: number; end: number; density: number } =>
          span !== null,
      );
      const verticalSpans = [
        axisSpan(verticalLabels, 0, axisRow),
        axisSpan(verticalLabels, axisRow + 1, sheetRows),
      ].filter(
        (
          span,
        ): span is { start: number; end: number; density: number } =>
          span !== null,
      );
      for (const horizontalSpan of horizontalSpans) {
        const columns = horizontalSpan.end - horizontalSpan.start;
        if (columns < 4) {
          continue;
        }
        for (const verticalSpan of verticalSpans) {
          const rows = verticalSpan.end - verticalSpan.start;
          if (rows < 4) {
            continue;
          }
          candidates.push({
            columnStart: horizontalSpan.start,
            columnEnd: horizontalSpan.end,
            rowStart: verticalSpan.start,
            rowEnd: verticalSpan.end,
            confidence:
              (horizontalSpan.density + verticalSpan.density) / 2,
            area: rows * columns,
          });
        }
      }
    }
  }
  const axes = candidates.sort(
    (left, right) =>
      right.confidence - left.confidence ||
      right.area - left.area,
  )[0];
  if (!axes) {
    return null;
  }
  const columns = axes.columnEnd - axes.columnStart;
  const rows = axes.rowEnd - axes.rowStart;
  if (
    rows < 1 ||
    columns < 1 ||
    rows > MAX_BEAD_GRID_SIZE ||
    columns > MAX_BEAD_GRID_SIZE
  ) {
    return null;
  }
  const originX = xPositions[axes.columnStart];
  const originY = yPositions[axes.rowStart];
  const cellWidth =
    (xPositions[axes.columnEnd] - originX) / columns;
  const cellHeight =
    (yPositions[axes.rowEnd] - originY) / rows;
  return {
    rows,
    columns,
    geometry: {
      originX,
      originY,
      cellWidth,
      cellHeight,
    },
    confidence: axes.confidence,
  };
}

function edgeProjections(source: Raster): {
  horizontal: number[];
  vertical: number[];
  horizontalLines: number[];
  verticalLines: number[];
} {
  const horizontal = Array.from({ length: source.height }, () => 0);
  const vertical = Array.from({ length: source.width }, () => 0);
  const horizontalLines = Array.from(
    { length: source.height },
    () => 0,
  );
  const verticalLines = Array.from({ length: source.width }, () => 0);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = pixelOffset(source, x, y);
      const red = source.data[offset];
      const green = source.data[offset + 1];
      const blue = source.data[offset + 2];
      const alpha = source.data[offset + 3];
      const currentLuminance =
        red * 0.299 + green * 0.587 + blue * 0.114;
      let strongestDelta = 0;
      let strongestAlphaDelta = 0;
      if (x > 0) {
        const leftOffset = offset - 4;
        const leftLuminance =
          source.data[leftOffset] * 0.299 +
          source.data[leftOffset + 1] * 0.587 +
          source.data[leftOffset + 2] * 0.114;
        strongestDelta = Math.abs(currentLuminance - leftLuminance);
        strongestAlphaDelta = Math.abs(
          alpha - source.data[leftOffset + 3],
        );
        const directionalDelta = Math.max(
          Math.abs(red - source.data[leftOffset]),
          Math.abs(green - source.data[leftOffset + 1]),
          Math.abs(blue - source.data[leftOffset + 2]),
          Math.abs(alpha - source.data[leftOffset + 3]),
        );
        if (directionalDelta >= IMPLICIT_DIRECTIONAL_EDGE_DELTA) {
          verticalLines[x] += 1;
        }
      }
      if (y > 0) {
        const aboveOffset = offset - source.width * 4;
        const aboveLuminance =
          source.data[aboveOffset] * 0.299 +
          source.data[aboveOffset + 1] * 0.587 +
          source.data[aboveOffset + 2] * 0.114;
        strongestDelta = Math.max(
          strongestDelta,
          Math.abs(currentLuminance - aboveLuminance),
        );
        strongestAlphaDelta = Math.max(
          strongestAlphaDelta,
          Math.abs(alpha - source.data[aboveOffset + 3]),
        );
        const directionalDelta = Math.max(
          Math.abs(red - source.data[aboveOffset]),
          Math.abs(green - source.data[aboveOffset + 1]),
          Math.abs(blue - source.data[aboveOffset + 2]),
          Math.abs(alpha - source.data[aboveOffset + 3]),
        );
        if (directionalDelta >= IMPLICIT_DIRECTIONAL_EDGE_DELTA) {
          horizontalLines[y] += 1;
        }
      }
      if (
        strongestDelta >= IMPLICIT_GRID_EDGE_DELTA ||
        strongestAlphaDelta >= 96
      ) {
        horizontal[y] += 1;
        vertical[x] += 1;
      }
    }
  }
  return {
    horizontal: horizontal.map((count) => count / source.width),
    vertical: vertical.map((count) => count / source.height),
    horizontalLines: horizontalLines.map(
      (count) => count / source.width,
    ),
    verticalLines: verticalLines.map(
      (count) => count / source.height,
    ),
  };
}

function localEdgeMask(source: Raster): Uint8Array {
  const edges = new Uint8Array(source.width * source.height);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = pixelOffset(source, x, y);
      let strongestDelta = 0;
      if (x > 0) {
        const leftOffset = offset - 4;
        strongestDelta = Math.max(
          Math.abs(source.data[offset] - source.data[leftOffset]),
          Math.abs(
            source.data[offset + 1] - source.data[leftOffset + 1],
          ),
          Math.abs(
            source.data[offset + 2] - source.data[leftOffset + 2],
          ),
          Math.abs(
            source.data[offset + 3] - source.data[leftOffset + 3],
          ),
        );
      }
      if (y > 0) {
        const aboveOffset = offset - source.width * 4;
        strongestDelta = Math.max(
          strongestDelta,
          Math.abs(source.data[offset] - source.data[aboveOffset]),
          Math.abs(
            source.data[offset + 1] - source.data[aboveOffset + 1],
          ),
          Math.abs(
            source.data[offset + 2] - source.data[aboveOffset + 2],
          ),
          Math.abs(
            source.data[offset + 3] - source.data[aboveOffset + 3],
          ),
        );
      }
      edges[y * source.width + x] = Number(
        strongestDelta >= IMPLICIT_PERIODIC_EDGE_DELTA,
      );
    }
  }
  return edges;
}

function smoothValues(
  values: readonly number[],
  windowSize: number,
): number[] {
  const prefix = [0];
  for (const value of values) {
    prefix.push(prefix[prefix.length - 1] + value);
  }
  const before = Math.floor(windowSize / 2);
  const after = windowSize - before;
  return values.map((_value, index) => {
    const start = Math.max(0, index - before);
    const end = Math.min(values.length, index + after);
    return (prefix[end] - prefix[start]) / Math.max(1, end - start);
  });
}

function edgePeriodicityScores(
  edges: Uint8Array,
  width: number,
  height: number,
  shift: number,
  axis: "x" | "y",
  crossStart = 0,
  crossEnd = axis === "y" ? width : height,
): number[] {
  if (axis === "y") {
    const startX = clamp(Math.floor(crossStart), 0, width);
    const endX = clamp(Math.ceil(crossEnd), startX + 1, width);
    const scores = Array.from(
      { length: Math.max(0, height - shift) },
      () => 0,
    );
    for (let y = 0; y < scores.length; y += 1) {
      let matches = 0;
      const firstRow = y * width;
      const secondRow = (y + shift) * width;
      for (let x = startX; x < endX; x += 1) {
        matches += Number(
          edges[firstRow + x] > 0 && edges[secondRow + x] > 0,
        );
      }
      scores[y] = matches / Math.max(1, endX - startX);
    }
    return smoothValues(scores, shift);
  }
  const startY = clamp(Math.floor(crossStart), 0, height);
  const endY = clamp(Math.ceil(crossEnd), startY + 1, height);
  const scores = Array.from(
    { length: Math.max(0, width - shift) },
    () => 0,
  );
  for (let x = 0; x < scores.length; x += 1) {
    let matches = 0;
    for (let y = startY; y < endY; y += 1) {
      const rowOffset = y * width;
      matches += Number(
        edges[rowOffset + x] > 0 &&
          edges[rowOffset + x + shift] > 0,
      );
    }
    scores[x] = matches / Math.max(1, endY - startY);
  }
  return smoothValues(scores, shift);
}

function periodicScoreThreshold(
  values: readonly number[],
): { threshold: number; contrast: number } | null {
  if (values.length < 8) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  let low = sorted[Math.floor(sorted.length * 0.25)];
  let high = sorted[Math.floor(sorted.length * 0.75)];
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let lowSum = 0;
    let lowCount = 0;
    let highSum = 0;
    let highCount = 0;
    for (const value of values) {
      if (Math.abs(value - low) <= Math.abs(value - high)) {
        lowSum += value;
        lowCount += 1;
      } else {
        highSum += value;
        highCount += 1;
      }
    }
    if (lowCount === 0 || highCount === 0) {
      return null;
    }
    const nextLow = lowSum / lowCount;
    const nextHigh = highSum / highCount;
    if (Math.abs(nextLow - low) + Math.abs(nextHigh - high) < 1e-6) {
      low = nextLow;
      high = nextHigh;
      break;
    }
    low = nextLow;
    high = nextHigh;
  }
  if (low > high) {
    [low, high] = [high, low];
  }
  const contrast = high - low;
  if (contrast < 0.035) {
    return null;
  }
  return { threshold: (low + high) / 2, contrast };
}

function longestSpanWithBridgedGaps(
  active: readonly boolean[],
  maximumGap: number,
): { start: number; end: number } | null {
  const bridged = [...active];
  let index = 0;
  while (index < bridged.length) {
    if (bridged[index]) {
      index += 1;
      continue;
    }
    const gapStart = index;
    while (index < bridged.length && !bridged[index]) {
      index += 1;
    }
    if (
      gapStart > 0 &&
      index < bridged.length &&
      index - gapStart <= maximumGap
    ) {
      bridged.fill(true, gapStart, index);
    }
  }
  let best: { start: number; end: number } | null = null;
  index = 0;
  while (index < bridged.length) {
    if (!bridged[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < bridged.length && bridged[index]) {
      index += 1;
    }
    if (!best || index - start > best.end - best.start) {
      best = { start, end: index };
    }
  }
  return best;
}

function periodicRegionSpan(
  values: readonly number[],
  pitch: number,
): { start: number; end: number; confidence: number } | null {
  const clustered = periodicScoreThreshold(values);
  if (!clustered) {
    return null;
  }
  const active = values.map((value) => value >= clustered.threshold);
  const span = longestSpanWithBridgedGaps(
    active,
    Math.max(1, Math.round(pitch)),
  );
  if (!span || span.end - span.start < pitch * 4) {
    return null;
  }
  const confidence = clamp(
    (clustered.contrast / 0.25) * 0.7 +
      Math.min(1, (span.end - span.start) / (pitch * 12)) * 0.3,
    0,
    1,
  );
  return { ...span, confidence };
}

function implicitPeriodicRegion(
  source: Raster,
  pitch: number,
): ImplicitPeriodicRegion | null {
  const shift = Math.max(1, Math.round(pitch));
  const edges = localEdgeMask(source);
  let rowSpan = periodicRegionSpan(
    edgePeriodicityScores(
      edges,
      source.width,
      source.height,
      shift,
      "y",
    ),
    pitch,
  );
  let columnSpan = periodicRegionSpan(
    edgePeriodicityScores(
      edges,
      source.width,
      source.height,
      shift,
      "x",
    ),
    pitch,
  );
  if (rowSpan) {
    const refinedColumns = periodicRegionSpan(
      edgePeriodicityScores(
        edges,
        source.width,
        source.height,
        shift,
        "x",
        rowSpan.start,
        rowSpan.end,
      ),
      pitch,
    );
    if (
      refinedColumns &&
      (!columnSpan ||
        refinedColumns.end - refinedColumns.start >
          columnSpan.end - columnSpan.start)
    ) {
      columnSpan = refinedColumns;
    }
  }
  if (columnSpan) {
    const refinedRows = periodicRegionSpan(
      edgePeriodicityScores(
        edges,
        source.width,
        source.height,
        shift,
        "y",
        columnSpan.start,
        columnSpan.end,
      ),
      pitch,
    );
    if (
      refinedRows &&
      (!rowSpan ||
        refinedRows.end - refinedRows.start > rowSpan.end - rowSpan.start)
    ) {
      rowSpan = refinedRows;
    }
  }
  if (!rowSpan || !columnSpan) {
    return null;
  }
  return {
    xStart: columnSpan.start,
    xEnd: columnSpan.end,
    yStart: rowSpan.start,
    yEnd: rowSpan.end,
    confidence: (rowSpan.confidence + columnSpan.confidence) / 2,
  };
}

function implicitBrightPanel(source: Raster): ImplicitBrightPanel | null {
  const isBrightNeutral = (offset: number): boolean => {
    if (source.data[offset + 3] < 128) {
      return false;
    }
    const red = source.data[offset];
    const green = source.data[offset + 1];
    const blue = source.data[offset + 2];
    return (
      Math.min(red, green, blue) >= 225 &&
      Math.max(red, green, blue) - Math.min(red, green, blue) <= 32
    );
  };
  const activeRows = Array.from({ length: source.height }, (_unused, y) => {
    let bright = 0;
    for (let x = 0; x < source.width; x += 1) {
      bright += Number(isBrightNeutral(pixelOffset(source, x, y)));
    }
    return bright / source.width >= 0.38;
  });
  const rowSpan = longestSpanWithBridgedGaps(
    activeRows,
    Math.max(2, Math.floor(source.height * 0.06)),
  );
  if (!rowSpan || rowSpan.end - rowSpan.start < source.height * 0.2) {
    return null;
  }
  const activeColumns = Array.from(
    { length: source.width },
    (_unused, x) => {
      let bright = 0;
      for (let y = rowSpan.start; y < rowSpan.end; y += 1) {
        bright += Number(isBrightNeutral(pixelOffset(source, x, y)));
      }
      return bright / Math.max(1, rowSpan.end - rowSpan.start) >= 0.32;
    },
  );
  const columnSpan = longestSpanWithBridgedGaps(
    activeColumns,
    Math.max(2, Math.floor(source.width * 0.03)),
  );
  if (
    !columnSpan ||
    columnSpan.end - columnSpan.start < source.width * 0.45
  ) {
    return null;
  }
  const horizontalCoverage =
    (columnSpan.end - columnSpan.start) / source.width;
  const verticalCoverage = (rowSpan.end - rowSpan.start) / source.height;
  const verticalMargin = Math.min(
    rowSpan.start,
    source.height - rowSpan.end,
  );
  if (
    horizontalCoverage < 0.85 ||
    verticalCoverage > 0.82 ||
    verticalMargin < source.height * 0.08
  ) {
    return null;
  }
  const coverage =
    (verticalCoverage + horizontalCoverage) /
    2;
  return {
    xStart: columnSpan.start,
    xEnd: columnSpan.end,
    yStart: rowSpan.start,
    yEnd: rowSpan.end,
    confidence: clamp(0.55 + coverage * 0.4, 0, 0.95),
  };
}

function projectionCorrelation(
  values: readonly number[],
  lag: number,
): number {
  const count = values.length - lag;
  if (count < 2) {
    return 0;
  }
  const mean =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < count; index += 1) {
    const left = values[index] - mean;
    const right = values[index + lag] - mean;
    numerator += left * right;
    leftSquared += left * left;
    rightSquared += right * right;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator > 0 ? numerator / denominator : 0;
}

function implicitGridPitch(
  horizontal: readonly number[],
  vertical: readonly number[],
): ImplicitGridPitch | null {
  const maximumPitch = Math.min(
    IMPLICIT_GRID_MAX_PITCH,
    Math.floor(Math.min(horizontal.length, vertical.length) / 4),
  );
  const candidates: ImplicitGridPitch[] = [];
  for (
    let pitch = IMPLICIT_GRID_MIN_PITCH;
    pitch <= maximumPitch;
    pitch += 1
  ) {
    const horizontalCorrelation = projectionCorrelation(
      horizontal,
      pitch,
    );
    const verticalCorrelation = projectionCorrelation(vertical, pitch);
    if (
      horizontalCorrelation < IMPLICIT_GRID_MIN_CORRELATION ||
      verticalCorrelation < IMPLICIT_GRID_MIN_CORRELATION
    ) {
      continue;
    }
    candidates.push({
      pitch,
      confidence: (horizontalCorrelation + verticalCorrelation) / 2,
    });
  }
  const best = candidates.sort(
    (left, right) =>
      right.confidence - left.confidence || left.pitch - right.pitch,
  )[0];
  if (!best) {
    return null;
  }
  const smallerFundamental = candidates
    .filter(
      (candidate) =>
        candidate.pitch < best.pitch &&
        Math.abs(
          best.pitch / candidate.pitch -
            Math.round(best.pitch / candidate.pitch),
        ) <= 0.2 &&
        candidate.confidence >=
          Math.max(
            IMPLICIT_GRID_MIN_CORRELATION,
            best.confidence * 0.62,
          ),
    )
    .sort((left, right) => left.pitch - right.pitch)[0];
  if (!smallerFundamental) {
    const secondHarmonic = candidates.find(
      (candidate) =>
        Math.abs(candidate.pitch - best.pitch * 2) <= 1 &&
        candidate.confidence >= best.confidence * 0.9,
    );
    const thirdHarmonic = candidates.find(
      (candidate) =>
        Math.abs(candidate.pitch - best.pitch * 3) <= 1 &&
        candidate.confidence >= best.confidence * 0.85,
    );
    const alternatingFundamental = best.pitch / 2;
    if (
      secondHarmonic &&
      thirdHarmonic &&
      alternatingFundamental >= IMPLICIT_GRID_MIN_PITCH
    ) {
      return {
        pitch: alternatingFundamental,
        confidence:
          (best.confidence +
            secondHarmonic.confidence +
            thirdHarmonic.confidence) /
          3,
        inferredAlternating: true,
        fallbackPitch: best,
      };
    }
    return best;
  }
  const harmonic = Math.max(
    1,
    Math.round(best.pitch / smallerFundamental.pitch),
  );
  const fundamentalPitch = best.pitch / harmonic;
  if (fundamentalPitch < IMPLICIT_GRID_MIN_PITCH) {
    return best;
  }
  return {
    pitch: fundamentalPitch,
    confidence: (best.confidence + smallerFundamental.confidence) / 2,
  };
}

function directionalHalfPitch(
  projections: ReturnType<typeof edgeProjections>,
  pitchResult: ImplicitGridPitch,
): ImplicitGridPitch | null {
  if (pitchResult.inferredAlternating) {
    return null;
  }
  const confidenceAt = (lag: number): number =>
    (projectionCorrelation(projections.horizontalLines, lag) +
      projectionCorrelation(projections.verticalLines, lag)) /
    2;
  const pitch = pitchResult.pitch;
  const halfPitch = pitch / 2;
  if (halfPitch < IMPLICIT_GRID_MIN_PITCH) {
    return null;
  }
  const baseConfidence = confidenceAt(Math.round(pitch));
  const secondConfidence = confidenceAt(Math.round(pitch * 2));
  const thirdConfidence = confidenceAt(Math.round(pitch * 3));
  const halfConfidence = Math.max(
    confidenceAt(Math.floor(halfPitch)),
    confidenceAt(Math.ceil(halfPitch)),
  );
  if (
    baseConfidence < 0.55 ||
    secondConfidence < baseConfidence * 0.88 ||
    thirdConfidence < baseConfidence * 0.78 ||
    halfConfidence < 0.34
  ) {
    return null;
  }
  return {
    pitch: halfPitch,
    confidence: clamp(
      pitchResult.confidence * 0.72 + halfConfidence * 0.28,
      0,
      1,
    ),
    preferLineLattice: true,
  };
}

function projectionAt(
  projection: readonly number[],
  coordinate: number,
): number {
  const left = clamp(
    Math.floor(coordinate),
    0,
    projection.length - 1,
  );
  const right = clamp(left + 1, 0, projection.length - 1);
  const fraction = clamp(coordinate - left, 0, 1);
  return projection[left] * (1 - fraction) + projection[right] * fraction;
}

function normalizeGridPhase(value: number, pitch: number): number {
  const normalized = ((value % pitch) + pitch) % pitch;
  return normalized > pitch / 2 ? normalized - pitch : normalized;
}

interface DirectionalLatticeFit {
  dataCells: number;
  pitch: number;
  phase: number;
  score: number;
  lineStrength: number;
  flankStrength: number;
}

function fitDirectionalLattice(
  projection: readonly number[],
  nominalPitch: number,
  approximateOuterStart: number,
  currentDataCells: number,
): DirectionalLatticeFit | null {
  const bestBySize: DirectionalLatticeFit[] = [];
  const pitchStep = Math.max(0.05, nominalPitch * 0.0025);
  const minimumPitch = nominalPitch * 0.94;
  const maximumPitch = nominalPitch * 1.06;
  for (
    let dataCells = Math.max(4, currentDataCells - 2);
    dataCells <= currentDataCells + 2;
    dataCells += 1
  ) {
    const intervals = dataCells + 2;
    let bestForSize: DirectionalLatticeFit | null = null;
    for (
      let pitch = minimumPitch;
      pitch <= maximumPitch;
      pitch += pitchStep
    ) {
      for (
        let start = approximateOuterStart - nominalPitch * 2;
        start <= approximateOuterStart + nominalPitch * 2;
        start += 0.25
      ) {
        const end = start + intervals * pitch;
        if (start < -2 || end > projection.length + 2) {
          continue;
        }
        let lineStrength = 0;
        let flankStrength = 0;
        for (let index = 0; index <= intervals; index += 1) {
          const boundary = start + index * pitch;
          lineStrength += Math.max(
            projectionAt(projection, boundary - 1),
            projectionAt(projection, boundary),
            projectionAt(projection, boundary + 1),
          );
          if (index < intervals) {
            flankStrength += projectionAt(
              projection,
              boundary + pitch * 0.3,
            );
            flankStrength += projectionAt(
              projection,
              boundary + pitch * 0.7,
            );
          }
        }
        lineStrength /= intervals + 1;
        flankStrength /= intervals * 2;
        const score =
          lineStrength -
          flankStrength * 0.65 -
          (Math.abs(pitch - nominalPitch) / nominalPitch) * 0.04;
        if (!bestForSize || score > bestForSize.score) {
          bestForSize = {
            dataCells,
            pitch,
            phase: normalizeGridPhase(start, pitch),
            score,
            lineStrength,
            flankStrength,
          };
        }
      }
    }
    if (bestForSize) {
      bestBySize.push(bestForSize);
    }
  }
  const strongest = [...bestBySize].sort(
    (left, right) => right.score - left.score,
  )[0];
  const scoreTolerance = strongest
    ? Math.max(0.006, strongest.score * 0.015)
    : 0;
  const best = strongest
    ? bestBySize
        .filter((fit) => fit.score >= strongest.score - scoreTolerance)
        .sort((left, right) => right.dataCells - left.dataCells)[0]
    : null;
  if (
    !best ||
    best.score < 0.3 ||
    best.lineStrength < 0.55 ||
    best.lineStrength - best.flankStrength < 0.16
  ) {
    return null;
  }
  return best;
}

function directionalPhaseDistance(
  coordinate: number,
  fit: DirectionalLatticeFit,
): number {
  return gridPhaseDistance(coordinate, fit.phase, fit.pitch);
}

function gridPhaseDistance(
  coordinate: number,
  phase: number,
  pitch: number,
): number {
  return Math.abs(
    normalizeGridPhase(coordinate - phase, pitch),
  );
}

interface DirectionalPhaseEvidence {
  phase: number;
  score: number;
}

function directionalPhaseEvidence(
  projection: readonly number[],
  pitch: number,
): DirectionalPhaseEvidence | null {
  const phase = implicitBoundaryPhases(projection, pitch)[0];
  if (phase === undefined) {
    return null;
  }
  let lineStrength = 0;
  let flankStrength = 0;
  let intervals = 0;
  let boundary = phase;
  while (boundary < 0) {
    boundary += pitch;
  }
  for (; boundary < projection.length; boundary += pitch) {
    lineStrength += Math.max(
      projectionAt(projection, boundary - 1),
      projectionAt(projection, boundary),
      projectionAt(projection, boundary + 1),
    );
    flankStrength += projectionAt(
      projection,
      boundary + pitch * 0.3,
    );
    flankStrength += projectionAt(
      projection,
      boundary + pitch * 0.7,
    );
    intervals += 1;
  }
  if (intervals === 0) {
    return null;
  }
  lineStrength /= intervals;
  flankStrength /= intervals * 2;
  const score = lineStrength - flankStrength * 0.65;
  if (
    score < 0.3 ||
    lineStrength < 0.55 ||
    lineStrength - flankStrength < 0.16 ||
    flankStrength > 0.25
  ) {
    return null;
  }
  return { phase, score };
}

function promoteLineLatticeCandidates(
  candidates: ImplicitGridCandidate[],
  projections: ReturnType<typeof edgeProjections>,
  pitch: number,
  possibleArea: number,
): void {
  for (const candidate of candidates) {
    const { suggestion } = candidate;
    const areaRatio =
      (suggestion.rows * suggestion.columns) /
      Math.max(1, possibleArea);
    if (areaRatio < 0.3) {
      continue;
    }
    const verticalFit = fitDirectionalLattice(
      projections.verticalLines,
      pitch,
      suggestion.geometry.originX - pitch,
      suggestion.columns,
    );
    const horizontalFit = fitDirectionalLattice(
      projections.horizontalLines,
      pitch,
      suggestion.geometry.originY - pitch,
      suggestion.rows,
    );
    const alignedFits = [
      verticalFit &&
      verticalFit.flankStrength <= 0.08 &&
      directionalPhaseDistance(
        suggestion.geometry.originX,
        verticalFit,
      ) <=
        pitch * 0.2
        ? verticalFit
        : null,
      horizontalFit &&
      horizontalFit.flankStrength <= 0.08 &&
      directionalPhaseDistance(
        suggestion.geometry.originY,
        horizontalFit,
      ) <=
        pitch * 0.2
        ? horizontalFit
        : null,
    ].filter((fit): fit is DirectionalLatticeFit => fit !== null);
    if (alignedFits.length === 0) {
      continue;
    }
    const lineEvidence =
      alignedFits.reduce((sum, fit) => sum + fit.score, 0) /
      alignedFits.length;
    candidate.evidence = Math.max(
      candidate.evidence,
      clamp(
        0.78 +
          alignedFits.length * 0.095 +
          lineEvidence * 0.08 +
          Math.min(1, areaRatio) * 0.035,
        0,
        1.04,
      ),
    );
    candidate.suggestion.confidence = Math.max(
      candidate.suggestion.confidence,
      clamp(
        0.58 +
          alignedFits.length * 0.08 +
          lineEvidence * 0.12,
        0,
        0.96,
      ),
    );
  }
}

function fusedDirectionalLatticeCandidate(
  candidates: readonly ImplicitGridCandidate[],
  projections: ReturnType<typeof edgeProjections>,
  pitchResult: ImplicitGridPitch,
  possibleArea: number,
  preliminaryBest: ImplicitGridCandidate | undefined,
): ImplicitGridCandidate | null {
  const pitch = pitchResult.pitch;
  const verticalEvidence = directionalPhaseEvidence(
    projections.verticalLines,
    pitch,
  );
  const horizontalEvidence = directionalPhaseEvidence(
    projections.horizontalLines,
    pitch,
  );
  if (!verticalEvidence || !horizontalEvidence) {
    return null;
  }
  const bestAxis = (
    axis: "horizontal" | "vertical",
  ):
    | {
        candidate: ImplicitGridCandidate;
        score: number;
        phaseQuality: number;
        coverage: number;
      }
    | undefined =>
    candidates
      .filter((candidate) => {
        const { suggestion } = candidate;
        const availableCells =
          axis === "vertical"
            ? Math.ceil(projections.verticalLines.length / pitch)
            : Math.ceil(projections.horizontalLines.length / pitch);
        const detectedCells =
          axis === "vertical"
            ? suggestion.columns
            : suggestion.rows;
        return detectedCells / Math.max(1, availableCells) >= 0.55;
      })
      .map((candidate) => {
        const { suggestion } = candidate;
        const evidence =
          axis === "vertical" ? verticalEvidence : horizontalEvidence;
        const coordinate =
          axis === "vertical"
            ? suggestion.geometry.originX
            : suggestion.geometry.originY;
        const phaseDistance = gridPhaseDistance(
          coordinate,
          evidence.phase,
          pitch,
        );
        if (phaseDistance > pitch * 0.2) {
          return null;
        }
        return {
          candidate,
          score: evidence.score,
          phaseQuality: 1 - phaseDistance / (pitch * 0.2),
          coverage:
            (axis === "vertical"
              ? suggestion.columns
              : suggestion.rows) /
            (axis === "vertical"
              ? Math.ceil(projections.verticalLines.length / pitch)
              : Math.ceil(
                  projections.horizontalLines.length / pitch,
                )),
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          candidate: ImplicitGridCandidate;
          score: number;
          phaseQuality: number;
          coverage: number;
        } => candidate !== null,
      )
      .sort(
        (left, right) =>
          right.score +
            right.phaseQuality * 0.2 +
            right.coverage * 0.3 +
            right.candidate.evidence * 0.02 -
          (left.score +
            left.phaseQuality * 0.2 +
            left.coverage * 0.3 +
            left.candidate.evidence * 0.02),
      )[0];
  const vertical = bestAxis("vertical");
  const horizontal = bestAxis("horizontal");
  if (!vertical || !horizontal) {
    return null;
  }
  const columnSuggestion = vertical.candidate.suggestion;
  const rowSuggestion = horizontal.candidate.suggestion;
  if (vertical.candidate === horizontal.candidate) {
    return null;
  }
  const fusedArea = rowSuggestion.rows * columnSuggestion.columns;
  const preliminaryArea = preliminaryBest
    ? preliminaryBest.suggestion.rows * preliminaryBest.suggestion.columns
    : 0;
  if (preliminaryArea > 0 && fusedArea < preliminaryArea * 1.25) {
    return null;
  }
  const directionalEvidence =
    (vertical.score + horizontal.score) / 2;
  return {
    suggestion: {
      rows: rowSuggestion.rows,
      columns: columnSuggestion.columns,
      geometry: {
        originX: columnSuggestion.geometry.originX,
        originY: rowSuggestion.geometry.originY,
        cellWidth: pitch,
        cellHeight: pitch,
      },
      confidence: clamp(
        pitchResult.confidence * 0.45 +
          directionalEvidence * 0.35 +
          (vertical.phaseQuality + horizontal.phaseQuality) * 0.09,
        0,
        0.96,
      ),
      validSquareGrid: true,
    },
    evidence: clamp(
      0.86 +
        directionalEvidence * 0.1 +
        Math.min(1, fusedArea / Math.max(1, possibleArea)) * 0.05,
      0,
      0.99,
    ),
    axisSupport: 2,
  };
}

function implicitBoundaryPhases(
  projection: readonly number[],
  pitch: number,
): number[] {
  const maximumLineWidth = Math.min(3, Math.max(1, Math.floor(pitch / 4)));
  const phaseStep = 0.25;
  let bestPhase = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let phase = 0; phase < pitch; phase += phaseStep) {
    for (let lineWidth = 1; lineWidth <= maximumLineWidth; lineWidth += 1) {
      let core = 0;
      let coreCount = 0;
      let flank = 0;
      let flankCount = 0;
      const flankWidth = Math.min(6, Math.floor(pitch / 3));
      for (
        let boundary = phase;
        boundary < projection.length;
        boundary += pitch
      ) {
        if (boundary < 0 || boundary >= projection.length) {
          continue;
        }
        for (let offset = 0; offset < lineWidth; offset += 1) {
          core += projectionAt(projection, boundary + offset);
          coreCount += 1;
        }
        for (
          let offset = lineWidth + 1;
          offset <= flankWidth;
          offset += 1
        ) {
          flank += projectionAt(projection, boundary + offset);
          flank += projectionAt(projection, boundary - offset);
          flankCount += 2;
        }
      }
      const score =
        core / Math.max(1, coreCount) -
        flank / Math.max(1, flankCount);
      if (score > bestScore) {
        bestScore = score;
        bestPhase = phase;
      }
    }
  }
  const phases = [
    normalizeGridPhase(bestPhase, pitch),
    normalizeGridPhase(bestPhase - pitch / 2, pitch),
  ];
  return phases.filter(
    (phase, index) =>
      phases.findIndex(
        (candidate) => Math.abs(candidate - phase) <= 0.2,
      ) === index,
  );
}

function longestActiveSpan(active: readonly boolean[]): {
  start: number;
  end: number;
} | null {
  const bridged = active.map(
    (value, index) =>
      value ||
      (index > 0 &&
        index + 1 < active.length &&
        active[index - 1] &&
        active[index + 1]),
  );
  let bestStart = -1;
  let bestEnd = -1;
  let runStart = -1;
  for (let index = 0; index <= bridged.length; index += 1) {
    if (index < bridged.length && bridged[index]) {
      if (runStart < 0) {
        runStart = index;
      }
      continue;
    }
    if (runStart >= 0) {
      let start = runStart;
      let end = index;
      while (start < end && !active[start]) start += 1;
      while (end > start && !active[end - 1]) end -= 1;
      if (end - start > bestEnd - bestStart) {
        bestStart = start;
        bestEnd = end;
      }
      runStart = -1;
    }
  }
  return bestStart >= 0 && bestEnd > bestStart
    ? { start: bestStart, end: bestEnd }
    : null;
}

function rangeDensity(
  values: readonly boolean[],
  start: number,
  end: number,
): number {
  if (end <= start) {
    return 0;
  }
  let matches = 0;
  for (let index = start; index < end; index += 1) {
    matches += Number(values[index]);
  }
  return matches / (end - start);
}

function densestLabelSpan(
  labeled: readonly boolean[],
): { start: number; end: number; density: number } | null {
  const prefix = [0];
  for (const value of labeled) {
    prefix.push(prefix[prefix.length - 1] + Number(value));
  }
  let best:
    | { start: number; end: number; density: number; score: number }
    | null = null;
  for (let start = 0; start <= labeled.length - 4; start += 1) {
    if (!labeled[start]) {
      continue;
    }
    for (let end = start + 4; end <= labeled.length; end += 1) {
      if (!labeled[end - 1]) {
        continue;
      }
      const length = end - start;
      const matches = prefix[end] - prefix[start];
      const density = matches / length;
      if (density < 0.65) {
        continue;
      }
      const score = matches - (length - matches) * 1.5;
      if (
        !best ||
        score > best.score ||
        (score === best.score && length > best.end - best.start)
      ) {
        best = { start, end, density, score };
      }
    }
  }
  return best
    ? { start: best.start, end: best.end, density: best.density }
    : null;
}

function columnDensity(
  labeled: readonly (readonly boolean[])[],
  column: number,
  rowStart: number,
  rowEnd: number,
): number | null {
  if (column < 0 || column >= (labeled[0]?.length ?? 0)) {
    return null;
  }
  let matches = 0;
  for (let row = rowStart; row < rowEnd; row += 1) {
    matches += Number(labeled[row][column]);
  }
  return matches / Math.max(1, rowEnd - rowStart);
}

interface ImplicitAxisPair {
  dataStart: number;
  dataEnd: number;
  crossStart: number;
  crossEnd: number;
  confidence: number;
  score: number;
}

function implicitAxisPairCandidates(
  labeled: readonly (readonly boolean[])[],
  samples: readonly (readonly CellSample[])[],
): ImplicitAxisPair[] {
  const rowSpans = labeled.map(densestLabelSpan);
  const candidates: ImplicitAxisPair[] = [];
  for (let top = 0; top < labeled.length - 4; top += 1) {
    const topSpan = rowSpans[top];
    if (!topSpan) {
      continue;
    }
    for (let bottom = top + 5; bottom < labeled.length; bottom += 1) {
      const bottomSpan = rowSpans[bottom];
      if (!bottomSpan) {
        continue;
      }
      if (
        Math.abs(topSpan.start - bottomSpan.start) > 1 ||
        Math.abs(topSpan.end - bottomSpan.end) > 1
      ) {
        continue;
      }
      let columnStart = Math.max(topSpan.start, bottomSpan.start);
      let columnEnd = Math.min(topSpan.end, bottomSpan.end);
      const rows = bottom - top - 1;
      const initialLeftAxisDensity = columnDensity(
        labeled,
        columnStart - 1,
        top + 1,
        bottom,
      );
      const unionStart = Math.min(topSpan.start, bottomSpan.start);
      if (unionStart < columnStart) {
        const expandedLeftAxisDensity = columnDensity(
          labeled,
          unionStart - 1,
          top + 1,
          bottom,
        );
        const initialCornerOccupancy =
          Number(labeled[top][columnStart - 1]) +
          Number(labeled[bottom][columnStart - 1]);
        const expandedCornerOccupancy =
          Number(labeled[top][unionStart - 1]) +
          Number(labeled[bottom][unionStart - 1]);
        if (
          (expandedLeftAxisDensity ?? 0) >= 0.65 &&
          ((expandedLeftAxisDensity ?? 0) >
            (initialLeftAxisDensity ?? 0) + 0.08 ||
            expandedCornerOccupancy < initialCornerOccupancy)
        ) {
          columnStart = unionStart;
        }
      }
      const initialRightAxisDensity = columnDensity(
        labeled,
        columnEnd,
        top + 1,
        bottom,
      );
      const unionEnd = Math.max(topSpan.end, bottomSpan.end);
      if (unionEnd > columnEnd) {
        const expandedRightAxisDensity = columnDensity(
          labeled,
          unionEnd,
          top + 1,
          bottom,
        );
        const initialCornerOccupancy =
          Number(labeled[top][columnEnd]) +
          Number(labeled[bottom][columnEnd]);
        const expandedCornerOccupancy =
          Number(labeled[top][unionEnd]) +
          Number(labeled[bottom][unionEnd]);
        if (
          (expandedRightAxisDensity ?? 0) >= 0.65 &&
          ((expandedRightAxisDensity ?? 0) >
            (initialRightAxisDensity ?? 0) + 0.08 ||
            expandedCornerOccupancy < initialCornerOccupancy)
        ) {
          columnEnd = unionEnd;
        }
      }
      const columns = columnEnd - columnStart;
      if (
        rows < 4 ||
        columns < 4 ||
        rows > MAX_BEAD_GRID_SIZE ||
        columns > MAX_BEAD_GRID_SIZE
      ) {
        continue;
      }
      const topDensity = rangeDensity(
        labeled[top],
        columnStart,
        columnEnd,
      );
      const bottomDensity = rangeDensity(
        labeled[bottom],
        columnStart,
        columnEnd,
      );
      if (topDensity < 0.65 || bottomDensity < 0.65) {
        continue;
      }
      let matchingBackgrounds = 0;
      for (let column = columnStart; column < columnEnd; column += 1) {
        matchingBackgrounds += Number(
          colorDistanceSquared(
            samples[top][column].color,
            samples[bottom][column].color,
          ) <=
            IMPLICIT_GRID_BACKGROUND_DISTANCE_SQUARED,
        );
      }
      const backgroundSimilarity =
        matchingBackgrounds / Math.max(1, columns);
      if (backgroundSimilarity < 0.55) {
        continue;
      }
      const leftAxisDensity = columnDensity(
        labeled,
        columnStart - 1,
        top + 1,
        bottom,
      );
      const rightAxisDensity = columnDensity(
        labeled,
        columnEnd,
        top + 1,
        bottom,
      );
      const availableSideDensities = [
        leftAxisDensity,
        rightAxisDensity,
      ].filter((density): density is number => density !== null);
      const strongestSideDensity = Math.max(
        ...availableSideDensities,
        0,
      );
      if (strongestSideDensity < 0.65) {
        continue;
      }
      const sideDensity =
        availableSideDensities.reduce(
          (sum, density) => sum + density,
          0,
        ) / Math.max(1, availableSideDensities.length);
      const cornerCoordinates = [
        [top, columnStart - 1],
        [top, columnEnd],
        [bottom, columnStart - 1],
        [bottom, columnEnd],
      ] as const;
      let visibleCorners = 0;
      let emptyCorners = 0;
      for (const [row, column] of cornerCoordinates) {
        if (column < 0 || column >= labeled[row].length) {
          continue;
        }
        visibleCorners += 1;
        emptyCorners += Number(!labeled[row][column]);
      }
      const cornerEvidence =
        visibleCorners > 0 ? emptyCorners / visibleCorners : 0;
      const spanAgreement =
        1 -
        (Math.abs(topSpan.start - bottomSpan.start) +
          Math.abs(topSpan.end - bottomSpan.end)) /
          4;
      const structuralConfidence =
        ((topDensity + bottomDensity) / 2) * 0.25 +
        strongestSideDensity * 0.25 +
        sideDensity * 0.1 +
        cornerEvidence * 0.15 +
        spanAgreement * 0.1 +
        backgroundSimilarity * 0.15;
      const confidence = clamp(structuralConfidence, 0, 1);
      candidates.push({
        dataStart: top + 1,
        dataEnd: bottom,
        crossStart: columnStart,
        crossEnd: columnEnd,
        confidence,
        score:
          confidence +
          Math.min(0.08, (rows * columns) / 40_000),
      });
    }
  }
  const ranked = candidates.sort(
    (left, right) =>
      right.score - left.score ||
      (right.dataEnd - right.dataStart) *
        (right.crossEnd - right.crossStart) -
        (left.dataEnd - left.dataStart) *
          (left.crossEnd - left.crossStart),
  );
  return ranked;
}

function implicitCoordinateFrame(
  labeled: readonly (readonly boolean[])[],
  samples: readonly (readonly CellSample[])[],
): ImplicitCoordinateFrame | null {
  const horizontal = implicitAxisPairCandidates(labeled, samples).slice(
    0,
    64,
  );
  const transposed = Array.from(
    { length: labeled[0]?.length ?? 0 },
    (_unused, column) => labeled.map((row) => row[column]),
  );
  const transposedSamples = Array.from(
    { length: samples[0]?.length ?? 0 },
    (_unused, column) => samples.map((row) => row[column]),
  );
  const vertical = implicitAxisPairCandidates(
    transposed,
    transposedSamples,
  ).slice(0, 64);
  const matched: Array<ImplicitCoordinateFrame & { score: number }> = [];
  for (const rowFrame of horizontal) {
    for (const columnFrame of vertical) {
      const deltas = [
        Math.abs(rowFrame.dataStart - columnFrame.crossStart),
        Math.abs(rowFrame.dataEnd - columnFrame.crossEnd),
        Math.abs(rowFrame.crossStart - columnFrame.dataStart),
        Math.abs(rowFrame.crossEnd - columnFrame.dataEnd),
      ];
      if (deltas.some((delta) => delta > 1)) {
        continue;
      }
      const rowStart = Math.round(
        (rowFrame.dataStart + columnFrame.crossStart) / 2,
      );
      const rowEnd = Math.round(
        (rowFrame.dataEnd + columnFrame.crossEnd) / 2,
      );
      const columnStart = Math.round(
        (rowFrame.crossStart + columnFrame.dataStart) / 2,
      );
      const columnEnd = Math.round(
        (rowFrame.crossEnd + columnFrame.dataEnd) / 2,
      );
      const boundaryError = deltas.reduce(
        (sum, delta) => sum + delta,
        0,
      );
      const confidence = clamp(
        (rowFrame.confidence + columnFrame.confidence) / 2 -
          boundaryError * 0.025,
        0,
        1,
      );
      matched.push({
        rowStart,
        rowEnd,
        columnStart,
        columnEnd,
        confidence,
        axisSupport: 2,
        score:
          confidence +
          Math.min(
            0.08,
            ((rowEnd - rowStart) * (columnEnd - columnStart)) /
              40_000,
          ),
      });
    }
  }
  const matrixArea = Math.max(
    1,
    labeled.length * (labeled[0]?.length ?? 0),
  );
  const frames: Array<ImplicitCoordinateFrame & { score: number }> = [
    ...horizontal.map((candidate) => ({
      rowStart: candidate.dataStart,
      rowEnd: candidate.dataEnd,
      columnStart: candidate.crossStart,
      columnEnd: candidate.crossEnd,
      confidence: candidate.confidence,
      axisSupport: 1 as const,
      score: 0,
    })),
    ...vertical.map((candidate) => ({
      rowStart: candidate.crossStart,
      rowEnd: candidate.crossEnd,
      columnStart: candidate.dataStart,
      columnEnd: candidate.dataEnd,
      confidence: candidate.confidence,
      axisSupport: 1 as const,
      score: 0,
    })),
    ...matched.map((candidate) => ({ ...candidate })),
  ];
  for (const frame of frames) {
    const area =
      (frame.rowEnd - frame.rowStart) *
      (frame.columnEnd - frame.columnStart);
    frame.score =
      frame.confidence * 0.78 +
      Math.sqrt(clamp(area / matrixArea, 0, 1)) * 0.22 +
      (frame.axisSupport === 2 ? 0.075 : 0);
  }
  const rankedFrames = frames.sort(
    (left, right) =>
      right.score - left.score ||
      (right.rowEnd - right.rowStart) *
        (right.columnEnd - right.columnStart) -
        (left.rowEnd - left.rowStart) *
          (left.columnEnd - left.columnStart),
  );
  const best = rankedFrames[0];
  return best
    ? {
        rowStart: best.rowStart,
        rowEnd: best.rowEnd,
        columnStart: best.columnStart,
        columnEnd: best.columnEnd,
        confidence: best.confidence,
        axisSupport: best.axisSupport,
      }
    : null;
}

function centeredLabelEvidence(
  samples: readonly (readonly CellSample[])[],
  labeled: readonly (readonly boolean[])[],
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
): number {
  let centralStructure = 0;
  let peripheralStructure = 0;
  let labelCount = 0;
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let column = columnStart; column < columnEnd; column += 1) {
      if (!labeled[row][column]) {
        continue;
      }
      centralStructure += samples[row][column].centralStructureRatio;
      peripheralStructure +=
        samples[row][column].peripheralStructureRatio;
      labelCount += 1;
    }
  }
  return clamp(
    (centralStructure - peripheralStructure) /
      Math.max(1, labelCount) /
      0.18,
    0,
    1,
  );
}

function trimSurroundingNumberAxes(
  labeled: readonly (readonly boolean[])[],
  rowSpan: { start: number; end: number },
  columnSpan: { start: number; end: number },
): {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
  axisCount: number;
} {
  const { start: rowStart, end: rowEnd } = rowSpan;
  const { start: columnStart, end: columnEnd } = columnSpan;
  const rowIsAxis = (row: number, adjacentRow: number): boolean => {
    if (columnEnd - columnStart < 4) {
      return false;
    }
    const cornersEmpty =
      !labeled[row][columnStart] &&
      !labeled[row][columnEnd - 1];
    const innerDensity = rangeDensity(
      labeled[row],
      columnStart + 1,
      columnEnd - 1,
    );
    const adjacentCorners =
      Number(labeled[adjacentRow][columnStart]) +
      Number(labeled[adjacentRow][columnEnd - 1]);
    return cornersEmpty && innerDensity >= 0.65 && adjacentCorners >= 1;
  };
  const strictTrimTop =
    rowStart + 1 < rowEnd && rowIsAxis(rowStart, rowStart + 1);
  const strictTrimBottom =
    rowEnd - 2 >= rowStart && rowIsAxis(rowEnd - 1, rowEnd - 2);
  const columnIsAxis = (
    column: number,
    adjacentColumn: number,
  ): boolean => {
    if (rowEnd - rowStart < 4) {
      return false;
    }
    const cornersEmpty =
      !labeled[rowStart][column] &&
      !labeled[rowEnd - 1][column];
    let labels = 0;
    for (let row = rowStart + 1; row < rowEnd - 1; row += 1) {
      labels += Number(labeled[row][column]);
    }
    const innerDensity =
      labels / Math.max(1, rowEnd - rowStart - 2);
    const adjacentCorners =
      Number(labeled[rowStart][adjacentColumn]) +
      Number(labeled[rowEnd - 1][adjacentColumn]);
    return cornersEmpty && innerDensity >= 0.65 && adjacentCorners >= 1;
  };
  const strictTrimLeft =
    columnStart + 1 < columnEnd &&
    columnIsAxis(columnStart, columnStart + 1);
  const strictTrimRight =
    columnEnd - 2 >= columnStart &&
    columnIsAxis(columnEnd - 1, columnEnd - 2);
  const rowInnerDensity = (row: number): number =>
    rangeDensity(labeled[row], columnStart + 1, columnEnd - 1);
  const columnInnerDensity = (column: number): number => {
    let labels = 0;
    for (let row = rowStart + 1; row < rowEnd - 1; row += 1) {
      labels += Number(labeled[row][column]);
    }
    return labels / Math.max(1, rowEnd - rowStart - 2);
  };
  const rowLabelCount = (row: number): number => {
    let labels = 0;
    for (let column = columnStart; column < columnEnd; column += 1) {
      labels += Number(labeled[row][column]);
    }
    return labels;
  };
  const columnLabelCount = (column: number): number => {
    let labels = 0;
    for (let row = rowStart; row < rowEnd; row += 1) {
      labels += Number(labeled[row][column]);
    }
    return labels;
  };
  const hasAnyColumnAxis = strictTrimLeft || strictTrimRight;
  const hasAnyRowAxis = strictTrimTop || strictTrimBottom;
  const trimTop =
    strictTrimTop ||
    (hasAnyColumnAxis &&
      rowInnerDensity(rowStart) >= 0.65 &&
      rowLabelCount(rowStart) < rowLabelCount(rowStart + 1));
  const trimBottom =
    strictTrimBottom ||
    (hasAnyColumnAxis &&
      rowInnerDensity(rowEnd - 1) >= 0.65 &&
      rowLabelCount(rowEnd - 1) < rowLabelCount(rowEnd - 2));
  const trimLeft =
    strictTrimLeft ||
    (hasAnyRowAxis &&
      columnInnerDensity(columnStart) >= 0.65 &&
      columnLabelCount(columnStart) <
        columnLabelCount(columnStart + 1));
  const trimRight =
    strictTrimRight ||
    (hasAnyRowAxis &&
      columnInnerDensity(columnEnd - 1) >= 0.65 &&
      columnLabelCount(columnEnd - 1) <
        columnLabelCount(columnEnd - 2));
  return {
    rowStart: rowStart + Number(trimTop),
    rowEnd: rowEnd - Number(trimBottom),
    columnStart: columnStart + Number(trimLeft),
    columnEnd: columnEnd - Number(trimRight),
    axisCount:
      Number(trimTop) +
      Number(trimBottom) +
      Number(trimLeft) +
      Number(trimRight),
  };
}

function implicitCandidateForGeometry(
  source: Raster,
  pitchResult: ImplicitGridPitch,
  originX: number,
  originY: number,
): ImplicitGridCandidate | null {
  const pitch = pitchResult.pitch;
  const sheetColumns = Math.ceil((source.width - originX) / pitch);
  const sheetRows = Math.ceil((source.height - originY) / pitch);
  if (
    sheetColumns < 4 ||
    sheetRows < 4 ||
    sheetColumns > MAX_BEAD_GRID_SIZE + 8 ||
    sheetRows > MAX_BEAD_GRID_SIZE + 16
  ) {
    return null;
  }
  const sheetGeometry: BeadGridGeometry = {
    originX,
    originY,
    cellWidth: pitch,
    cellHeight: pitch,
  };
  const samples: CellSample[][] = Array.from(
    { length: sheetRows },
    (_unused, row) =>
      Array.from({ length: sheetColumns }, (_unusedColumn, column) =>
        sampleNumberedCell(
          source,
          cellBounds(sheetGeometry, row, column, source),
        ),
      ),
  );
  const labeled = samples.map((row) =>
    row.map(hasCenteredNumberedLabel),
  );
  const coordinateFrame = implicitCoordinateFrame(labeled, samples);
  if (coordinateFrame) {
    if (
      pitchResult.inferredAlternating &&
      coordinateFrame.axisSupport !== 2
    ) {
      return null;
    }
    const rows = coordinateFrame.rowEnd - coordinateFrame.rowStart;
    const columns =
      coordinateFrame.columnEnd - coordinateFrame.columnStart;
    const alignment = centeredLabelEvidence(
      samples,
      labeled,
      Math.max(0, coordinateFrame.rowStart - 1),
      Math.min(samples.length, coordinateFrame.rowEnd + 1),
      Math.max(0, coordinateFrame.columnStart - 1),
      Math.min(
        samples[0]?.length ?? 0,
        coordinateFrame.columnEnd + 1,
      ),
    );
    if (pitchResult.inferredAlternating && alignment < 0.75) {
      return null;
    }
    return {
      suggestion: {
        rows,
        columns,
        geometry: {
          originX: originX + coordinateFrame.columnStart * pitch,
          originY: originY + coordinateFrame.rowStart * pitch,
          cellWidth: pitch,
          cellHeight: pitch,
        },
        confidence: clamp(
          pitchResult.confidence * 0.55 +
            coordinateFrame.confidence * 0.3 +
            alignment * 0.13,
          0,
          0.98,
        ),
        validSquareGrid: true,
      },
      evidence:
        coordinateFrame.confidence * 0.72 +
        alignment * 0.23 +
        pitchResult.confidence * 0.05 +
        (coordinateFrame.axisSupport === 2 ? 0.08 : 0),
      axisSupport: coordinateFrame.axisSupport,
    };
  }
  if (pitchResult.inferredAlternating) {
    return null;
  }
  const rowCounts = labeled.map(
    (row) => row.filter(Boolean).length,
  );
  const maximumRowCount = Math.max(...rowCounts, 0);
  const rowSpan = longestActiveSpan(
    rowCounts.map(
      (count) =>
        count >= Math.max(4, Math.ceil(maximumRowCount * 0.55)),
    ),
  );
  if (rowSpan && rowSpan.end - rowSpan.start >= 4) {
    const columnCounts = Array.from(
      { length: sheetColumns },
      (_unused, column) => {
        let count = 0;
        for (let row = rowSpan.start; row < rowSpan.end; row += 1) {
          count += Number(labeled[row][column]);
        }
        return count;
      },
    );
    const maximumColumnCount = Math.max(...columnCounts, 0);
    const columnSpan = longestActiveSpan(
      columnCounts.map(
        (count) =>
          count >= Math.max(
            4,
            Math.ceil(maximumColumnCount * 0.55),
          ),
      ),
    );
    if (columnSpan && columnSpan.end - columnSpan.start >= 4) {
      const trimmed = trimSurroundingNumberAxes(
        labeled,
        rowSpan,
        columnSpan,
      );
      const rows = trimmed.rowEnd - trimmed.rowStart;
      const columns = trimmed.columnEnd - trimmed.columnStart;
      if (
        rows >= 4 &&
        columns >= 4 &&
        rows <= MAX_BEAD_GRID_SIZE &&
        columns <= MAX_BEAD_GRID_SIZE
      ) {
        let labelCount = 0;
        for (let row = rowSpan.start; row < rowSpan.end; row += 1) {
          for (
            let column = columnSpan.start;
            column < columnSpan.end;
            column += 1
          ) {
            labelCount += Number(labeled[row][column]);
          }
        }
        const spanArea =
          (rowSpan.end - rowSpan.start) *
          (columnSpan.end - columnSpan.start);
        const labelDensity = labelCount / Math.max(1, spanArea);
        let centralStructure = 0;
        let peripheralStructure = 0;
        for (let row = rowSpan.start; row < rowSpan.end; row += 1) {
          for (
            let column = columnSpan.start;
            column < columnSpan.end;
            column += 1
          ) {
            centralStructure +=
              samples[row][column].centralStructureRatio;
            peripheralStructure +=
              samples[row][column].peripheralStructureRatio;
          }
        }
        const centeredLabelEvidence = clamp(
          (centralStructure - peripheralStructure) /
            Math.max(1, spanArea) /
            0.18,
          0,
          1,
        );
        return {
          suggestion: {
            rows,
            columns,
            geometry: {
              originX: originX + trimmed.columnStart * pitch,
              originY: originY + trimmed.rowStart * pitch,
              cellWidth: pitch,
              cellHeight: pitch,
            },
            confidence: clamp(
              pitchResult.confidence * 0.66 +
                labelDensity * 0.16 +
                centeredLabelEvidence * 0.16,
              0,
              0.98,
            ),
            validSquareGrid: true,
          },
          evidence:
            labelDensity * Math.min(1, spanArea / 120) * 0.45 +
            centeredLabelEvidence * 0.5 +
            trimmed.axisCount * 0.025,
        };
      }
    }
  }

  const backgroundColor = approximateCellColorMode(samples.flat());
  const colored = samples.map((row) =>
    row.map(
      (sample) =>
        colorDistanceSquared(sample.color, backgroundColor) >=
        IMPLICIT_GRID_BACKGROUND_DISTANCE_SQUARED,
    ),
  );
  const coloredRowSpan = longestActiveSpan(
    colored.map((row) => row.some(Boolean)),
  );
  if (!coloredRowSpan || coloredRowSpan.end - coloredRowSpan.start < 4) {
    return null;
  }
  const coloredColumnSpan = longestActiveSpan(
    Array.from({ length: sheetColumns }, (_unused, column) => {
      for (
        let row = coloredRowSpan.start;
        row < coloredRowSpan.end;
        row += 1
      ) {
        if (colored[row][column]) {
          return true;
        }
      }
      return false;
    }),
  );
  if (
    !coloredColumnSpan ||
    coloredColumnSpan.end - coloredColumnSpan.start < 4
  ) {
    return null;
  }
  const rows = coloredRowSpan.end - coloredRowSpan.start;
  const columns = coloredColumnSpan.end - coloredColumnSpan.start;
  if (rows > MAX_BEAD_GRID_SIZE || columns > MAX_BEAD_GRID_SIZE) {
    return null;
  }
  return {
    suggestion: {
      rows,
      columns,
      geometry: {
        originX: originX + coloredColumnSpan.start * pitch,
        originY: originY + coloredRowSpan.start * pitch,
        cellWidth: pitch,
        cellHeight: pitch,
      },
      confidence: clamp(pitchResult.confidence * 0.8, 0, 0.9),
      validSquareGrid: true,
    },
    evidence: 0.12 * Math.min(1, (rows * columns) / 120),
  };
}

function implicitPeriodicCandidateForGeometry(
  pitchResult: ImplicitGridPitch,
  originX: number,
  originY: number,
  region: ImplicitPeriodicRegion,
): { suggestion: GridSuggestion; evidence: number } | null {
  const pitch = pitchResult.pitch;
  const outerColumn = Math.round((region.xStart - originX) / pitch);
  const columnEnd = Math.round((region.xEnd - originX) / pitch);
  const outerRow = Math.round((region.yStart - originY) / pitch);
  const rowEnd = Math.round((region.yEnd - originY) / pitch);
  const columnStart = outerColumn + 1;
  const rowStart = outerRow + 1;
  const columns = columnEnd - columnStart;
  const rows = rowEnd - rowStart;
  if (
    rows < 4 ||
    columns < 4 ||
    rows > MAX_BEAD_GRID_SIZE ||
    columns > MAX_BEAD_GRID_SIZE
  ) {
    return null;
  }
  const snapError =
    (Math.abs(originX + outerColumn * pitch - region.xStart) +
      Math.abs(originX + columnEnd * pitch - region.xEnd) +
      Math.abs(originY + outerRow * pitch - region.yStart) +
      Math.abs(originY + rowEnd * pitch - region.yEnd)) /
    (pitch * 4);
  const snapConfidence = 1 - clamp(snapError, 0, 1);
  const areaEvidence = Math.min(1, (rows * columns) / 500);
  return {
    suggestion: {
      rows,
      columns,
      geometry: {
        originX: originX + columnStart * pitch,
        originY: originY + rowStart * pitch,
        cellWidth: pitch,
        cellHeight: pitch,
      },
      confidence: clamp(
        pitchResult.confidence * 0.45 +
          region.confidence * 0.35 +
          snapConfidence * 0.18,
        0,
        0.95,
      ),
      validSquareGrid: true,
    },
    evidence:
      region.confidence * 0.55 +
      snapConfidence * 0.25 +
      areaEvidence * 0.15 +
      pitchResult.confidence * 0.05,
  };
}

function implicitPanelCandidateForGeometry(
  pitchResult: ImplicitGridPitch,
  originX: number,
  originY: number,
  region: ImplicitPeriodicRegion,
  panel: ImplicitBrightPanel,
): { suggestion: GridSuggestion; evidence: number } | null {
  const pitch = pitchResult.pitch;
  const panelWidth = panel.xEnd - panel.xStart;
  const totalColumns = Math.floor(panelWidth / pitch);
  const totalRows = Math.round((region.yEnd - region.yStart) / pitch);
  const columns = totalColumns - 2;
  const rows = totalRows - 2;
  if (
    rows < 4 ||
    columns < 4 ||
    rows > MAX_BEAD_GRID_SIZE ||
    columns > MAX_BEAD_GRID_SIZE
  ) {
    return null;
  }
  const horizontalPadding = panelWidth - totalColumns * pitch;
  if (horizontalPadding < 0 || horizontalPadding > pitch * 1.25) {
    return null;
  }
  const targetOuterX = panel.xStart + horizontalPadding / 2;
  const outerX =
    originX + Math.round((targetOuterX - originX) / pitch) * pitch;
  const outerY =
    originY + Math.round((region.yStart - originY) / pitch) * pitch;
  const horizontalSnapError = Math.abs(outerX - targetOuterX) / pitch;
  const verticalSnapError = Math.abs(outerY - region.yStart) / pitch;
  const endSnapError =
    Math.abs(outerY + totalRows * pitch - region.yEnd) / pitch;
  const snapConfidence =
    1 -
    clamp(
      (horizontalSnapError + verticalSnapError + endSnapError) / 3,
      0,
      1,
    );
  return {
    suggestion: {
      rows,
      columns,
      geometry: {
        originX: outerX + pitch,
        originY: outerY + pitch,
        cellWidth: pitch,
        cellHeight: pitch,
      },
      confidence: clamp(
        pitchResult.confidence * 0.35 +
          region.confidence * 0.25 +
          panel.confidence * 0.2 +
          snapConfidence * 0.18,
        0,
        0.95,
      ),
      validSquareGrid: true,
    },
    evidence:
      region.confidence * 0.3 +
      panel.confidence * 0.3 +
      snapConfidence * 0.3 +
      pitchResult.confidence * 0.1 +
      0.08,
  };
}

function implicitNumberedGridCandidates(
  source: Raster,
  projections: ReturnType<typeof edgeProjections>,
  pitchResult: ImplicitGridPitch,
): ImplicitGridCandidate[] {
  const pitch = pitchResult.pitch;
  const horizontalPhases = implicitBoundaryPhases(
    projections.horizontal,
    pitch,
  );
  const verticalPhases = implicitBoundaryPhases(
    projections.vertical,
    pitch,
  );
  const candidates: ImplicitGridCandidate[] = [];
  for (const originY of horizontalPhases) {
    for (const originX of verticalPhases) {
      const candidate = implicitCandidateForGeometry(
        source,
        pitchResult,
        originX,
        originY,
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  const possibleArea =
    Math.ceil(source.width / pitch) * Math.ceil(source.height / pitch);
  if (pitchResult.preferLineLattice) {
    promoteLineLatticeCandidates(
      candidates,
      projections,
      pitch,
      possibleArea,
    );
  }
  let initialBest = [...candidates].sort(
    (left, right) =>
      right.evidence - left.evidence ||
      right.suggestion.confidence - left.suggestion.confidence,
  )[0];
  let usedDirectionalFusion = false;
  if (
    !pitchResult.inferredAlternating &&
    !pitchResult.preferLineLattice
  ) {
    const fusedCandidate = fusedDirectionalLatticeCandidate(
      candidates,
      projections,
      pitchResult,
      possibleArea,
      initialBest,
    );
    if (fusedCandidate) {
      candidates.push(fusedCandidate);
      initialBest = fusedCandidate;
      usedDirectionalFusion = true;
    }
  }
  const detectedArea = initialBest
    ? initialBest.suggestion.rows * initialBest.suggestion.columns
    : 0;
  const detectedAreaRatio = detectedArea / Math.max(1, possibleArea);
  if (
    initialBest &&
    !usedDirectionalFusion &&
    !pitchResult.inferredAlternating &&
    !pitchResult.preferLineLattice &&
    Math.min(
      initialBest.suggestion.rows,
      initialBest.suggestion.columns,
    ) >= 8
  ) {
    const { suggestion } = initialBest;
    const verticalFit = fitDirectionalLattice(
      projections.verticalLines,
      pitch,
      suggestion.geometry.originX - pitch,
      suggestion.columns,
    );
    const horizontalFit = fitDirectionalLattice(
      projections.horizontalLines,
      pitch,
      suggestion.geometry.originY - pitch,
      suggestion.rows,
    );
    const fits = [verticalFit, horizontalFit].filter(
      (fit): fit is DirectionalLatticeFit => fit !== null,
    );
    if (fits.length > 0) {
      const fitsAgree =
        fits.length < 2 ||
        Math.abs(fits[0].pitch - fits[1].pitch) /
          Math.max(fits[0].pitch, fits[1].pitch) <=
          0.035;
      const selectedFits = fitsAgree
        ? fits
        : [
            fits.sort(
              (left, right) => right.score - left.score,
            )[0],
          ];
      const fitWeight = selectedFits.reduce(
        (sum, fit) => sum + Math.max(0.05, fit.score),
        0,
      );
      const refinedPitch =
        selectedFits.reduce(
          (sum, fit) =>
            sum + fit.pitch * Math.max(0.05, fit.score),
          0,
        ) / fitWeight;
      const usesVerticalFit = selectedFits.includes(verticalFit!);
      const usesHorizontalFit = selectedFits.includes(horizontalFit!);
      const refinedVerticalPhases =
        usesVerticalFit && verticalFit
          ? [normalizeGridPhase(verticalFit.phase, refinedPitch)]
          : implicitBoundaryPhases(
              projections.vertical,
              refinedPitch,
            );
      const refinedHorizontalPhases =
        usesHorizontalFit && horizontalFit
          ? [normalizeGridPhase(horizontalFit.phase, refinedPitch)]
          : implicitBoundaryPhases(
              projections.horizontal,
              refinedPitch,
            );
      const lineEvidence = clamp(
        selectedFits.reduce((sum, fit) => sum + fit.score, 0) /
          selectedFits.length,
        0,
        1,
      );
      const refinedPitchResult: ImplicitGridPitch = {
        pitch: refinedPitch,
        confidence: clamp(
          pitchResult.confidence * 0.88 + lineEvidence * 0.12,
          0,
          1,
        ),
      };
      if (initialBest.axisSupport !== 2) {
        const adjustedSuggestion: GridSuggestion = {
          ...initialBest.suggestion,
          geometry: { ...initialBest.suggestion.geometry },
        };
        let adjusted = false;
        if (
          usesVerticalFit &&
          verticalFit &&
          Math.abs(
            adjustedSuggestion.columns - verticalFit.dataCells,
          ) === 1 &&
          adjustedSuggestion.columns !== verticalFit.dataCells
        ) {
          adjustedSuggestion.columns = verticalFit.dataCells;
          adjusted = true;
        }
        if (
          usesHorizontalFit &&
          horizontalFit &&
          Math.abs(adjustedSuggestion.rows - horizontalFit.dataCells) ===
            1 &&
          adjustedSuggestion.rows !== horizontalFit.dataCells
        ) {
          adjustedSuggestion.rows = horizontalFit.dataCells;
          adjusted = true;
        }
        if (adjusted) {
          candidates.push({
            suggestion: adjustedSuggestion,
            evidence: initialBest.evidence + lineEvidence * 0.04,
            axisSupport: 1,
          });
        }
      }
      for (const originY of refinedHorizontalPhases) {
        for (const originX of refinedVerticalPhases) {
          const candidate = implicitCandidateForGeometry(
            source,
            refinedPitchResult,
            originX,
            originY,
          );
          if (candidate) {
            candidate.evidence += lineEvidence * 0.025;
            candidates.push(candidate);
          }
        }
      }
    }
  }
  const brightPanel =
    !pitchResult.inferredAlternating && detectedAreaRatio < 0.3
      ? implicitBrightPanel(source)
      : null;
  if (
    !pitchResult.inferredAlternating &&
    (!initialBest ||
      (Math.min(
        initialBest.suggestion.rows,
        initialBest.suggestion.columns,
      ) < 8 ||
        detectedAreaRatio < 0.18 ||
        brightPanel !== null))
  ) {
    const periodicRegion = implicitPeriodicRegion(source, pitch);
    if (periodicRegion) {
      for (const originY of horizontalPhases) {
        for (const originX of verticalPhases) {
          const periodicCandidate =
            implicitPeriodicCandidateForGeometry(
              pitchResult,
              originX,
              originY,
              periodicRegion,
            );
          if (periodicCandidate) {
            candidates.push(periodicCandidate);
          }
          if (brightPanel) {
            const panelCandidate = implicitPanelCandidateForGeometry(
              pitchResult,
              originX,
              originY,
              periodicRegion,
              brightPanel,
            );
            if (panelCandidate) {
              candidates.push(panelCandidate);
            }
          }
        }
      }
    }
  }
  return candidates;
}

function implicitNumberedGridSuggestion(
  source: Raster,
): GridSuggestion | null {
  const projections = edgeProjections(source);
  const pitchResult = implicitGridPitch(
    projections.horizontal,
    projections.vertical,
  );
  if (!pitchResult) {
    return null;
  }
  const candidates = implicitNumberedGridCandidates(
    source,
    projections,
    pitchResult,
  );
  const halfPitchResult = directionalHalfPitch(
    projections,
    pitchResult,
  );
  if (halfPitchResult) {
    candidates.push(
      ...implicitNumberedGridCandidates(
        source,
        projections,
        halfPitchResult,
      ),
    );
  }
  if (pitchResult.fallbackPitch) {
    candidates.push(
      ...implicitNumberedGridCandidates(
        source,
        projections,
        pitchResult.fallbackPitch,
      ),
    );
  }
  return (
    candidates.sort(
      (left, right) =>
        right.evidence - left.evidence ||
        right.suggestion.confidence - left.suggestion.confidence,
    )[0]?.suggestion ?? null
  );
}

function numberedGridSuggestion(source: Raster): GridSuggestion {
  const vertical = detectDarkLines(source, "x");
  const horizontal = detectDarkLines(source, "y");
  const guideTrim = numberedGuideTrim(source, vertical, horizontal);
  if (guideTrim) {
    const { cellWidth, cellHeight } = guideTrim.geometry;
    return {
      rows: guideTrim.rows,
      columns: guideTrim.columns,
      geometry: guideTrim.geometry,
      confidence: clamp(
        (vertical.consistency +
          horizontal.consistency +
          guideTrim.confidence) /
          3,
        0,
        1,
      ),
      validSquareGrid:
        Math.abs(cellWidth - cellHeight) /
          Math.max(cellWidth, cellHeight) <=
        0.08,
    };
  }
  const columns = clamp(vertical.positions.length - 1, 1, MAX_BEAD_GRID_SIZE);
  const rows = clamp(horizontal.positions.length - 1, 1, MAX_BEAD_GRID_SIZE);
  const cellWidth =
    vertical.spacing > 0 ? vertical.spacing : source.width / columns;
  const cellHeight =
    horizontal.spacing > 0 ? horizontal.spacing : source.height / rows;
  const confidence =
    vertical.positions.length >= 2 && horizontal.positions.length >= 2
      ? (vertical.consistency + horizontal.consistency) / 2
      : 0;
  const lineSuggestion: GridSuggestion = {
    rows,
    columns,
    geometry: {
      originX: vertical.positions[0] ?? 0,
      originY: horizontal.positions[0] ?? 0,
      cellWidth,
      cellHeight,
    },
    confidence,
    validSquareGrid:
      Math.abs(cellWidth - cellHeight) / Math.max(cellWidth, cellHeight) <=
      0.08,
  };
  const implicitSuggestion = implicitNumberedGridSuggestion(source);
  if (
    implicitSuggestion &&
    (lineSuggestion.rows === 1 ||
      lineSuggestion.columns === 1 ||
      implicitSuggestion.confidence > lineSuggestion.confidence + 0.1)
  ) {
    return implicitSuggestion;
  }
  return lineSuggestion;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function boundaryPositions(
  source: Raster,
  axis: "x" | "y",
): number[] {
  const length = axis === "x" ? source.width : source.height;
  const crossLength = axis === "x" ? source.height : source.width;
  const positions: number[] = [];
  for (let coordinate = 1; coordinate < length; coordinate += 1) {
    let changed = 0;
    for (let cross = 0; cross < crossLength; cross += 1) {
      const before =
        axis === "x"
          ? readPixel(source, coordinate - 1, cross)
          : readPixel(source, cross, coordinate - 1);
      const after =
        axis === "x"
          ? readPixel(source, coordinate, cross)
          : readPixel(source, cross, coordinate);
      if (pixelDifferenceSquared(before, after) > COLOR_CHANGE_THRESHOLD_SQUARED) {
        changed += 1;
      }
    }
    if (changed / crossLength >= 0.22) {
      positions.push(coordinate);
    }
  }
  return groupConsecutive(positions);
}

function inferredBlockSize(
  dimension: number,
  boundaries: readonly number[],
): number {
  if (boundaries.length === 0) {
    return dimension;
  }
  const divisor = boundaries.reduce(
    (current, boundary) =>
      greatestCommonDivisor(current, boundary),
    dimension,
  );
  return divisor >= 4 ? divisor : dimension;
}

function hardPixelSuggestion(source: Raster): GridSuggestion {
  const verticalBoundaries = boundaryPositions(source, "x");
  const horizontalBoundaries = boundaryPositions(source, "y");
  let cellWidth = inferredBlockSize(source.width, verticalBoundaries);
  let cellHeight = inferredBlockSize(source.height, horizontalBoundaries);
  // A valid pixel chart may contain two or more identical neighboring rows or
  // columns, leaving one axis with no color boundary evidence. Because v1 only
  // supports square grids, use the detected pitch from the other axis instead
  // of collapsing the repeated axis to a single giant cell.
  if (
    verticalBoundaries.length === 0 &&
    horizontalBoundaries.length > 0 &&
    source.width % cellHeight === 0
  ) {
    cellWidth = cellHeight;
  } else if (
    horizontalBoundaries.length === 0 &&
    verticalBoundaries.length > 0 &&
    source.height % cellWidth === 0
  ) {
    cellHeight = cellWidth;
  }
  const columns = clamp(
    Math.round(source.width / cellWidth),
    1,
    MAX_BEAD_GRID_SIZE,
  );
  const rows = clamp(
    Math.round(source.height / cellHeight),
    1,
    MAX_BEAD_GRID_SIZE,
  );
  const detectedBoundaryCount =
    verticalBoundaries.length + horizontalBoundaries.length;
  const expectedBoundaryCount = Math.max(1, columns + rows - 2);
  return {
    rows,
    columns,
    geometry: { originX: 0, originY: 0, cellWidth, cellHeight },
    confidence:
      detectedBoundaryCount === 0
        ? 0.15
        : clamp(detectedBoundaryCount / expectedBoundaryCount, 0.4, 1),
    validSquareGrid:
      Math.abs(cellWidth - cellHeight) / Math.max(cellWidth, cellHeight) <=
      0.08,
  };
}

function darkHoleComponents(source: Raster): HoleComponent[] {
  const visited = new Uint8Array(source.width * source.height);
  const components: HoleComponent[] = [];
  const maximumArea = source.width * source.height * 0.08;

  for (let startY = 0; startY < source.height; startY += 1) {
    for (let startX = 0; startX < source.width; startX += 1) {
      const startIndex = startY * source.width + startX;
      if (visited[startIndex]) {
        continue;
      }
      const start = readPixel(source, startX, startY);
      if (
        start.alpha < 128 ||
        luminance(start.color) > HOLE_DARK_LUMINANCE
      ) {
        visited[startIndex] = 1;
        continue;
      }

      const queue: number[] = [startIndex];
      visited[startIndex] = 1;
      let cursor = 0;
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      let touchesEdge = false;
      while (cursor < queue.length) {
        const index = queue[cursor];
        cursor += 1;
        const y = Math.floor(index / source.width);
        const x = index % source.width;
        area += 1;
        sumX += x + 0.5;
        sumY += y + 0.5;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        touchesEdge ||= x === 0 || y === 0 || x === source.width - 1 || y === source.height - 1;

        const neighbours = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ] as const;
        for (const [nextX, nextY] of neighbours) {
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= source.width ||
            nextY >= source.height
          ) {
            continue;
          }
          const nextIndex = nextY * source.width + nextX;
          if (visited[nextIndex]) {
            continue;
          }
          const next = readPixel(source, nextX, nextY);
          if (
            next.alpha >= 128 &&
            luminance(next.color) <= HOLE_DARK_LUMINANCE
          ) {
            visited[nextIndex] = 1;
            queue.push(nextIndex);
          }
        }
      }

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const fillRatio = area / (width * height);
      if (
        !touchesEdge &&
        area >= 8 &&
        area <= maximumArea &&
        fillRatio >= 0.55 &&
        Math.abs(width - height) / Math.max(width, height) <= 0.35
      ) {
        components.push({
          centreX: sumX / area,
          centreY: sumY / area,
          width,
          height,
          area,
        });
      }
    }
  }
  return components;
}

function clusterCoordinates(values: readonly number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  const groups: number[][] = [];
  for (const value of sorted) {
    const current = groups[groups.length - 1];
    if (!current || Math.abs(value - median(current)) > 3) {
      groups.push([value]);
    } else {
      current.push(value);
    }
  }
  return groups.map((group) => median(group));
}

function ringGridSuggestion(source: Raster): GridSuggestion {
  const components = darkHoleComponents(source);
  const xCentres = clusterCoordinates(
    components.map((component) => component.centreX),
  );
  const yCentres = clusterCoordinates(
    components.map((component) => component.centreY),
  );
  const xSpacing = lineConsistency(xCentres);
  const ySpacing = lineConsistency(yCentres);
  const columns = clamp(xCentres.length || 1, 1, MAX_BEAD_GRID_SIZE);
  const rows = clamp(yCentres.length || 1, 1, MAX_BEAD_GRID_SIZE);
  const cellWidth =
    xSpacing.spacing > 0 ? xSpacing.spacing : source.width / columns;
  const cellHeight =
    ySpacing.spacing > 0 ? ySpacing.spacing : source.height / rows;
  const possibleCells = rows * columns;
  const occupancy = possibleCells > 0 ? components.length / possibleCells : 0;
  const confidence =
    components.length >= 2
      ? clamp(
          occupancy *
            ((xSpacing.consistency || 1) + (ySpacing.consistency || 1)) /
            2,
          0,
          1,
        )
      : 0;

  return {
    rows,
    columns,
    geometry: {
      originX: clamp(
        (xCentres[0] ?? cellWidth / 2) - cellWidth / 2,
        0,
        source.width,
      ),
      originY: clamp(
        (yCentres[0] ?? cellHeight / 2) - cellHeight / 2,
        0,
        source.height,
      ),
      cellWidth,
      cellHeight,
    },
    confidence,
    validSquareGrid:
      Math.abs(cellWidth - cellHeight) / Math.max(cellWidth, cellHeight) <=
      0.08,
  };
}

export function cropRaster(
  source: Raster,
  crop: { x: number; y: number; width: number; height: number },
): Raster {
  validateRaster(source);
  if (
    !Number.isInteger(crop.x) ||
    !Number.isInteger(crop.y) ||
    !Number.isInteger(crop.width) ||
    !Number.isInteger(crop.height) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > source.width ||
    crop.y + crop.height > source.height
  ) {
    return fail("Crop rectangle is outside the source raster.");
  }
  const data = new Uint8ClampedArray(crop.width * crop.height * 4);
  for (let row = 0; row < crop.height; row += 1) {
    const sourceStart =
      ((crop.y + row) * source.width + crop.x) * 4;
    const targetStart = row * crop.width * 4;
    data.set(
      source.data.subarray(
        sourceStart,
        sourceStart + crop.width * 4,
      ),
      targetStart,
    );
  }
  return { width: crop.width, height: crop.height, data };
}

export function suggestGrid(
  source: Raster,
  mode: BeadInputMode,
): GridSuggestion {
  validateRaster(source);
  if (mode === "numbered-grid") {
    return numberedGridSuggestion(source);
  }
  if (mode === "ring-preview") {
    return ringGridSuggestion(source);
  }
  return hardPixelSuggestion(source);
}

function hardPixelScore(
  source: Raster,
  suggestion: GridSuggestion,
): number {
  if (suggestion.rows === 1 && suggestion.columns === 1) {
    return 0.15;
  }
  const samples: PixelSample[] = [];
  const geometry = suggestion.geometry;
  for (let row = 0; row < suggestion.rows; row += 1) {
    for (let column = 0; column < suggestion.columns; column += 1) {
      const centreX = geometry.originX + (column + 0.5) * geometry.cellWidth;
      const centreY = geometry.originY + (row + 0.5) * geometry.cellHeight;
      samples.push(readPixel(source, centreX, centreY));
    }
  }
  let interiorError = 0;
  let checks = 0;
  for (let row = 0; row < suggestion.rows; row += 1) {
    for (let column = 0; column < suggestion.columns; column += 1) {
      const centre = samples[row * suggestion.columns + column];
      for (const [offsetX, offsetY] of [
        [-0.2, 0],
        [0.2, 0],
        [0, -0.2],
        [0, 0.2],
      ] as const) {
        const pixel = readPixel(
          source,
          geometry.originX +
            (column + 0.5 + offsetX) * geometry.cellWidth,
          geometry.originY +
            (row + 0.5 + offsetY) * geometry.cellHeight,
        );
        interiorError += pixelDifferenceSquared(centre, pixel);
        checks += 1;
      }
    }
  }
  const normalizedError = checks > 0 ? interiorError / checks : 0;
  const uniformity = 1 - clamp(normalizedError / 3_000, 0, 1);
  return clamp(0.5 + uniformity * 0.42, 0, 0.92);
}

function suggestionImageCoverage(
  source: Raster,
  suggestion: GridSuggestion,
): number {
  if (
    suggestion.rows <= 1 ||
    suggestion.columns <= 1 ||
    !suggestion.validSquareGrid
  ) {
    return 0;
  }
  const left = clamp(suggestion.geometry.originX, 0, source.width);
  const top = clamp(suggestion.geometry.originY, 0, source.height);
  const right = clamp(
    suggestion.geometry.originX +
      suggestion.columns * suggestion.geometry.cellWidth,
    left,
    source.width,
  );
  const bottom = clamp(
    suggestion.geometry.originY +
      suggestion.rows * suggestion.geometry.cellHeight,
    top,
    source.height,
  );
  return (
    ((right - left) * (bottom - top)) /
    Math.max(1, source.width * source.height)
  );
}

function sampledVisualRange(source: Raster): number {
  const step = Math.max(
    1,
    Math.floor(
      Math.sqrt((source.width * source.height) / 16_384),
    ),
  );
  let minimum = 255;
  let maximum = 0;
  for (let y = 0; y < source.height; y += step) {
    for (let x = 0; x < source.width; x += step) {
      const offset = pixelOffset(source, x, y);
      if (source.data[offset + 3] < 128) {
        minimum = 0;
        continue;
      }
      const value = luminance([
        source.data[offset],
        source.data[offset + 1],
        source.data[offset + 2],
      ]);
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  return maximum - minimum;
}

function hasSeparatedPatternBands(source: Raster): boolean {
  if (source.width * source.height > 500_000) {
    return false;
  }
  const sampleStep = Math.max(
    1,
    Math.floor(
      Math.sqrt((source.width * source.height) / 40_000),
    ),
  );
  const buckets = new Map<
    string,
    { count: number; red: number; green: number; blue: number; alpha: number }
  >();
  for (let y = 0; y < source.height; y += sampleStep) {
    for (let x = 0; x < source.width; x += sampleStep) {
      const offset = pixelOffset(source, x, y);
      const red = source.data[offset];
      const green = source.data[offset + 1];
      const blue = source.data[offset + 2];
      const alpha = source.data[offset + 3];
      const key = `${red >> 5}:${green >> 5}:${blue >> 5}:${alpha >> 7}`;
      const bucket = buckets.get(key) ?? {
        count: 0,
        red: 0,
        green: 0,
        blue: 0,
        alpha: 0,
      };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      bucket.alpha += alpha;
      buckets.set(key, bucket);
    }
  }
  const background = [...buckets.values()].sort(
    (left, right) => right.count - left.count,
  )[0];
  if (!background) {
    return false;
  }
  const backgroundColor: RgbColor = [
    background.red / background.count,
    background.green / background.count,
    background.blue / background.count,
  ];
  const backgroundAlpha = background.alpha / background.count;
  if (
    backgroundAlpha < 200 ||
    Math.min(...backgroundColor) < 220 ||
    Math.max(...backgroundColor) - Math.min(...backgroundColor) > 24
  ) {
    return false;
  }
  const activeColumns = Array.from(
    { length: source.width },
    (_unused, x) => {
      let foreground = 0;
      let samples = 0;
      for (let y = 0; y < source.height; y += sampleStep) {
        const offset = pixelOffset(source, x, y);
        const color: RgbColor = [
          source.data[offset],
          source.data[offset + 1],
          source.data[offset + 2],
        ];
        foreground += Number(
          colorDistanceSquared(color, backgroundColor) >= 36 * 36 ||
            Math.abs(source.data[offset + 3] - backgroundAlpha) >= 64,
        );
        samples += 1;
      }
      return foreground / Math.max(1, samples) >= 0.2;
    },
  );
  const spans: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let index = 0; index <= activeColumns.length; index += 1) {
    if (index < activeColumns.length && activeColumns[index]) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0) {
      spans.push({ start, end: index });
      start = -1;
    }
  }
  const minimumSpan = source.width * 0.12;
  const minimumGap = Math.max(3, source.width * 0.08);
  const substantial = spans.filter(
    (span) => span.end - span.start >= minimumSpan,
  );
  return substantial.some(
    (span, index) =>
      index > 0 && span.start - substantial[index - 1].end >= minimumGap,
  );
}

function patternRequiresCrop(
  source: Raster,
  numbered: GridSuggestion,
  hardPixel: GridSuggestion,
  rings: GridSuggestion,
): boolean {
  if (sampledVisualRange(source) < 24) {
    return false;
  }
  if (hasSeparatedPatternBands(source)) {
    return true;
  }
  if (
    numbered.rows > 1 &&
    numbered.columns > 1 &&
    numbered.validSquareGrid &&
    numbered.confidence >= 0.73
  ) {
    return false;
  }
  const suggestions = [numbered, hardPixel, rings];
  const validSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.rows > 1 &&
      suggestion.columns > 1 &&
      suggestion.validSquareGrid,
  );
  const coverage = Math.max(
    0,
    ...validSuggestions.map((suggestion) =>
      suggestionImageCoverage(source, suggestion),
    ),
  );
  const largestMinorDimension = Math.max(
    0,
    ...validSuggestions.map((suggestion) =>
      Math.min(suggestion.rows, suggestion.columns),
    ),
  );
  const portraitEmbeddedPattern =
    source.height / source.width >= 1.45 &&
    coverage < 0.7 &&
    largestMinorDimension < 30;
  return coverage < 0.25 || portraitEmbeddedPattern;
}

export function classifyPattern(
  source: Raster,
): PatternClassification {
  validateRaster(source);
  const numbered = numberedGridSuggestion(source);
  const hardPixel = hardPixelSuggestion(source);
  const rings = ringGridSuggestion(source);
  const ringScore =
    rings.rows > 1 && rings.columns > 1
      ? clamp(0.72 + rings.confidence * 0.25, 0, 0.97)
      : 0;
  const genericNumberedScore =
    numbered.rows > 1 && numbered.columns > 1
      ? clamp(0.82 + numbered.confidence * 0.17, 0, 0.99)
      : 0;
  // A regular field of centre holes is stronger mode evidence than the
  // generic periodic edges shared by rings and printed code lattices.
  const ringSpecificity = clamp((ringScore - 0.84) / 0.13, 0, 1);
  const scores: Record<BeadInputMode, number> = {
    "numbered-grid":
      genericNumberedScore * (1 - ringSpecificity * 0.38),
    "hard-pixel": hardPixelScore(source, hardPixel),
    "ring-preview": ringScore,
  };
  const requiresCrop = patternRequiresCrop(
    source,
    numbered,
    hardPixel,
    rings,
  );
  const ranked = (Object.entries(scores) as Array<[BeadInputMode, number]>)
    .sort((left, right) => right[1] - left[1]);
  const [first, second] = ranked;
  if (!first || first[1] < 0.45 || first[1] - (second?.[1] ?? 0) < 0.08) {
    return {
      mode: "ambiguous",
      confidence: first?.[1] ?? 0,
      scores,
      requiresCrop,
    };
  }
  return {
    mode: first[0],
    confidence: first[1],
    scores,
    requiresCrop,
  };
}

function cellBounds(
  geometry: BeadGridGeometry,
  row: number,
  column: number,
  source: Raster,
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: clamp(
      Math.floor(geometry.originX + column * geometry.cellWidth),
      0,
      source.width,
    ),
    top: clamp(
      Math.floor(geometry.originY + row * geometry.cellHeight),
      0,
      source.height,
    ),
    right: clamp(
      Math.ceil(geometry.originX + (column + 1) * geometry.cellWidth),
      0,
      source.width,
    ),
    bottom: clamp(
      Math.ceil(geometry.originY + (row + 1) * geometry.cellHeight),
      0,
      source.height,
    ),
  };
}

function rectangularSamples(
  source: Raster,
  bounds: ReturnType<typeof cellBounds>,
  insetFraction: number,
): PixelSample[] {
  const width = Math.max(0, bounds.right - bounds.left);
  const height = Math.max(0, bounds.bottom - bounds.top);
  const left = clamp(
    Math.ceil(bounds.left + width * insetFraction),
    0,
    source.width,
  );
  const right = clamp(
    Math.floor(bounds.right - width * insetFraction),
    left + 1,
    source.width,
  );
  const top = clamp(
    Math.ceil(bounds.top + height * insetFraction),
    0,
    source.height,
  );
  const bottom = clamp(
    Math.floor(bounds.bottom - height * insetFraction),
    top + 1,
    source.height,
  );
  const samples: PixelSample[] = [];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      samples.push(readPixel(source, x, y));
    }
  }
  return samples;
}

function localGradientSquared(
  source: Raster,
  sample: PixelSample,
): number {
  const neighbours = [
    readPixel(source, sample.x - 1, sample.y),
    readPixel(source, sample.x + 1, sample.y),
    readPixel(source, sample.x, sample.y - 1),
    readPixel(source, sample.x, sample.y + 1),
  ];
  return Math.max(
    ...neighbours.map((neighbour) =>
      pixelDifferenceSquared(sample, neighbour),
    ),
  );
}

function summarizeSamples(
  samples: readonly PixelSample[],
  colorCandidates = samples,
  preferMedian = false,
): Omit<
  CellSample,
  | "centreDark"
  | "centralStructureRatio"
  | "centralLeftStructureRatio"
  | "centralRightStructureRatio"
  | "peripheralStructureRatio"
> {
  const dominant = dominantColor(
    colorCandidates.length > 0 ? colorCandidates : samples,
  );
  const color =
    !preferMedian && dominant.ratio >= 0.08
      ? dominant.color
      : medianColor(colorCandidates);
  const variance =
    samples.length > 0
      ? samples.reduce(
          (sum, sample) =>
            sum + colorDistanceSquared(sample.color, color),
          0,
        ) / samples.length
      : 0;
  const structureRatio =
    samples.length > 0
      ? samples.filter(
          (sample) =>
            colorDistanceSquared(sample.color, color) >
              COLOR_CHANGE_THRESHOLD_SQUARED ||
            sample.alpha < 128,
        ).length / samples.length
      : 0;
  return {
    color,
    variance,
    dominantRatio: dominant.ratio,
    structureRatio,
  };
}

function sampleNumberedCell(
  source: Raster,
  bounds: ReturnType<typeof cellBounds>,
  preferMedianColor = false,
): CellSample {
  const samples = rectangularSamples(source, bounds, 0.12);
  const lowGradient = samples.filter(
    (sample) =>
      localGradientSquared(source, sample) <=
      COLOR_CHANGE_THRESHOLD_SQUARED,
  );
  const summary = summarizeSamples(
    samples,
    lowGradient,
    preferMedianColor,
  );
  let minimumX = source.width - 1;
  let maximumX = 0;
  let minimumY = source.height - 1;
  let maximumY = 0;
  for (const sample of samples) {
    minimumX = Math.min(minimumX, sample.x);
    maximumX = Math.max(maximumX, sample.x);
    minimumY = Math.min(minimumY, sample.y);
    maximumY = Math.max(maximumY, sample.y);
  }
  const width = Math.max(1, maximumX - minimumX + 1);
  const height = Math.max(1, maximumY - minimumY + 1);
  let centralStructureCount = 0;
  let centralLeftStructureCount = 0;
  let centralRightStructureCount = 0;
  let peripheralStructureCount = 0;
  for (const sample of samples) {
    const structure =
      colorDistanceSquared(sample.color, summary.color) >
        COLOR_CHANGE_THRESHOLD_SQUARED ||
      sample.alpha < 128;
    const normalizedX = (sample.x - minimumX + 0.5) / width;
    const normalizedY = (sample.y - minimumY + 0.5) / height;
    if (!structure) {
      continue;
    }
    if (
      normalizedX >= 0.2 &&
      normalizedX <= 0.8 &&
      normalizedY >= 0.2 &&
      normalizedY <= 0.8
    ) {
      centralStructureCount += 1;
      if (normalizedX <= 0.55) {
        centralLeftStructureCount += 1;
      }
      if (normalizedX >= 0.45) {
        centralRightStructureCount += 1;
      }
    }
    if (
      normalizedX < 0.08 ||
      normalizedX > 0.92 ||
      normalizedY < 0.08 ||
      normalizedY > 0.92
    ) {
      peripheralStructureCount += 1;
    }
  }
  const sampleCount = Math.max(1, samples.length);
  return {
    ...summary,
    centralStructureRatio: centralStructureCount / sampleCount,
    centralLeftStructureRatio:
      centralLeftStructureCount / sampleCount,
    centralRightStructureRatio:
      centralRightStructureCount / sampleCount,
    peripheralStructureRatio:
      peripheralStructureCount / sampleCount,
    centreDark: false,
  };
}

function sampleHardPixelCell(
  source: Raster,
  bounds: ReturnType<typeof cellBounds>,
): CellSample {
  const samples = rectangularSamples(source, bounds, 0.2);
  return {
    ...summarizeSamples(samples),
    centralStructureRatio: 0,
    centralLeftStructureRatio: 0,
    centralRightStructureRatio: 0,
    peripheralStructureRatio: 0,
    centreDark: false,
  };
}

function sampleRingCell(
  source: Raster,
  bounds: ReturnType<typeof cellBounds>,
): CellSample {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const centreX = (bounds.left + bounds.right) / 2;
  const centreY = (bounds.top + bounds.bottom) / 2;
  const scale = Math.min(width, height);
  const annulus: PixelSample[] = [];
  const centre: PixelSample[] = [];
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const distance =
        Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY) / scale;
      if (distance >= 0.22 && distance <= 0.43) {
        annulus.push(readPixel(source, x, y));
      }
      if (distance <= 0.18) {
        centre.push(readPixel(source, x, y));
      }
    }
  }
  const summary = summarizeSamples(annulus);
  const darkCentreRatio =
    centre.length > 0
      ? centre.filter(
          (sample) =>
            sample.alpha >= 128 &&
            luminance(sample.color) <= HOLE_DARK_LUMINANCE,
        ).length / centre.length
      : 0;
  return {
    ...summary,
    centralStructureRatio: 0,
    centralLeftStructureRatio: 0,
    centralRightStructureRatio: 0,
    peripheralStructureRatio: 0,
    centreDark: darkCentreRatio >= 0.35,
  };
}

function sampleCell(
  source: Raster,
  bounds: ReturnType<typeof cellBounds>,
  mode: BeadInputMode,
): CellSample {
  if (mode === "numbered-grid") {
    return sampleNumberedCell(source, bounds, true);
  }
  if (mode === "ring-preview") {
    return sampleRingCell(source, bounds);
  }
  return sampleHardPixelCell(source, bounds);
}

function paletteIndexFor(
  palette: RgbColor[],
  color: RgbColor,
): number {
  const existing = palette.findIndex(
    (candidate) =>
      colorDistanceSquared(candidate, color) <=
      PALETTE_MERGE_THRESHOLD_SQUARED,
  );
  if (existing >= 0) {
    return existing;
  }
  palette.push([...color] as RgbColor);
  return palette.length - 1;
}

function hasCenteredNumberedLabel(sample: CellSample): boolean {
  return (
    sample.centralStructureRatio >= NUMBERED_LABEL_STRUCTURE_RATIO &&
    sample.centralLeftStructureRatio >=
      NUMBERED_LABEL_SIDE_STRUCTURE_RATIO &&
    sample.centralRightStructureRatio >=
      NUMBERED_LABEL_SIDE_STRUCTURE_RATIO
  );
}

function orientedPosition(
  row: number,
  column: number,
  rows: number,
  columns: number,
  orientation: BeadOrientation,
): { row: number; column: number; rows: number; columns: number } {
  const flippedRow = orientation.flipVertical ? rows - 1 - row : row;
  const flippedColumn = orientation.flipHorizontal
    ? columns - 1 - column
    : column;
  if (orientation.rotation === 90) {
    return {
      row: flippedColumn,
      column: rows - 1 - flippedRow,
      rows: columns,
      columns: rows,
    };
  }
  if (orientation.rotation === 180) {
    return {
      row: rows - 1 - flippedRow,
      column: columns - 1 - flippedColumn,
      rows,
      columns,
    };
  }
  if (orientation.rotation === 270) {
    return {
      row: columns - 1 - flippedColumn,
      column: flippedRow,
      rows: columns,
      columns: rows,
    };
  }
  return {
    row: flippedRow,
    column: flippedColumn,
    rows,
    columns,
  };
}

function orientRecognition(
  cells: BeadCell[],
  issues: BeadConfidenceIssue[],
  rows: number,
  columns: number,
  orientation: BeadOrientation,
): {
  cells: BeadCell[];
  issues: BeadConfidenceIssue[];
  rows: number;
  columns: number;
} {
  const first = orientedPosition(0, 0, rows, columns, orientation);
  const orientedCells: BeadCell[] = Array.from(
    { length: cells.length },
    () => ({ kind: "empty" }),
  );
  const indexMap = new Map<number, number>();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceIndex = row * columns + column;
      const target = orientedPosition(
        row,
        column,
        rows,
        columns,
        orientation,
      );
      const targetIndex = target.row * target.columns + target.column;
      orientedCells[targetIndex] = cells[sourceIndex];
      indexMap.set(sourceIndex, targetIndex);
    }
  }
  return {
    cells: orientedCells,
    issues: issues.map((issue) => ({
      ...issue,
      cellIndex: indexMap.get(issue.cellIndex) ?? issue.cellIndex,
    })),
    rows: first.rows,
    columns: first.columns,
  };
}

export function recognizeBeadPattern(
  request: RecognitionRequest,
): RecognitionResult {
  validateRaster(request.source);
  if (
    !Number.isInteger(request.rows) ||
    !Number.isInteger(request.columns) ||
    request.rows < 1 ||
    request.columns < 1 ||
    request.rows > MAX_BEAD_GRID_SIZE ||
    request.columns > MAX_BEAD_GRID_SIZE
  ) {
    return fail("Recognition grid dimensions are invalid.");
  }

  const cellCount = request.rows * request.columns;
  const emptyIndex =
    request.emptySelection.kind === "sample"
      ? request.emptySelection.cellIndex
      : null;
  if (emptyIndex !== null && (emptyIndex < 0 || emptyIndex >= cellCount)) {
    return fail("Calibration sample is outside the recognition grid.");
  }

  const samples: CellSample[] = [];
  for (let row = 0; row < request.rows; row += 1) {
    for (let column = 0; column < request.columns; column += 1) {
      samples.push(
        sampleCell(
          request.source,
          cellBounds(
            request.geometry,
            row,
            column,
            request.source,
          ),
          request.mode,
        ),
      );
    }
  }

  const emptyColor = emptyIndex === null ? null : samples[emptyIndex].color;
  const palette: RgbColor[] = [];
  const cells: BeadCell[] = [];
  const confidenceIssues: BeadConfidenceIssue[] = [];
  const squareError =
    Math.abs(
      request.geometry.cellWidth - request.geometry.cellHeight,
    ) /
    Math.max(request.geometry.cellWidth, request.geometry.cellHeight);
  const occupiedCells = samples.map((sample, index) => {
    const distanceFromEmpty =
      emptyColor === null
        ? Number.POSITIVE_INFINITY
        : colorDistanceSquared(sample.color, emptyColor);
    return (
      emptyIndex === null ||
      (request.mode === "numbered-grid"
        ? hasCenteredNumberedLabel(sample)
        : distanceFromEmpty > COLOR_CHANGE_THRESHOLD_SQUARED ||
          (request.mode === "ring-preview" && sample.centreDark))
    );
  });
  const numberedOccupiedSamples =
    request.mode === "numbered-grid"
      ? samples.filter(
          (_sample, index) =>
            occupiedCells[index] &&
            index !== emptyIndex,
        )
      : [];
  const numberedPeripheralMedian = median(
    numberedOccupiedSamples.map(
      (sample) => sample.peripheralStructureRatio,
    ),
  );
  const numberedPeripheralDeviation = median(
    numberedOccupiedSamples.map((sample) =>
      Math.abs(
        sample.peripheralStructureRatio - numberedPeripheralMedian,
      ),
    ),
  );
  const numberedPeripheralIssueThreshold = Math.max(
    0.055,
    numberedPeripheralMedian +
      Math.max(0.02, numberedPeripheralDeviation * 6),
  );

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const distanceFromEmpty =
      emptyColor === null
        ? Number.POSITIVE_INFINITY
        : colorDistanceSquared(sample.color, emptyColor);
    const occupied = occupiedCells[index];

    if (index === emptyIndex || !occupied) {
      cells.push({ kind: "empty" });
      continue;
    }
    cells.push({
      kind: "color",
      paletteIndex: paletteIndexFor(palette, sample.color),
    });

    const reasons: BeadConfidenceReason[] = [];
    const numberedOverlayObstruction =
      request.mode === "numbered-grid" &&
      (sample.peripheralStructureRatio >
        numberedPeripheralIssueThreshold ||
        sample.structureRatio > 0.72);
    if (
      sample.variance > 4_000 &&
      (request.mode !== "numbered-grid" ||
        numberedOverlayObstruction)
    ) {
      reasons.push("high-color-variance");
    }
    if (
      request.mode === "numbered-grid" &&
      numberedOverlayObstruction
    ) {
      reasons.push("overlay-obstruction");
    }
    if (
      request.mode === "hard-pixel" &&
      sample.dominantRatio <= 0.6 &&
      sample.variance > 16 &&
      sample.variance < 4_000
    ) {
      reasons.push("jpeg-near-tie");
    }
    if (
      emptyColor &&
      distanceFromEmpty <= COLOR_CHANGE_THRESHOLD_SQUARED &&
      !(
        request.mode === "numbered-grid" &&
        hasCenteredNumberedLabel(sample) &&
        !numberedOverlayObstruction
      )
    ) {
      reasons.push("occupancy-color-conflict");
    }
    if (squareError > 0.12) {
      reasons.push("grid-misalignment");
    }
    if (reasons.length > 0) {
      confidenceIssues.push({
        cellIndex: index,
        confidence: clamp(1 - reasons.length * 0.2, 0.1, 0.95),
        reasons,
        resolved: false,
      });
    }
  }

  const oriented = orientRecognition(
    cells,
    confidenceIssues,
    request.rows,
    request.columns,
    request.orientation,
  );
  return {
    mode: request.mode,
    rows: oriented.rows,
    columns: oriented.columns,
    palette,
    cells: oriented.cells,
    confidenceIssues: oriented.issues,
  };
}
