import { describe, expect, it, vi } from "vitest";

import { createBeadProject } from "../src/domain/project";
import {
  BeadWorkerClient,
  BeadWorkerClientError,
  createBeadWorker,
  type BeadWorkerLike,
} from "../src/worker/workerClient";
import type {
  BeadWorkerRequest,
  BeadWorkerResponse,
} from "../src/worker/workerProtocol";
import type { Raster } from "../src/domain/types";

class FakeWorker implements BeadWorkerLike {
  onmessage:
    | ((event: MessageEvent<BeadWorkerResponse>) => void)
    | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly posted: Array<{
    message: BeadWorkerRequest;
    transfer: Transferable[];
  }> = [];

  readonly terminate = vi.fn();

  postMessage(
    message: BeadWorkerRequest,
    transfer: Transferable[] = [],
  ): void {
    this.posted.push({ message, transfer });
  }

  emit(message: BeadWorkerResponse): void {
    this.onmessage?.(
      { data: message } as MessageEvent<BeadWorkerResponse>,
    );
  }
}

function raster(): Raster {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]),
  };
}

function beadProject() {
  return createBeadProject({
    projectId: "worker-surface",
    moduleVersion: "1.0.8-dev.23",
    now: "2026-08-11T00:00:00.000Z",
    rows: 1,
    columns: 1,
    palette: [[230, 40, 50]],
    cells: [{ kind: "color", paletteIndex: 0 }],
  });
}

describe("bead worker client", () => {
  it("constructs the worker from the build-inlined module", () => {
    class TestWorker {
      readonly terminate = vi.fn();
    }
    vi.stubGlobal("Worker", TestWorker);

    const worker = createBeadWorker();

    expect(worker).toBeInstanceOf(TestWorker);
    worker.terminate();
    vi.unstubAllGlobals();
  });

  it("cancels older requests and ignores their late responses", async () => {
    const worker = new FakeWorker();
    const client = new BeadWorkerClient(() => worker);
    const first = client.classify(raster());
    const second = client.classify(raster());

    expect(second.id).toBe(first.id + 1);
    client.cancelBefore(second.id);
    await expect(first.promise).rejects.toMatchObject({
      code: "request-cancelled",
    });

    worker.emit({
      id: first.id,
      ok: true,
      type: "classify",
      result: {
        mode: "hard-pixel",
        confidence: 0.9,
        scores: {
          "numbered-grid": 0,
          "hard-pixel": 0.9,
          "ring-preview": 0,
        },
      },
    });
    worker.emit({
      id: second.id,
      ok: true,
      type: "classify",
      result: {
        mode: "ring-preview",
        confidence: 0.95,
        scores: {
          "numbered-grid": 0,
          "hard-pixel": 0.1,
          "ring-preview": 0.95,
        },
      },
    });

    await expect(second.promise).resolves.toMatchObject({
      mode: "ring-preview",
    });
  });

  it("transfers a private raster copy without detaching the caller source", () => {
    const worker = new FakeWorker();
    const client = new BeadWorkerClient(() => worker);
    const source = raster();

    client.classify(source);

    const posted = worker.posted[0];
    expect(posted?.message.type).toBe("classify");
    if (posted?.message.type !== "classify") {
      throw new Error("expected classify request");
    }
    expect(posted.message.raster.data).not.toBe(source.data);
    expect(posted.message.raster.data).toEqual(source.data);
    expect(posted.transfer).toEqual([
      posted.message.raster.data.buffer,
    ]);
    expect(source.data.byteLength).toBe(16);
  });

  it("posts and resolves the dedicated fusion-surface request", async () => {
    const worker = new FakeWorker();
    const client = new BeadWorkerClient(() => worker);
    const project = beadProject();
    const task = client.renderSurface(project);
    const paths = [{
      cellIndex: 0,
      d: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
      fill: "rgb(230,40,50)",
      strokeWidth: 0,
    }];

    expect(worker.posted[0]?.message).toEqual({
      id: task.id,
      type: "render-surface",
      project: { ...project, source: null },
    });
    worker.emit({
      id: task.id,
      ok: true,
      type: "render-surface",
      result: paths,
    });

    await expect(task.promise).resolves.toEqual(paths);
    client.dispose();
  });

  it("rejects worker failures with a stable error code", async () => {
    const worker = new FakeWorker();
    const client = new BeadWorkerClient(() => worker);
    const task = client.classify(raster());

    worker.emit({
      id: task.id,
      ok: false,
      errorCode: "invalid-raster",
      message: "Raster is invalid.",
    });

    await expect(task.promise).rejects.toEqual(
      expect.objectContaining({
        name: "BeadWorkerClientError",
        code: "invalid-raster",
      }),
    );
  });

  it("disposes exactly once and rejects every outstanding task", async () => {
    const worker = new FakeWorker();
    const client = new BeadWorkerClient(() => worker);
    const first = client.classify(raster());
    const second = client.classify(raster());

    client.dispose();
    client.dispose();

    await expect(first.promise).rejects.toBeInstanceOf(
      BeadWorkerClientError,
    );
    await expect(first.promise).rejects.toMatchObject({
      code: "worker-disposed",
    });
    await expect(second.promise).rejects.toMatchObject({
      code: "worker-disposed",
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(() => client.classify(raster())).toThrowError(
      expect.objectContaining({ code: "worker-disposed" }),
    );
  });
});
