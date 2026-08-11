import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Path,
  Quaternion,
  Scene,
  Shape,
  Vector3,
} from "three";

import type {
  FastBeadPreviewModel,
  FastBeadPreviewSlot,
} from "../domain/fastPreviewModel";
import type { RgbColor } from "../domain/types";

/**
 * Duration of one fast bead placement motion in milliseconds.
 * 单颗拼豆快速放置动画的时长（毫秒）。
 */
export const BEAD_PLACEMENT_ANIMATION_MS = 370;

/**
 * Duration of one outgoing replacement or erase motion in milliseconds.
 * 单颗拼豆换色或擦除退场动画的时长（毫秒）。
 */
export const BEAD_EXIT_ANIMATION_MS = 220;

/**
 * Persistent browser-side instance layer for immediate bead feedback.
 * 用于即时拼豆反馈的浏览器端常驻实例层。
 */
export interface BeadFastPreviewLayer {
  /** Latest project revision accepted by this layer. / 此层已接收的最新项目修订号。 */
  readonly revision: number;

  /**
   * Applies one lightweight model and starts only new placement animations.
   * 应用一份轻量模型，并且只为新增拼豆启动放置动画。
   */
  update(model: FastBeadPreviewModel, revision: number, now: number): void;

  /**
   * Advances active placements and reports whether another frame is needed.
   * 推进活动中的放置动画，并返回是否还需要下一帧。
   */
  advance(now: number): boolean;

  /**
   * Reports whether any bead placement is still moving.
   * 返回当前是否仍有拼豆处于放置动画中。
   */
  hasActiveAnimations(): boolean;

  /**
   * Shows or hides the persistent fast mesh without rebuilding it.
   * 显示或隐藏常驻快速网格，且不会重建网格。
   */
  setVisible(visible: boolean): void;

  /**
   * Releases the mesh and its GPU resources exactly once.
   * 仅一次释放网格及其 GPU 资源。
   */
  dispose(): void;
}

interface PlacementAnimation {
  startedAt: number;
  slot: FastBeadPreviewSlot;
  heightMm: number;
  dropHeightMm: number;
}

interface ExitAnimation {
  startedAt: number;
  startPosition: Vector3;
  startScale: Vector3;
  liftMm: number;
}

interface PlacementPose {
  radialScale: number;
  verticalScale: number;
  liftMm: number;
}

const OUTER_SEGMENTS = 24;
const INITIAL_SCALE = 0.18;
const APPEARANCE_END_MS = 80;
const FALL_END_MS = 270;
const MAX_SUPERELLIPSE_EXPONENT_DELTA = 1.2;
const IDENTITY_ROTATION = new Quaternion();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(value: number): number {
  const remaining = 1 - clamp01(value);
  return 1 - remaining * remaining * remaining;
}

function superellipsePoint(
  angle: number,
  radiusMm: number,
  exponent: number,
): readonly [number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    radiusMm * Math.sign(cosine) * Math.pow(Math.abs(cosine), 2 / exponent),
    radiusMm * Math.sign(sine) * Math.pow(Math.abs(sine), 2 / exponent),
  ];
}

/**
 * Resolves the fast-preview superellipse exponent from canonical pressure.
 * 根据规范化压合压力解析快速预览的超椭圆指数。
 */
export function resolveFastBeadSuperellipseExponent(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1) {
    throw new RangeError("Fast preview pressure must be between 0 and 1.");
  }
  return 2 + pressure * MAX_SUPERELLIPSE_EXPONENT_DELTA;
}

