import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import type { BeadProject } from "../src/domain/types";

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
    pickCellAt: vi.fn(() => null),
    setSelectedCell: vi.fn(),
    setHoveredCell: vi.fn(),
    resize: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fit: vi.fn(),
    resetView: vi.fn(),
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
    render: vi.fn((_project: BeadProject) => promise),
    dispose: vi.fn(),
  };
}

function translateThreePreviewControls(key: string): string {
  const messages: Record<string, string> = {
    "workshop.bead.viewport.threeToolbar": "3D preview controls",
    "workshop.bead.viewport.threeZoomOut": "Zoom out 3D preview",
    "workshop.bead.viewport.threeReset": "Reset 3D view",
    "workshop.bead.viewport.threeZoomIn": "Zoom in 3D preview",
    "workshop.bead.viewport.threeFit": "Fit 3D preview",
    "workshop.bead.threeInteractionMode": "3D interaction mode",
    "workshop.bead.threeEditMode": "Edit",
    "workshop.bead.threeViewMode": "View",
    "workshop.bead.threeRendering": "Updating 3D preview…",
  };
  return messages[key] ?? key;
}

function dispatchPointer(
  target: Element,
  type: string,
  init: PointerEventInit & {
    pointerId?: number;
    pointerType?: string;
    isPrimary?: boolean;
  } = {},
): PointerEvent {
  const event = new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  if (event.pointerId !== init.pointerId && init.pointerId !== undefined) {
    Object.defineProperty(event, "pointerId", { value: init.pointerId });
  }
  if (
    event.pointerType !== init.pointerType &&
    init.pointerType !== undefined
  ) {
    Object.defineProperty(event, "pointerType", {
      value: init.pointerType,
    });
  }
  if (event.isPrimary !== init.isPrimary && init.isPrimary !== undefined) {
    Object.defineProperty(event, "isPrimary", {
      value: init.isPrimary,
    });
  }
  fireEvent(target, event);
  return event;
}

function installPointerCaptureSpies(canvas: HTMLCanvasElement) {
  const captured = new Set<number>();
  const setPointerCapture = vi.fn((pointerId: number) => {
    captured.add(pointerId);
  });
  const releasePointerCapture = vi.fn((pointerId: number) => {
    captured.delete(pointerId);
  });
  Object.defineProperties(canvas, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    releasePointerCapture: {
      configurable: true,
      value: releasePointerCapture,
    },
    hasPointerCapture: {
      configurable: true,
      value: (pointerId: number) => captured.has(pointerId),
    },
  });
  return { setPointerCapture, releasePointerCapture };
}

