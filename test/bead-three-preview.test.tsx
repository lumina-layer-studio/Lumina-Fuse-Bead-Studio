import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BeadThreePreview,
  MAX_THREE_PREVIEW_BEADS,
  supportsBeadThreePreviewCount,
} from "../src/app/BeadThreePreview";
import type {
  BeadThreePreviewController,
  CreateBeadThreePreviewController,
} from "../src/app/beadThreePreviewController";
import { buildPhysicalPreviewModel } from "../src/domain/physicalPreviewModel";
import { createBeadProject } from "../src/domain/project";
import type { BeadFusionSvgPath } from "../src/domain/svgRenderer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class ResizeObserverStub implements ResizeObserver {
  static instances: ResizeObserverStub[] = [];

  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.push(this);
  }

  trigger(): void {
    this.callback([], this);
  }
}

function makeProject() {
  return createBeadProject({
    projectId: "three-preview",
    moduleVersion: "1.0.8",
    now: "2026-08-10T00:00:00.000Z",
    rows: 1,
    columns: 2,
    palette: [
      [230, 40, 50],
      [20, 120, 210],
    ],
    cells: [
      { kind: "color", paletteIndex: 0 },
      { kind: "color", paletteIndex: 1 },
    ],
    compression: 40,
    irregularity: 10,
  });
}

