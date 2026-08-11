import {
  WORKSHOP_MANIFEST_VERSION,
  type WorkshopRecipeSource,
} from "@lumina/workshop-sdk";
import {
  BEAD_MODULE_ID,
  BEAD_PROJECT_SCHEMA_VERSION,
  BEAD_RECIPE_PAYLOAD_VERSION,
  BEAD_RENDER_SCHEMA_VERSION,
  DEFAULT_BEAD_COMPRESSION,
  DEFAULT_BEAD_IRREGULARITY,
  DEFAULT_BEAD_PITCH_MM,
  MAX_BEAD_GRID_SIZE,
  type BeadCalibration,
  type BeadCell,
  type BeadCellRun,
  type BeadConfidenceIssue,
  type BeadInputMode,
  type BeadOrientation,
  type BeadPrintMapping,
  type BeadProject,
  type CreateBeadProjectInput,
  type RestoreBeadProjectOptions,
  type RgbColor,
} from "./types";

const SEMVER_NUMBER = "(?:0|[1-9]\\d*)";
const SEMVER_NAMED_IDENTIFIER =
  "(?:\\d*[A-Za-z-][0-9A-Za-z-]*)";
const SEMVER_PRERELEASE_IDENTIFIER =
  `(?:${SEMVER_NUMBER}|${SEMVER_NAMED_IDENTIFIER})`;
const SEMVER_PATTERN = new RegExp(
  `^${SEMVER_NUMBER}\\.${SEMVER_NUMBER}\\.${SEMVER_NUMBER}` +
    `(?:-${SEMVER_PRERELEASE_IDENTIFIER}` +
    `(?:\\.${SEMVER_PRERELEASE_IDENTIFIER})*)?` +
    "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
);
const WORKSHOP_MANIFEST_SCHEMA_VERSION = WORKSHOP_MANIFEST_VERSION;
const INPUT_MODES = new Set<BeadInputMode>([
  "numbered-grid",
  "hard-pixel",
  "ring-preview",
]);
const ROTATIONS = new Set([0, 90, 180, 270]);
const CONFIDENCE_REASONS = new Set([
  "high-color-variance",
  "occupancy-color-conflict",
  "grid-misalignment",
  "overlay-obstruction",
  "jpeg-near-tie",
]);
const MAX_RECIPE_PAYLOAD_BYTES = 1024 * 1024;

export class BeadProjectValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BeadProjectValidationError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new BeadProjectValidationError(code, message);
}

