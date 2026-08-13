import type { Raster } from "../domain/types";
import type { BeadRenderResult } from "../domain/renderer";
import type {
  BeadFusionPreviewSvg,
  BeadFusionSvgPath,
} from "../domain/svgRenderer";
import type {
  BeadProject,
  PatternClassification,
  RecognitionRequest,
  RecognitionResult,
} from "../domain/types";

export type BeadWorkerRequest =
  | {
      id: number;
      type: "classify";
      raster: Raster;
    }
  | {
      id: number;
      type: "recognize";
      request: RecognitionRequest;
    }
  | {
      id: number;
      type: "render";
      project: BeadProject;
      compression: number;
      pixelsPerCell: number;
    }
  | {
      id: number;
      type: "render-preview";
      project: BeadProject;
    }
  | {
      id: number;
      type: "render-surface";
      project: BeadProject;
    };

export type BeadWorkerResponse =
  | {
      id: number;
      ok: true;
      type: "classify";
      result: PatternClassification;
    }
  | {
      id: number;
      ok: true;
      type: "recognize";
      result: RecognitionResult;
    }
  | {
      id: number;
      ok: true;
      type: "render";
      result: BeadRenderResult;
    }
  | {
      id: number;
      ok: true;
      type: "render-preview";
      result: BeadFusionPreviewSvg;
    }
  | {
      id: number;
      ok: true;
      type: "render-surface";
      result: BeadFusionSvgPath[];
    }
  | {
      id: number;
      ok: false;
      errorCode: string;
      message: string;
    };

export type BeadWorkerRequestType = BeadWorkerRequest["type"];

export interface BeadWorkerResultMap {
  classify: PatternClassification;
  recognize: RecognitionResult;
  render: BeadRenderResult;
  "render-preview": BeadFusionPreviewSvg;
  "render-surface": BeadFusionSvgPath[];
}