function makeController(): BeadThreePreviewController {
  return {
    update: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeSurfacePaths(fill = "rgb(230,40,50)"): BeadFusionSvgPath[] {
  return [
    {
      cellIndex: 0,
      d: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
      fill,
      strokeWidth: 0,
    },
  ];
}

function makeSurfaceRenderer(
  promise: Promise<BeadFusionSvgPath[]>,
) {
  return {
    render: vi.fn(() => promise),
    dispose: vi.fn(),
  };
}

describe("BeadThreePreview", () => {
  beforeEach(() => {
    ResizeObserverStub.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caps full 3D extrusion before a legal maximum grid can exhaust browser memory", () => {
    expect(MAX_THREE_PREVIEW_BEADS).toBe(4_096);
    expect(supportsBeadThreePreviewCount(MAX_THREE_PREVIEW_BEADS)).toBe(true);
    expect(supportsBeadThreePreviewCount(MAX_THREE_PREVIEW_BEADS + 1)).toBe(false);
  });

  it("does not create WebGL or a surface Worker when the project exceeds the safe 3D limit", async () => {
    const rows = 65;
    const columns = 64;
    const cellCount = rows * columns;
    const project = createBeadProject({
      projectId: "three-preview-safe-limit",
      moduleVersion: "1.0.8",
      now: "2026-08-11T00:00:00.000Z",
      rows,
      columns,
      palette: [[230, 40, 50]],
      cells: Array.from({ length: cellCount }, () => ({
        kind: "color" as const,
        paletteIndex: 0,
      })),
      compression: 80,
      irregularity: 20,
    });
    const createController = vi.fn(() => makeController());
    const createSurfaceRenderer = vi.fn(() =>
      makeSurfaceRenderer(Promise.resolve(makeSurfacePaths())),
    );

    render(
      <BeadThreePreview
        project={project}
        ariaLabel="超限二维压合预览"
        createController={createController}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    expect(
      await screen.findByRole("img", { name: "超限二维压合预览" }),
    ).toHaveProperty("tagName", "svg");
    expect(createController).not.toHaveBeenCalled();
    expect(createSurfaceRenderer).not.toHaveBeenCalled();
  });

  it("waits for the asynchronous fusion surface before updating the 3D controller", async () => {
    const project = makeProject();
    const controller = makeController();
    const pending = deferred<BeadFusionSvgPath[]>();
    const renderer = makeSurfaceRenderer(pending.promise);
    render(
      <BeadThreePreview
        project={project}
        ariaLabel="异步三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );

    const canvas = screen.getByRole("img", { name: "异步三维预览" });
    expect(canvas).toHaveAttribute("aria-busy", "true");
    expect(renderer.render).toHaveBeenCalledWith(project);
    expect(controller.update).not.toHaveBeenCalled();

    const surfacePaths = makeSurfacePaths();
    await act(async () => {
      pending.resolve(surfacePaths);
      await pending.promise;
    });

    expect(controller.update).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenLastCalledWith(
      buildPhysicalPreviewModel(project, surfacePaths),
    );
    expect(canvas).toHaveAttribute("aria-busy", "false");
  });

  it("ignores a superseded surface result that resolves after the latest project", async () => {
    const firstProject = makeProject();
    const latestProject = {
      ...firstProject,
      projectId: "three-preview-latest",
      compression: 88,
    };
    const controller = makeController();
    const firstPending = deferred<BeadFusionSvgPath[]>();
    const latestPending = deferred<BeadFusionSvgPath[]>();
    const firstRenderer = makeSurfaceRenderer(firstPending.promise);
    const latestRenderer = makeSurfaceRenderer(latestPending.promise);
    const createSurfaceRenderer = vi
      .fn()
      .mockReturnValueOnce(firstRenderer)
      .mockReturnValueOnce(latestRenderer);
    const view = render(
      <BeadThreePreview
        project={firstProject}
        ariaLabel="最新三维预览"
        createController={() => controller}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    view.rerender(
      <BeadThreePreview
        project={latestProject}
        ariaLabel="最新三维预览"
        createController={() => controller}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );
    expect(firstRenderer.dispose).toHaveBeenCalledTimes(1);

    const latestSurfacePaths = makeSurfacePaths("rgb(20,120,210)");
    await act(async () => {
      latestPending.resolve(latestSurfacePaths);
      await latestPending.promise;
    });
    expect(controller.update).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenLastCalledWith(
      buildPhysicalPreviewModel(
        latestProject,
        latestSurfacePaths,
      ),
    );

    await act(async () => {
      firstPending.resolve(makeSurfacePaths());
      await firstPending.promise;
    });
    expect(controller.update).toHaveBeenCalledTimes(1);
  });

  it("keeps one controller while applying resolved physical surfaces", async () => {
    const project = makeProject();
    const controller = makeController();
    const createController = vi.fn(() => controller);
    const initialSurfacePaths = makeSurfacePaths();
    const initialRenderer = makeSurfaceRenderer(
      Promise.resolve(initialSurfacePaths),
    );
    const updatedSurfacePaths = makeSurfacePaths("rgb(245,190,35)");
    const updatedRenderer = makeSurfaceRenderer(
      Promise.resolve(updatedSurfacePaths),
    );
    const createSurfaceRenderer = vi
      .fn()
      .mockReturnValueOnce(initialRenderer)
      .mockReturnValueOnce(updatedRenderer);
    const view = render(
      <BeadThreePreview
        project={project}
        ariaLabel="全局三维预览"
        createController={createController}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    expect(createController).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(controller.update).toHaveBeenCalledTimes(1);
    });
    expect(controller.update).toHaveBeenLastCalledWith(
      buildPhysicalPreviewModel(project, initialSurfacePaths),
    );

    const updatedProject = {
      ...project,
      palette: [
        [245, 190, 35],
        [20, 120, 210],
      ] as [[number, number, number], [number, number, number]],
      compression: 86,
      irregularity: 72,
    };
    view.rerender(
      <BeadThreePreview
        project={updatedProject}
        ariaLabel="全局三维预览"
        createController={createController}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    expect(createController).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(controller.update).toHaveBeenCalledTimes(2);
    });
    expect(controller.update).toHaveBeenLastCalledWith(
      buildPhysicalPreviewModel(
        updatedProject,
        updatedSurfacePaths,
      ),
    );
    expect(initialRenderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("resizes from the observed container and caps device pixel ratio", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 3,
    });
    const controller = makeController();
    const renderer = makeSurfaceRenderer(
      Promise.resolve(makeSurfacePaths()),
    );
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="三维尺寸预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );
    const canvas = screen.getByRole("img", { name: "三维尺寸预览" });
    const container = canvas.parentElement;
    expect(container).not.toBeNull();
    expect(canvas).toHaveStyle({
      display: "block",
      width: "100%",
      height: "100%",
    });
    vi.spyOn(container!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 640,
      bottom: 360,
      left: 0,
      width: 640,
      height: 360,
      toJSON: () => undefined,
    });

    act(() => {
      ResizeObserverStub.instances[0]?.trigger();
    });

    expect(controller.resize).toHaveBeenLastCalledWith(640, 360, 1.5);
    expect(ResizeObserverStub.instances[0]?.observe).toHaveBeenCalledWith(
      container,
    );
  });

  it("disposes its controller and pending surface renderer exactly once on unmount", async () => {
    const controller = makeController();
    const pending = deferred<BeadFusionSvgPath[]>();
    const renderer = makeSurfaceRenderer(pending.promise);
    const view = render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="待卸载三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );

    view.unmount();

    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(ResizeObserverStub.instances[0]?.disconnect).toHaveBeenCalledTimes(
      1,
    );

    await act(async () => {
      pending.resolve(makeSurfacePaths());
      await pending.promise;
    });
    expect(controller.update).not.toHaveBeenCalled();
  });

  it("falls back to the SVG truth view when controller creation fails", async () => {
    const project = makeProject();
    const createController: CreateBeadThreePreviewController = () => {
      throw new Error("WebGL unavailable");
    };
    const createSurfaceRenderer = vi.fn(() =>
      makeSurfaceRenderer(Promise.resolve(makeSurfacePaths())),
    );
    render(
      <BeadThreePreview
        project={project}
        ariaLabel="创建失败降级预览"
        createController={createController}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    const fallback = await screen.findByRole("img", {
      name: "创建失败降级预览",
    });
    expect(fallback.tagName).toBe("svg");
    await waitFor(() => {
      expect(
        fallback.querySelectorAll("[data-bead-fusion-path]"),
      ).toHaveLength(2);
    });
    expect(createSurfaceRenderer).not.toHaveBeenCalled();
  });

  it("falls back to the SVG truth view when fusion-surface rendering fails", async () => {
    const controller = makeController();
    const renderer = makeSurfaceRenderer(
      Promise.reject(new Error("surface worker failed")),
    );
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="表面失败降级预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: "表面失败降级预览" }),
      ).toHaveProperty("tagName", "svg");
    });
    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("falls back when the surface Worker throws during synchronous creation", async () => {
    const controller = makeController();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="Worker 创建失败降级预览"
        createController={() => controller}
        createSurfaceRenderer={() => {
          throw new Error("Worker blocked by CSP");
        }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: "Worker 创建失败降级预览" }),
      ).toHaveProperty("tagName", "svg");
    });
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes and falls back when the controller reports context loss", async () => {
    const project = makeProject();
    const controller = makeController();
    const pending = deferred<BeadFusionSvgPath[]>();
    const renderer = makeSurfaceRenderer(pending.promise);
    let reportUnavailable: (() => void) | undefined;
    const createController: CreateBeadThreePreviewController = (
      _canvas,
      onUnavailable,
    ) => {
      reportUnavailable = onUnavailable;
      return controller;
    };
    const view = render(
      <BeadThreePreview
        project={project}
        ariaLabel="上下文丢失降级预览"
        createController={createController}
        createSurfaceRenderer={() => renderer}
      />,
    );

    act(() => {
      reportUnavailable?.();
    });

    expect(ResizeObserverStub.instances[0]?.disconnect).toHaveBeenCalledTimes(
      1,
    );
    expect(
      await screen.findByRole("img", { name: "上下文丢失降级预览" }),
    ).toHaveProperty("tagName", "svg");
    expect(controller.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });
});
