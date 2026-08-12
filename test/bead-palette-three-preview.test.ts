import {
  Color,
  ExtrudeGeometry,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  Scene,
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

describe("bead palette shared 3D renderer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses one scene to render upright hollow cylinders from an oblique camera", () => {
    const addSpy = vi.spyOn(Scene.prototype, "add");
    const renderer = createBeadPaletteThreeRenderer(makeCanvas());

    renderer.update([
      [230, 40, 50],
      [20, 120, 210],
      [0, 0, 0],
    ]);

    const scene = addSpy.mock.instances[0] as Scene;
    const camera = scene.children.find(
      (child) => child instanceof OrthographicCamera,
    ) as OrthographicCamera | undefined;
    const meshes = paletteMeshes(scene);
    expect(camera).toBeInstanceOf(OrthographicCamera);
    expect(camera?.position.y).toBeGreaterThan(0);
    expect(Math.abs(camera?.position.z ?? 0)).toBeGreaterThan(0);
    expect(((camera?.left ?? 0) + (camera?.right ?? 0)) / 2).toBeCloseTo(
      1.35,
    );
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
    renderer.update([[230, 40, 50]]);
    const scene = addSpy.mock.instances[0] as Scene;
    const firstMesh = paletteMeshes(scene)[0];

    renderer.update([[20, 120, 210]]);

    expect(paletteMeshes(scene)[0]).toBe(firstMesh);
    expect(firstMesh.material.color.getHex()).toBe(
      new Color().setStyle("rgb(20, 120, 210)").getHex(),
    );
    renderer.dispose();
  });

  it("caps the backing buffer for a 256-color scroll strip", () => {
    const renderer = createBeadPaletteThreeRenderer(makeCanvas(16_000));
    renderer.update(
      Array.from({ length: 256 }, () => [120, 80, 40] as const),
    );

    expect(rendererCapture.renderer?.setPixelRatio).toHaveBeenLastCalledWith(
      expect.any(Number),
    );
    const pixelRatio = rendererCapture.renderer?.setPixelRatio.mock
      .lastCall?.[0] as number;
    expect(pixelRatio).toBeLessThanOrEqual(0.512);
    renderer.dispose();
  });
});
