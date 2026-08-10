import {
  ExtrudeGeometry,
  InstancedMesh,
  Mesh,
  Scene,
  Vector3,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBeadThreePreviewController } from "../src/app/beadThreePreviewController";
import type { PhysicalPreviewModel } from "../src/domain/physicalPreviewModel";

const capturedControls = vi.hoisted(() => [] as Array<{
  camera: import("three").PerspectiveCamera;
  target: import("three").Vector3;
}>);

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();

  class WebGLRendererStub {
    outputColorSpace = "";
    readonly setClearColor = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn();
    readonly render = vi.fn();
    readonly dispose = vi.fn();
  }

  return {
    ...actual,
    WebGLRenderer: WebGLRendererStub,
  };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => {
  class OrbitControlsStub {
    readonly target = new Vector3();
    enableDamping = false;
    enablePan = false;
    minDistance = 0;
    maxDistance = Infinity;
    readonly addEventListener = vi.fn();
    readonly removeEventListener = vi.fn();
    readonly update = vi.fn(() => {
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld(true);
    });
    readonly dispose = vi.fn();

    constructor(private readonly camera: import("three").PerspectiveCamera) {
      capturedControls.push({ camera, target: this.target });
    }
  }

  return { OrbitControls: OrbitControlsStub };
});

function makeModel(
  pegCount: number,
  widthMm = pegCount * 2.6,
  depthMm = 2.6,
): PhysicalPreviewModel {
  const beadPitchMm = 2.6;
  return {
    widthMm,
    depthMm,
    heightMm: 1.4,
    beadPitchMm,
    surfacePaths: [{
      cellIndex: 0,
      d: `M 0 0 L ${widthMm / beadPitchMm} 0 L ${widthMm / beadPitchMm} ${depthMm / beadPitchMm} L 0 ${depthMm / beadPitchMm} Z`,
      fill: "rgb(230,40,50)",
      strokeWidth: 0,
    }],
    board: {
      widthMm: widthMm + beadPitchMm * 2.6,
      depthMm: depthMm + beadPitchMm * 2.6,
      thicknessMm: beadPitchMm * 0.45,
      cornerRadiusMm: beadPitchMm * 0.55,
      pegRadiusMm: beadPitchMm * 0.16,
      pegHeightMm: beadPitchMm * 0.32,
      pegs: Array.from({ length: pegCount }, (_, cellIndex) => ({
        cellIndex,
        xMm: (cellIndex - (pegCount - 1) / 2) * beadPitchMm,
        zMm: 0,
      })),
    },
  };
}

function makeMaximumSquareModel(): PhysicalPreviewModel {
  const side = 128;
  const pitchMm = 2.6;
  const model = makeModel(side * side, side * pitchMm, side * pitchMm);
  return {
    ...model,
    board: {
      ...model.board,
      pegs: model.board.pegs.map((peg, cellIndex) => ({
        ...peg,
        xMm: (cellIndex % side - (side - 1) / 2) * pitchMm,
        zMm: (Math.floor(cellIndex / side) - (side - 1) / 2) * pitchMm,
      })),
    },
  };
}

function projectBoundingBox(
  camera: import("three").PerspectiveCamera,
  model: PhysicalPreviewModel,
): Array<import("three").Vector3> {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const halfWidth = model.board.widthMm / 2;
  const halfDepth = model.board.depthMm / 2;
  const minimumY = -model.board.thicknessMm;
  const maximumY = model.heightMm;
  return [-1, 1].flatMap((xSign) =>
    [minimumY, maximumY].flatMap((y) =>
      [-1, 1].map((zSign) =>
        new Vector3(
          xSign * halfWidth,
          y,
          zSign * halfDepth,
        ).project(camera),
      ),
    ),
  );
}

