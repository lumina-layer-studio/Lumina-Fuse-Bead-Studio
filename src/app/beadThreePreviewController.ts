import {
  AmbientLight,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshPhysicalMaterial,
  MOUSE,
  Object3D,
  Plane,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import type { PhysicalPreviewModel } from "../domain/physicalPreviewModel";

export interface BeadThreePreviewController {
  update(model: PhysicalPreviewModel): void;
  pickCellAt(clientX: number, clientY: number): number | null;
  setSelectedCell(cellIndex: number | null): void;
  setHoveredCell(cellIndex: number | null): void;
  resize(width: number, height: number, pixelRatio: number): void;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  resetView(): void;
  dispose(): void;
}

export type CreateBeadThreePreviewController = (
  canvas: HTMLCanvasElement,
  onUnavailable: () => void,
) => BeadThreePreviewController;

const CAMERA_FIT_PADDING = 1.08;
const DEFAULT_VIEW_DIRECTION = new Vector3(0, 1, 0);
const DEFAULT_CAMERA_UP = new Vector3(0, 0, -1);
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
const BOARD_COLOR = 0xe6edf3;
const PEG_COLOR = 0xd5e0e8;
const HOVER_MARKER_COLOR = 0xffffff;
const SELECTED_MARKER_COLOR = 0x2f7cff;

function createCellMarker(name: string, color: number): LineLoop {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(-0.5, 0, -0.5),
    new Vector3(0.5, 0, -0.5),
    new Vector3(0.5, 0, 0.5),
    new Vector3(-0.5, 0, 0.5),
  ]);
  const material = new LineBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const marker = new LineLoop(geometry, material);
  marker.name = name;
  marker.visible = false;
  marker.frustumCulled = false;
  marker.renderOrder = 10;
  return marker;
}

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
  const upReference = cameraUp
    .clone()
    .addScaledVector(back, -cameraUp.dot(back));
  if (upReference.lengthSq() < Number.EPSILON) {
    const fallbackUp = Math.abs(back.x) < 0.999
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 1, 0);
    upReference
      .copy(fallbackUp)
      .addScaledVector(back, -fallbackUp.dot(back));
  }
  const right = upReference.normalize().cross(back).normalize();
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
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly editPlane = new Plane(new Vector3(0, 1, 0));
  private readonly planeHit = new Vector3();
  private readonly hoverMarker = createCellMarker(
    "bead-preview-hover-cell",
    HOVER_MARKER_COLOR,
  );
  private readonly selectedMarker = createCellMarker(
    "bead-preview-selected-cell",
    SELECTED_MARKER_COLOR,
  );
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
  private logicalWidthMm: number | null = null;
  private logicalDepthMm: number | null = null;
  private logicalRows = 0;
  private logicalColumns = 0;
  private logicalPitchMm: number | null = null;
  private markerY = 0;
  private hoveredCellIndex: number | null = null;
  private selectedCellIndex: number | null = null;
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
    this.camera.up.copy(DEFAULT_CAMERA_UP);

    this.scene.add(new AmbientLight(0xffffff, 1.35));
    const keyLight = new DirectionalLight(0xffffff, 2.7);
    keyLight.position.set(-35, 55, 40);
    this.scene.add(keyLight);
    const fillLight = new DirectionalLight(0xbfd8ff, 1.05);
    fillLight.position.set(40, 25, -30);
    this.scene.add(fillLight);
    this.scene.add(this.hoverMarker, this.selectedMarker);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = true;
    this.controls.mouseButtons.LEFT = MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = MOUSE.PAN;
    this.controls.mouseButtons.RIGHT = MOUSE.ROTATE;
    this.controls.addEventListener("change", this.scheduleRender);
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
  }

  update(model: PhysicalPreviewModel): void {
    if (this.disposed || this.unavailable) return;

    this.logicalWidthMm = model.widthMm;
    this.logicalDepthMm = model.depthMm;
    this.logicalPitchMm = model.beadPitchMm;
    this.logicalColumns = Math.max(
      0,
      Math.round(model.widthMm / model.beadPitchMm),
    );
    this.logicalRows = Math.max(
      0,
      Math.round(model.depthMm / model.beadPitchMm),
    );
    const editPlaneY = Math.max(model.heightMm, model.board.pegHeightMm);
    this.editPlane.constant = -editPlaneY;
    this.markerY = editPlaneY + Math.max(0.02, model.beadPitchMm * 0.015);
    this.updateMarker(this.hoverMarker, this.hoveredCellIndex);
    this.updateMarker(this.selectedMarker, this.selectedCellIndex);

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
    }
    this.scheduleRender();
  }

  pickCellAt(clientX: number, clientY: number): number | null {
    if (
      this.disposed ||
      this.unavailable ||
      this.logicalWidthMm === null ||
      this.logicalDepthMm === null ||
      this.logicalPitchMm === null ||
      this.logicalRows <= 0 ||
      this.logicalColumns <= 0 ||
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY)
    ) {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    if (
      this.raycaster.ray.intersectPlane(this.editPlane, this.planeHit) === null
    ) {
      return null;
    }

    const logicalX = this.planeHit.x + this.logicalWidthMm / 2;
    const logicalZ = this.planeHit.z + this.logicalDepthMm / 2;
    if (
      logicalX < 0 ||
      logicalX >= this.logicalWidthMm ||
      logicalZ < 0 ||
      logicalZ >= this.logicalDepthMm
    ) {
      return null;
    }
    const column = Math.floor(logicalX / this.logicalPitchMm);
    const row = Math.floor(logicalZ / this.logicalPitchMm);
    if (
      row < 0 ||
      row >= this.logicalRows ||
      column < 0 ||
      column >= this.logicalColumns
    ) {
      return null;
    }
    return row * this.logicalColumns + column;
  }

  setSelectedCell(cellIndex: number | null): void {
    this.selectedCellIndex = cellIndex;
    this.updateMarker(this.selectedMarker, cellIndex);
    this.scheduleRender();
  }

  setHoveredCell(cellIndex: number | null): void {
    this.hoveredCellIndex = cellIndex;
    this.updateMarker(this.hoverMarker, cellIndex);
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

  zoomIn(): void {
    this.zoomBy(ZOOM_IN_FACTOR);
  }

  zoomOut(): void {
    this.zoomBy(ZOOM_OUT_FACTOR);
  }

  fit(): void {
    if (this.disposed || this.unavailable) return;
    const viewDirection = this.camera.position
      .clone()
      .sub(this.controls.target);
    if (viewDirection.lengthSq() < Number.EPSILON) {
      viewDirection.copy(DEFAULT_VIEW_DIRECTION);
    }
    if (this.fitCamera(viewDirection)) this.scheduleRender();
  }

  resetView(): void {
    if (this.disposed || this.unavailable) return;
    this.camera.up.copy(DEFAULT_CAMERA_UP);
    if (this.fitCamera(DEFAULT_VIEW_DIRECTION)) this.scheduleRender();
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
    this.disposeMarker(this.hoverMarker);
    this.disposeMarker(this.selectedMarker);
    this.renderer.dispose();
  }

  private updateMarker(marker: LineLoop, cellIndex: number | null): void {
    if (
      cellIndex === null ||
      !Number.isInteger(cellIndex) ||
      cellIndex < 0 ||
      cellIndex >= this.logicalRows * this.logicalColumns ||
      this.logicalWidthMm === null ||
      this.logicalDepthMm === null ||
      this.logicalPitchMm === null
    ) {
      marker.visible = false;
      return;
    }
    const row = Math.floor(cellIndex / this.logicalColumns);
    const column = cellIndex % this.logicalColumns;
    marker.position.set(
      (column + 0.5) * this.logicalPitchMm - this.logicalWidthMm / 2,
      this.markerY,
      (row + 0.5) * this.logicalPitchMm - this.logicalDepthMm / 2,
    );
    const markerSize = this.logicalPitchMm * 0.86;
    marker.scale.set(markerSize, 1, markerSize);
    marker.visible = true;
  }

  private disposeMarker(marker: LineLoop): void {
    this.scene.remove(marker);
    marker.geometry.dispose();
    const material = marker.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material.dispose();
    }
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
    this.camera.up.copy(DEFAULT_CAMERA_UP);
    this.fitCamera(DEFAULT_VIEW_DIRECTION);
  }

  private fitCamera(viewDirection: Vector3): boolean {
    if (
      this.framedWidthMm === null ||
      this.framedDepthMm === null ||
      this.framedMinimumY === null ||
      this.framedMaximumY === null
    ) {
      return false;
    }

    this.controls.target.set(
      0,
      (this.framedMinimumY + this.framedMaximumY) / 2,
      0,
    );
    const distance = resolveMinimumCameraDistanceForView(
      this.framedWidthMm,
      this.framedDepthMm,
      this.framedMinimumY,
      this.framedMaximumY,
      this.controls.target,
      viewDirection,
      this.camera.up,
      this.camera.aspect,
      this.camera.fov,
    );
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(viewDirection.clone().normalize(), distance);
    this.camera.near = Math.max(0.05, distance / 250);
    this.camera.far = Math.max(100, distance * 12);
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = Math.max(
      2,
      Math.min(this.framedWidthMm, this.framedDepthMm) * 0.12,
    );
    this.controls.maxDistance = distance * 6;
    this.controls.update();
    return true;
  }

  private zoomBy(factor: number): void {
    if (this.disposed || this.unavailable) return;
    const viewOffset = this.camera.position.clone().sub(this.controls.target);
    const currentDistance = viewOffset.length();
    if (currentDistance < Number.EPSILON) return;
    const distance = Math.min(
      this.controls.maxDistance,
      Math.max(this.controls.minDistance, currentDistance * factor),
    );
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(viewOffset.normalize(), distance);
    this.controls.update();
    this.scheduleRender();
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
