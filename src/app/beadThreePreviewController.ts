import {
  AmbientLight,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedMesh,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import type { PhysicalPreviewModel } from "../domain/physicalPreviewModel";

export interface BeadThreePreviewController {
  update(model: PhysicalPreviewModel): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export type CreateBeadThreePreviewController = (
  canvas: HTMLCanvasElement,
  onUnavailable: () => void,
) => BeadThreePreviewController;

const CAMERA_FIT_PADDING = 1.08;
const DEFAULT_VIEW_DIRECTION = new Vector3(0.72, 0.78, 1).normalize();
const BOARD_COLOR = 0xe6edf3;
const PEG_COLOR = 0xd5e0e8;

function resolveMinimumCameraDistanceForView(
  widthMm: number,
  depthMm: number,
  minimumY: number,
  maximumY: number,
  target: Vector3,
  viewDirection: Vector3,
  cameraUp: Vector3,
  aspect: number,
  verticalFovDegrees: number,
): number {
  const safeAspect = Math.max(aspect, 0.1);
  const tangentVertical = Math.tan((verticalFovDegrees * Math.PI) / 360);
  const tangentHorizontal = tangentVertical * safeAspect;
  const back = viewDirection.clone().normalize();
  const right = new Vector3().crossVectors(cameraUp, back);
  if (right.lengthSq() < Number.EPSILON) {
    right.crossVectors(new Vector3(0, 0, 1), back);
  }
  right.normalize();
  const up = new Vector3().crossVectors(back, right).normalize();
  const halfWidth = widthMm / 2;
  const halfDepth = depthMm / 2;
  let minimumDistance = 8;

  for (const xSign of [-1, 1]) {
    for (const y of [minimumY, maximumY]) {
      for (const zSign of [-1, 1]) {
        const cornerFromTarget = new Vector3(
          xSign * halfWidth,
          y,
          zSign * halfDepth,
        ).sub(target);
        const depthTowardCamera = cornerFromTarget.dot(back);
        const horizontalDistance =
          depthTowardCamera +
          Math.abs(cornerFromTarget.dot(right)) /
            tangentHorizontal * CAMERA_FIT_PADDING;
        const verticalDistance =
          depthTowardCamera +
          Math.abs(cornerFromTarget.dot(up)) /
            tangentVertical * CAMERA_FIT_PADDING;
        minimumDistance = Math.max(
          minimumDistance,
          horizontalDistance,
          verticalDistance,
        );
      }
    }
  }
  return minimumDistance;
}

function hashText(hash: number, text: string): number {
  let next = hash;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next >>> 0;
}

function surfaceGeometryKey(model: PhysicalPreviewModel): string {
  let hash = 2166136261;
  for (const path of model.surfacePaths) hash = hashText(hash, path.d);
  return [
    model.widthMm,
    model.depthMm,
    model.heightMm,
    model.beadPitchMm,
    model.surfacePaths.length,
    hash,
  ].join(":");
}

function surfaceColorKey(model: PhysicalPreviewModel): string {
  return model.surfacePaths.map((path) => path.fill).join(":");
}

function boardKey(model: PhysicalPreviewModel): string {
  const { board } = model;
  return [
    board.widthMm,
    board.depthMm,
    board.thicknessMm,
    board.cornerRadiusMm,
    board.pegRadiusMm,
    board.pegHeightMm,
    board.pegs.length,
    model.beadPitchMm,
  ].join(":");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Builds one palette surface for the controller and performance gate.
 * 为三维控制器与性能门禁构建一个色组的压合表面。
 */
export function buildBeadPreviewSurfaceGeometry(
  model: PhysicalPreviewModel,
  pathD: string,
): ExtrudeGeometry | null {
  const parsed = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${escapeXmlAttribute(pathD)}" fill="#000" fill-rule="evenodd"/></svg>`,
  );
  const shapes = parsed.paths.flatMap((path) => path.toShapes());
  if (shapes.length === 0) return null;

  const geometry = new ExtrudeGeometry(shapes, {
    depth: model.heightMm,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(
    -model.widthMm / (2 * model.beadPitchMm),
    -model.depthMm / (2 * model.beadPitchMm),
    0,
  );
  geometry.scale(model.beadPitchMm, model.beadPitchMm, 1);
  // SVG row direction maps to world +Z. Extrusion maps from the board face
  // upward, with the front cap becoming the visible top surface.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, model.heightMm, 0);
  geometry.computeVertexNormals();
  return geometry;
}

class ThreeBeadPreviewController implements BeadThreePreviewController {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(36, 1, 0.1, 10_000);
  private readonly controls: OrbitControls;
  private readonly pegTransform = new Object3D();
  private boardMesh: Mesh | null = null;
  private pegMesh: InstancedMesh | null = null;
  private surfaceMeshes: Mesh[] = [];
  private currentBoardKey: string | null = null;
  private currentSurfaceGeometryKey: string | null = null;
  private currentSurfaceColorKey: string | null = null;
  private frameKey: string | null = null;
  private framedWidthMm: number | null = null;
  private framedDepthMm: number | null = null;
  private framedMinimumY: number | null = null;
  private framedMaximumY: number | null = null;
  private animationFrame: number | null = null;
  private disposed = false;
  private unavailable = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onUnavailable: () => void,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    this.scene.add(new AmbientLight(0xffffff, 1.35));
    const keyLight = new DirectionalLight(0xffffff, 2.7);
    keyLight.position.set(-35, 55, 40);
    this.scene.add(keyLight);
    const fillLight = new DirectionalLight(0xbfd8ff, 1.05);
    fillLight.position.set(40, 25, -30);
    this.scene.add(fillLight);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = true;
    this.controls.addEventListener("change", this.scheduleRender);
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
  }

  update(model: PhysicalPreviewModel): void {
    if (this.disposed || this.unavailable) return;

    const nextBoardKey = boardKey(model);
    if (nextBoardKey !== this.currentBoardKey) {
      this.replaceBoard(model);
      this.currentBoardKey = nextBoardKey;
    }

    const nextGeometryKey = surfaceGeometryKey(model);
    const nextColorKey = surfaceColorKey(model);
    if (nextGeometryKey !== this.currentSurfaceGeometryKey) {
      this.replaceSurfaces(model);
      this.currentSurfaceGeometryKey = nextGeometryKey;
      this.currentSurfaceColorKey = nextColorKey;
    } else if (nextColorKey !== this.currentSurfaceColorKey) {
      for (let index = 0; index < this.surfaceMeshes.length; index += 1) {
        const material = this.surfaceMeshes[index]?.material;
        const path = model.surfacePaths[index];
        if (
          path &&
          material instanceof MeshPhysicalMaterial
        ) {
          material.color.set(path.fill);
          material.needsUpdate = true;
        }
      }
      this.currentSurfaceColorKey = nextColorKey;
    }

    const sceneWidthMm = model.board.widthMm;
    const sceneDepthMm = model.board.depthMm;
    const minimumY = -model.board.thicknessMm;
    const maximumY = Math.max(model.heightMm, model.board.pegHeightMm);
    const nextFrameKey = [
      sceneWidthMm,
      sceneDepthMm,
      model.board.pegs.length,
    ].join(":");
    if (nextFrameKey !== this.frameKey) {
      this.frameKey = nextFrameKey;
      this.frameCamera(
        sceneWidthMm,
        sceneDepthMm,
        minimumY,
        maximumY,
      );
    } else {
      this.framedMinimumY = minimumY;
      this.framedMaximumY = maximumY;
      this.ensureCameraFitsCurrentAspect();
    }
    this.scheduleRender();
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (
      this.disposed ||
      this.unavailable ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(Math.round(width), Math.round(height), false);
    this.camera.aspect = width / height;
    this.ensureCameraFitsCurrentAspect();
    this.camera.updateProjectionMatrix();
    this.scheduleRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.canvas.removeEventListener(
      "webglcontextlost",
      this.handleContextLost,
    );
    this.controls.removeEventListener("change", this.scheduleRender);
    this.controls.dispose();
    this.disposeBoard();
    this.disposeSurfaces();
    this.renderer.dispose();
  }

  private replaceBoard(model: PhysicalPreviewModel): void {
    this.disposeBoard();
    const { board } = model;
    const boardGeometry = new RoundedBoxGeometry(
      board.widthMm,
      board.thicknessMm,
      board.depthMm,
      3,
      Math.min(
        board.cornerRadiusMm,
        board.thicknessMm * 0.46,
      ),
    );
    const boardMaterial = new MeshPhysicalMaterial({
      color: BOARD_COLOR,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.7,
    });
    this.boardMesh = new Mesh(boardGeometry, boardMaterial);
    this.boardMesh.name = "bead-preview-board";
    this.boardMesh.position.y = -board.thicknessMm / 2;
    this.scene.add(this.boardMesh);

    const pegGeometry = new CylinderGeometry(
      board.pegRadiusMm,
      board.pegRadiusMm,
      board.pegHeightMm,
      12,
      1,
      false,
    );
    const pegMaterial = new MeshPhysicalMaterial({
      color: PEG_COLOR,
      roughness: 0.56,
      metalness: 0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.65,
    });
    this.pegMesh = new InstancedMesh(
      pegGeometry,
      pegMaterial,
      board.pegs.length,
    );
    this.pegMesh.name = "bead-preview-pegs";
    this.pegMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (const peg of board.pegs) {
      this.pegTransform.position.set(
        peg.xMm,
        board.pegHeightMm / 2,
        peg.zMm,
      );
      this.pegTransform.rotation.set(0, 0, 0);
      this.pegTransform.scale.set(1, 1, 1);
      this.pegTransform.updateMatrix();
      this.pegMesh.setMatrixAt(peg.cellIndex, this.pegTransform.matrix);
    }
    this.pegMesh.instanceMatrix.needsUpdate = true;
    this.pegMesh.computeBoundingSphere();
    this.scene.add(this.pegMesh);
  }

  private replaceSurfaces(model: PhysicalPreviewModel): void {
    this.disposeSurfaces();
    for (let index = 0; index < model.surfacePaths.length; index += 1) {
      const path = model.surfacePaths[index];
      const geometry = buildBeadPreviewSurfaceGeometry(model, path.d);
      if (geometry === null) continue;
      const material = new MeshPhysicalMaterial({
        color: path.fill,
        roughness: 0.43,
        metalness: 0,
        clearcoat: 0.2,
        clearcoatRoughness: 0.5,
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = `bead-preview-surface-${index}`;
      this.surfaceMeshes.push(mesh);
      this.scene.add(mesh);
    }
  }

  private disposeBoard(): void {
    if (this.boardMesh !== null) {
      this.scene.remove(this.boardMesh);
      this.boardMesh.geometry.dispose();
      const material = this.boardMesh.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else {
        material.dispose();
      }
      this.boardMesh = null;
    }
    if (this.pegMesh !== null) {
      this.scene.remove(this.pegMesh);
      this.pegMesh.dispose();
      this.pegMesh.geometry.dispose();
      const material = this.pegMesh.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else {
        material.dispose();
      }
      this.pegMesh = null;
    }
  }

  private disposeSurfaces(): void {
    for (const mesh of this.surfaceMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else {
        material.dispose();
      }
    }
    this.surfaceMeshes = [];
  }

  private frameCamera(
    widthMm: number,
    depthMm: number,
    minimumY: number,
    maximumY: number,
  ): void {
    this.framedWidthMm = widthMm;
    this.framedDepthMm = depthMm;
    this.framedMinimumY = minimumY;
    this.framedMaximumY = maximumY;
    this.controls.target.set(0, (minimumY + maximumY) / 2, 0);
    const distance = resolveMinimumCameraDistanceForView(
      widthMm,
      depthMm,
      minimumY,
      maximumY,
      this.controls.target,
      DEFAULT_VIEW_DIRECTION,
      this.camera.up,
      this.camera.aspect,
      this.camera.fov,
    );
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(DEFAULT_VIEW_DIRECTION, distance);
    this.camera.near = Math.max(0.05, distance / 250);
    this.camera.far = Math.max(100, distance * 12);
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = Math.max(2, Math.min(widthMm, depthMm) * 0.12);
    this.controls.maxDistance = distance * 6;
    this.controls.update();
  }

  private ensureCameraFitsCurrentAspect(): void {
    if (
      this.framedWidthMm === null ||
      this.framedDepthMm === null ||
      this.framedMinimumY === null ||
      this.framedMaximumY === null
    ) {
      return;
    }
    const viewOffset = this.camera.position.clone().sub(this.controls.target);
    const currentDistance = viewOffset.length();
    if (currentDistance === 0) viewOffset.copy(DEFAULT_VIEW_DIRECTION);
    const minimumDistance = resolveMinimumCameraDistanceForView(
      this.framedWidthMm,
      this.framedDepthMm,
      this.framedMinimumY,
      this.framedMaximumY,
      this.controls.target,
      viewOffset,
      this.camera.up,
      this.camera.aspect,
      this.camera.fov,
    );
    if (currentDistance < minimumDistance) {
      this.camera.position
        .copy(this.controls.target)
        .addScaledVector(viewOffset.normalize(), minimumDistance);
      this.controls.update();
    }
    this.camera.far = Math.max(this.camera.far, minimumDistance * 12);
    this.controls.maxDistance = Math.max(
      this.controls.maxDistance,
      minimumDistance * 6,
    );
  }

  private readonly scheduleRender = (): void => {
    if (
      this.disposed ||
      this.unavailable ||
      this.animationFrame !== null
    ) {
      return;
    }
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = null;
      if (!this.disposed && !this.unavailable) {
        this.renderer.render(this.scene, this.camera);
      }
    });
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed || this.unavailable) return;
    this.unavailable = true;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.onUnavailable();
  };
}

export const createBeadThreePreviewController: CreateBeadThreePreviewController =
  (canvas, onUnavailable) =>
    new ThreeBeadPreviewController(canvas, onUnavailable);