function assertRecipePayloadBound(payload: unknown): void {
  try {
    const serialized = JSON.stringify(payload);
    if (
      serialized === undefined ||
      new TextEncoder().encode(serialized).byteLength >
        MAX_RECIPE_PAYLOAD_BYTES
    ) {
      fail(
        "recipe-payload-too-large",
        "Bead recipe payload exceeds 1 MiB.",
      );
    }
  } catch (error) {
    if (error instanceof BeadProjectValidationError) throw error;
    fail(
      "invalid-recipe-source",
      "Bead recipe payload is not serializable.",
    );
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGridDimension(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= MAX_BEAD_GRID_SIZE
  );
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 255;
}

function validatePalette(palette: unknown): asserts palette is RgbColor[] {
  if (
    !Array.isArray(palette) ||
    palette.length === 0 ||
    palette.length > 256 ||
    !palette.every(
      (color) =>
        Array.isArray(color) &&
        color.length === 3 &&
        color.every(isByte),
    )
  ) {
    fail("invalid-palette", "Palette must contain 1–256 integer RGB colors.");
  }
}

function validateCell(
  cell: unknown,
  paletteLength: number,
): asserts cell is BeadCell {
  if (typeof cell !== "object" || cell === null || !("kind" in cell)) {
    fail("invalid-cell", "Every matrix entry must be a bead cell.");
  }

  const candidate = cell as Record<string, unknown>;
  if (candidate.kind === "empty") {
    return;
  }
  if (
    candidate.kind === "color" &&
    Number.isInteger(candidate.paletteIndex) &&
    (candidate.paletteIndex as number) >= 0 &&
    (candidate.paletteIndex as number) < paletteLength
  ) {
    return;
  }
  if (candidate.kind === "color") {
    fail(
      "invalid-palette-index",
      "Color cell palette index is outside the project palette.",
    );
  }
  fail("invalid-cell", "Unknown bead cell kind.");
}

function validateOrientation(
  orientation: unknown,
): asserts orientation is BeadOrientation {
  if (typeof orientation !== "object" || orientation === null) {
    fail("invalid-calibration", "Calibration orientation is missing.");
  }
  const candidate = orientation as Record<string, unknown>;
  if (
    !ROTATIONS.has(candidate.rotation as number) ||
    typeof candidate.flipHorizontal !== "boolean" ||
    typeof candidate.flipVertical !== "boolean"
  ) {
    fail("invalid-calibration", "Calibration orientation is invalid.");
  }
}

function validateCalibration(
  calibration: unknown,
  cellCount: number,
): asserts calibration is BeadCalibration {
  if (typeof calibration !== "object" || calibration === null) {
    fail("invalid-calibration", "Calibration is missing.");
  }
  const candidate = calibration as Record<string, unknown>;
  if (!INPUT_MODES.has(candidate.inputMode as BeadInputMode)) {
    fail("invalid-calibration", "Calibration input mode is invalid.");
  }

  if (candidate.crop !== null) {
    if (typeof candidate.crop !== "object" || candidate.crop === null) {
      fail("invalid-calibration", "Crop must be null or a rectangle.");
    }
    const crop = candidate.crop as Record<string, unknown>;
    if (
      !isFiniteNumber(crop.x) ||
      !isFiniteNumber(crop.y) ||
      !isFiniteNumber(crop.width) ||
      !isFiniteNumber(crop.height) ||
      crop.x < 0 ||
      crop.y < 0 ||
      crop.width <= 0 ||
      crop.height <= 0
    ) {
      fail("invalid-calibration", "Crop rectangle is invalid.");
    }
  }

  if (typeof candidate.origin !== "object" || candidate.origin === null) {
    fail("invalid-calibration", "Grid origin is missing.");
  }
  const origin = candidate.origin as Record<string, unknown>;
  if (!isFiniteNumber(origin.x) || !isFiniteNumber(origin.y)) {
    fail("invalid-calibration", "Grid origin is invalid.");
  }
  validateOrientation(candidate.orientation);

  if (
    typeof candidate.emptySelection !== "object" ||
    candidate.emptySelection === null
  ) {
    fail("invalid-calibration", "Empty-cell selection is missing.");
  }
  const emptySelection = candidate.emptySelection as Record<string, unknown>;
  if (emptySelection.kind === "sample") {
    if (
      !Number.isInteger(emptySelection.cellIndex) ||
      (emptySelection.cellIndex as number) < 0 ||
      (emptySelection.cellIndex as number) >= cellCount
    ) {
      fail("invalid-calibration", "Empty-cell sample is outside the grid.");
    }
  } else if (emptySelection.kind !== "none") {
    fail("invalid-calibration", "Empty-cell selection is invalid.");
  }

}

function validateConfidenceIssues(
  issues: unknown,
  cellCount: number,
): asserts issues is BeadConfidenceIssue[] {
  if (!Array.isArray(issues)) {
    fail("invalid-confidence-issues", "Confidence issues must be an array.");
  }
  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) {
      fail("invalid-confidence-issues", "Confidence issue is invalid.");
    }
    const candidate = issue as Record<string, unknown>;
    if (
      !Number.isInteger(candidate.cellIndex) ||
      (candidate.cellIndex as number) < 0 ||
      (candidate.cellIndex as number) >= cellCount ||
      !isFiniteNumber(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1 ||
      !Array.isArray(candidate.reasons) ||
      candidate.reasons.length === 0 ||
      !candidate.reasons.every(
        (reason) =>
          typeof reason === "string" && CONFIDENCE_REASONS.has(reason),
      ) ||
      typeof candidate.resolved !== "boolean"
    ) {
      fail("invalid-confidence-issues", "Confidence issue is invalid.");
    }
  }
}

