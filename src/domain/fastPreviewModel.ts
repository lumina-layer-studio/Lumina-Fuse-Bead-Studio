import { estimateBeadThicknessMm } from "./beadThickness";
import {
  resolveBeadFusionCellDeformation,
  resolveBeadFusionSharedProfile,
} from "./fusionGeometry";
import {
  buildPhysicalPreviewLayout,
  type PhysicalPreviewBoard,
  type PhysicalPreviewLayout,
} from "./physicalPreviewModel";
import type { BeadProject, RgbColor } from "./types";

/**
 * One renderable cell in the lightweight fused-bead preview.
 * 轻量压合拼豆预览中的单个可渲染格子。
 */
export interface FastBeadPreviewSlot {
  cellIndex: number;
  visible: boolean;
  color: RgbColor | null;
  xMm: number;
  zMm: number;
  scaleX: number;
  scaleZ: number;
}

/**
 * Renderer-agnostic data for a lightweight fused-bead preview.
 * 与渲染器无关的轻量压合拼豆预览数据。
 */
export interface FastBeadPreviewModel {
  projectId: string;
  rows: number;
  columns: number;
  beadPitchMm: number;
  outerRadiusMm: number;
  holeRadiusMm: number;
  contactReachMm: number;
  heightMm: number;
  board: PhysicalPreviewBoard;
  slots: FastBeadPreviewSlot[];
}

interface AxisTransform {
  centerShift: number;
  scale: number;
}

function hasColoredCell(
  project: BeadProject,
  row: number,
  column: number,
): boolean {
  if (
    row < 0 ||
    row >= project.rows ||
    column < 0 ||
    column >= project.columns
  ) {
    return false;
  }
  return project.cells[row * project.columns + column]?.kind === "color";
}

function axisTransform(
  negativeExtent: number,
  positiveExtent: number,
  outerRadius: number,
): AxisTransform {
  return {
    centerShift: (positiveExtent - negativeExtent) / 2,
    scale: (positiveExtent + negativeExtent) / (2 * outerRadius),
  };
}

/**
 * Builds a cheap, deterministic fused-bead model without Three.js dependencies.
 * 构建不依赖 Three.js 的轻量且确定的压合拼豆模型。
 */
export function buildFastBeadPreviewModel(
  project: BeadProject,
  layout: PhysicalPreviewLayout = buildPhysicalPreviewLayout(project),
): FastBeadPreviewModel {
  const profile = resolveBeadFusionSharedProfile(
    project.compression,
    project.irregularity,
  );
  const pitchMm = layout.beadPitchMm;
  const outerRadiusMm = profile.outerRadius * pitchMm;

  return {
    projectId: project.projectId,
    rows: project.rows,
    columns: project.columns,
    beadPitchMm: pitchMm,
    outerRadiusMm,
    holeRadiusMm: profile.holeRadius * pitchMm,
    contactReachMm: profile.contactReach * pitchMm,
    heightMm: estimateBeadThicknessMm(project.compression, pitchMm),
    board: layout.board,
    slots: project.cells.map((cell, cellIndex) => {
      const row = Math.floor(cellIndex / project.columns);
      const column = cellIndex % project.columns;
      const peg = layout.board.pegs[cellIndex];
      if (!peg) throw new Error(`Missing physical peg for cell ${cellIndex}.`);
      if (cell.kind === "empty") {
        return {
          cellIndex,
          visible: false,
          color: null,
          xMm: peg.xMm,
          zMm: peg.zMm,
          scaleX: 1,
          scaleZ: 1,
        };
      }

      const deformation = resolveBeadFusionCellDeformation(
        row,
        column,
        project.compression,
        project.irregularity,
      );
      const leftExtent = hasColoredCell(project, row, column - 1)
        ? profile.contactReach
        : profile.outerRadius + deformation.radiusXDelta;
      const rightExtent = hasColoredCell(project, row, column + 1)
        ? profile.contactReach
        : profile.outerRadius + deformation.radiusXDelta;
      const topExtent = hasColoredCell(project, row - 1, column)
        ? profile.contactReach
        : profile.outerRadius + deformation.radiusYDelta;
      const bottomExtent = hasColoredCell(project, row + 1, column)
        ? profile.contactReach
        : profile.outerRadius + deformation.radiusYDelta;
      const horizontal = axisTransform(
        leftExtent,
        rightExtent,
        profile.outerRadius,
      );
      const vertical = axisTransform(
        topExtent,
        bottomExtent,
        profile.outerRadius,
      );

      return {
        cellIndex,
        visible: true,
        color: [...project.palette[cell.paletteIndex]] as RgbColor,
        xMm:
          (deformation.center.x - project.columns / 2 + horizontal.centerShift) *
          pitchMm,
        zMm:
          (deformation.center.y - project.rows / 2 + vertical.centerShift) *
          pitchMm,
        scaleX: horizontal.scale,
        scaleZ: vertical.scale,
      };
    }),
  };
}
