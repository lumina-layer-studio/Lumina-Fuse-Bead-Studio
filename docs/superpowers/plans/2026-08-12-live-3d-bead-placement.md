# Live 3D Bead Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 3D paint and erase strokes visible within the next animation frame, with the approved 370ms placement motion, while exact fused geometry continues to converge in the background.

**Architecture:** Keep the current exact SVG/ExtrudeGeometry pipeline unchanged and add a browser-only persistent fast preview layer. React publishes each committed project revision to the controller in a layout effect; one reusable InstancedMesh updates changed slots and animates only newly painted beads. Exact Worker results carry the same revision and atomically replace the fast layer only when they are still current.

**Tech Stack:** React 19, TypeScript, Three.js `InstancedMesh`, Vitest, Vite Worker pipeline, existing Lumina Workshop packaging.

---

## File Map

- Create `src/domain/fastPreviewModel.ts`: pure browser/domain model for fast bead dimensions, stable slots, color, neighbor-aware contact stretch, and canonical irregular offsets.
- Create `src/app/beadFastPreviewLayer.ts`: owns the reusable Three.js InstancedMesh, per-slot diffs, placement animation, visibility, and GPU resource disposal.
- Modify `src/domain/fusionGeometry.ts`: expose the small canonical profile/cell-deformation helpers and make exact geometry consume the same helpers.
- Modify `src/domain/physicalPreviewModel.ts`: extract a cheap physical layout/board builder so initial picking does not allocate exact surface data or rebuild peg objects on every cell edit.
- Modify `src/app/beadThreePreviewController.ts`: connect fast layer, logical picking before exact geometry, revision-safe exact handoff, camera preservation, and one RAF loop.
- Modify `src/app/BeadThreePreview.tsx`: publish project revisions in `useLayoutEffect`, preserve one exact Worker, and commit only current exact models.
- Create `test/fast-preview-model.test.ts`: canonical profile, dimensions, contacts, determinism, and color tests.
- Modify `test/physical-preview-model.test.ts`: physical layout and exact-model composition tests.
- Create `test/bead-fast-preview-layer.test.ts`: real Three scene/InstancedMesh and 370ms animation tests.
- Modify `test/bead-three-preview-controller.test.ts`: first-frame picking, fast/exact visibility, revision, camera, and resource lifecycle.
- Modify `test/bead-three-preview.test.tsx`: stateful drag-to-project integration and exact scheduler tests.
- Modify `scripts/benchmark.mjs` and `benchmarks/ci-budget.json`: add a deterministic 3532-bead fast-model budget.
- Modify `test/benchmark-contract.test.ts`: require the new fast-preview metric and its budget.
- Modify `package.json`, `manifest.json`, and `src/domain/types.ts`: synchronized dev35 release version after all behavior gates pass.

### Task 1: Canonical Fast Preview Model

**Files:**
- Create: `src/domain/fastPreviewModel.ts`
- Modify: `src/domain/fusionGeometry.ts`
- Modify: `src/domain/physicalPreviewModel.ts`
- Create: `test/fast-preview-model.test.ts`
- Modify: `test/bead-fusion-geometry.test.ts`
- Modify: `test/physical-preview-model.test.ts`

- [ ] **Step 1: Write failing canonical-profile tests**

Add tests that require the fast model to use the same outer radius, hole radius, contact reach, irregular center offset, and thickness rules as exact fusion:

```ts
it("shares fusion radii and deterministic cell deformation", () => {
  const project = makeProject({ compression: 50, irregularity: 70 });
  const fast = buildFastBeadPreviewModel(project);
  const exact = buildBeadFusionGeometry(project, 50, 70, 24);

  expect(fast.outerRadiusMm / project.beadPitchMm)
    .toBeCloseTo(exact.outerRadius, 8);
  expect(fast.holeRadiusMm / project.beadPitchMm)
    .toBeCloseTo(exact.holeRadius, 8);
  expect(fast.heightMm).toBe(
    estimateBeadThicknessMm(50, project.beadPitchMm),
  );
  expect(fast.slots[0]).toEqual(
    buildFastBeadPreviewModel(project).slots[0],
  );
});
```