function validatePrintMapping(
  mapping: unknown,
  paletteLength: number,
): asserts mapping is BeadPrintMapping | null | undefined {
  if (mapping === undefined || mapping === null) {
    return;
  }
  if (
    typeof mapping !== "object" ||
    Array.isArray(mapping) ||
    mapping === null
  ) {
    fail("invalid-print-mapping", "Print color mapping is invalid.");
  }
  const candidate = mapping as Record<string, unknown>;
  if (
    typeof candidate.libraryId !== "string" ||
    candidate.libraryId.length === 0 ||
    candidate.libraryId.length > 256 ||
    typeof candidate.libraryLabel !== "string" ||
    candidate.libraryLabel.length === 0 ||
    candidate.libraryLabel.length > 256 ||
    !Array.isArray(candidate.entries) ||
    candidate.entries.length > paletteLength
  ) {
    fail("invalid-print-mapping", "Print color mapping is invalid.");
  }
  const mappedPaletteIndices = new Set<number>();
  for (const entry of candidate.entries) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry)
    ) {
      fail("invalid-print-mapping", "Print color mapping entry is invalid.");
    }
    const value = entry as Record<string, unknown>;
    if (
      !Number.isInteger(value.sourcePaletteIndex) ||
      (value.sourcePaletteIndex as number) < 0 ||
      (value.sourcePaletteIndex as number) >= paletteLength ||
      mappedPaletteIndices.has(value.sourcePaletteIndex as number) ||
      typeof value.colorEntryId !== "string" ||
      value.colorEntryId.length === 0 ||
      value.colorEntryId.length > 256
    ) {
      fail("invalid-print-mapping", "Print color mapping entry is invalid.");
    }
    mappedPaletteIndices.add(value.sourcePaletteIndex as number);
  }
}

function validateSource(source: unknown): void {
  if (source === null) {
    return;
  }
  if (typeof source !== "object" || source === null) {
    fail("invalid-source", "Project source is invalid.");
  }
  const candidate = source as Record<string, unknown>;
  if (
    typeof candidate.fileName !== "string" ||
    typeof candidate.mimeType !== "string" ||
    !(candidate.blob instanceof Blob) ||
    !Number.isInteger(candidate.pixelWidth) ||
    (candidate.pixelWidth as number) <= 0 ||
    !Number.isInteger(candidate.pixelHeight) ||
    (candidate.pixelHeight as number) <= 0
  ) {
    fail("invalid-source", "Project source is invalid.");
  }
}

