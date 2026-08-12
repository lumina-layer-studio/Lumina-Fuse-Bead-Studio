import {
  BackSide,
  Color,
  ExtrudeGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

const rendererCapture = vi.hoisted(() => ({
  renderer: null as null | {
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    setPixelRatio: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRendererStub {
    readonly dispose = vi.fn();
    readonly render = vi.fn();
    readonly setClearColor = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn();

    constructor() {
      rendererCapture.renderer = this;
    }
  }
  return { ...actual, WebGLRenderer: WebGLRendererStub };
});

import { createBeadPaletteThreeRenderer } from "../src/app/beadPaletteThreeRenderer";

function makeCanvas(width = 480): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: width });
  Object.defineProperty(canvas, "clientHeight", { value: 64 });
  return canvas;
}

function paletteMeshes(scene: Scene): Mesh<ExtrudeGeometry, MeshPhysicalMaterial>[] {
  const meshes: Mesh<ExtrudeGeometry, MeshPhysicalMaterial>[] = [];
  scene.traverse((child) => {
    if (child.name.startsWith("bead-palette-upright-")) {
      meshes.push(child as Mesh<ExtrudeGeometry, MeshPhysicalMaterial>);
    }
  });
  return meshes;
}

function screenXForWorldX(
  camera: OrthographicCamera,
  worldX: number,
  viewportWidth: number,
): number {
  camera.updateMatrixWorld(true);
  const projected = new Vector3(worldX, 0, 0).project(camera);
  return (projected.x + 1) / 2 * viewportWidth;
}