Add a neighbor test proving two occupied orthogonal slots reach one another while an exposed side retains the canonical outer arc extent. Add a palette test proving empty slots have `color: null` and occupied slots copy the source RGB tuple without mutating it.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/fast-preview-model.test.ts test/bead-fusion-geometry.test.ts test/physical-preview-model.test.ts
```

Expected: FAIL because `fastPreviewModel.ts` and the public profile helpers do not exist.

- [ ] **Step 3: Extract canonical helpers and adopt them in exact geometry**

Expose pure normalized helpers from `fusionGeometry.ts`, and replace the private duplicate calculations inside `buildBeadFusionGeometry`:

```ts
export interface BeadFusionSharedProfile {
  pressure: number;
  outerRadius: number;
  holeRadius: number;
  contactReach: number;
}

export interface BeadFusionCellDeformation {
  center: FusionPoint;
  radiusXDelta: number;
  radiusYDelta: number;
}

export function resolveBeadFusionSharedProfile(
  compression: number,
  irregularity = 0,
): BeadFusionSharedProfile;

export function resolveBeadFusionCellDeformation(
  row: number,
  column: number,
  compression: number,
  irregularity = 0,
): BeadFusionCellDeformation;
```

Both helpers validate finite physical percentages, clamp only after validation, and call the existing noise/smoothstep functions. `contourPoints` and center-map creation must use these exports so fast and exact paths cannot drift.

- [ ] **Step 4: Build the pure fast model**

Implement the model with stable `cellIndex` slots and no Three.js dependency:

```ts
export interface FastBeadPreviewSlot {
  cellIndex: number;
  visible: boolean;
  color: RgbColor | null;
  xMm: number;
  zMm: number;
  scaleX: number;
  scaleZ: number;
}

export interface FastBeadPreviewModel {
  projectId: string;
  rows: number;
  columns: number;
  beadPitchMm: number;
  outerRadiusMm: number;
  holeRadiusMm: number;
  heightMm: number;
  board: PhysicalPreviewBoard;
  slots: FastBeadPreviewSlot[];
}

export function buildFastBeadPreviewModel(
  project: BeadProject,
  layout?: PhysicalPreviewLayout,
): FastBeadPreviewModel;
```

For each side, use canonical `contactReach` when that orthogonal neighbor is occupied and `outerRadius` when exposed. Convert asymmetric negative/positive extents into one center shift plus `scaleX`/`scaleZ`; include canonical irregular center and radius deltas. This preserves no-gap contacts and distinguishes boundary from internal pressure without running SVG boolean operations.

Extract `buildPhysicalPreviewLayout(project)` from the current private board builder. `buildPhysicalPreviewModel(project, surfacePaths)` composes this layout with cloned exact paths. The controller caches the layout by project ID, rows, columns, pitch, and compression and passes it into `buildFastBeadPreviewModel`, so ordinary cell edits do not recreate the full peg array.

- [ ] **Step 5: Run domain tests and typecheck**

Run:

```bash
./node_modules/.bin/vitest run test/fast-preview-model.test.ts test/bead-fusion-geometry.test.ts test/physical-preview-model.test.ts
./node_modules/.bin/tsc -b --pretty false
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/domain/fusionGeometry.ts src/domain/fastPreviewModel.ts src/domain/physicalPreviewModel.ts test/bead-fusion-geometry.test.ts test/fast-preview-model.test.ts test/physical-preview-model.test.ts
git commit -m "feat(workshop): model fast fused bead previews"
```

### Task 2: Persistent Fast Instanced Layer and Placement Motion

**Files:**
- Create: `src/app/beadFastPreviewLayer.ts`
- Create: `test/bead-fast-preview-layer.test.ts`

- [ ] **Step 1: Write the real-Scene RED tests**

Use a real `Scene`, real `InstancedMesh`, and a manually controlled clock. Assert:

```ts
it("reuses stable slots for paint erase and recolor", () => {
  const layer = createBeadFastPreviewLayer(scene, false);
  layer.update(initialModel, 1, 0);
  const mesh = scene.getObjectByName("bead-preview-fast-beads");

  layer.update(paintedModel, 2, 10);
  expect(scene.getObjectByName("bead-preview-fast-beads")).toBe(mesh);
  expect(readScale(mesh, paintedCell)).not.toBe(0);

  layer.update(erasedModel, 3, 20);
  expect(readScale(mesh, erasedCell)).toBe(0);
});
```

Add a 0/80/270/370ms matrix test, an initial-existing-beads-no-animation test, a recolor-no-animation test, an erase-immediate test, and a reduced-motion test.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/bead-fast-preview-layer.test.ts
```

