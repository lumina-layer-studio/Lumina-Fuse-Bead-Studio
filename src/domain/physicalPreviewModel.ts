import { estimateBeadThicknessMm } from "./beadThickness";
import type { BeadFusionSvgPath } from "./svgRenderer";
import type { BeadProject } from "./types";

const BOARD_THICKNESS_RATIO = 0.3;
const BOARD_CORNER_RADIUS_RATIO = 0.4;
const BOARD_PEG_RADIUS_RATIO = 0.14;
const BOARD_PEG_HEIGHT_RATIO = 0.3;
const BOARD_MARGIN_RATIO = 1.5;

function roundMillimeters(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function centeredPosition(index: number, count: number, pitchMm: number): number {
  return (index - (count - 1) / 2) * pitchMm;
}

export interface PhysicalPreviewPeg {
  cellIndex: number;
  xMm: number;
  zMm: number;
}

export interface PhysicalPreviewBoard {
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
  cornerRadiusMm: number;
  pegRadiusMm: number;
  pegHeightMm: number;
  pegs: PhysicalPreviewPeg[];
}

export interface PhysicalPreviewModel {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  beadPitchMm: number;
  surfacePaths: BeadFusionSvgPath[];
  board: PhysicalPreviewBoard;
}

function buildPreviewBoard(project: BeadProject): PhysicalPreviewBoard {
  const marginMm = project.beadPitchMm * BOARD_MARGIN_RATIO;
  const widthMm = roundMillimeters(
    project.columns * project.beadPitchMm + marginMm * 2,
  );
  const depthMm = roundMillimeters(
    project.rows * project.beadPitchMm + marginMm * 2,
  );
  return {
    widthMm,
    depthMm,
    thicknessMm: roundMillimeters(
      project.beadPitchMm * BOARD_THICKNESS_RATIO,
    ),
    cornerRadiusMm: roundMillimeters(
      project.beadPitchMm * BOARD_CORNER_RADIUS_RATIO,
    ),
    pegRadiusMm: roundMillimeters(
      project.beadPitchMm * BOARD_PEG_RADIUS_RATIO,
    ),
    pegHeightMm: roundMillimeters(
      project.beadPitchMm * BOARD_PEG_HEIGHT_RATIO,
    ),
    pegs: project.cells.map((_, cellIndex) => {
      const column = cellIndex % project.columns;
      const row = Math.floor(cellIndex / project.columns);
      return {
        cellIndex,
        xMm: centeredPosition(
          column,
          project.columns,
          project.beadPitchMm,
        ),
        zMm: centeredPosition(
          row,
          project.rows,
          project.beadPitchMm,
        ),
      };
    }),
  };
}

/**
 * Builds millimetre data for a canonical fused surface and preview-only board.
 * 生成标准压合表面与仅供预览使用的豆板毫米数据。
 */
export function buildPhysicalPreviewModel(
  project: BeadProject,
  surfacePaths: readonly BeadFusionSvgPath[],
): PhysicalPreviewModel {
  const board = buildPreviewBoard(project);
  return {
    widthMm: roundMillimeters(
      project.columns * project.beadPitchMm,
    ),
    depthMm: roundMillimeters(
      project.rows * project.beadPitchMm,
    ),
    heightMm: estimateBeadThicknessMm(
      project.compression,
      project.beadPitchMm,
    ),
    beadPitchMm: project.beadPitchMm,
    surfacePaths: surfacePaths.map((path) => ({ ...path })),
    board,
  };
}