export function validateBeadProject(value: unknown): BeadProject {
  if (typeof value !== "object" || value === null) {
    return fail("invalid-project", "Bead project must be an object.");
  }
  const project = value as Record<string, unknown>;
  if (
    project.schemaVersion !== BEAD_PROJECT_SCHEMA_VERSION ||
    project.renderSchemaVersion !== BEAD_RENDER_SCHEMA_VERSION ||
    project.moduleId !== BEAD_MODULE_ID ||
    typeof project.projectId !== "string" ||
    project.projectId.length === 0 ||
    typeof project.moduleVersion !== "string" ||
    !SEMVER_PATTERN.test(project.moduleVersion) ||
    typeof project.createdAt !== "string" ||
    !Number.isFinite(Date.parse(project.createdAt)) ||
    typeof project.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(project.updatedAt))
  ) {
    return fail("invalid-project", "Project identity or schema is invalid.");
  }
  if (!isGridDimension(project.rows) || !isGridDimension(project.columns)) {
    return fail(
      "invalid-dimensions",
      `Grid dimensions must be integers from 1 to ${MAX_BEAD_GRID_SIZE}.`,
    );
  }

  validatePalette(project.palette);
  const expectedCellCount = project.rows * project.columns;
  if (
    !Array.isArray(project.cells) ||
    project.cells.length !== expectedCellCount
  ) {
    return fail(
      "cell-count-mismatch",
      "Cell count must equal rows multiplied by columns.",
    );
  }
  for (const cell of project.cells) {
    validateCell(cell, project.palette.length);
  }

  validateSource(project.source);
  validateCalibration(project.calibration, expectedCellCount);
  validateConfidenceIssues(project.confidenceIssues, expectedCellCount);
  validatePrintMapping(project.printMapping, project.palette.length);

  if (
    !isFiniteNumber(project.beadPitchMm) ||
    project.beadPitchMm < 0.5 ||
    project.beadPitchMm > 10
  ) {
    return fail("invalid-pitch", "Bead pitch must be from 0.5 to 10 mm.");
  }
  if (
    !Number.isInteger(project.compression) ||
    (project.compression as number) < 0 ||
    (project.compression as number) > 100
  ) {
    return fail(
      "invalid-compression",
      "Compression must be an integer from 0 to 100.",
    );
  }
  if (
    project.irregularity !== undefined &&
    (!Number.isInteger(project.irregularity) ||
      (project.irregularity as number) < 0 ||
      (project.irregularity as number) > 100)
  ) {
    return fail(
      "invalid-irregularity",
      "Irregular compression must be an integer from 0 to 100.",
    );
  }
  if (
    project.canvasMode !== undefined &&
    project.canvasMode !== "auto-expand"
  ) {
    return fail(
      "invalid-canvas-mode",
      "Canvas mode is unsupported.",
    );
  }

  return value as BeadProject;
}

function defaultCalibration(): BeadCalibration {
  return {
    inputMode: "hard-pixel",
    crop: null,
    origin: { x: 0, y: 0 },
    orientation: {
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    },
    emptySelection: { kind: "none" },
  };
}

export function createBeadProject(
  input: CreateBeadProjectInput,
): BeadProject {
  const project: BeadProject = {
    schemaVersion: BEAD_PROJECT_SCHEMA_VERSION,
    renderSchemaVersion: BEAD_RENDER_SCHEMA_VERSION,
    projectId: input.projectId,
    moduleId: BEAD_MODULE_ID,
    moduleVersion: input.moduleVersion,
    createdAt: input.now,
    updatedAt: input.now,
    source: input.source ?? null,
    calibration: input.calibration ?? defaultCalibration(),
    rows: input.rows,
    columns: input.columns,
    palette: input.palette ?? [[0, 0, 0]],
    cells:
      input.cells ??
      Array.from({ length: input.rows * input.columns }, () => ({
        kind: "empty" as const,
      })),
    confidenceIssues: input.confidenceIssues ?? [],
    beadPitchMm: input.beadPitchMm ?? DEFAULT_BEAD_PITCH_MM,
    compression: input.compression ?? DEFAULT_BEAD_COMPRESSION,
    irregularity:
      input.irregularity ?? DEFAULT_BEAD_IRREGULARITY,
    ...(input.canvasMode !== undefined
      ? { canvasMode: input.canvasMode }
      : {}),
    ...(input.printMapping !== undefined
      ? { printMapping: input.printMapping }
      : {}),
  };
  return validateBeadProject(project);
}

/** Initial square size for a free-creation canvas. / 自由创作画布的初始正方形边长。 */
export const AUTO_EXPAND_CANVAS_INITIAL_SIZE = 32;
/** Edge growth chunk for a free-creation canvas. / 自由创作画布的单次边缘扩展格数。 */
export const AUTO_EXPAND_CANVAS_GROWTH = 8;
const AUTO_EXPAND_CANVAS_EDGE_MARGIN = 2;

/**
 * Result of growing an automatic canvas while preserving the addressed cell.
 * 自动扩展画布并保留目标格后的结果。
 */
export interface AutoCanvasExpansion {
  project: BeadProject;
  cellIndex: number;
}