Expected: FAIL because the layer module does not exist.

- [ ] **Step 3: Implement one reusable InstancedMesh**

Create this focused interface:

```ts
export const BEAD_PLACEMENT_ANIMATION_MS = 370;

export interface BeadFastPreviewLayer {
  readonly revision: number;
  update(model: FastBeadPreviewModel, revision: number, now: number): void;
  advance(now: number): boolean;
  hasActiveAnimations(): boolean;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createBeadFastPreviewLayer(
  scene: Scene,
  reduceMotion: boolean,
): BeadFastPreviewLayer;
```

Use a low-segment compressed superellipse/ring `ExtrudeGeometry` derived from canonical `outerRadiusMm`, `holeRadiusMm`, `contactReach`, and `heightMm`; do not use `CylinderGeometry`. At 100% compression omit the hole. Use one `MeshPhysicalMaterial` matching exact-surface roughness/clearcoat, vertex colors, and one `InstancedMesh` whose capacity is `rows * columns`; empty slots get a zero-scale matrix. The fast layer intentionally approximates neighbor shoulders and junction relief, while the exact surface remains authoritative.

Rebuild geometry only if grid capacity or physical profile changes. Diff slots so paint/erase/recolor touch only changed instance matrices/colors. Set `instanceMatrix.needsUpdate` and `instanceColor.needsUpdate` once per update batch, then recompute the bounding sphere.

- [ ] **Step 4: Implement the approved animation curve**

Track only newly changed `empty -> color` slots:

```ts
function placementPose(progress: number) {
  if (progress < 80 / 370) return appearancePose(progress);
  if (progress < 270 / 370) return fallingPose(progress);
  return singleReboundPose(progress);
}
```

The first update must already use non-zero scale. Finish at the exact final slot matrix at 370ms, delete the animation entry, and return `false` from `advance` when no animation remains. Reduced-motion mode writes the final matrix immediately and never schedules another animation frame.

- [ ] **Step 5: Verify animation and disposal**

Add disposal spies and assert geometry, material, and mesh dispose exactly once; a second `dispose()` is a no-op.

Run:

```bash
./node_modules/.bin/vitest run test/bead-fast-preview-layer.test.ts
./node_modules/.bin/tsc -b --pretty false
git diff --check
```

Expected: PASS, exit 0, and no whitespace errors.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/app/beadFastPreviewLayer.ts test/bead-fast-preview-layer.test.ts
git commit -m "feat(workshop): animate persistent fast bead instances"
```

### Task 3: Controller Revision and Exact Handoff

**Files:**
- Modify: `src/app/beadThreePreviewController.ts`
- Modify: `test/bead-three-preview-controller.test.ts`

- [ ] **Step 1: Extend the controller test harness and write RED tests**

Replace the inert RAF stub with a queue and `flushFrame(timestamp)`. Add tests for:

- `previewProject` initializes board, logical grid, and picking before `update` receives an exact model.
- A/B/C preview calls before one frame allocate one fast mesh and render only C.
- A paint shows fast and hides exact; latest exact hides fast and shows exact.
- Exact revision N cannot hide fast revision N+1.
- Fast-to-exact preserves camera position, quaternion, up, and OrbitControls target.
- Dispose cancels a pending animation RAF and frees the fast layer once.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview-controller.test.ts -t "fast|revision|before the first exact|camera"
```

Expected: FAIL because the controller has no fast-preview API.

- [ ] **Step 3: Add revision-aware controller methods**

Change the internal interface to:

```ts
export interface BeadThreePreviewController {
  previewProject(project: BeadProject, revision: number): void;
  update(model: PhysicalPreviewModel, revision: number): void;
  // existing picking, markers, camera controls, resize, dispose stay unchanged
}
```

