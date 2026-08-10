import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBeadProject } from "../src/domain/project";

const svgRendererMocks = vi.hoisted(() => ({
  buildPreview: vi.fn(),
  buildSurface: vi.fn(),
}));

vi.mock("../src/domain/svgRenderer", () => ({
  buildBeadFusionPreviewSvg: svgRendererMocks.buildPreview,
  buildBeadFusionSurfacePaths: svgRendererMocks.buildSurface,
}));

import { processBeadWorkerRequest } from "../src/worker/beadWorker";

function project() {
  return createBeadProject({
    projectId: "worker-surface-dispatch",
    moduleVersion: "1.0.8-dev.23",
    now: "2026-08-11T00:00:00.000Z",
    rows: 1,
    columns: 1,
    palette: [[230, 40, 50]],
    cells: [{ kind: "color", paletteIndex: 0 }],
  });
}

const surfacePaths = [{
  cellIndex: 0,
  d: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
  fill: "rgb(230,40,50)",
  strokeWidth: 0,
}];

describe("bead worker surface dispatch", () => {
  beforeEach(() => {
    svgRendererMocks.buildPreview.mockReset();
    svgRendererMocks.buildSurface.mockReset();
    svgRendererMocks.buildPreview.mockReturnValue({
      paths: surfacePaths,
      reliefD: "",
    });
    svgRendererMocks.buildSurface.mockReturnValue(surfacePaths);
  });

  it("builds a dedicated low-detail fusion surface", () => {
    const response = processBeadWorkerRequest({
      id: 9,
      type: "render-surface",
      project: project(),
    });

    expect(response).toEqual({
      id: 9,
      ok: true,
      type: "render-surface",
      result: surfacePaths,
    });
    expect(svgRendererMocks.buildSurface).toHaveBeenCalledOnce();
    expect(svgRendererMocks.buildPreview).not.toHaveBeenCalled();
  });

  it("keeps the existing preview request on the lightweight builder", () => {
    const response = processBeadWorkerRequest({
      id: 10,
      type: "render-preview",
      project: project(),
    });

    expect(response).toEqual({
      id: 10,
      ok: true,
      type: "render-preview",
      result: { paths: surfacePaths, reliefD: "" },
    });
    expect(svgRendererMocks.buildPreview).toHaveBeenCalledOnce();
    expect(svgRendererMocks.buildSurface).not.toHaveBeenCalled();
  });
});
