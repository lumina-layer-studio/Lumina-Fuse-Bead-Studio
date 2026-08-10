import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBeadProject } from "../src/domain/project";
import type { BeadFusionSvgPath } from "../src/domain/svgRenderer";
import type { BeadProject } from "../src/domain/types";
import type {
  BeadWorkerRequest,
  BeadWorkerResponse,
} from "../src/worker/workerProtocol";

const svgRendererMocks = vi.hoisted(() => ({
  buildPreview: vi.fn(),
  buildSurface: vi.fn(),
}));

vi.mock("../src/domain/svgRenderer", () => ({
  buildBeadFusionPreviewSvg: svgRendererMocks.buildPreview,
  buildBeadFusionSurfacePaths: svgRendererMocks.buildSurface,
}));

import * as previewRenderer from "../src/worker/previewRenderer";

function project() {
  return createBeadProject({
    projectId: "surface-renderer",
    moduleVersion: "1.0.8-dev.23",
    now: "2026-08-11T00:00:00.000Z",
    rows: 1,
    columns: 1,
    palette: [[230, 40, 50]],
    cells: [{ kind: "color", paletteIndex: 0 }],
  });
}

const surfacePaths: BeadFusionSvgPath[] = [{
  cellIndex: 0,
  d: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
  fill: "rgb(230,40,50)",
  strokeWidth: 0,
}];

class RecordingWorker {
  static latest: RecordingWorker | null = null;

  onmessage:
    | ((event: MessageEvent<BeadWorkerResponse>) => void)
    | null = null;

  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly posted: BeadWorkerRequest[] = [];
  readonly terminate = vi.fn();

  constructor() {
    RecordingWorker.latest = this;
  }

  postMessage(message: BeadWorkerRequest): void {
    this.posted.push(message);
  }

  emit(response: BeadWorkerResponse): void {
    this.onmessage?.(
      { data: response } as MessageEvent<BeadWorkerResponse>,
    );
  }
}

function createSurfaceRenderer() {
  const factory = (
    previewRenderer as typeof previewRenderer & {
      createBeadFusionSurfaceRenderer?: () => {
        render(project: BeadProject): Promise<BeadFusionSvgPath[]>;
        dispose(): void;
      };
    }
  ).createBeadFusionSurfaceRenderer;
  expect(factory).toBeTypeOf("function");
  return factory!();
}

describe("fusion surface renderer", () => {
  beforeEach(() => {
    svgRendererMocks.buildPreview.mockReset();
    svgRendererMocks.buildSurface.mockReset();
    svgRendererMocks.buildPreview.mockReturnValue({
      paths: surfacePaths,
      reliefD: "",
    });
    svgRendererMocks.buildSurface.mockReturnValue(surfacePaths);
    RecordingWorker.latest = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defers local surface generation to a microtask", async () => {
    vi.stubGlobal("Worker", undefined);
    const renderer = createSurfaceRenderer();

    const result = renderer.render(project());
    expect(svgRendererMocks.buildSurface).not.toHaveBeenCalled();

    await expect(result).resolves.toEqual(surfacePaths);
    expect(svgRendererMocks.buildSurface).toHaveBeenCalledOnce();
    expect(svgRendererMocks.buildPreview).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("uses the dedicated worker request and terminates it on dispose", async () => {
    vi.stubGlobal("Worker", RecordingWorker);
    const renderer = createSurfaceRenderer();
    const result = renderer.render(project());
    const worker = RecordingWorker.latest;

    expect(worker?.posted[0]).toMatchObject({
      id: 1,
      type: "render-surface",
    });
    worker?.emit({
      id: 1,
      ok: true,
      type: "render-surface",
      result: surfacePaths,
    });

    await expect(result).resolves.toEqual(surfacePaths);
    renderer.dispose();
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });

  it("keeps local 2D preview rendering on the lightweight builder", async () => {
    vi.stubGlobal("Worker", undefined);
    const renderer = previewRenderer.createBeadFusionPreviewRenderer();
    const result = renderer.render(project());

    expect(svgRendererMocks.buildPreview).not.toHaveBeenCalled();
    await expect(result).resolves.toEqual({
      paths: surfacePaths,
      reliefD: "",
    });
    expect(svgRendererMocks.buildPreview).toHaveBeenCalledOnce();
    expect(svgRendererMocks.buildSurface).not.toHaveBeenCalled();
    renderer.dispose();
  });
});
