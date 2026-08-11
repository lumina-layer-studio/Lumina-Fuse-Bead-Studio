# 3D Bead Replace and Erase Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visible browser-side 3D replacement and erase motion while preserving immediate editing, exact fusion output, camera state, and existing placement animation.

**Architecture:** Extend the existing persistent fast-preview layer with a second fixed-capacity outgoing `InstancedMesh`. The main mesh always represents the latest project, while the outgoing mesh temporarily renders the previous bead pose and color; both meshes share geometry and material, update only dirty slots, and remain entirely in the browser. Existing revision guards and `hasActiveAnimations()` continue to delay exact-surface handoff until all placement and exit motion has settled.

**Tech Stack:** React 19, TypeScript, Three.js 0.185, Vitest, Vite, browser Web Worker.

---

### Task 1: Lock replacement and erase motion with failing fast-layer tests

**Files:**
- Modify: `test/bead-fast-preview-layer.test.ts`
- Modify: `test/bead-three-preview-controller.test.ts`

- [ ] **Step 1: Add helpers for the outgoing instance layer**

```ts
function outgoingMesh(scene: Scene): InstancedMesh {
  const mesh = scene.getObjectByName("bead-preview-fast-outgoing");
  expect(mesh).toBeInstanceOf(InstancedMesh);
  return mesh as InstancedMesh;
}

function expectVisible(mesh: InstancedMesh, cellIndex: number): void {
  const scale = readTransform(mesh, cellIndex).scale;
  expect(scale.x).toBeGreaterThan(0);
  expect(scale.y).toBeGreaterThan(0);
  expect(scale.z).toBeGreaterThan(0);
}
```

- [ ] **Step 2: Write a replacement test that requires old and new beads concurrently**

```ts
it("lifts the old color while the replacement bead starts placing", () => {
  const scene = new Scene();
  const layer = createBeadFastPreviewLayer(scene, false);
  const red = makeModel([RED]);
  const blue = makeModel([BLUE]);

  layer.update(red, 1, 0);
  layer.update(blue, 2, 100);

  const main = fastMesh(scene);
  const outgoing = outgoingMesh(scene);
  expectVisible(main, 0);
  expectVisible(outgoing, 0);
  expectColorClose(readColor(main, 0), new Color().setStyle("rgb(40, 114, 224)"));
  expectColorClose(readColor(outgoing, 0), new Color().setStyle("rgb(239, 56, 72)"));
  expect(layer.hasActiveAnimations()).toBe(true);

  layer.advance(100 + 220);
  expectHidden(outgoing, 0);
  expect(layer.hasActiveAnimations()).toBe(true);
  layer.advance(100 + BEAD_PLACEMENT_ANIMATION_MS);
  expect(layer.hasActiveAnimations()).toBe(false);
});
```

- [ ] **Step 3: Write erase, interrupted placement, reduced-motion, and reuse tests**

```ts
it("lifts an erased bead from its current animated pose", () => {
  const scene = new Scene();
  const layer = createBeadFastPreviewLayer(scene, false);
  layer.update(makeModel([EMPTY]), 1, 0);
  layer.update(makeModel([RED]), 2, 10);
  layer.advance(90);
  const current = readTransform(fastMesh(scene), 0);

  layer.update(makeModel([EMPTY]), 3, 90);

  expectHidden(fastMesh(scene), 0);
  const outgoing = readTransform(outgoingMesh(scene), 0);
  expect(outgoing.position.y).toBeCloseTo(current.position.y, 6);
  expect(outgoing.scale.x).toBeCloseTo(current.scale.x, 6);
  expect(layer.hasActiveAnimations()).toBe(true);
  layer.advance(90 + 220);
  expectHidden(outgoingMesh(scene), 0);
  expect(layer.hasActiveAnimations()).toBe(false);
});

it("reuses both instance meshes across repeated replacements", () => {
  const scene = new Scene();
  const layer = createBeadFastPreviewLayer(scene, false);
  layer.update(makeModel([RED]), 1, 0);
  const main = fastMesh(scene);
  const outgoing = outgoingMesh(scene);
  layer.update(makeModel([BLUE]), 2, 10);
  layer.update(makeModel([RED]), 3, 20);
  expect(fastMesh(scene)).toBe(main);
  expect(outgoingMesh(scene)).toBe(outgoing);
});
```

