import {
  AmbientLight,
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
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
  NearestFilter,
  Object3D,
  Plane,
  PerspectiveCamera,
  Raycaster,
  RedFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import {
  createBeadFastPreviewLayer,
  type BeadFastPreviewLayer,
} from "./beadFastPreviewLayer";
import {
  buildFastBeadPreviewModel,
  type FastBeadPreviewModel,
} from "../domain/fastPreviewModel";
import {
  buildPhysicalPreviewLayout,
  type PhysicalPreviewLayout,
  type PhysicalPreviewModel,
} from "../domain/physicalPreviewModel";
import type { BeadProject } from "../domain/types";

export interface BeadThreePreviewController {
  /**
   * Publishes the next browser-side project preview. Revisions must be
   * non-negative integers that increase strictly; duplicate or stale values
   * are ignored so one exact result can pair with only one fast revision.
   * React callers must publish a paired revision before scheduling exact work.
   *
   * 发布下一份浏览器端项目预览。修订号必须是严格递增的非负整数；重复或
   * 过期值会被忽略，确保一份精确结果只与一份快速预览配对。React 调用方
   * 必须先发布配对修订号，再调度精确模型。
   */
  previewProject(project: BeadProject, revision: number): void;

  /**
   * Commits exact fused geometry. A supplied revision must match the latest
   * accepted fast revision; the single-argument legacy form is transitional.
   *
   * 提交精确压合几何。传入的修订号必须匹配最近一次已接收的快速预览；
   * 单参数旧式调用仅用于迁移期兼容。
   */
  update(model: PhysicalPreviewModel, revision?: number): void;
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

function boardKey(
  model: Pick<PhysicalPreviewModel, "board" | "beadPitchMm">,
): string {
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

function physicalLayoutKey(project: BeadProject): string {
  return [
    project.projectId,
    project.rows,
    project.columns,
    project.beadPitchMm,
    project.compression,
  ].join(":");
}

interface PendingFastPreview {
  model: FastBeadPreviewModel;
  revision: number;
  visibleCellMask: Uint8Array | null;
}

interface PendingExactModel {
  model: PhysicalPreviewModel;
  revision: number;
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
  private fastLayer: BeadFastPreviewLayer;
  private pendingFastPreview: PendingFastPreview | null = null;
  private latestFastModel: FastBeadPreviewModel | null = null;
  private latestFastModelRevision = -1;
  private latestFastVisibleCellMask: Uint8Array | null = null;
  private currentExactFastModel: FastBeadPreviewModel | null = null;
  private pendingExactModel: PendingExactModel | null = null;
  private exactBuildArmed = false;
  private latestPreviewRevision = -1;
  private currentExactRevision: number | null = null;
  private exactEditMaskTexture: DataTexture | null = null;
  private exactEditMaskData = new Uint8Array(0);
  private exactEditMaskRows = 0;
  private exactEditMaskColumns = 0;
  private readonly exactEditMaskTextureUniform: { value: DataTexture | null } = {
    value: null,
  };
  private readonly exactEditMaskGridUniform = { value: new Vector4() };
  private readonly exactEditMaskPitchUniform = { value: 1 };
  private physicalLayoutCacheKey: string | null = null;
  private physicalLayoutCache: PhysicalPreviewLayout | null = null;
  private reducedMotionQuery: MediaQueryList | null = null;
  private reducedMotionListenerMode: "modern" | "legacy" | null = null;
  private reduceMotion = false;
  private currentBoardKey: string | null = null;
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
    this.reducedMotionQuery = this.resolveReducedMotionQuery();
    this.reduceMotion = this.reducedMotionQuery?.matches ?? false;
    this.fastLayer = createBeadFastPreviewLayer(
      this.scene,
      this.reduceMotion,
    );
    this.addReducedMotionListener();
  }

  previewProject(project: BeadProject, revision: number): void {
    if (this.disposed || this.unavailable) return;
    if (
      !Number.isInteger(revision) ||
      revision < 0 ||
      revision <= this.latestPreviewRevision
    ) {
      return;
    }

    const layout = this.resolvePhysicalLayout(project);
    this.applySceneLayout(layout, project.rows, project.columns);
    const fastModel = buildFastBeadPreviewModel(project, layout);
    const visibleCellMask = this.resolveLocalEditMask(fastModel);
    this.latestPreviewRevision = revision;
    this.latestFastModel = fastModel;
    this.latestFastModelRevision = revision;
    this.latestFastVisibleCellMask = visibleCellMask;
    this.pendingFastPreview = {
      model: fastModel,
      revision,
      visibleCellMask,
    };
    this.clearPendingExactModel();
    this.scheduleRender();
  }

  update(model: PhysicalPreviewModel, revision?: number): void {
    if (this.disposed || this.unavailable) return;

    if (revision === undefined) {
      this.applySceneLayout(
        model,
        Math.max(0, Math.round(model.depthMm / model.beadPitchMm)),
        Math.max(0, Math.round(model.widthMm / model.beadPitchMm)),
      );
      this.clearPendingExactModel();
      const nextMeshes = this.buildExactMeshes(model);
      if (nextMeshes === null) return;
      this.commitExactMeshes(nextMeshes, null);
      this.scheduleRender();
      return;
    }

    if (
      !Number.isInteger(revision) ||
      revision !== this.latestPreviewRevision
    ) {
      return;
    }
    this.pendingExactModel = {
      model,
      revision,
    };
    this.exactBuildArmed = false;
    this.scheduleRender();
  }

  private applySceneLayout(
    model: Pick<
      PhysicalPreviewModel,
      "widthMm" | "depthMm" | "heightMm" | "beadPitchMm" | "board"
    >,
    rows: number,
    columns: number,
  ): void {
    this.logicalWidthMm = model.widthMm;
    this.logicalDepthMm = model.depthMm;
    this.logicalPitchMm = model.beadPitchMm;
    this.logicalColumns = Math.max(0, columns);
    this.logicalRows = Math.max(0, rows);
    this.ensureExactEditMask(
      this.logicalRows,
      this.logicalColumns,
      model.widthMm,
      model.depthMm,
      model.beadPitchMm,
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
  }

  private resolveLocalEditMask(
    model: FastBeadPreviewModel,
  ): Uint8Array | null {
    const baseline = this.currentExactFastModel;
    if (
      baseline === null ||
      this.currentExactRevision === null ||
      baseline.projectId !== model.projectId ||
      baseline.rows !== model.rows ||
      baseline.columns !== model.columns ||
      baseline.beadPitchMm !== model.beadPitchMm ||
      baseline.outerRadiusMm !== model.outerRadiusMm ||
      baseline.holeRadiusMm !== model.holeRadiusMm ||
      baseline.contactReachMm !== model.contactReachMm ||
      baseline.heightMm !== model.heightMm
    ) {
      return null;
    }

    const mask = new Uint8Array(model.slots.length);
    for (let index = 0; index < model.slots.length; index += 1) {
      const before = baseline.slots[index];
      const after = model.slots[index];
      if (before === undefined || after === undefined) {
        mask[index] = 255;
        continue;
      }
      const colorChanged =
        before.color?.[0] !== after.color?.[0] ||
        before.color?.[1] !== after.color?.[1] ||
        before.color?.[2] !== after.color?.[2];
      const geometryChanged =
        before.xMm !== after.xMm ||
        before.zMm !== after.zMm ||
        before.scaleX !== after.scaleX ||
        before.scaleZ !== after.scaleZ;
      if (
        before.visible !== after.visible ||
        colorChanged ||
        geometryChanged
      ) {
        mask[index] = 255;
      }
    }
    return mask;
  }

  private ensureExactEditMask(
    rows: number,
    columns: number,
    widthMm: number,
    depthMm: number,
    pitchMm: number,
  ): void {
    const capacity = rows * columns;
    this.exactEditMaskGridUniform.value.set(
      columns,
      rows,
      widthMm,
      depthMm,
    );
    this.exactEditMaskPitchUniform.value = pitchMm;
    if (
      this.exactEditMaskTexture !== null &&
      this.exactEditMaskData.length === capacity &&
      this.exactEditMaskRows === rows &&
      this.exactEditMaskColumns === columns
    ) {
      return;
    }
    this.disposeExactEditMask();
    this.exactEditMaskData = new Uint8Array(capacity);
    const texture = new DataTexture(
      this.exactEditMaskData,
      Math.max(columns, 1),
      Math.max(rows, 1),
      RedFormat,
      UnsignedByteType,
    );
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    this.exactEditMaskTexture = texture;
    this.exactEditMaskTextureUniform.value = texture;
    this.exactEditMaskRows = rows;
    this.exactEditMaskColumns = columns;
  }

  private applyExactEditMask(mask: Uint8Array): void {
    if (
      this.exactEditMaskTexture === null ||
      mask.length !== this.exactEditMaskData.length
    ) {
      return;
    }
    this.exactEditMaskData.set(mask);
    this.exactEditMaskTexture.needsUpdate = true;
  }

  private clearExactEditMask(): void {
    if (this.exactEditMaskTexture === null) return;
    this.exactEditMaskData.fill(0);
    this.exactEditMaskTexture.needsUpdate = true;
  }

  private configureExactEditMask(material: MeshPhysicalMaterial): void {
    material.onBeforeCompile = (shader) => {
      const texture = this.exactEditMaskTexture;
      if (texture === null) return;
      shader.uniforms.beadEditMask = this.exactEditMaskTextureUniform;
      shader.uniforms.beadEditGrid = this.exactEditMaskGridUniform;
      shader.uniforms.beadEditPitch = this.exactEditMaskPitchUniform;
      shader.vertexShader = `
varying vec3 vBeadEditPosition;
${shader.vertexShader.replace(
  "#include <begin_vertex>",
  "#include <begin_vertex>\nvBeadEditPosition = transformed;",
)}`;
      shader.fragmentShader = `
uniform sampler2D beadEditMask;
uniform vec4 beadEditGrid;
uniform float beadEditPitch;
varying vec3 vBeadEditPosition;
${shader.fragmentShader.replace(
  "#include <clipping_planes_fragment>",
  `#include <clipping_planes_fragment>
vec2 beadEditCell = clamp(
  floor(vec2(
    (vBeadEditPosition.x + beadEditGrid.z * 0.5) / beadEditPitch,
    (vBeadEditPosition.z + beadEditGrid.w * 0.5) / beadEditPitch
  )),
  vec2(0.0),
  beadEditGrid.xy - vec2(1.0)
);
vec2 beadEditUv = (beadEditCell + 0.5) / beadEditGrid.xy;
if (texture2D(beadEditMask, beadEditUv).r > 0.5) discard;`,
)}`;
    };
    material.customProgramCacheKey = () => "bead-exact-edit-mask-v1";
  }

  private disposeExactEditMask(): void {
    this.exactEditMaskTexture?.dispose();
    this.exactEditMaskTexture = null;
    this.exactEditMaskTextureUniform.value = null;
    this.exactEditMaskData = new Uint8Array(0);
    this.exactEditMaskRows = 0;
    this.exactEditMaskColumns = 0;
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
    this.removeReducedMotionListener();
    this.controls.removeEventListener("change", this.scheduleRender);
    this.controls.dispose();
    this.fastLayer.dispose();
    this.clearPendingExactModel();
    this.disposeBoard();
    this.disposeSurfaces();
    this.disposeExactEditMask();
    this.disposeMarker(this.hoverMarker);
    this.disposeMarker(this.selectedMarker);
    this.renderer.dispose();
  }

  private resolvePhysicalLayout(project: BeadProject): PhysicalPreviewLayout {
    const nextKey = physicalLayoutKey(project);
    if (
      this.physicalLayoutCacheKey === nextKey &&
      this.physicalLayoutCache !== null
    ) {
      return this.physicalLayoutCache;
    }
    const layout = buildPhysicalPreviewLayout(project);
    this.physicalLayoutCacheKey = nextKey;
    this.physicalLayoutCache = layout;
    return layout;
  }

  private resolveReducedMotionQuery(): MediaQueryList | null {
    const ownerWindow = this.canvas.ownerDocument.defaultView;
    if (ownerWindow === null || typeof ownerWindow.matchMedia !== "function") {
      return null;
    }
    try {
      return ownerWindow.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return null;
    }
  }

  private addReducedMotionListener(): void {
    const query = this.reducedMotionQuery;
    if (query === null) return;
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", this.handleReducedMotionChange);
      this.reducedMotionListenerMode = "modern";
    } else if (typeof query.addListener === "function") {
      query.addListener(this.handleReducedMotionChange);
      this.reducedMotionListenerMode = "legacy";
    }
  }

  private removeReducedMotionListener(): void {
    const query = this.reducedMotionQuery;
    if (query === null) return;
    if (
      this.reducedMotionListenerMode === "modern" &&
      typeof query.removeEventListener === "function"
    ) {
      query.removeEventListener("change", this.handleReducedMotionChange);
    } else if (
      this.reducedMotionListenerMode === "legacy" &&
      typeof query.removeListener === "function"
    ) {
      query.removeListener(this.handleReducedMotionChange);
    }
    this.reducedMotionListenerMode = null;
    this.reducedMotionQuery = null;
  }

  private readonly handleReducedMotionChange = (
    event: MediaQueryListEvent,
  ): void => {
    if (
      this.disposed ||
      this.unavailable ||
      event.matches === this.reduceMotion
    ) {
      return;
    }
    this.reduceMotion = event.matches;
    this.fastLayer.dispose();
    this.fastLayer = createBeadFastPreviewLayer(
      this.scene,
      this.reduceMotion,
    );
    this.exactBuildArmed = false;
    if (this.latestFastModel !== null && this.latestPreviewRevision >= 0) {
      this.pendingFastPreview = {
        model: this.latestFastModel,
        revision: this.latestPreviewRevision,
        visibleCellMask: this.latestFastVisibleCellMask,
      };
    }
    this.scheduleRender();
  };

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

  private replaceBoard(
    model: Pick<PhysicalPreviewModel, "board">,
  ): void {
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

  private buildExactMeshes(model: PhysicalPreviewModel): Mesh[] | null {
    const meshes: Mesh[] = [];
    try {
      for (let index = 0; index < model.surfacePaths.length; index += 1) {
        const path = model.surfacePaths[index];
        if (path === undefined) continue;
        const geometry = buildBeadPreviewSurfaceGeometry(model, path.d);
        if (geometry === null) continue;
        let material: MeshPhysicalMaterial | null = null;
        try {
          material = new MeshPhysicalMaterial({
            color: path.fill,
            roughness: 0.43,
            metalness: 0,
            clearcoat: 0.2,
            clearcoatRoughness: 0.5,
            side: DoubleSide,
          });
          this.configureExactEditMask(material);
          const mesh = new Mesh(geometry, material);
          mesh.name = `bead-preview-surface-${index}`;
          meshes.push(mesh);
        } catch (error) {
          geometry.dispose();
          material?.dispose();
          throw error;
        }
      }
      return meshes;
    } catch {
      this.disposeExactMeshes(meshes);
      return null;
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
    this.disposeExactMeshes(this.surfaceMeshes);
    this.surfaceMeshes = [];
  }

  private clearPendingExactModel(): void {
    this.pendingExactModel = null;
    this.exactBuildArmed = false;
  }

  private disposeExactMeshes(meshes: readonly Mesh[]): void {
    for (const mesh of meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else {
        material.dispose();
      }
    }
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

  private hideAllExactPreviews(): void {
    for (const mesh of this.surfaceMeshes) mesh.visible = false;
  }

  private commitExactMeshes(meshes: Mesh[], revision: number | null): void {
    this.disposeSurfaces();
    this.surfaceMeshes = meshes;
    this.currentExactRevision = revision;
    this.currentExactFastModel =
      revision !== null && revision === this.latestFastModelRevision
        ? this.latestFastModel
        : null;
    this.clearExactEditMask();
    for (const mesh of meshes) {
      mesh.visible = true;
      this.scene.add(mesh);
    }
    this.fastLayer.setVisible(false);
  }

  private buildDeferredExactIfCurrent(): void {
    const pending = this.pendingExactModel;
    this.clearPendingExactModel();
    if (
      pending === null ||
      pending.revision !== this.latestPreviewRevision ||
      pending.revision !== this.fastLayer.revision
    ) {
      return;
    }
    const nextMeshes = this.buildExactMeshes(pending.model);
    if (nextMeshes === null) return;
    this.commitExactMeshes(nextMeshes, pending.revision);
  }

  private readonly renderFrame = (timestamp: number): void => {
    this.animationFrame = null;
    if (this.disposed || this.unavailable) return;

    const pendingFast = this.pendingFastPreview;
    if (pendingFast !== null) {
      this.pendingFastPreview = null;
      if (pendingFast.revision === this.latestPreviewRevision) {
        this.exactBuildArmed = false;
        this.fastLayer.update(
          pendingFast.model,
          pendingFast.revision,
          timestamp,
          pendingFast.visibleCellMask ?? undefined,
        );
        this.fastLayer.setVisible(true);
        if (
          pendingFast.visibleCellMask !== null &&
          this.surfaceMeshes.length > 0
        ) {
          this.applyExactEditMask(pendingFast.visibleCellMask);
          for (const mesh of this.surfaceMeshes) mesh.visible = true;
        } else {
          this.clearExactEditMask();
          this.hideAllExactPreviews();
        }
      }
    }

    const hasActiveAnimation = this.fastLayer.advance(timestamp);
    if (this.exactBuildArmed) {
      if (hasActiveAnimation) {
        this.exactBuildArmed = false;
      } else {
        this.buildDeferredExactIfCurrent();
      }
    } else if (
      !hasActiveAnimation &&
      this.pendingExactModel === null &&
      this.currentExactRevision === this.fastLayer.revision
    ) {
      for (const mesh of this.surfaceMeshes) mesh.visible = true;
      this.fastLayer.setVisible(false);
    }
    this.renderer.render(this.scene, this.camera);

    let needsAnotherFrame =
      this.pendingFastPreview !== null ||
      this.fastLayer.hasActiveAnimations();
    if (!needsAnotherFrame && this.pendingExactModel !== null) {
      if (
        this.pendingExactModel.revision === this.latestPreviewRevision &&
        this.pendingExactModel.revision === this.fastLayer.revision
      ) {
        this.exactBuildArmed = true;
        needsAnotherFrame = true;
      } else {
        this.clearPendingExactModel();
      }
    }
    if (needsAnotherFrame) this.scheduleRender();
  };

  private readonly scheduleRender = (): void => {
    if (
      this.disposed ||
      this.unavailable ||
      this.animationFrame !== null
    ) {
      return;
    }
    this.animationFrame = requestAnimationFrame(this.renderFrame);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed || this.unavailable) return;
    this.unavailable = true;
    this.dispose();
    this.onUnavailable();
  };
}

export const createBeadThreePreviewController: CreateBeadThreePreviewController =
  (canvas, onUnavailable) =>
    new ThreeBeadPreviewController(canvas, onUnavailable);