describe("BeadThreePreview", () => {
  beforeEach(() => {
    ResizeObserverStub.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    vi.useFakeTimers();
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
    expect(renderer.render).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
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

  it("shows immediate feedback while the exact 3D surface catches up", async () => {
    vi.useFakeTimers();
    const project = makeProject();
    const updatedProject = {
      ...project,
      cells: [
        { kind: "empty" as const },
        project.cells[1],
      ],
    };
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockReturnValue(0);
    const onPickCell = vi.fn();
    const initialPending = deferred<BeadFusionSvgPath[]>();
    const updatedPending = deferred<BeadFusionSvgPath[]>();
    const renderer = makeSurfaceRenderer(initialPending.promise);
    renderer.render
      .mockReturnValueOnce(initialPending.promise)
      .mockReturnValueOnce(updatedPending.promise);
    const view = render(
      <BeadThreePreview
        project={project}
        ariaLabel="有即时反馈的三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
        onPickCell={onPickCell}
        allowDrag
        translate={translateThreePreviewControls}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Updating 3D preview…" }),
    ).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
      initialPending.resolve(makeSurfacePaths());
      await initialPending.promise;
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const canvas = screen.getByRole("img", {
      name: "有即时反馈的三维预览",
    });
    installPointerCaptureSpies(canvas as HTMLCanvasElement);
    dispatchPointer(canvas, "pointerdown", {
      pointerId: 17,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 24,
      clientY: 24,
    });
    expect(onPickCell).toHaveBeenCalledWith(0);
    expect(controller.setHoveredCell).toHaveBeenLastCalledWith(0);

    view.rerender(
      <BeadThreePreview
        project={updatedProject}
        ariaLabel="有即时反馈的三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
        onPickCell={onPickCell}
        allowDrag
        translate={translateThreePreviewControls}
      />,
    );
    expect(
      screen.getByRole("status", { name: "Updating 3D preview…" }),
    ).toBeVisible();
    expect(controller.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
      updatedPending.resolve(makeSurfacePaths("rgb(20,120,210)"));
      await updatedPending.promise;
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(controller.update).toHaveBeenCalledTimes(2);
  });

  it("ignores a superseded surface result before starting the latest project", async () => {
    vi.useFakeTimers();
    const firstProject = makeProject();
    const latestProject = {
      ...firstProject,
      projectId: "three-preview-latest",
      compression: 88,
    };
    const controller = makeController();
    const firstPending = deferred<BeadFusionSvgPath[]>();
    const latestPending = deferred<BeadFusionSvgPath[]>();
    const renderer = makeSurfaceRenderer(firstPending.promise);
    renderer.render
      .mockReturnValueOnce(firstPending.promise)
      .mockReturnValueOnce(latestPending.promise);
    const createSurfaceRenderer = vi.fn(() => renderer);
    const view = render(
      <BeadThreePreview
        project={firstProject}
        ariaLabel="最新三维预览"
        createController={() => controller}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(renderer.render).toHaveBeenCalledWith(firstProject);

    view.rerender(
      <BeadThreePreview
        project={latestProject}
        ariaLabel="最新三维预览"
        createController={() => controller}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );
    expect(createSurfaceRenderer).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstPending.resolve(makeSurfacePaths());
      await firstPending.promise;
      await Promise.resolve();
    });
    expect(controller.update).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenLastCalledWith(latestProject);

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

    expect(controller.update).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps one surface render in flight and starts only the latest ready project after it settles", async () => {
    vi.useFakeTimers();
    const firstProject = makeProject();
    const intermediateProject = {
      ...firstProject,
      projectId: "three-preview-intermediate",
      compression: 55,
    };
    const latestProject = {
      ...firstProject,
      projectId: "three-preview-serialized-latest",
      compression: 92,
    };
    const controller = makeController();
    const firstPending = deferred<BeadFusionSvgPath[]>();
    const intermediatePending = deferred<BeadFusionSvgPath[]>();
    const latestPending = deferred<BeadFusionSvgPath[]>();
    const renderer = makeSurfaceRenderer(firstPending.promise);
    renderer.render.mockImplementation((renderProject) => {
      if (renderProject.projectId === intermediateProject.projectId) {
        return intermediatePending.promise;
      }
      if (renderProject.projectId === latestProject.projectId) {
        return latestPending.promise;
      }
      return firstPending.promise;
    });
    const view = render(
      <BeadThreePreview
        project={firstProject}
        ariaLabel="串行三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenLastCalledWith(firstProject);

    view.rerender(
      <BeadThreePreview
        project={intermediateProject}
        ariaLabel="串行三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);

    view.rerender(
      <BeadThreePreview
        project={latestProject}
        ariaLabel="串行三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstPending.resolve(makeSurfacePaths());
      await firstPending.promise;
      await Promise.resolve();
    });

    expect(controller.update).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenLastCalledWith(latestProject);

    const latestSurfacePaths = makeSurfacePaths("rgb(20,120,210)");
    await act(async () => {
      latestPending.resolve(latestSurfacePaths);
      await latestPending.promise;
    });
    expect(controller.update).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenLastCalledWith(
      buildPhysicalPreviewModel(latestProject, latestSurfacePaths),
    );
  });

  it("coalesces rapid project changes for one persistent surface renderer", async () => {
    vi.useFakeTimers();
    const project = makeProject();
    const secondProject = {
      ...project,
      projectId: "three-preview-second",
      compression: 55,
    };
    const latestProject = {
      ...project,
      projectId: "three-preview-coalesced",
      compression: 90,
    };
    const controller = makeController();
    const renderer = makeSurfaceRenderer(
      Promise.resolve(makeSurfacePaths("rgb(20,120,210)")),
    );
    const createSurfaceRenderer = vi.fn(() => renderer);
    const view = render(
      <BeadThreePreview
        project={project}
        ariaLabel="合并三维预览"
        createController={() => controller}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    view.rerender(
      <BeadThreePreview
        project={secondProject}
        ariaLabel="合并三维预览"
        createController={() => controller}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );
    view.rerender(
      <BeadThreePreview
        project={latestProject}
        ariaLabel="合并三维预览"
        createController={() => controller}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    expect(createSurfaceRenderer).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(119);
    });
    expect(renderer.render).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenLastCalledWith(latestProject);
    expect(controller.update).toHaveBeenCalledTimes(1);
  });

  it("keeps one canvas and old geometry until the latest model is ready", async () => {
    vi.useFakeTimers();
    const project = makeProject();
    const controller = makeController();
    const createController = vi.fn(() => controller);
    const initialSurfacePaths = makeSurfacePaths();
    const initialPending = deferred<BeadFusionSvgPath[]>();
    const updatedPending = deferred<BeadFusionSvgPath[]>();
    const updatedSurfacePaths = makeSurfacePaths("rgb(245,190,35)");
    const renderer = makeSurfaceRenderer(initialPending.promise);
    renderer.render
      .mockReturnValueOnce(initialPending.promise)
      .mockReturnValueOnce(updatedPending.promise);
    const createSurfaceRenderer = vi.fn(() => renderer);
    const view = render(
      <BeadThreePreview
        project={project}
        ariaLabel="全局三维预览"
        createController={createController}
        createSurfaceRenderer={createSurfaceRenderer}
      />,
    );

    expect(createController).toHaveBeenCalledTimes(1);
    const canvas = screen.getByRole("img", { name: "全局三维预览" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
      initialPending.resolve(initialSurfacePaths);
      await initialPending.promise;
    });
    expect(controller.update).toHaveBeenCalledTimes(1);
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
    expect(createSurfaceRenderer).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "全局三维预览" })).toBe(canvas);
    expect(controller.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(controller.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      updatedPending.resolve(updatedSurfacePaths);
      await updatedPending.promise;
    });
    expect(controller.update).toHaveBeenCalledTimes(2);
    expect(controller.update).toHaveBeenLastCalledWith(
      buildPhysicalPreviewModel(
        updatedProject,
        updatedSurfacePaths,
      ),
    );
    expect(screen.getByRole("img", { name: "全局三维预览" })).toBe(canvas);

    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("provides a bottom-centred 3D view toolbar wired to the controller", () => {
    const controller = makeController();
    const renderer = makeSurfaceRenderer(
      new Promise<BeadFusionSvgPath[]>(() => undefined),
    );
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="带控制条的三维预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
        translate={translateThreePreviewControls}
      />,
    );

    const toolbar = screen.getByRole("toolbar", {
      name: "3D preview controls",
    });
    expect(
      within(toolbar).getByRole("group", {
        name: "3D interaction mode",
      }),
    ).toBeInTheDocument();
    expect(toolbar).toHaveStyle({
      position: "absolute",
      bottom: "12px",
      left: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "8px",
      padding: "8px 12px",
      transform: "translateX(-50%)",
    });
    expect(screen.getByText("Reset 3D view")).toBeInTheDocument();
    expect(screen.getByText("Fit 3D preview")).toBeInTheDocument();
    for (const button of toolbar.querySelectorAll("button")) {
      expect(button).toHaveClass(
        "button",
        "button--secondary",
        "button--small",
      );
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Zoom out 3D preview" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Zoom in 3D preview" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Fit 3D preview" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reset 3D view" }),
    );

    expect(controller.zoomOut).toHaveBeenCalledTimes(1);
    expect(controller.zoomIn).toHaveBeenCalledTimes(1);
    expect(controller.fit).toHaveBeenCalledTimes(1);
    expect(controller.resetView).toHaveBeenCalledTimes(1);
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
    const renderer = makeSurfaceRenderer(Promise.resolve([]));
    renderer.render.mockImplementation(() =>
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

  it("falls back when the surface renderer throws while starting a render", async () => {
    vi.useFakeTimers();
    const controller = makeController();
    const renderer = makeSurfaceRenderer(Promise.resolve([]));
    renderer.render.mockImplementation(() => {
      throw new Error("surface render failed synchronously");
    });
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="表面同步失败降级预览"
        createController={() => controller}
        createSurfaceRenderer={() => renderer}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    expect(
      screen.getByRole("img", { name: "表面同步失败降级预览" }),
    ).toHaveProperty("tagName", "svg");
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

  it("still completes fallback when clearing a preview marker throws", async () => {
    const controller = makeController();
    vi.mocked(controller.setHoveredCell).mockImplementation(() => {
      throw new Error("WebGL context already gone");
    });

    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="标记失效降级预览"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(Promise.resolve(makeSurfacePaths()))
        }
      />,
    );

    expect(
      await screen.findByRole("img", { name: "标记失效降级预览" }),
    ).toHaveProperty("tagName", "svg");
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });

  it("edits drag-capable tools on pointer down and only once per crossed cell", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockImplementation((clientX) =>
      clientX < 20 ? 0 : 1,
    );
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="可拖涂三维预览"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "可拖涂三维预览",
    }) as HTMLCanvasElement;
    const capture = installPointerCaptureSpies(canvas);

    const down = dispatchPointer(canvas, "pointerdown", {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointermove", {
      buttons: 1,
      clientX: 11,
      clientY: 10,
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointermove", {
      buttons: 1,
      clientX: 24,
      clientY: 10,
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointerup", {
      button: 0,
      clientX: 24,
      clientY: 10,
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
    });

    expect(down.defaultPrevented).toBe(true);
    expect(onPickCell.mock.calls.map(([cellIndex]) => cellIndex)).toEqual([
      0,
      1,
    ]);
    expect(capture.setPointerCapture).toHaveBeenCalledWith(7);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("applies a one-shot tool only on a valid pointer up within the click threshold", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockReturnValue(1);
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="单次三维工具"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag={false}
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "单次三维工具",
    }) as HTMLCanvasElement;
    installPointerCaptureSpies(canvas);

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
      pointerId: 3,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointermove", {
      buttons: 1,
      clientX: 13,
      clientY: 14,
      pointerId: 3,
      pointerType: "mouse",
      isPrimary: true,
    });
    expect(onPickCell).not.toHaveBeenCalled();
    dispatchPointer(canvas, "pointerup", {
      button: 0,
      clientX: 13,
      clientY: 14,
      pointerId: 3,
      pointerType: "mouse",
      isPrimary: true,
    });

    expect(onPickCell).toHaveBeenCalledTimes(1);
    expect(onPickCell).toHaveBeenCalledWith(1);
  });

  it("cancels one-shot tools after a drag, pointer cancellation, or lost capture", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockReturnValue(0);
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="可取消三维工具"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag={false}
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "可取消三维工具",
    }) as HTMLCanvasElement;
    installPointerCaptureSpies(canvas);

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointermove", {
      buttons: 1,
      clientX: 30,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointerup", {
      clientX: 30,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointercancel", {
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointerup", {
      clientX: 10,
      clientY: 10,
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    });

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 4,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "lostpointercapture", {
      pointerId: 4,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointerup", {
      clientX: 10,
      clientY: 10,
      pointerId: 4,
      pointerType: "mouse",
      isPrimary: true,
    });

    expect(onPickCell).not.toHaveBeenCalled();
  });

  it("leaves camera gestures and wheel input untouched", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockReturnValue(0);
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="相机手势三维预览"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag
        translate={translateThreePreviewControls}
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "相机手势三维预览",
    });
    const container = canvas.parentElement!;
    const bubbled = vi.fn();
    container.addEventListener("pointerdown", bubbled);

    const events = [
      dispatchPointer(canvas, "pointerdown", {
        button: 2,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
      dispatchPointer(canvas, "pointerdown", {
        button: 1,
        clientX: 10,
        clientY: 10,
        pointerId: 2,
        pointerType: "mouse",
        isPrimary: true,
      }),
      dispatchPointer(canvas, "pointerdown", {
        altKey: true,
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerId: 3,
        pointerType: "mouse",
        isPrimary: true,
      }),
    ];
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    events.push(
      dispatchPointer(canvas, "pointerdown", {
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerId: 4,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 10,
    });
    fireEvent(canvas, wheel);

    expect(events.every((event) => !event.defaultPrevented)).toBe(true);
    expect(wheel.defaultPrevented).toBe(false);
    expect(bubbled).toHaveBeenCalledTimes(4);
    expect(onPickCell).not.toHaveBeenCalled();

    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(canvas, contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
  });

  it("cancels an active edit when a second pointer arrives", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockReturnValue(1);
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="多指三维预览"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag={false}
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "多指三维预览",
    }) as HTMLCanvasElement;
    installPointerCaptureSpies(canvas);
    const nativePointerDown = vi.fn();
    canvas.addEventListener("pointerdown", nativePointerDown);

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 8,
      pointerType: "touch",
      isPrimary: true,
    });
    nativePointerDown.mockClear();
    const secondPointerDown = dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 12,
      clientY: 12,
      pointerId: 9,
      pointerType: "touch",
      isPrimary: false,
    });
    dispatchPointer(canvas, "pointerup", {
      clientX: 10,
      clientY: 10,
      pointerId: 8,
      pointerType: "touch",
      isPrimary: true,
    });

    expect(onPickCell).not.toHaveBeenCalled();
    expect(secondPointerDown.defaultPrevented).toBe(true);
    expect(nativePointerDown).not.toHaveBeenCalled();
  });

  it("ends a captured mouse edit when the primary button is no longer pressed", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockImplementation((clientX) =>
      clientX < 20 ? 0 : 1,
    );
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="主键丢失三维预览"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "主键丢失三维预览",
    }) as HTMLCanvasElement;
    Object.defineProperties(canvas, {
      setPointerCapture: {
        configurable: true,
        value: vi.fn(() => {
          throw new Error("capture unavailable");
        }),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
      hasPointerCapture: {
        configurable: true,
        value: vi.fn(() => false),
      },
    });

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    expect(onPickCell.mock.calls.map(([cellIndex]) => cellIndex)).toEqual([
      0,
    ]);

    dispatchPointer(canvas, "pointermove", {
      buttons: 0,
      clientX: 24,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    expect(onPickCell.mock.calls.map(([cellIndex]) => cellIndex)).toEqual([
      0,
    ]);
    expect(controller.setHoveredCell).toHaveBeenLastCalledWith(null);

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      buttons: 1,
      clientX: 24,
      clientY: 10,
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    });
    expect(onPickCell.mock.calls.map(([cellIndex]) => cellIndex)).toEqual([
      0,
      1,
    ]);
  });

  it("keeps a primary touch drag active when buttons is zero", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockImplementation((clientX) =>
      clientX < 20 ? 0 : 1,
    );
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="触摸拖涂三维预览"
        createController={() => controller}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "触摸拖涂三维预览",
    }) as HTMLCanvasElement;
    installPointerCaptureSpies(canvas);

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
      pointerId: 5,
      pointerType: "touch",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointermove", {
      buttons: 0,
      clientX: 24,
      clientY: 10,
      pointerId: 5,
      pointerType: "touch",
      isPrimary: true,
    });

    expect(onPickCell.mock.calls.map(([cellIndex]) => cellIndex)).toEqual([
      0,
      1,
    ]);
  });

  it("uses the latest edit props without recreating the controller, canvas, or renderer", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockReturnValue(1);
    const createController = vi.fn(() => controller);
    const renderer = makeSurfaceRenderer(new Promise(() => undefined));
    const createSurfaceRenderer = vi.fn(() => renderer);
    const firstPick = vi.fn();
    const latestPick = vi.fn();
    const view = render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="持久三维编辑"
        createController={createController}
        createSurfaceRenderer={createSurfaceRenderer}
        onPickCell={firstPick}
        allowDrag
        selectedCellIndex={0}
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "持久三维编辑",
    }) as HTMLCanvasElement;
    installPointerCaptureSpies(canvas);
    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointerup", {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });

    view.rerender(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="持久三维编辑"
        createController={createController}
        createSurfaceRenderer={createSurfaceRenderer}
        onPickCell={latestPick}
        allowDrag={false}
        selectedCellIndex={1}
      />,
    );
    expect(screen.getByRole("img", { name: "持久三维编辑" })).toBe(
      canvas,
    );
    expect(createController).toHaveBeenCalledTimes(1);
    expect(createSurfaceRenderer).toHaveBeenCalledTimes(1);
    expect(controller.setSelectedCell).toHaveBeenLastCalledWith(1);

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 20,
      clientY: 10,
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchPointer(canvas, "pointerup", {
      clientX: 20,
      clientY: 10,
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    });

    expect(firstPick).toHaveBeenCalledTimes(1);
    expect(latestPick).toHaveBeenCalledTimes(1);
    expect(latestPick).toHaveBeenCalledWith(1);
  });

  it("switches accessible edit and view modes without rebuilding the scene", () => {
    const controller = makeController();
    vi.mocked(controller.pickCellAt).mockReturnValue(0);
    const createController = vi.fn(() => controller);
    const onPickCell = vi.fn();
    render(
      <BeadThreePreview
        project={makeProject()}
        ariaLabel="模式三维预览"
        createController={createController}
        createSurfaceRenderer={() =>
          makeSurfaceRenderer(new Promise(() => undefined))
        }
        onPickCell={onPickCell}
        allowDrag={false}
        translate={translateThreePreviewControls}
      />,
    );
    const canvas = screen.getByRole("img", {
      name: "模式三维预览",
    }) as HTMLCanvasElement;
    installPointerCaptureSpies(canvas);
    const container = canvas.parentElement!;
    const editButton = screen.getByRole("button", { name: "Edit" });
    const viewButton = screen.getByRole("button", { name: "View" });

    expect(
      screen.getByRole("group", { name: "3D interaction mode" }),
    ).toBeInTheDocument();
    expect(editButton).toHaveAttribute("aria-pressed", "true");
    expect(viewButton).toHaveAttribute("aria-pressed", "false");
    expect(container).toHaveAttribute("data-interaction-mode", "edit");

    dispatchPointer(canvas, "pointermove", {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    expect(controller.setHoveredCell).toHaveBeenLastCalledWith(0);

    dispatchPointer(canvas, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    fireEvent.click(viewButton);
    dispatchPointer(canvas, "pointerup", {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });

    expect(controller.setHoveredCell).toHaveBeenLastCalledWith(null);
    expect(onPickCell).not.toHaveBeenCalled();
    expect(editButton).toHaveAttribute("aria-pressed", "false");
    expect(viewButton).toHaveAttribute("aria-pressed", "true");
    expect(container).toHaveAttribute("data-interaction-mode", "view");
    expect(createController).toHaveBeenCalledTimes(1);

    dispatchPointer(canvas, "pointermove", {
      clientX: 20,
      clientY: 10,
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    });
    expect(controller.setHoveredCell).toHaveBeenLastCalledWith(null);

    fireEvent.click(editButton);
    expect(container).toHaveAttribute("data-interaction-mode", "edit");
    fireEvent.pointerLeave(canvas);
    expect(controller.setHoveredCell).toHaveBeenLastCalledWith(null);
  });
});