/**
 * Adds empty rows and columns around an edge cell in fixed-size chunks.
 * The project remains bounded by MAX_BEAD_GRID_SIZE for predictable memory use.
 *
 * 在靠边格周围按固定块添加空白行列，并受 MAX_BEAD_GRID_SIZE 上限约束，
 * 从而保持可预测的内存占用。
 */
export function expandAutoCanvasAroundCell(
  project: BeadProject,
  cellIndex: number,
): AutoCanvasExpansion {
  validateBeadProject(project);
  if (
    project.canvasMode !== "auto-expand" ||
    !Number.isInteger(cellIndex) ||
    cellIndex < 0 ||
    cellIndex >= project.cells.length
  ) {
    return { project, cellIndex };
  }

  const row = Math.floor(cellIndex / project.columns);
  const column = cellIndex % project.columns;
  let remainingRows = MAX_BEAD_GRID_SIZE - project.rows;
  let remainingColumns = MAX_BEAD_GRID_SIZE - project.columns;
  const addTop = row < AUTO_EXPAND_CANVAS_EDGE_MARGIN
    ? Math.min(AUTO_EXPAND_CANVAS_GROWTH, remainingRows)
    : 0;
  remainingRows -= addTop;
  const addBottom =
    project.rows - 1 - row < AUTO_EXPAND_CANVAS_EDGE_MARGIN
      ? Math.min(AUTO_EXPAND_CANVAS_GROWTH, remainingRows)
      : 0;
  const addLeft = column < AUTO_EXPAND_CANVAS_EDGE_MARGIN
    ? Math.min(AUTO_EXPAND_CANVAS_GROWTH, remainingColumns)
    : 0;
  remainingColumns -= addLeft;
  const addRight =
    project.columns - 1 - column < AUTO_EXPAND_CANVAS_EDGE_MARGIN
      ? Math.min(AUTO_EXPAND_CANVAS_GROWTH, remainingColumns)
      : 0;

  if (addTop + addBottom + addLeft + addRight === 0) {
    return { project, cellIndex };
  }

  const rows = project.rows + addTop + addBottom;
  const columns = project.columns + addLeft + addRight;
  const cells: BeadCell[] = Array.from(
    { length: rows * columns },
    () => ({ kind: "empty" }),
  );
  const remapCellIndex = (oldIndex: number): number => {
    const oldRow = Math.floor(oldIndex / project.columns);
    const oldColumn = oldIndex % project.columns;
    return (oldRow + addTop) * columns + oldColumn + addLeft;
  };
  for (let oldIndex = 0; oldIndex < project.cells.length; oldIndex += 1) {
    cells[remapCellIndex(oldIndex)] = project.cells[oldIndex];
  }

  const calibration =
    project.calibration.emptySelection.kind === "sample"
      ? {
          ...project.calibration,
          emptySelection: {
            kind: "sample" as const,
            cellIndex: remapCellIndex(
              project.calibration.emptySelection.cellIndex,
            ),
          },
        }
      : project.calibration;
  const expanded = validateBeadProject({
    ...project,
    rows,
    columns,
    cells,
    calibration,
    confidenceIssues: project.confidenceIssues.map((issue) => ({
      ...issue,
      cellIndex: remapCellIndex(issue.cellIndex),
    })),
  });
  return {
    project: expanded,
    cellIndex: remapCellIndex(cellIndex),
  };
}

