import type { WorkshopImageHandoff } from "@lumina/workshop-sdk";

import {
  calculatePhysicalSize,
  createBeadRecipeSource,
  validateBeadProject,
} from "../domain/project";
import type { BeadRenderResult } from "../domain/renderer";
import type { BeadProject } from "../domain/types";
import type { BeadImageCodec } from "./imageCodec";

const MAX_HANDOFF_PNG_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export interface PreparedBeadHandoff {
  base: Omit<WorkshopImageHandoff, "pngBytes">;
  pngBytes: ArrayBuffer;
}

export class BeadHandoffError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BeadHandoffError";
    this.code = code;
  }
}

function assertRenderMatchesProject(
  project: BeadProject,
  raster: BeadRenderResult,
): void {
  const expectedWidth = project.columns * raster.pixelsPerCell;
  const expectedHeight = project.rows * raster.pixelsPerCell;
  if (
    !Number.isInteger(raster.pixelsPerCell) ||
    raster.pixelsPerCell < 1 ||
    raster.width !== expectedWidth ||
    raster.height !== expectedHeight ||
    raster.data.length !== raster.width * raster.height * 4
  ) {
    throw new BeadHandoffError(
      "handoff-render-mismatch",
      "The bead render does not match the logical project grid.",
    );
  }
}

function assertPng(bytes: ArrayBuffer): void {
  if (
    bytes.byteLength > MAX_HANDOFF_PNG_BYTES ||
    bytes.byteLength < PNG_SIGNATURE.length
  ) {
    throw new BeadHandoffError(
      "handoff-png-size-invalid",
      "The encoded bead PNG is empty or exceeds 64 MiB.",
    );
  }
  const signature = new Uint8Array(bytes, 0, PNG_SIGNATURE.length);
  if (
    PNG_SIGNATURE.some((expected, index) => signature[index] !== expected)
  ) {
    throw new BeadHandoffError(
      "handoff-png-invalid",
      "The bead handoff encoder did not produce PNG bytes.",
    );
  }
}

export async function prepareBeadHandoff(
  project: BeadProject,
  raster: BeadRenderResult,
  imageCodec: BeadImageCodec,
  colorLibraryId: string | null,
): Promise<PreparedBeadHandoff> {
  validateBeadProject(project);
  assertRenderMatchesProject(project, raster);
  const pngBytes = await imageCodec.encodePng(raster);
  assertPng(pngBytes);
  const size = calculatePhysicalSize(project, project.beadPitchMm);
  return {
    base: {
      moduleId: project.moduleId,
      moduleVersion: project.moduleVersion,
      projectId: project.projectId,
      pixelWidth: raster.width,
      pixelHeight: raster.height,
      recommendedWidthMm: size.widthMm,
      recommendedHeightMm: size.heightMm,
      preserveCanvasBounds: true,
      layout: {
        kind: "square-grid",
        rows: project.rows,
        columns: project.columns,
        pitchMm: project.beadPitchMm,
      },
      colorLibraryId,
      recipeSource: structuredClone(createBeadRecipeSource(project)),
    },
    pngBytes: pngBytes.slice(0),
  };
}

export function toWorkshopImageHandoff(
  prepared: PreparedBeadHandoff,
): WorkshopImageHandoff {
  return {
    ...prepared.base,
    pngBytes: prepared.pngBytes.slice(0),
  };
}
