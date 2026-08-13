import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OrthographicCamera,
  Path,
  Scene,
  Shape,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

import type { RgbColor } from "../domain/types";

const BEAD_OUTER_RADIUS = 0.5;
const BEAD_INNER_RADIUS = 0.2;
const BEAD_HEIGHT = 1.12;
const BEAD_SEGMENTS = 32;
const BEAD_SPACING = 1.35;
const BEAD_VERTICAL_VIEW = 1.9;
const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * 色板滚动视口与语义点击目标之间的像素映射。
 * Pixel mapping between the palette viewport and its semantic hit targets.
 */
export interface BeadPaletteViewport {
  scrollLeftPx: number;
  widthPx: number;
  heightPx: number;
  firstTargetCenterPx: number;
  targetStepPx: number;
}

/**
 * 共享色板三维渲染器的最小生命周期接口。
 * Minimal lifecycle for the shared 3D palette renderer.
 */
export interface BeadPaletteThreeRenderer {
  update(colors: readonly RgbColor[], activeIndex: number): void;
  setViewport(viewport: BeadPaletteViewport): void;
  dispose(): void;
}

function appendCircle(
  path: Shape | Path,
  radius: number,
  clockwise: boolean,
): void {
  for (let index = 0; index < BEAD_SEGMENTS; index += 1) {
    const unit = index / BEAD_SEGMENTS;
    const angle = (clockwise ? -1 : 1) * unit * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

function createUprightBeadGeometry(): ExtrudeGeometry {
  const shape = new Shape();
  appendCircle(shape, BEAD_OUTER_RADIUS, false);
  const hole = new Path();
  appendCircle(hole, BEAD_INNER_RADIUS, true);
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, {
    depth: BEAD_HEIGHT,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -BEAD_HEIGHT / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

class ThreeBeadPaletteRenderer implements BeadPaletteThreeRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly beadGroup = new Group();
  private readonly geometry = createUprightBeadGeometry();
  private readonly meshes: Array<Mesh<ExtrudeGeometry, MeshPhysicalMaterial>> = [];
  private readonly selectionMaterial: MeshBasicMaterial;
  private readonly selectionMesh: Mesh<ExtrudeGeometry, MeshBasicMaterial>;
  private colors: readonly RgbColor[] = [];
  private activeIndex = -1;
  private viewport: BeadPaletteViewport = {
    scrollLeftPx: 0,
    widthPx: 1,
    heightPx: 48,
    firstTargetCenterPx: 0,
    targetStepPx: 1,
  };
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const computedStyle = this.canvas.ownerDocument.defaultView
      ?.getComputedStyle(this.canvas);
    const accent = computedStyle
      ?.getPropertyValue("--bead-accent")
      .trim();
    const cssColor = computedStyle?.color;
    const selectionColor = accent ||
      (cssColor?.startsWith("rgb") ? cssColor : "#2563eb");
    this.selectionMaterial = new MeshBasicMaterial({
      color: new Color().setStyle(selectionColor),
      side: BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.selectionMesh = new Mesh(this.geometry, this.selectionMaterial);
    this.selectionMesh.name = "bead-palette-selection-outline";
    this.selectionMesh.scale.set(1.16, 1.08, 1.16);
    this.selectionMesh.visible = false;
    this.selectionMesh.renderOrder = -1;
    this.scene.add(this.camera);
    this.scene.add(this.beadGroup);
    this.beadGroup.add(this.selectionMesh);
    this.scene.add(new AmbientLight(0xffffff, 1.45));
    const keyLight = new DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(-3, 5, 6);
    this.scene.add(keyLight);
    const rimLight = new DirectionalLight(0xbfd8ff, 1.15);
    rimLight.position.set(4, 2, -3);
    this.scene.add(rimLight);
  }

  update(colors: readonly RgbColor[], activeIndex: number): void {
    if (this.disposed) return;
    this.colors = colors;
    this.activeIndex = activeIndex;
    while (this.meshes.length < colors.length) {
      const material = new MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.36,
        metalness: 0,
        clearcoat: 0.26,
        clearcoatRoughness: 0.45,
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.name = `bead-palette-upright-${this.meshes.length}`;
      this.meshes.push(mesh);
      this.beadGroup.add(mesh);
    }
    for (let index = 0; index < this.meshes.length; index += 1) {
      const mesh = this.meshes[index];
      const color = colors[index];
      mesh.visible = color !== undefined;
      if (color === undefined) continue;
      mesh.position.set(index * BEAD_SPACING, 0, 0);
      mesh.material.color.copy(
        new Color().setStyle(`rgb(${color[0]}, ${color[1]}, ${color[2]})`),
      );
    }
    const activeMesh = this.meshes[activeIndex];
    this.selectionMesh.visible = activeMesh?.visible === true;
    if (this.selectionMesh.visible) {
      this.selectionMesh.position.copy(activeMesh.position);
    }
    this.renderViewport();
  }

  setViewport(viewport: BeadPaletteViewport): void {
    if (this.disposed) return;
    this.viewport = {
      scrollLeftPx: Math.max(0, viewport.scrollLeftPx),
      widthPx: Math.max(1, viewport.widthPx),
      heightPx: Math.max(1, viewport.heightPx),
      firstTargetCenterPx: viewport.firstTargetCenterPx,
      targetStepPx: Math.max(1, viewport.targetStepPx),
    };
    this.renderViewport();
  }

  private renderViewport(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.round(this.viewport.widthPx));
    const height = Math.max(1, Math.round(this.viewport.heightPx));
    const devicePixelRatio = this.canvas.ownerDocument.defaultView
      ?.devicePixelRatio ?? 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DEVICE_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    const pixelsPerWorldUnit = this.viewport.targetStepPx / BEAD_SPACING;
    const left = (this.viewport.scrollLeftPx -
      this.viewport.firstTargetCenterPx) / pixelsPerWorldUnit;
    const right = left + width / pixelsPerWorldUnit;
    const centerX = (left + right) / 2;
    const halfWidth = (right - left) / 2;
    this.camera.position.set(centerX, 3.4, 7.4);
    this.camera.lookAt(centerX, 0, 0);
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = BEAD_VERTICAL_VIEW / 2;
    this.camera.bottom = -BEAD_VERTICAL_VIEW / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes) {
      this.beadGroup.remove(mesh);
      mesh.material.dispose();
    }
    this.meshes.length = 0;
    this.beadGroup.remove(this.selectionMesh);
    this.selectionMaterial.dispose();
    this.geometry.dispose();
    this.scene.remove(this.camera, this.beadGroup);
    this.renderer.dispose();
  }
}

/**
 * 为一个色板画布创建单一、可复用的浏览器端 Three.js 渲染器。
 * Creates one reusable browser-side Three.js renderer for a palette canvas.
 */
export function createBeadPaletteThreeRenderer(
  canvas: HTMLCanvasElement,
): BeadPaletteThreeRenderer {
  return new ThreeBeadPaletteRenderer(canvas);
}
