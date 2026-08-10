import {
  buildBeadFusionPreviewSvg,
  type BeadFusionPreviewSvg,
} from "../domain/svgRenderer";
import type { BeadProject } from "../domain/types";
import { BeadWorkerClient } from "./workerClient";

export interface BeadFusionPreviewRenderer {
  render(project: BeadProject): Promise<BeadFusionPreviewSvg>;
  dispose(): void;
}

class LocalBeadFusionPreviewRenderer
  implements BeadFusionPreviewRenderer
{
  render(project: BeadProject): Promise<BeadFusionPreviewSvg> {
    return Promise.resolve().then(() =>
      buildBeadFusionPreviewSvg(project),
    );
  }

  dispose(): void {}
}

class WorkerBeadFusionPreviewRenderer
  implements BeadFusionPreviewRenderer
{
  private readonly client = new BeadWorkerClient();

  render(project: BeadProject): Promise<BeadFusionPreviewSvg> {
    return this.client.renderPreview(project).promise;
  }

  dispose(): void {
    this.client.dispose();
  }
}

export function createBeadFusionPreviewRenderer(): BeadFusionPreviewRenderer {
  return typeof globalThis.Worker === "undefined"
    ? new LocalBeadFusionPreviewRenderer()
    : new WorkerBeadFusionPreviewRenderer();
}
