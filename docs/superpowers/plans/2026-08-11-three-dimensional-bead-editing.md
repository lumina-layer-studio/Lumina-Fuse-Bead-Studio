# 3D Bead Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all five existing bead tools usable in the interactive 3D preview while preserving camera state, exact output geometry, and the existing reducer contract.

**Architecture:** `BeadEditorStep` continues to dispatch the existing `apply-tool` action. `BeadThreePreview` arbitrates edit versus camera gestures and asks its persistent controller to map a client-space pointer to a logical cell. The controller performs an O(1) ray/work-plane intersection and owns preview-only hover/selection markers; it never raycasts the fused output mesh.

**Tech Stack:** React 19, TypeScript, Three.js 0.185, OrbitControls, Vitest, Testing Library.

---

The repository already contains uncommitted dev31 work. Never stage `pnpm-workspace.yaml`, the local corpus test, generated artifacts, or unrelated pre-existing changes. If a task's source files overlap those changes and a clean task-only index cannot be proven, defer its commit until the final verified checkpoint.

### Task 1: Add O(1) 3D grid picking and preview markers

**Files:**
- Modify: `src/app/beadThreePreviewController.ts`
- Test: `test/bead-three-preview-controller.test.ts`

- [ ] **Step 1: Write failing controller tests**

Add tests that project known logical work-plane cell centers through the captured Three camera and call the wished-for controller API:

```ts
const rect = {
  left: 40,
  top: 25,
  width: 800,
  height: 600,
  right: 840,
  bottom: 625,
  x: 40,
  y: 25,
  toJSON: () => ({}),
};
vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(rect);

const clientPointForWorld = (world: Vector3) => {
  const projected = world.clone().project(camera);
  return {
    clientX: rect.left + ((projected.x + 1) / 2) * rect.width,
    clientY: rect.top + ((1 - projected.y) / 2) * rect.height,
  };
};

const topLeftClient = clientPointForWorld(topLeft);
const bottomRightClient = clientPointForWorld(bottomRight);
expect(controller.pickCellAt(topLeftClient.clientX, topLeftClient.clientY)).toBe(0);
expect(controller.pickCellAt(bottomRightClient.clientX, bottomRightClient.clientY)).toBe(lastIndex);
```

Cover the canonical top view, a manually rotated camera, canvas page offsets, empty `surfacePaths`, center-hole coordinates, all four corners, logical-grid misses inside the board margin, and calls before `update()`. Add a marker test proving selected/hover marker transforms follow `cellIndex` and are hidden for `null` or invalid indices. Add disposal assertions for marker geometry and materials.

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview-controller.test.ts
```

Expected: TypeScript/Vitest failure because `pickCellAt`, `setSelectedCell`, and `setHoveredCell` do not exist.

- [ ] **Step 3: Implement the minimal controller API**

Extend the public interface without changing existing method signatures:

```ts
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
```

Cache only the current logical grid width, depth, rows, columns, pitch, and edit-plane Y during `update(model)`. Use Three `Raycaster`, `Plane`, and `Vector2`:

```ts
const column = Math.floor((hit.x + widthMm / 2) / pitchMm);
const row = Math.floor((hit.z + depthMm / 2) / pitchMm);
if (column < 0 || column >= columns || row < 0 || row >= rows) return null;
return row * columns + column;
```

Create two preview-only `LineLoop` cell outlines, one for hover and one for selection. Reposition them from the same centered grid formula used by `PhysicalPreviewModel.board.pegs`; keep them just above `max(model.heightMm, model.board.pegHeightMm)`. Hide invalid/null markers and dispose every geometry/material once.

Configure desktop camera gestures once in the controller:

```ts
controls.mouseButtons.LEFT = MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = MOUSE.PAN;
controls.mouseButtons.RIGHT = MOUSE.ROTATE;
```

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview-controller.test.ts
./node_modules/.bin/tsc -b --pretty false
```

Expected: controller tests pass and TypeScript exits 0.

- [ ] **Step 5: Review the task diff**

Verify `pickCellAt` never iterates pegs or `surfaceMeshes`, camera state is untouched, marker resources are disposed, and `git diff --check` is clean. Commit only if the cached file list contains exactly the two task files.

### Task 2: Add edit/view gesture arbitration to the 3D canvas

**Files:**
- Modify: `src/app/BeadThreePreview.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/ui/theme.css`
- Test: `test/bead-three-preview.test.tsx`
- Test: `test/theme-contract.test.ts`

- [ ] **Step 1: Write failing gesture tests**

Extend the controller stub with mocked picking and marker methods. Render the preview with this wished-for controlled bridge:

```tsx
<BeadThreePreview
  project={project}
  ariaLabel="可编辑三维拼豆"
  onPickCell={onPickCell}
  allowDrag
  selectedCellIndex={1}
  createController={() => controller}
  createSurfaceRenderer={() => renderer}
/>
```

Prove:

- paint/erase pointer sequences returning `0, 0, 1` call `[0, 1]` and capture/release the pointer;
- one-shot tools do nothing on down/move and call once on a completed pointer up;
- right, middle, `Alt + primary`, wheel, View mode, pointer cancel, lost capture, and a second pointer do not call the tool;
- changing `onPickCell`, `allowDrag`, selected cell, or mode uses current refs without recreating the controller/canvas;
- hover updates `setHoveredCell`, selected updates `setSelectedCell`, and unmount clears both;
- Edit/View controls have translated accessible names and `aria-pressed` state.