export function trimEmptyBorder(project: BeadProject): BeadProject {
  validateBeadProject(project);

  let minRow = project.rows;
  let maxRow = -1;
  let minColumn = project.columns;
  let maxColumn = -1;

  for (let row = 0; row < project.rows; row += 1) {
    for (let column = 0; column < project.columns; column += 1) {
      const index = row * project.columns + column;
      if (project.cells[index]?.kind !== "empty") {
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minColumn = Math.min(minColumn, column);
        maxColumn = Math.max(maxColumn, column);
      }
    }
  }

  if (
    maxRow < 0 ||
    (minRow === 0 &&
      minColumn === 0 &&
      maxRow === project.rows - 1 &&
      maxColumn === project.columns - 1)
  ) {
    return project;
  }

  const rows = maxRow - minRow + 1;
  const columns = maxColumn - minColumn + 1;
  const cells: BeadCell[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      cells.push(project.cells[row * project.columns + column]);
    }
  }

  const confidenceIssues = project.confidenceIssues
    .filter(({ cellIndex }) => {
      const row = Math.floor(cellIndex / project.columns);
      const column = cellIndex % project.columns;
      return (
        row >= minRow &&
        row <= maxRow &&
        column >= minColumn &&
        column <= maxColumn
      );
    })
    .map((issue) => {
      const oldRow = Math.floor(issue.cellIndex / project.columns);
      const oldColumn = issue.cellIndex % project.columns;
      return {
        ...issue,
        cellIndex:
          (oldRow - minRow) * columns + (oldColumn - minColumn),
      };
    });

  return validateBeadProject({
    ...project,
    rows,
    columns,
    cells,
    confidenceIssues,
  });
}

