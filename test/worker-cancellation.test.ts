import { describe, expect, it, vi } from "vitest";

import { createBeadProject } from "../src/domain/project";
import type { RecognitionRequest } from "../src/domain/types";
import {
  BeadWorkerClient,
  type BeadWorkerLike,
} from "../src/worker/workerClient";
import type {
  BeadWorkerRequest,
  BeadWorkerResponse,
} from "../src/worker/workerProtocol";
import { makeHardPixelFixture } from "./helpers/beadFixtures";

class RecordingWorker implements BeadWorkerLike {
  onmessage:
    | ((event: MessageEvent<BeadWorkerResponse>) => void)
    | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly requests: BeadWorkerRequest[] = [];
  readonly terminate = vi.fn();

  postMessage(message: BeadWorkerRequest): void {
    this.requests.push(message);
  }

  emit(response: BeadWorkerResponse): void {
    this.onmessage?.(
      { data: response } as MessageEvent<BeadWorkerResponse>,
    );
  }
}

describe("worker supersession", () => {
  it("uses monotonic IDs and ignores stale classify and recognize results", async () => {
    const worker = new RecordingWorker();
    const client = new BeadWorkerClient(() => worker);
    const raster = makeHardPixelFixture({
      rows: 2,
      columns: 2,
      scale: 8,
    });
    const recognition: RecognitionRequest = {
      source: raster,
      mode: "hard-pixel",
      rows: 2,
      columns: 2,
      geometry: {
        originX: 0,
        originY: 0,
        cellWidth: 8,
        cellHeight: 8,
      },
      emptySelection: { kind: "sample", cellIndex: 0 },
      transparentSupportSampleCellIndex: null,
      orientation: {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      },
    };
    const project = createBeadProject({
      projectId: "worker-cancellation",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 2,
      columns: 2,
      palette: [[230, 40, 50]],
      cells: Array.from(
        { length: 4 },
        () => ({ kind: "color", paletteIndex: 0 }) as const,
      ),
    });

    const classify = client.classify(raster);
    const recognize = client.recognize(recognition);
    const render = client.render(project, 80, 12);

    expect([classify.id, recognize.id, render.id]).toEqual([1, 2, 3]);
    expect(worker.requests.map((request) => request.type)).toEqual([
      "classify",
      "recognize",
      "render",
    ]);

    client.cancelBefore(render.id);
    await expect(classify.promise).rejects.toMatchObject({
      code: "request-cancelled",
    });
    await expect(recognize.promise).rejects.toMatchObject({
      code: "request-cancelled",
    });

    worker.emit({
      id: classify.id,
      ok: true,
      type: "classify",
      result: {
        mode: "numbered-grid",
        confidence: 0.9,
        scores: {
          "numbered-grid": 0.9,
          "hard-pixel": 0.1,
          "ring-preview": 0,
        },
      },
    });
    worker.emit({
      id: recognize.id,
      ok: true,
      type: "recognize",
      result: {
        mode: "hard-pixel",
        rows: 1,
        columns: 1,
        palette: [],
        cells: [{ kind: "empty" }],
        confidenceIssues: [],
      },
    });
    worker.emit({
      id: render.id,
      ok: true,
      type: "render",
      result: {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([230, 40, 50, 255]),
        palette: [[230, 40, 50]],
        compression: 80,
        pixelsPerCell: 12,
      },
    });

    await expect(render.promise).resolves.toMatchObject({
      compression: 80,
      pixelsPerCell: 12,
    });
    client.dispose();
  });
});