Reduced motion must leave the outgoing slot hidden and the main slot at its final color and matrix. Extend disposal assertions so both meshes dispatch `dispose()` once while their shared geometry and material each dispose once.

- [ ] **Step 4: Add a controller test that requires exact handoff to wait for erase exit**

```ts
it("waits for erase exit motion before exact geometry takes over", () => {
  const controller = createBeadThreePreviewController(document.createElement("canvas"), vi.fn());
  previewProject(controller, makeProject([RED_CELL]), 1);
  flushFrame(0);
  previewProject(controller, makeProject([EMPTY_CELL]), 2);
  flushFrame(10);
  controller.update(makeGridModel(1, 1), 2);
  const parse = vi.spyOn(SVGLoader.prototype, "parse");

  flushFrame(10 + 219);
  expect(parse).not.toHaveBeenCalled();
  flushFrame(10 + 220);
  expect(parse).not.toHaveBeenCalled();
  flushFrame(10 + 221);
  expect(parse).toHaveBeenCalledTimes(1);
  controller.dispose();
});
```

- [ ] **Step 5: Run both focused tests and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/bead-fast-preview-layer.test.ts test/bead-three-preview-controller.test.ts
```

Expected: assertion failures because `bead-preview-fast-outgoing` does not exist, recolor/erase still finish immediately, and exact geometry takes over before 220 ms. The run must reach test assertions rather than fail on imports or TypeScript syntax.

### Task 2: Implement the persistent outgoing layer

**Files:**
- Modify: `src/app/beadFastPreviewLayer.ts`
- Modify: `test/bead-fast-preview-layer.test.ts`
- Modify: `test/bead-three-preview-controller.test.ts`

- [ ] **Step 1: Add the public duration and outgoing animation state**

```ts
export const BEAD_EXIT_ANIMATION_MS = 220;

interface ExitAnimation {
  startedAt: number;
  startPosition: Vector3;
  startScale: Vector3;
  liftMm: number;
}

private readonly instanceRotation = new Quaternion();
private readonly exits = new Map<number, ExitAnimation>();
private outgoingMesh: InstancedMesh<ExtrudeGeometry, MeshPhysicalMaterial> | null = null;
```

- [ ] **Step 2: Create two persistent meshes with shared GPU resources**

Refactor `ensureMesh()` to create the existing main mesh and a same-capacity outgoing mesh named `bead-preview-fast-outgoing`. Both meshes must share one `ExtrudeGeometry` and one `MeshPhysicalMaterial`; every outgoing slot starts with a zero-scale matrix.

```ts
const geometry = createFastBeadGeometry(model);
const material = createFastBeadMaterial();
this.mesh = createFastInstanceMesh("bead-preview-fast-beads", geometry, material, capacity);
this.outgoingMesh = createFastInstanceMesh("bead-preview-fast-outgoing", geometry, material, capacity);
this.scene.add(this.mesh, this.outgoingMesh);
```

- [ ] **Step 3: Capture the current pose before replacement or erase**

```ts
private startExit(cellIndex: number, now: number, model: FastBeadPreviewModel): void {
  if (this.mesh === null || this.outgoingMesh === null) return;
  this.mesh.getMatrixAt(cellIndex, this.instanceMatrix);
  this.instanceMatrix.decompose(this.instancePosition, this.instanceRotation, this.instanceScale);
  this.outgoingMesh.setMatrixAt(cellIndex, this.instanceMatrix);
  this.mesh.getColorAt(cellIndex, this.instanceColor);
  this.outgoingMesh.setColorAt(cellIndex, this.instanceColor);
  this.exits.set(cellIndex, {
    startedAt: now,
    startPosition: this.instancePosition.clone(),
    startScale: this.instanceScale.clone(),
    liftMm: Math.max(this.instanceScale.y * model.heightMm * 1.8, model.outerRadiusMm * 0.7),
  });
}
```

Call `startExit(cellIndex, now, model)` before overwriting a previously visible slot. For color-to-color changes, start a normal placement animation for the new color at the same timestamp. For color-to-empty changes, hide the main slot immediately.

- [ ] **Step 4: Advance outgoing motion and report all active animation**

```ts
private advanceExit(cellIndex: number, exit: ExitAnimation, now: number): boolean {
  const elapsed = Math.max(0, now - exit.startedAt);
  if (elapsed >= BEAD_EXIT_ANIMATION_MS) {
    this.writeHiddenOutgoingMatrix(cellIndex);
    this.exits.delete(cellIndex);
    return false;
  }
  const progress = easeOutCubic(elapsed / BEAD_EXIT_ANIMATION_MS);
  this.writeOutgoingMatrix(cellIndex, exit, progress);
  return true;
}

