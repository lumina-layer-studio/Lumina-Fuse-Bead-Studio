import {
  AmbientLight,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
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

function resolvePaletteFrame(colorsLength: number) {
  const span = Math.max(1, (colorsLength - 1) * BEAD_SPACING + 1);
  const centerX = Math.max(0, (colorsLength - 1) * BEAD_SPACING / 2);
  return { span, centerX };
}

/**
 * 共享色板三维渲染器的最小生命周期接口。
 * Minimal lifecycle for the shared 3D palette renderer.
 */
export interface BeadPaletteThreeRenderer {
  update(colors: readonly RgbColor[]): void;
  resize(): void;
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
  private colors: readonly RgbColor[] = [];
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
    this.scene.add(this.camera);
    this.scene.add(this.beadGroup);
    this.scene.add(new AmbientLight(0xffffff, 1.45));
    const keyLight = new DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(-3, 5, 6);
    this.scene.add(keyLight);
    const rimLight = new DirectionalLight(0xbfd8ff, 1.15);
    rimLight.position.set(4, 2, -3);
    this.scene.add(rimLight);
  }

  update(colors: readonly RgbColor[]): void {
    if (this.disposed) return;
    this.colors = colors;
    this.resize();
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
    const { span, centerX } = resolvePaletteFrame(colors.length);
    this.camera.position.set(centerX, 3.4, 7.4);
    this.camera.lookAt(centerX, 0, 0);
    const aspect = Math.max(this.canvas.clientWidth, 1) /
      Math.max(this.canvas.clientHeight, 1);
    const horizontalView = Math.max(span + 0.4, BEAD_VERTICAL_VIEW * aspect);
    this.camera.left = centerX - horizontalView / 2;
    this.camera.right = centerX + horizontalView / 2;
    this.camera.top = BEAD_VERTICAL_VIEW / 2;
    this.camera.bottom = -BEAD_VERTICAL_VIEW / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    const devicePixelRatio = this.canvas.ownerDocument.defaultView
      ?.devicePixelRatio ?? 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(width, height, false);
    if (this.colors.length > 0) {
      const { span, centerX } = resolvePaletteFrame(this.colors.length);
      this.camera.position.set(centerX, 3.4, 7.4);
      this.camera.lookAt(centerX, 0, 0);
      const aspect = width / height;
      const horizontalView = Math.max(
        span + 0.4,
        BEAD_VERTICAL_VIEW * aspect,
      );
      this.camera.left = centerX - horizontalView / 2;
      this.camera.right = centerX + horizontalView / 2;
      this.camera.top = BEAD_VERTICAL_VIEW / 2;
      this.camera.bottom = -BEAD_VERTICAL_VIEW / 2;
      this.camera.updateProjectionMatrix();
    }
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