`previewProject` synchronously updates logical dimensions, board, edit plane, and marker positions, then stores only the latest `{ fastModel, revision }` for the shared RAF. This makes first-surface picking available immediately.

Read `prefers-reduced-motion` from `canvas.ownerDocument.defaultView.matchMedia`. Update the fast layer if the media query changes, remove the listener during dispose, and fall back to normal motion when `matchMedia` is unavailable.

- [ ] **Step 4: Merge upload, animation, and render into one RAF loop**

Replace the one-shot render callback with a frame function that:

1. Applies the latest pending fast model.
2. Hides exact surfaces and shows the fast layer.
3. Advances active placement animations.
4. Performs a pending exact visibility handoff only after current placement animations finish.
5. Renders once.
6. Requests another frame only for remaining animation or pending work.

OrbitControls `change` continues to call the same scheduler. Do not create a second perpetual loop.

- [ ] **Step 5: Guard exact revision and preserve camera**

In `update(model, revision)`, return without mutation unless `revision === fastLayer.revision`. Build every next exact mesh first; if any build fails, dispose the new temporary group and keep the current fast/exact display. Only after successful construction remove the old exact group and install the new hidden group. Then either swap immediately or mark it ready until the current 370ms animation ends. Never call `frameCamera` for cell/color/compression-only changes when board dimensions are unchanged.

- [ ] **Step 6: Run controller and geometry regressions**

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview-controller.test.ts test/bead-fast-preview-layer.test.ts test/physical-preview-model.test.ts
./node_modules/.bin/tsc -b --pretty false
```

Expected: all PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/app/beadThreePreviewController.ts test/bead-three-preview-controller.test.ts
git commit -m "feat(workshop): hand off live 3d edits to exact geometry"
```

### Task 4: React Layout-Effect Publication and Worker Convergence

**Files:**
- Modify: `src/app/BeadThreePreview.tsx`
- Modify: `test/bead-three-preview.test.tsx`
- Verify: `test/bead-editor-step.test.tsx`

- [ ] **Step 1: Update controller fakes and write the stateful RED test**

Add `previewProject: vi.fn()` to `makeController`. Use a harness whose `onPickCell` edits project state. For paint and erase, assert after pointerdown and each crossed pointermove, before pointerup and before 120ms:

```ts
expect(controller.previewProject).toHaveBeenLastCalledWith(
  expect.objectContaining({ cells: expectedLatestCells }),
  expect.any(Number),
);
expect(renderer.render).toHaveBeenCalledTimes(initialExactRequests);
expect(controller.update).toHaveBeenCalledTimes(initialExactCommits);
```

Assert repeated moves over the same cell do not edit twice and pointerup does not add another bead. Keep fill, area erase, and eyedropper as pointerup-only tools.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview.test.tsx -t "publishes paint and erase|one-shot"
```

Expected: FAIL with zero `previewProject` calls.

- [ ] **Step 3: Publish each project revision before paint**

Add a layout effect after controller creation:

```ts
useLayoutEffect(() => {
  if (unavailable || !supportsThreePreview) return;
  const controller = controllerRef.current;
  if (controller === null) return;
  const revision = surfaceRequestVersionRef.current + 1;
  surfaceRequestVersionRef.current = revision;
  controller.previewProject(project, revision);
}, [project, supportsThreePreview, unavailable]);
```

The surface scheduling effect reuses the already assigned revision instead of incrementing it again.

- [ ] **Step 4: Make exact model state revision-safe**

Store `{ model, revision }` rather than a bare model. Before committing exact geometry, check the revision again:

```ts
if (exactState.revision !== surfaceRequestVersionRef.current) return;
controllerRef.current?.update(exactState.model, exactState.revision);
```

Keep the current single in-flight plus latest-ready pending Worker scheduler. Old success and failure callbacks must not clear the latest fast layer or enter fallback.
Call `setRendering(false)` only after the current exact model has passed the revision check and `controller.update` has completed without throwing; do not clear the status immediately when surface-path strings arrive.

- [ ] **Step 5: Correct misleading old tests and run the integration set**

Rename or update these contracts:

- “waits for asynchronous fusion surface…” becomes “publishes fast project before committing asynchronous exact surface”.
- “shows immediate feedback…” must assert a real fast publication, not only a status badge.
- “keeps old geometry…” becomes “keeps one canvas while the latest fast project is visible”.

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview.test.tsx test/bead-three-preview-controller.test.ts test/bead-editor-step.test.tsx
./node_modules/.bin/tsc -b --pretty false
git diff --check
```

