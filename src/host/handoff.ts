import type {
  WorkshopClient,
  WorkshopImageHandoff,
} from "@lumina/workshop-sdk";

import {
  calculatePhysicalSize,
  createBeadRecipeSource,
  validateBeadProject,
} from "../domain/project";
import { estimateBeadThicknessMm } from "../domain/beadThickness";
import type { BeadRenderResult } from "../domain/renderer";
import { encodeBeadProjectSvg } from "../domain/svgRenderer";
import {
  BEAD_MODULE_ID,
  BEAD_MODULE_VERSION,
  type BeadProject,
} from "../domain/types";
import type { BeadImageCodec } from "./imageCodec";

const MAX_HANDOFF_PNG_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

interface BeadWorkshopImageBase
  extends Omit<WorkshopImageHandoff, "pngBytes"> {
  recommendedTotalThicknessMm: number;
}

export interface PreparedBeadHandoff {
  base: BeadWorkshopImageBase;
  pngBytes: ArrayBuffer;
  svgBytes: ArrayBuffer;
}

export interface BeadWorkshopImageHandoff
  extends WorkshopImageHandoff {
  svgBytes: ArrayBuffer;
  recommendedTotalThicknessMm: number;
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
  const svgBytes = encodeBeadProjectSvg(project);
  if (
    svgBytes.byteLength === 0 ||
    pngBytes.byteLength + svgBytes.byteLength > MAX_HANDOFF_PNG_BYTES
  ) {
    throw new BeadHandoffError(
      "handoff-binary-size-invalid",
      "The combined bead SVG and PNG fallback exceed 64 MiB.",
    );
  }
  const size = calculatePhysicalSize(project, project.beadPitchMm);
  const recipeSource = {
    ...createBeadRecipeSource(project),
    moduleId: BEAD_MODULE_ID,
    moduleVersion: BEAD_MODULE_VERSION,
  };
  return {
    base: {
      moduleId: BEAD_MODULE_ID,
      moduleVersion: BEAD_MODULE_VERSION,
      projectId: project.projectId,
      pixelWidth: raster.width,
      pixelHeight: raster.height,
      recommendedWidthMm: size.widthMm,
      recommendedHeightMm: size.heightMm,
      recommendedTotalThicknessMm: estimateBeadThicknessMm(
        project.compression,
        project.beadPitchMm,
      ),
      preserveCanvasBounds: true,
      layout: {
        kind: "square-grid",
        rows: project.rows,
        columns: project.columns,
        pitchMm: project.beadPitchMm,
      },
      colorLibraryId,
      recipeSource: structuredClone(recipeSource),
    },
    pngBytes: pngBytes.slice(0),
    svgBytes: svgBytes.slice(0),
  };
}

export function toWorkshopImageHandoff(
  prepared: PreparedBeadHandoff,
): BeadWorkshopImageHandoff {
  return {
    ...prepared.base,
    pngBytes: prepared.pngBytes.slice(0),
    svgBytes: prepared.svgBytes.slice(0),
  };
}

function toLegacyWorkshopImageHandoff(
  prepared: PreparedBeadHandoff,
): WorkshopImageHandoff {
  const { recommendedTotalThicknessMm: _thickness, ...legacyBase } =
    prepared.base;
  return {
    ...legacyBase,
    pngBytes: prepared.pngBytes.slice(0),
  };
}

function isLegacyPayloadRejection(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "rpc-payload-invalid"
  );
}

export async function handoffPreparedBeadImage(
  client: Pick<WorkshopClient, "handoff">,
  prepared: PreparedBeadHandoff,
): Promise<{ status: "needs-confirmation" | "completed" }> {
  try {
    return await client.handoff.image(
      toWorkshopImageHandoff(prepared),
    );
  } catch (error) {
    if (!isLegacyPayloadRejection(error)) throw error;
    return client.handoff.image(
      toLegacyWorkshopImageHandoff(prepared),
    );
  }
}