function appendSuperellipse(
  path: Shape | Path,
  radiusMm: number,
  exponent: number,
  clockwise: boolean,
): void {
  for (let index = 0; index < OUTER_SEGMENTS; index += 1) {
    const unit = index / OUTER_SEGMENTS;
    const angle = (clockwise ? -1 : 1) * unit * Math.PI * 2;
    const [x, y] = superellipsePoint(angle, radiusMm, exponent);
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

function createFastBeadGeometry(
  model: FastBeadPreviewModel,
): ExtrudeGeometry {
  const outerExponent = resolveFastBeadSuperellipseExponent(model.pressure);
  const shape = new Shape();
  appendSuperellipse(shape, model.outerRadiusMm, outerExponent, false);

  if (model.holeRadiusMm > Number.EPSILON) {
    const hole = new Path();
    appendSuperellipse(hole, model.holeRadiusMm, 2, true);
    shape.holes.push(hole);
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: model.heightMm,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, model.heightMm / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function physicalProfileKey(model: FastBeadPreviewModel): string {
  return [
    model.rows * model.columns,
    model.pressure,
    model.outerRadiusMm,
    model.holeRadiusMm,
    model.contactReachMm,
    model.heightMm,
  ].join(":");
}

function placementPose(elapsedMs: number, animation: PlacementAnimation) {
  if (elapsedMs < APPEARANCE_END_MS) {
    const progress = easeOutCubic(elapsedMs / APPEARANCE_END_MS);
    const scale = INITIAL_SCALE + (1 - INITIAL_SCALE) * progress;
    return {
      radialScale: scale,
      verticalScale: scale,
      liftMm: animation.dropHeightMm,
    } satisfies PlacementPose;
  }

  if (elapsedMs < FALL_END_MS) {
    const progress = smoothstep(
      (elapsedMs - APPEARANCE_END_MS) /
        (FALL_END_MS - APPEARANCE_END_MS),
    );
    const impact = smoothstep((progress - 0.76) / 0.24);
    return {
      radialScale: 1 + 0.03 * impact,
      verticalScale: 1 - 0.06 * impact,
      liftMm: animation.dropHeightMm * (1 - progress),
    } satisfies PlacementPose;
  }

  const progress = clamp01(
    (elapsedMs - FALL_END_MS) /
      (BEAD_PLACEMENT_ANIMATION_MS - FALL_END_MS),
  );
  const rebound = Math.sin(Math.PI * progress);
  return {
    radialScale: 1 + 0.03 * (1 - progress) - 0.01 * rebound,
    verticalScale: 0.94 + 0.06 * progress + 0.03 * rebound,
    liftMm: animation.heightMm * 0.07 * rebound,
  } satisfies PlacementPose;
}

function previewTopologyKey(model: FastBeadPreviewModel): string {
  return `${model.projectId}:${model.rows}:${model.columns}`;
}

class ThreeBeadFastPreviewLayer implements BeadFastPreviewLayer {
  private readonly scene: Scene;
  private readonly reduceMotion: boolean;
  private readonly instanceMatrix = new Matrix4();
  private readonly instancePosition = new Vector3();
  private readonly instanceRotation = new Quaternion();
  private readonly instanceScale = new Vector3();
  private readonly instanceColor = new Color();
  private readonly animations = new Map<number, PlacementAnimation>();
  private readonly exits = new Map<number, ExitAnimation>();
  private mesh: InstancedMesh<ExtrudeGeometry, MeshPhysicalMaterial> | null =
    null;
  private outgoingMesh:
    | InstancedMesh<ExtrudeGeometry, MeshPhysicalMaterial>
    | null = null;
  private profileKey: string | null = null;
  private topologyKey: string | null = null;
  private snapshotVisible = new Uint8Array(0);
  private snapshotColor = new Float64Array(0);
  private snapshotGeometry = new Float64Array(0);
  private initialized = false;
  private requestedVisible = true;
  private currentRevision = -1;
  private disposed = false;

  constructor(scene: Scene, reduceMotion: boolean) {
    this.scene = scene;
    this.reduceMotion = reduceMotion;
  }

  get revision(): number {
    return this.currentRevision;
  }

  update(model: FastBeadPreviewModel, revision: number, now: number): void {
    if (this.disposed) return;
    if (revision < this.currentRevision) return;
    const capacity = model.rows * model.columns;
    if (model.slots.length !== capacity) {
      throw new Error(
        `Fast preview slot count ${model.slots.length} does not match ${capacity}.`,
      );
    }

    const nextTopologyKey = previewTopologyKey(model);
    const topologyChanged =
      this.topologyKey !== null && this.topologyKey !== nextTopologyKey;
    const rebuilt = this.ensureMesh(model);
    const mesh = this.mesh;
    const outgoingMesh = this.outgoingMesh;
    if (mesh === null || outgoingMesh === null) return;
    this.ensureSnapshotCapacity(capacity);
    let matrixDirty = false;
    let colorDirty = false;
    let outgoingMatrixDirty = false;
    let outgoingColorDirty = false;

    if (rebuilt || topologyChanged || !this.initialized) {
      this.animations.clear();
      this.exits.clear();
      for (const slot of model.slots) {
        if (slot.visible) {
          this.writeFinalMatrix(mesh, slot.cellIndex, slot, model.heightMm);
          this.writeColor(mesh, slot.cellIndex, slot.color);
          colorDirty = true;
        } else {
          this.writeHiddenMatrix(mesh, slot.cellIndex, slot);
        }
        this.writeHiddenMatrix(outgoingMesh, slot.cellIndex, slot);
        matrixDirty = true;
        outgoingMatrixDirty = true;
      }
      this.initialized = true;
    } else {
      for (const slot of model.slots) {
        const previousVisible = this.snapshotVisible[slot.cellIndex] === 1;
        const colorChanged = !this.sameSnapshotColor(slot.cellIndex, slot.color);
        const geometryChanged = !this.sameSnapshotGeometry(slot.cellIndex, slot);

        if (!slot.visible) {
          if (previousVisible || this.animations.has(slot.cellIndex)) {
            if (this.reduceMotion) {
              this.exits.delete(slot.cellIndex);
              this.writeHiddenMatrix(
                outgoingMesh,
                slot.cellIndex,
                slot,
              );
            } else {
              this.startExit(slot.cellIndex, now, model);
              outgoingColorDirty = true;
            }
            outgoingMatrixDirty = true;
            this.animations.delete(slot.cellIndex);
            this.writeHiddenMatrix(mesh, slot.cellIndex, slot);
            matrixDirty = true;
          }
          continue;
        }

        if (!previousVisible) {
          if (this.exits.delete(slot.cellIndex)) {
            this.writeHiddenMatrix(
              outgoingMesh,
              slot.cellIndex,
              slot,
            );
            outgoingMatrixDirty = true;
          }
          this.writeColor(mesh, slot.cellIndex, slot.color);
          colorDirty = true;
          if (this.reduceMotion) {
            this.writeFinalMatrix(mesh, slot.cellIndex, slot, model.heightMm);
          } else {
            this.startPlacement(mesh, slot, model, now);
          }
          matrixDirty = true;
          continue;
        }

        if (colorChanged) {
          if (this.reduceMotion) {
            this.animations.delete(slot.cellIndex);
            this.exits.delete(slot.cellIndex);
            this.writeHiddenMatrix(
              outgoingMesh,
              slot.cellIndex,
              slot,
            );
            outgoingMatrixDirty = true;
            this.writeColor(mesh, slot.cellIndex, slot.color);
            this.writeFinalMatrix(
              mesh,
              slot.cellIndex,
              slot,
              model.heightMm,
            );
          } else {
            this.startExit(slot.cellIndex, now, model);
            outgoingMatrixDirty = true;
            outgoingColorDirty = true;
            this.writeColor(mesh, slot.cellIndex, slot.color);
            this.startPlacement(mesh, slot, model, now);
          }
          colorDirty = true;
          matrixDirty = true;
          continue;
        }

        if (geometryChanged) {
          const active = this.animations.get(slot.cellIndex);
          if (active) {
            active.slot = {
              ...slot,
              color: slot.color === null ? null : [...slot.color],
            };
            active.heightMm = model.heightMm;
            this.writeAnimatedMatrix(
              mesh,
              slot.cellIndex,
              active,
              Math.max(0, now - active.startedAt),
            );
          } else {
            this.writeFinalMatrix(mesh, slot.cellIndex, slot, model.heightMm);
          }
          matrixDirty = true;
        }
      }
    }

    this.captureSnapshots(model);
    this.topologyKey = nextTopologyKey;
    this.currentRevision = revision;
    this.flushChanges(mesh, matrixDirty, colorDirty);
    this.flushChanges(
      outgoingMesh,
      outgoingMatrixDirty,
      outgoingColorDirty,
    );
  }

  advance(now: number): boolean {
    if (
      this.disposed ||
      this.mesh === null ||
      this.outgoingMesh === null ||
      (this.animations.size === 0 && this.exits.size === 0)
    ) {
      return false;
    }

    let matrixDirty = false;
    for (const [cellIndex, animation] of this.animations) {
      const elapsedMs = Math.max(0, now - animation.startedAt);
      if (elapsedMs >= BEAD_PLACEMENT_ANIMATION_MS) {
        this.writeFinalMatrix(
          this.mesh,
          cellIndex,
          animation.slot,
          animation.heightMm,
        );
        this.animations.delete(cellIndex);
      } else {
        this.writeAnimatedMatrix(
          this.mesh,
          cellIndex,
          animation,
          elapsedMs,
        );
      }
      matrixDirty = true;
    }
    this.flushChanges(this.mesh, matrixDirty, false);
    let outgoingMatrixDirty = false;
    for (const [cellIndex, exit] of this.exits) {
      const elapsedMs = Math.max(0, now - exit.startedAt);
      if (elapsedMs >= BEAD_EXIT_ANIMATION_MS) {
        this.writeHiddenExitMatrix(this.outgoingMesh, cellIndex, exit);
        this.exits.delete(cellIndex);
      } else {
        this.writeExitMatrix(
          this.outgoingMesh,
          cellIndex,
          exit,
          elapsedMs,
        );
      }
      outgoingMatrixDirty = true;
    }
    this.flushChanges(this.outgoingMesh, outgoingMatrixDirty, false);
    return this.animations.size > 0 || this.exits.size > 0;
  }

  hasActiveAnimations(): boolean {
    return this.animations.size > 0 || this.exits.size > 0;
  }

  setVisible(visible: boolean): void {
    this.requestedVisible = visible;
    if (this.mesh !== null) this.mesh.visible = visible;
    if (this.outgoingMesh !== null) this.outgoingMesh.visible = visible;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animations.clear();
    this.exits.clear();
    this.disposeMesh();
    this.snapshotVisible = new Uint8Array(0);
    this.snapshotColor = new Float64Array(0);
    this.snapshotGeometry = new Float64Array(0);
    this.topologyKey = null;
  }

  private ensureMesh(model: FastBeadPreviewModel): boolean {
    const nextProfileKey = physicalProfileKey(model);
    if (
      this.mesh !== null &&
      this.outgoingMesh !== null &&
      this.profileKey === nextProfileKey
    ) {
      return false;
    }

    this.disposeMesh();
    const geometry = createFastBeadGeometry(model);
    const material = new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.43,
      metalness: 0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.5,
      side: DoubleSide,
    });
    const mesh = new InstancedMesh(
      geometry,
      material,
      model.rows * model.columns,
    );
    mesh.name = "bead-preview-fast-beads";
    mesh.visible = this.requestedVisible;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    const outgoingMesh = new InstancedMesh(
      geometry,
      material,
      model.rows * model.columns,
    );
    outgoingMesh.name = "bead-preview-fast-outgoing";
    outgoingMesh.visible = this.requestedVisible;
    outgoingMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    outgoingMesh.frustumCulled = false;
    outgoingMesh.renderOrder = mesh.renderOrder + 1;
    this.scene.add(mesh);
    this.scene.add(outgoingMesh);
    this.mesh = mesh;
    this.outgoingMesh = outgoingMesh;
    this.profileKey = nextProfileKey;
    this.animations.clear();
    this.exits.clear();
    this.initialized = false;
    return true;
  }

  private ensureSnapshotCapacity(capacity: number): void {
    if (this.snapshotVisible.length === capacity) return;
    this.snapshotVisible = new Uint8Array(capacity);
    this.snapshotColor = new Float64Array(capacity * 3);
    this.snapshotGeometry = new Float64Array(capacity * 4);
  }

  private sameSnapshotColor(
    cellIndex: number,
    color: RgbColor | null,
  ): boolean {
    const previousVisible = this.snapshotVisible[cellIndex] === 1;
    if (!previousVisible || color === null) {
      return !previousVisible && color === null;
    }
    const offset = cellIndex * 3;
    return (
      this.snapshotColor[offset] === color[0] &&
      this.snapshotColor[offset + 1] === color[1] &&
      this.snapshotColor[offset + 2] === color[2]
    );
  }

  private sameSnapshotGeometry(
    cellIndex: number,
    slot: FastBeadPreviewSlot,
  ): boolean {
    const offset = cellIndex * 4;
    return (
      this.snapshotGeometry[offset] === slot.xMm &&
      this.snapshotGeometry[offset + 1] === slot.zMm &&
      this.snapshotGeometry[offset + 2] === slot.scaleX &&
      this.snapshotGeometry[offset + 3] === slot.scaleZ
    );
  }

  private captureSnapshots(model: FastBeadPreviewModel): void {
    for (const slot of model.slots) {
      const cellIndex = slot.cellIndex;
      this.snapshotVisible[cellIndex] = slot.visible ? 1 : 0;
      const colorOffset = cellIndex * 3;
      this.snapshotColor[colorOffset] = slot.color?.[0] ?? 0;
      this.snapshotColor[colorOffset + 1] = slot.color?.[1] ?? 0;
      this.snapshotColor[colorOffset + 2] = slot.color?.[2] ?? 0;
      const geometryOffset = cellIndex * 4;
      this.snapshotGeometry[geometryOffset] = slot.xMm;
      this.snapshotGeometry[geometryOffset + 1] = slot.zMm;
      this.snapshotGeometry[geometryOffset + 2] = slot.scaleX;
      this.snapshotGeometry[geometryOffset + 3] = slot.scaleZ;
    }
  }

  private startPlacement(
    mesh: InstancedMesh,
    slot: FastBeadPreviewSlot,
    model: FastBeadPreviewModel,
    now: number,
  ): void {
    const animation = {
      startedAt: now,
      slot: {
        ...slot,
        color: slot.color === null ? null : [...slot.color],
      },
      heightMm: model.heightMm,
      dropHeightMm: Math.max(
        model.heightMm * 1.8,
        model.outerRadiusMm * 0.7,
      ),
    } satisfies PlacementAnimation;
    this.animations.set(slot.cellIndex, animation);
    this.writeAnimatedMatrix(mesh, slot.cellIndex, animation, 0);
  }

  private startExit(
    cellIndex: number,
    now: number,
    model: FastBeadPreviewModel,
  ): void {
    if (this.mesh === null || this.outgoingMesh === null) return;
    this.mesh.getMatrixAt(cellIndex, this.instanceMatrix);
    this.instanceMatrix.decompose(
      this.instancePosition,
      this.instanceRotation,
      this.instanceScale,
    );
    this.outgoingMesh.setMatrixAt(cellIndex, this.instanceMatrix);
    if (this.mesh.instanceColor !== null) {
      this.mesh.getColorAt(cellIndex, this.instanceColor);
      this.outgoingMesh.setColorAt(cellIndex, this.instanceColor);
      this.outgoingMesh.instanceColor?.setUsage(DynamicDrawUsage);
    }
    this.exits.set(cellIndex, {
      startedAt: now,
      startPosition: this.instancePosition.clone(),
      startScale: this.instanceScale.clone(),
      liftMm: Math.max(
        this.instanceScale.y * model.heightMm * 1.8,
        model.outerRadiusMm * 0.7,
      ),
    });
  }

  private writeColor(
    mesh: InstancedMesh,
    cellIndex: number,
    color: RgbColor | null,
  ): void {
    const [red, green, blue] = color ?? [0, 0, 0];
    this.instanceColor.setStyle(`rgb(${red}, ${green}, ${blue})`);
    mesh.setColorAt(cellIndex, this.instanceColor);
    mesh.instanceColor?.setUsage(DynamicDrawUsage);
  }

  private writeHiddenMatrix(
    mesh: InstancedMesh,
    cellIndex: number,
    slot: FastBeadPreviewSlot,
  ): void {
    this.instancePosition.set(slot.xMm, 0, slot.zMm);
    this.instanceScale.set(0, 0, 0);
    this.instanceMatrix.compose(
      this.instancePosition,
      IDENTITY_ROTATION,
      this.instanceScale,
    );
    mesh.setMatrixAt(cellIndex, this.instanceMatrix);
  }

  private writeFinalMatrix(
    mesh: InstancedMesh,
    cellIndex: number,
    slot: FastBeadPreviewSlot,
    heightMm: number,
  ): void {
    this.instancePosition.set(slot.xMm, heightMm / 2, slot.zMm);
    this.instanceScale.set(slot.scaleX, 1, slot.scaleZ);
    this.instanceMatrix.compose(
      this.instancePosition,
      IDENTITY_ROTATION,
      this.instanceScale,
    );
    mesh.setMatrixAt(cellIndex, this.instanceMatrix);
  }

  private writeAnimatedMatrix(
    mesh: InstancedMesh,
    cellIndex: number,
    animation: PlacementAnimation,
    elapsedMs: number,
  ): void {
    const pose = placementPose(elapsedMs, animation);
    this.instancePosition.set(
      animation.slot.xMm,
      pose.liftMm + animation.heightMm * pose.verticalScale / 2,
      animation.slot.zMm,
    );
    this.instanceScale.set(
      animation.slot.scaleX * pose.radialScale,
      pose.verticalScale,
      animation.slot.scaleZ * pose.radialScale,
    );
    this.instanceMatrix.compose(
      this.instancePosition,
      IDENTITY_ROTATION,
      this.instanceScale,
    );
    mesh.setMatrixAt(cellIndex, this.instanceMatrix);
  }

  private writeExitMatrix(
    mesh: InstancedMesh,
    cellIndex: number,
    exit: ExitAnimation,
    elapsedMs: number,
  ): void {
    const progress = easeOutCubic(elapsedMs / BEAD_EXIT_ANIMATION_MS);
    this.instancePosition.copy(exit.startPosition);
    this.instancePosition.y += exit.liftMm * progress;
    this.instanceScale
      .copy(exit.startScale)
      .multiplyScalar(1 - 0.82 * progress);
    this.instanceMatrix.compose(
      this.instancePosition,
      IDENTITY_ROTATION,
      this.instanceScale,
    );
    mesh.setMatrixAt(cellIndex, this.instanceMatrix);
  }

  private writeHiddenExitMatrix(
    mesh: InstancedMesh,
    cellIndex: number,
    exit: ExitAnimation,
  ): void {
    this.instancePosition.copy(exit.startPosition);
    this.instanceScale.set(0, 0, 0);
    this.instanceMatrix.compose(
      this.instancePosition,
      IDENTITY_ROTATION,
      this.instanceScale,
    );
    mesh.setMatrixAt(cellIndex, this.instanceMatrix);
  }

  private flushChanges(
    mesh: InstancedMesh,
    matrixDirty: boolean,
    colorDirty: boolean,
  ): void {
    if (matrixDirty) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorDirty && mesh.instanceColor !== null) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  private disposeMesh(): void {
    const mesh = this.mesh;
    const outgoingMesh = this.outgoingMesh;
    if (mesh === null && outgoingMesh === null) return;
    const geometry = mesh?.geometry ?? outgoingMesh?.geometry;
    const material = mesh?.material ?? outgoingMesh?.material;
    if (mesh !== null) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    if (outgoingMesh !== null) {
      this.scene.remove(outgoingMesh);
      outgoingMesh.dispose();
    }
    geometry?.dispose();
    material?.dispose();
    this.mesh = null;
    this.outgoingMesh = null;
    this.profileKey = null;
  }
}

/**
 * Creates a persistent fast bead layer owned by the supplied Three.js scene.
 * 为给定 Three.js 场景创建一个常驻快速拼豆层。
 */
export function createBeadFastPreviewLayer(
  scene: Scene,
  reduceMotion: boolean,
): BeadFastPreviewLayer {
  return new ThreeBeadFastPreviewLayer(scene, reduceMotion);
}