Expected: all PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/app/BeadThreePreview.tsx test/bead-three-preview.test.tsx
git commit -m "feat(workshop): publish 3d strokes before exact fusion"
```

### Task 5: Performance Gate and Full Regression

**Files:**
- Modify: `scripts/benchmark.mjs`
- Modify: `benchmarks/ci-budget.json`
- Modify: `test/benchmark-contract.test.ts`

- [ ] **Step 1: Add a deterministic 3532-bead benchmark**

Measure `buildFastBeadPreviewModel(realistic3532Project)` and a sparse 128×128 project over warm iterations; report `fastPreview3532Ms` and `fastPreview16384Ms`. Add conservative CI budgets without weakening existing SVG, fusion-surface, or Three extrusion budgets. Extend `THREE_PREVIEW_METRICS` so a missing result or budget fails the contract test.

- [ ] **Step 2: Run benchmark and focused tests**

```bash
node scripts/benchmark.mjs --check-regression
./node_modules/.bin/vitest run test/benchmark-contract.test.ts
./node_modules/.bin/vitest run test/fast-preview-model.test.ts test/bead-fast-preview-layer.test.ts test/bead-three-preview-controller.test.ts test/bead-three-preview.test.tsx test/bead-editor-step.test.tsx
```

Expected: benchmark and tests PASS.

- [ ] **Step 3: Run complete build gates**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/vite build
node --test test/inline-worker-build.test.mjs
git diff --check
```

Expected: all existing non-local tests PASS; the local corpus remains skipped when its environment is absent.

- [ ] **Step 4: Commit Task 5**

```bash
git add scripts/benchmark.mjs benchmarks/ci-budget.json test/benchmark-contract.test.ts
git commit -m "test(workshop): gate live 3d preview performance"
```

### Task 6: dev35 Package, Install, and Real Browser Acceptance

**Files:**
- Modify: `package.json`
- Modify: `manifest.json`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Synchronize the release version**

Change all three version sources from `1.0.8-dev.34` to `1.0.8-dev.35`. Run the package contract test before packaging.

- [ ] **Step 2: Build the reproducible workshop archive**

```bash
pnpm_config_verify_deps_before_run=false pnpm run package
```

Expected: full Vitest, TypeScript, Vite, inline Worker, archive surface, consecutive reproducibility, and cross-timezone reproducibility gates PASS. Record archive path, byte size, and SHA-256.

- [ ] **Step 3: Commit the release metadata**

```bash
git add package.json manifest.json src/domain/types.ts
git commit -m "chore(release): prepare bead studio dev35"
```

- [ ] **Step 4: Install and activate dev35 through the Workshop installer**

Use the host repository's `WorkshopInstaller` with the existing Lumina virtual environment and current application-support workshop data directory. Inspect the package before install, preserve dev34 as `previous_version`, activate dev35, and verify `/api/workshop/v1/modules` reports dev35 active. Do not edit install-state files by hand.

- [ ] **Step 5: Real-browser acceptance**

Reload the actual Lumina browser tab and verify on a complex saved project:

1. Enter 3D Edit mode and select Paint.
2. Press and drag across multiple empty cells; every crossed cell appears before pointerup.
3. Observe the approved quick appearance, fall, and one small rebound.
4. Switch to Erase and drag; cells disappear immediately without placement animation.
5. Rotate/zoom, edit again, and confirm the camera does not reset.
6. Wait for exact convergence and confirm there is no blank frame, stale overwrite, repeated animation, or material/size change.
7. Undo once and confirm existing editor history behavior remains valid.

- [ ] **Step 6: Final scope and process audit**

Confirm no backend/API file changed, no `.superpowers/`, local corpus, machine path, build output, or package artifact is staged. Check no preview/test/dev-server process remains unless intentionally kept running for the user.