hasActiveAnimations(): boolean {
  return this.animations.size > 0 || this.exits.size > 0;
}
```

The exit pose moves upward by `max(startScale.y * heightMm * 1.8, outerRadiusMm * 0.7)` while scaling all axes from the captured pose toward 18%. Do not allocate new vectors inside `advance()`.

- [ ] **Step 5: Preserve stale-revision, topology, visibility, and disposal contracts**

`setVisible()` toggles both meshes. A profile/topology rebuild clears both animation maps and hides every outgoing slot. `dispose()` removes both meshes, dispatches mesh disposal once per mesh, and disposes the shared geometry and material exactly once.

- [ ] **Step 6: Run the focused layer tests and verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/bead-fast-preview-layer.test.ts
```

Expected: all layer tests PASS, including replacement, erase, interrupted placement, reduced motion, reuse, stale revision, and disposal.

- [ ] **Step 7: Commit the tested layer implementation**

```bash
git add src/app/beadFastPreviewLayer.ts test/bead-fast-preview-layer.test.ts test/bead-three-preview-controller.test.ts
git commit -m "feat(workshop): animate bead replacement and erase"
```

### Task 3: Verify exact handoff, performance, package, and real browser behavior

**Files:**
- Modify: `package.json`
- Modify: `manifest.json`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Run focused and full verification**

```bash
./node_modules/.bin/vitest run test/bead-fast-preview-layer.test.ts test/bead-three-preview-controller.test.ts test/bead-three-preview.test.tsx
./node_modules/.bin/tsc -b --pretty false
pnpm_config_verify_deps_before_run=false pnpm run test:run
pnpm_config_verify_deps_before_run=false pnpm run benchmark -- --check-regression
git diff --check
```

Expected: focused tests, 320+ full tests, TypeScript, benchmark regression, and diff check all PASS.

- [ ] **Step 2: Prepare the next local workshop version**

Increment `package.json`, `manifest.json`, and `BEAD_MODULE_VERSION` in `src/domain/types.ts` together from `1.0.8-dev.36` to `1.0.8-dev.37`, then run:

```bash
pnpm_config_verify_deps_before_run=false pnpm run package
```

Expected: tests/build/inline-worker/reproducible-package gates PASS and `artifacts/lumina.bead-pattern-1.0.8-dev.37.lumina-workshop` is created.

- [ ] **Step 3: Install dev37 locally with rollback preserved**

Back up the current Workshop data directory, inspect the package manifest, install dev37 as the official seed candidate, and activate it while retaining dev36 as `previous_version`. Verify `/api/workshop/v1/modules` and the dev37 runtime endpoint both return HTTP 200.

- [ ] **Step 4: Validate in real Chrome**

Open `http://127.0.0.1:4174/`, confirm the header shows dev37, then validate on a saved multicolor project:

1. In 3D Edit mode, drag a different color across existing beads. Old colors must lift/shrink while new colors fall immediately.
2. Drag Eraser across existing beads. Main cells must disappear immediately while outgoing beads finish their 220 ms lift/shrink.
3. Repeat after rotating the camera; the camera must remain unchanged.
4. Wait for exact geometry; colors and holes must converge without black flash, blank frame, or stale revision.
5. Undo all QA edits so the saved project is unchanged.

- [ ] **Step 5: Commit dev37 metadata locally**

```bash
git add package.json manifest.json src/domain/types.ts
git commit -m "chore(release): prepare bead studio dev37"
```

Do not push and do not create a pull request.