describe("beadThreePreviewController resource lifecycle", () => {
  beforeEach(() => {
    capturedControls.length = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 41));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the canonical fused surface above a board with every peg", () => {
    const sceneAdd = vi.spyOn(Scene.prototype, "add");
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );
    const model = makeModel(6, 7.8, 5.2);

    controller.update(model);

    const added = sceneAdd.mock.calls.flat();
    const board = added.find((object) => object.name === "bead-preview-board");
    const pegs = added.find((object) => object.name === "bead-preview-pegs");
    const surface = added.find((object) => object.name === "bead-preview-surface-0");
    expect(board).toBeInstanceOf(Mesh);
    expect(pegs).toBeInstanceOf(InstancedMesh);
    expect((pegs as InstancedMesh).count).toBe(6);
    expect(surface).toBeInstanceOf(Mesh);
    expect((surface as Mesh).geometry).toBeInstanceOf(ExtrudeGeometry);
    (surface as Mesh).geometry.computeBoundingBox();
    expect((surface as Mesh).geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
    expect((surface as Mesh).geometry.boundingBox?.max.y).toBeCloseTo(
      model.heightMm,
      5,
    );
    controller.dispose();
  });

  it("preserves canonical centre holes instead of filling them as cylinders", () => {
    const sceneAdd = vi.spyOn(Scene.prototype, "add");
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );
    const model = makeModel(2, 5.2, 2.6);
    model.surfacePaths[0] = {
      ...model.surfacePaths[0]!,
      d: "M 0 0 L 2 0 L 2 1 L 0 1 Z M 0.75 0.25 L 1.25 0.25 L 1.25 0.75 L 0.75 0.75 Z",
    };

    controller.update(model);

    const surface = sceneAdd.mock.calls
      .flat()
      .find((object) => object.name === "bead-preview-surface-0") as Mesh;
    const shapes = (surface.geometry as ExtrudeGeometry).parameters.shapes;
    const shapeList = Array.isArray(shapes) ? shapes : [shapes];
    expect(shapeList).toHaveLength(1);
    expect(shapeList[0]?.holes).toHaveLength(1);
    controller.dispose();
  });

  it("maps the SVG top-left cell to the physical board top-left quadrant", () => {
    const sceneAdd = vi.spyOn(Scene.prototype, "add");
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );
    const model = makeModel(4, 5.2, 5.2);
    model.surfacePaths[0] = {
      ...model.surfacePaths[0]!,
      d: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
    };

    controller.update(model);

    const surface = sceneAdd.mock.calls
      .flat()
      .find((object) => object.name === "bead-preview-surface-0") as Mesh;
    surface.geometry.computeBoundingBox();
    expect(surface.geometry.boundingBox?.min.x).toBeCloseTo(-2.6, 5);
    expect(surface.geometry.boundingBox?.max.x).toBeCloseTo(0, 5);
    expect(surface.geometry.boundingBox?.min.z).toBeCloseTo(-2.6, 5);
    expect(surface.geometry.boundingBox?.max.z).toBeCloseTo(0, 5);
    controller.dispose();
  });

  it("disposes the previous board, peg, and surface meshes when board size changes", () => {
    const meshDispose = vi.spyOn(InstancedMesh.prototype, "dispose");
    const geometryDispose = vi.spyOn(
      ExtrudeGeometry.prototype,
      "dispose",
    );
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );

    controller.update(makeModel(1));
    controller.update(makeModel(2));

    expect(meshDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("disposes the current board, peg, and surface resources exactly once", () => {
    const meshDispose = vi.spyOn(InstancedMesh.prototype, "dispose");
    const geometryDispose = vi.spyOn(
      ExtrudeGeometry.prototype,
      "dispose",
    );
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );
    controller.update(makeModel(1));

    controller.dispose();
    controller.dispose();

    expect(meshDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it("moves outward along the current view direction when a narrow resize needs more distance", () => {
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );
    controller.update(makeModel(4, 52, 26));
    controller.resize(800, 400, 1);
    const { camera, target } = capturedControls[0]!;
    const wideDistance = camera.position.distanceTo(target);
    const userDirection = new Vector3(1, 2, 3).normalize();
    camera.position.copy(target).addScaledVector(userDirection, wideDistance);

    controller.resize(300, 600, 1);

    expect(camera.position.distanceTo(target)).toBeGreaterThan(wideDistance);
    expect(
      camera.position.clone().sub(target).normalize().dot(userDirection),
    ).toBeCloseTo(1, 6);
    controller.dispose();
  });

  it("keeps every maximum-board bounding-box corner inside the padded frustum", () => {
    const model = makeMaximumSquareModel();
    for (const [width, height] of [
      [800, 800],
      [900, 1_600],
    ] as const) {
      const controller = createBeadThreePreviewController(
        document.createElement("canvas"),
        vi.fn(),
      );
      controller.resize(width, height, 1);
      controller.update(model);
      const { camera } = capturedControls.at(-1)!;

      const projectedCorners = projectBoundingBox(camera, model);

      expect(
        Math.max(...projectedCorners.map((corner) => Math.abs(corner.x))),
      ).toBeLessThanOrEqual(0.95);
      expect(
        Math.max(...projectedCorners.map((corner) => Math.abs(corner.y))),
      ).toBeLessThanOrEqual(0.95);
      controller.dispose();
    }
  });

  it("does not pull in a user camera that is already farther than the resize minimum", () => {
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );
    controller.update(makeModel(4, 52, 26));
    controller.resize(800, 400, 1);
    const { camera, target } = capturedControls[0]!;
    const userDirection = new Vector3(-2, 3, 1).normalize();
    const farDistance = 400;
    camera.position.copy(target).addScaledVector(userDirection, farDistance);

    controller.resize(300, 600, 1);

    expect(camera.position.distanceTo(target)).toBeCloseTo(farDistance, 6);
    expect(
      camera.position.clone().sub(target).normalize().dot(userDirection),
    ).toBeCloseTo(1, 6);
    controller.dispose();
  });

  it("does not reset the camera for color and compression-only model updates", () => {
    const controller = createBeadThreePreviewController(
      document.createElement("canvas"),
      vi.fn(),
    );
    controller.resize(640, 480, 1);
    const model = makeModel(4, 52, 26);
    controller.update(model);
    const { camera, target } = capturedControls[0]!;
    camera.position.copy(target).add(new Vector3(300, 400, 500));
    const userPosition = camera.position.clone();

    controller.update({
      ...model,
      heightMm: 0.7,
      surfacePaths: model.surfacePaths.map((path) => ({
        ...path,
        fill: "rgb(20,120,210)",
      })),
    });

    expect(camera.position).toEqual(userPosition);
    controller.dispose();
  });

});