function roundMillimeters(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function calculatePhysicalSize(
  project: Pick<BeadProject, "rows" | "columns">,
  beadPitchMm: number,
): { widthMm: number; heightMm: number } {
  if (
    !isFiniteNumber(beadPitchMm) ||
    beadPitchMm < 0.5 ||
    beadPitchMm > 10
  ) {
    return fail("invalid-pitch", "Bead pitch must be from 0.5 to 10 mm.");
  }
  return {
    widthMm: roundMillimeters(project.columns * beadPitchMm),
    heightMm: roundMillimeters(project.rows * beadPitchMm),
  };
}

function cellToken(cell: BeadCell): number {
  if (cell.kind === "empty") {
    return -1;
  }
  return cell.paletteIndex;
}

export function encodeBeadCellsRle(
  cells: readonly BeadCell[],
): BeadCellRun[] {
  if (cells.length === 0) {
    return [];
  }

  const runs: BeadCellRun[] = [];
  let token = cellToken(cells[0]);
  let count = 1;
  for (let index = 1; index < cells.length; index += 1) {
    const nextToken = cellToken(cells[index]);
    if (nextToken === token) {
      count += 1;
    } else {
      runs.push([token, count]);
      token = nextToken;
      count = 1;
    }
  }
  runs.push([token, count]);
  return runs;
}

export function decodeBeadCellsRle(
  value: unknown,
  expectedLength: number,
): BeadCell[] {
  if (!Array.isArray(value) || !Number.isInteger(expectedLength) || expectedLength < 0) {
    return fail("invalid-rle", "Cell RLE is invalid.");
  }

  const cells: BeadCell[] = [];
  for (const run of value) {
    if (
      !Array.isArray(run) ||
      run.length !== 2 ||
      !Number.isInteger(run[0]) ||
      (run[0] as number) < -1 ||
      !Number.isInteger(run[1]) ||
      (run[1] as number) <= 0 ||
      cells.length + (run[1] as number) > expectedLength
    ) {
      return fail("invalid-rle", "Cell RLE contains an invalid run.");
    }
    const token = run[0] as number;
    const cell: BeadCell =
      token === -1
        ? { kind: "empty" }
        : { kind: "color", paletteIndex: token };
    for (let count = 0; count < (run[1] as number); count += 1) {
      cells.push(cell);
    }
  }
  if (cells.length !== expectedLength) {
    return fail("invalid-rle", "Cell RLE does not match the grid size.");
  }
  return cells;
}

interface BeadRecipePayload {
  payloadVersion: typeof BEAD_RECIPE_PAYLOAD_VERSION;
  rows: number;
  columns: number;
  palette: RgbColor[];
  cellsRle: BeadCellRun[];
  calibration: {
    inputMode: BeadInputMode;
    orientation: BeadOrientation;
  };
  beadPitchMm: number;
  compression: number;
  irregularity?: number;
  canvasMode?: "auto-expand";
}

export function createBeadRecipeSource(
  project: BeadProject,
): WorkshopRecipeSource {
  validateBeadProject(project);
  const payload: BeadRecipePayload = {
    payloadVersion: BEAD_RECIPE_PAYLOAD_VERSION,
    rows: project.rows,
    columns: project.columns,
    palette: project.palette.map((color) => [...color] as RgbColor),
    cellsRle: encodeBeadCellsRle(project.cells),
    calibration: {
      inputMode: project.calibration.inputMode,
      orientation: { ...project.calibration.orientation },
    },
    beadPitchMm: project.beadPitchMm,
    compression: project.compression,
    ...((project.irregularity ?? DEFAULT_BEAD_IRREGULARITY) > 0
      ? { irregularity: project.irregularity }
      : {}),
    ...(project.canvasMode === "auto-expand"
      ? { canvasMode: project.canvasMode }
      : {}),
  };
  assertRecipePayloadBound(payload);
  return {
    manifestSchemaVersion: WORKSHOP_MANIFEST_SCHEMA_VERSION,
    moduleId: project.moduleId,
    moduleVersion: project.moduleVersion,
    projectSchemaVersion: project.schemaVersion,
    renderSchemaVersion: project.renderSchemaVersion,
    payload: payload as unknown as Record<string, unknown>,
  };
}

function generatedProjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `bead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function restoreBeadProjectFromRecipeSource(
  source: WorkshopRecipeSource,
  options: RestoreBeadProjectOptions = {},
): BeadProject {
  if (
    source.manifestSchemaVersion !== WORKSHOP_MANIFEST_SCHEMA_VERSION ||
    source.moduleId !== BEAD_MODULE_ID ||
    source.projectSchemaVersion !== BEAD_PROJECT_SCHEMA_VERSION ||
    source.renderSchemaVersion !== BEAD_RENDER_SCHEMA_VERSION ||
    typeof source.moduleVersion !== "string" ||
    !SEMVER_PATTERN.test(source.moduleVersion) ||
    typeof source.payload !== "object" ||
    source.payload === null
  ) {
    return fail("invalid-recipe-source", "Workshop recipe source is not a bead project.");
  }

  const payload = source.payload;
  assertRecipePayloadBound(payload);
  if (payload.payloadVersion !== BEAD_RECIPE_PAYLOAD_VERSION) {
    return fail("invalid-recipe-source", "Bead recipe payload version is unsupported.");
  }
  if (
    payload.canvasMode !== undefined &&
    payload.canvasMode !== "auto-expand"
  ) {
    return fail("invalid-recipe-source", "Bead recipe canvas mode is unsupported.");
  }
  if (!isGridDimension(payload.rows) || !isGridDimension(payload.columns)) {
    return fail("invalid-dimensions", "Bead recipe grid is invalid.");
  }
  if (
    typeof payload.calibration !== "object" ||
    payload.calibration === null
  ) {
    return fail("invalid-recipe-source", "Bead recipe calibration is missing.");
  }
  const calibrationPayload = payload.calibration as Record<string, unknown>;
  const rows = payload.rows;
  const columns = payload.columns;
  const cells = decodeBeadCellsRle(payload.cellsRle, rows * columns);
  const now = options.now ?? new Date().toISOString();

  return createBeadProject({
    projectId: options.projectId ?? generatedProjectId(),
    moduleVersion: source.moduleVersion,
    now,
    rows,
    columns,
    palette: payload.palette as RgbColor[],
    cells,
    source: null,
    calibration: {
      inputMode: calibrationPayload.inputMode as BeadInputMode,
      crop: null,
      origin: { x: 0, y: 0 },
      orientation: calibrationPayload.orientation as BeadOrientation,
      emptySelection: { kind: "none" },
    },
    confidenceIssues: [],
    beadPitchMm: payload.beadPitchMm as number,
    compression: payload.compression as number,
    irregularity: payload.irregularity as number | undefined,
    canvasMode:
      payload.canvasMode === "auto-expand"
        ? "auto-expand"
        : undefined,
  });
}