describe("bead palette shared 3D renderer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses one scene to render upright hollow cylinders from an oblique camera", () => {
    const addSpy = vi.spyOn(Scene.prototype, "add");
    const renderer = createBeadPaletteThreeRenderer(makeCanvas());

    renderer.update([
      [230, 40, 50],
      [20, 120, 210],
      [0, 0, 0],
    ], 1);

    const scene = addSpy.mock.instances[0] as Scene;
    const camera = scene.children.find(
      (child) => child instanceof OrthographicCamera,
    ) as OrthographicCamera | undefined;
    const meshes = paletteMeshes(scene);
    expect(camera).toBeInstanceOf(OrthographicCamera);
    expect(camera?.position.y).toBeGreaterThan(0);
    expect(Math.abs(camera?.position.z ?? 0)).toBeGreaterThan(0);
    expect(camera).toBeDefined();
    expect(meshes).toHaveLength(3);
    expect(meshes.map((mesh) => mesh.position.x)).toEqual([0, 1.35, 2.7]);
    expect(meshes[0].geometry).toBeInstanceOf(ExtrudeGeometry);
    meshes[0].geometry.computeBoundingBox();
    const bounds = meshes[0].geometry.boundingBox;
    expect(bounds).not.toBeNull();
    expect((bounds?.max.y ?? 0) - (bounds?.min.y ?? 0)).toBeGreaterThan(
      (bounds?.max.x ?? 0) - (bounds?.min.x ?? 0),
    );
    const shape = meshes[0].geometry.parameters.shapes;
    expect(Array.isArray(shape) ? shape[0].holes : shape.holes).toHaveLength(1);
    expect(meshes[0].material).toBeInstanceOf(MeshPhysicalMaterial);
    expect(meshes[0].material.color.getHex()).toBe(
      new Color().setStyle("rgb(230, 40, 50)").getHex(),
    );
    expect(rendererCapture.renderer?.render).toHaveBeenCalled();

    renderer.dispose();
    expect(rendererCapture.renderer?.dispose).toHaveBeenCalledTimes(1);
    for (const mesh of meshes) {
      expect(mesh.parent).toBeNull();
    }
  });

  it("reuses the scene while changing colors", () => {
    const addSpy = vi.spyOn(Scene.prototype, "add");
    const renderer = createBeadPaletteThreeRenderer(makeCanvas());
    renderer.update([[230, 40, 50]], 0);
    const scene = addSpy.mock.instances[0] as Scene;
    const firstMesh = paletteMeshes(scene)[0];

    renderer.update([[20, 120, 210]], 0);

    expect(paletteMeshes(scene)[0]).toBe(firstMesh);
    expect(firstMesh.material.color.getHex()).toBe(
      new Color().setStyle("rgb(20, 120, 210)").getHex(),
    );
    renderer.dispose();
  });

  it("renders a 256-color strip at full retina density inside only the visible viewport", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
    const renderer = createBeadPaletteThreeRenderer(makeCanvas(428));
    expect(renderer).toHaveProperty("setViewport");
    if (!("setViewport" in renderer)) return;
    renderer.setViewport({
      scrollLeftPx: 0,
      widthPx: 428,
      heightPx: 48,
      firstTargetCenterPx: 26,
      targetStepPx: 40,
    });
    renderer.update(
      Array.from({ length: 256 }, () => [120, 80, 40] as const),
      0,
    );

    expect(rendererCapture.renderer?.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(rendererCapture.renderer?.setSize).toHaveBeenLastCalledWith(
      428,
      48,
      false,
    );
    expect(rendererCapture.renderer?.setSize.mock.calls.every(
      ([width]) => Number(width) <= 428,
    )).toBe(true);
    renderer.dispose();
  });

  it("aligns every rendered bead with its semantic target while scrolling", () => {
    const addSpy = vi.spyOn(Scene.prototype, "add");
    const renderer = createBeadPaletteThreeRenderer(makeCanvas(360));
    expect(renderer).toHaveProperty("setViewport");
    if (!("setViewport" in renderer)) return;
    renderer.setViewport({
      scrollLeftPx: 72,
      widthPx: 360,
      heightPx: 48,
      firstTargetCenterPx: 24,
      targetStepPx: 36,
    });
    renderer.update([
      [230, 40, 50],
      [20, 120, 210],
      [0, 0, 0],
    ], 2);

    const scene = addSpy.mock.instances[0] as Scene;
    const camera = scene.children.find(
      (child) => child instanceof OrthographicCamera,
    ) as OrthographicCamera;
    expect(screenXForWorldX(camera, 0, 360)).toBeCloseTo(-48);
    expect(screenXForWorldX(camera, 1.35, 360)).toBeCloseTo(-12);
    expect(screenXForWorldX(camera, 2.7, 360)).toBeCloseTo(24);
    renderer.dispose();
  });

  it("keeps the far end of a long palette inside the visible viewport", () => {
    const addSpy = vi.spyOn(Scene.prototype, "add");
    const renderer = createBeadPaletteThreeRenderer(makeCanvas(428));
    renderer.setViewport({
      scrollLeftPx: 9_824,
      widthPx: 428,
      heightPx: 48,
      firstTargetCenterPx: 26,
      targetStepPx: 40,
    });
    renderer.update(
      Array.from({ length: 256 }, () => [120, 80, 40] as const),
      255,
    );

    const scene = addSpy.mock.instances[0] as Scene;
    const camera = scene.children.find(
      (child) => child instanceof OrthographicCamera,
    ) as OrthographicCamera;
    const lastMesh = paletteMeshes(scene)[255];
    expect(screenXForWorldX(camera, lastMesh.position.x, 428)).toBeCloseTo(402);
    renderer.dispose();
  });

  it("wraps the active bead with a matching 3D silhouette instead of a CSS box", () => {
    const addSpy = vi.spyOn(Scene.prototype, "add");
    const canvas = makeCanvas();
    canvas.style.color = "rgb(1, 2, 3)";
    const renderer = createBeadPaletteThreeRenderer(canvas);
    renderer.update([
      [230, 40, 50],
      [20, 120, 210],
    ], 1);

    const scene = addSpy.mock.instances[0] as Scene;
    const meshes = paletteMeshes(scene);
    const selection = scene.getObjectByName("bead-palette-selection-outline") as
      | Mesh<ExtrudeGeometry, MeshBasicMaterial>
      | undefined;
    expect(selection).toBeDefined();
    expect(selection?.geometry).toBe(meshes[1].geometry);
    expect(selection?.material).toBeInstanceOf(MeshBasicMaterial);
    expect(selection?.material.side).toBe(BackSide);
    expect(selection?.material.color.getHex()).toBe(
      new Color().setStyle("rgb(1, 2, 3)").getHex(),
    );
    expect(selection?.position.x).toBeCloseTo(meshes[1].position.x);
    expect(selection?.scale.x).toBeGreaterThan(1);
    expect(selection?.scale.y).toBeGreaterThan(1);
    expect(selection?.scale.z).toBeGreaterThan(1);
    renderer.dispose();
  });
});