Add a theme contract for a compact segmented mode control that stays inside the existing horizontally scrollable 3D toolbar.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview.test.tsx test/theme-contract.test.ts
```

Expected: failure because the new props, controller methods, mode controls, and gesture handlers are absent.

- [ ] **Step 3: Implement the minimal component behavior**

Add optional props:

```ts
onPickCell?(cellIndex: number): void;
allowDrag?: boolean;
selectedCellIndex?: number | null;
```

Store the latest callback and flags in refs. Keep `interactionMode` local with default `"edit"`. Use capture-phase pointer handlers so an intercepted primary edit gesture never reaches OrbitControls, while right/middle/Alt/View-mode events pass through unchanged.

Use one gesture record:

```ts
interface ThreeEditGesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastCellIndex: number | null;
  moved: boolean;
}
```

For drag tools, apply on pointer down and on each newly crossed cell. For one-shot tools, apply only on pointer up when movement stays within the click threshold. Clear the gesture on cancel, lost capture, mode change, second pointer, fallback, and unmount. Suppress `contextmenu` only on the interactive 3D canvas.

Add bilingual keys for Edit mode, View mode, and the updated gesture hint. All regular strings remain in `src/i18n/translations.ts`.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
./node_modules/.bin/vitest run test/bead-three-preview.test.tsx test/theme-contract.test.ts
./node_modules/.bin/tsc -b --pretty false
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Review the task diff**

Verify the controller creation effects do not depend on callback/tool/mode props, touch View mode is the only path that hands one-finger navigation to OrbitControls, no user-facing literal bypasses translations, and `git diff --check` is clean.

### Task 3: Connect the existing editor tools to the 3D preview

**Files:**
- Modify: `src/app/BeadEditorStep.tsx`
- Test: `test/bead-editor-step.test.tsx`

- [ ] **Step 1: Write the failing editor bridge tests**

Extend the hoisted `BeadThreePreview` mock to capture and expose `onPickCell`, `allowDrag`, and `selectedCellIndex`. Switch to the 3D tab, invoke the captured callback, and assert the existing action shape:

```ts
expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
  type: "apply-tool",
  tool: "erase",
  cellIndex: 1,
  paletteIndex: state.activePaletteIndex,
}));
```

Rerender with a different active tool and palette before invoking the callback to prove the latest state is used. Table-test `paint` and `erase` as draggable and `fill`, `eraseFill`, and `eyedropper` as one-shot. Prove the selected cell is forwarded and the view remains 3D after a pick.

- [ ] **Step 2: Run the editor test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/bead-editor-step.test.tsx
```

Expected: failure because the 3D branch does not pass the editing props.

- [ ] **Step 3: Connect the existing bridge**

Pass the same values already used by `BeadMatrixCanvas`:

```tsx
<BeadThreePreview
  project={displayProject}
  onPickCell={applyAt}
  allowDrag={state.activeTool === "paint" || state.activeTool === "erase"}
  selectedCellIndex={state.selectedCellIndex}
  translate={t}
  ariaLabel={...}
/>
```

Do not add reducer actions, duplicate flood-fill logic, or change project persistence.

- [ ] **Step 4: Run focused integration tests**

Run:

```bash
./node_modules/.bin/vitest run test/bead-editor-step.test.tsx test/bead-editor-reducer.test.ts test/bead-three-preview.test.tsx test/bead-three-preview-controller.test.ts
./node_modules/.bin/tsc -b --pretty false
```

Expected: focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Review the task diff**

Verify one 3D pick produces the same reducer action as one matrix pick, active tool/palette changes do not recreate WebGL, and `git diff --check` is clean.

### Task 4: Full verification and real-browser acceptance

**Files:**
- Modify only if verification exposes a defect in the scoped implementation.
- Verify: all modified source and test files from Tasks 1-3.

- [ ] **Step 1: Run the full module gates**

Run:

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc -b --pretty false
node scripts/benchmark.mjs
./node_modules/.bin/vite build
node --test test/inline-worker-build.test.mjs
git diff --check
```

Expected: every command exits 0 and existing exact SVG fingerprints/performance budgets remain unchanged.

- [ ] **Step 2: Perform real-browser acceptance**

Start the module Vite server on an available LAN-visible port. With the 64 x 69 real project, verify top and angled views, an empty cell, a center hole, an occupied cell, every one-shot tool, a 100-cell paint/erase sweep, right/middle/Alt navigation, wheel zoom, Edit/View touch behavior, undo/redo, selected-cell magnifier, and camera stability while the exact surface catches up.

Record console errors, pointer-to-feedback latency, camera/controller identity, and any over-4096 fallback behavior. Stop the server after acceptance unless the user explicitly asks to keep it running.

- [ ] **Step 3: Request two-stage review**

First request a strict spec-compliance review against `docs/superpowers/specs/2026-08-11-three-dimensional-bead-editing-design.md`. Fix every missing or extra behavior and re-review. Then request a code-quality review focused on pointer lifecycle, OrbitControls conflicts, stale callbacks, O(1) picking, Three resource disposal, accessibility, and dirty-worktree safety. Fix all Critical and Important findings and re-review.

- [ ] **Step 4: Prepare the verified checkpoint**

Inspect the complete cached file list before committing. Exclude `pnpm-workspace.yaml`, the local corpus test, generated artifacts, and unrelated design notes. Use a conventional commit whose message explains the 3D editing outcome. Do not push or open a PR.
