# Floating Bead Editor Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bead editor's document-flow sidebar with a scene-first workspace containing fixed, collapsible floating control docks and a responsive bottom drawer.

**Architecture:** Keep `BeadEditorStep` as the only business-state coordinator. Add a slot-based `BeadEditorWorkspace` that owns only presentation state (desktop collapse and mobile drawer), plus thin `BeadEditorFloatingControls` and `BeadEditorInspector` dock components in the same file. Move existing controls unchanged into the two slots. CSS supplies the floating/drawer behavior; existing project, reducer, preview, Worker, and handoff contracts remain untouched.

**Tech Stack:** React 19, TypeScript, CSS media queries and theme tokens, Vitest, Testing Library, Vite single-file packaging.

---

### Task 0: Preserve the validated dev27 checkpoint — completed

- [x] Full Vitest baseline: 204 passed, 61 machine-local corpus cases skipped.
- [x] TypeScript build and `git diff --check` passed.
- [x] Portable dev27 source and tests committed as `8520d02 feat(workshop): align fused and 3d bead previews`.
- [x] `pnpm-workspace.yaml` and `test/bead-recognition-real-corpus.local.test.ts` remain excluded.

### Task 1: Build the accessible floating workspace shell

**Files:**
- Create: `src/app/BeadEditorWorkspace.tsx`
- Create: `test/bead-editor-workspace.test.tsx`

- [ ] **Step 1: Write the failing workspace interaction tests**

Create `test/bead-editor-workspace.test.tsx` with real children and assertions for both dock collapse and mobile drawer focus restoration:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BeadEditorWorkspace } from "../src/app/BeadEditorWorkspace";

const labels = {
  editTitle: "编辑",
  inspectorTitle: "参数",
  collapseEdit: "收起编辑控件",
  expandEdit: "展开编辑控件",
  collapseInspector: "收起参数控件",
  expandInspector: "展开参数控件",
  openEditDrawer: "打开编辑控件",
  openInspectorDrawer: "打开参数控件",
};

function renderWorkspace() {
  return render(
    <BeadEditorWorkspace
      labels={labels}
      viewControls={<div data-testid="views">views</div>}
      editControls={<button type="button">画笔</button>}
      inspectorControls={<label>压合程度<input /></label>}
      canvas={<div data-testid="canvas">canvas</div>}
      magnifier={<div data-testid="magnifier">magnifier</div>}
    />,
  );
}

describe("BeadEditorWorkspace", () => {
  it("collapses each desktop dock without unmounting the canvas", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "收起编辑控件" }));
    expect(screen.getByTestId("bead-editor-workspace")).toHaveAttribute(
      "data-left-collapsed",
      "true",
    );
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画笔", hidden: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开编辑控件" }));
    expect(screen.getByRole("button", { name: "画笔" })).toBeInTheDocument();
  });

  it("opens one mobile drawer at a time and returns focus on Escape", () => {
    renderWorkspace();
    const editTrigger = screen.getByRole("button", {
      name: "打开编辑控件",
      hidden: true,
    });
    fireEvent.click(editTrigger);
    expect(editTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "画笔" })).toHaveFocus();
    expect(screen.getByTestId("bead-editor-workspace")).toHaveAttribute(
      "data-mobile-drawer",
      "edit",
    );
    fireEvent.click(screen.getByRole("button", {
      name: "打开参数控件",
      hidden: true,
    }));
    expect(editTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("textbox", { name: "压合程度" })).toHaveFocus();
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("bead-editor-workspace")).toHaveAttribute(
      "data-mobile-drawer",
      "inspector",
    );
    modal.remove();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("bead-editor-workspace")).toHaveAttribute(
      "data-mobile-drawer",
      "closed",
    );
    expect(screen.getByRole("button", {
      name: "打开参数控件",
      hidden: true,
    })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
node_modules/.bin/vitest run test/bead-editor-workspace.test.tsx
```

Expected: FAIL because `../src/app/BeadEditorWorkspace` does not exist.

- [ ] **Step 3: Implement the slot-based workspace**

Create `src/app/BeadEditorWorkspace.tsx` with this public contract and presentation-only state:

```tsx
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

type MobileDrawer = "edit" | "inspector" | null;

export interface BeadEditorWorkspaceLabels {
  editTitle: string;
  inspectorTitle: string;
  collapseEdit: string;
  expandEdit: string;
  collapseInspector: string;
  expandInspector: string;
  openEditDrawer: string;
  openInspectorDrawer: string;
}

export interface BeadEditorWorkspaceProps {
  labels: BeadEditorWorkspaceLabels;
  viewControls: ReactNode;
  editControls: ReactNode;
  inspectorControls: ReactNode;
  canvas: ReactNode;
  magnifier?: ReactNode;
}

export function BeadEditorWorkspace(props: BeadEditorWorkspaceProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawer>(null);
  const editId = `bead-edit-${useId().replaceAll(":", "")}`;
  const inspectorId = `bead-inspector-${useId().replaceAll(":", "")}`;
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const editBodyRef = useRef<HTMLDivElement>(null);
  const inspectorBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobileDrawer === null) return;
    const body = mobileDrawer === "edit" ? editBodyRef.current : inspectorBodyRef.current;
    body?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )?.focus();
  }, [mobileDrawer]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || mobileDrawer === null) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const trigger = mobileDrawer === "edit" ? editTriggerRef : inspectorTriggerRef;
      setMobileDrawer(null);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileDrawer]);

  const openDrawer = (drawer: Exclude<MobileDrawer, null>) => {
    if (drawer === "edit") setLeftCollapsed(false);
    else setRightCollapsed(false);
    setMobileDrawer((current) => (current === drawer ? null : drawer));
  };

  return (
    <section
      className="bead-editor-workspace"
      data-testid="bead-editor-workspace"
      data-left-collapsed={leftCollapsed}
      data-right-collapsed={rightCollapsed}
      data-mobile-drawer={mobileDrawer ?? "closed"}
    >
      <div className="bead-editor-workspace__canvas">{props.canvas}</div>
      <div className="bead-editor-workspace__overlay">
        <nav className="bead-editor-workspace__views">{props.viewControls}</nav>
        <aside
          className="bead-editor-dock bead-editor-dock--left"
          data-mobile-open={mobileDrawer === "edit"}
        >
          <header className="bead-editor-dock__header">
            <span>{props.labels.editTitle}</span>
            <button
              type="button"
              aria-controls={editId}
              aria-expanded={!leftCollapsed}
              aria-label={leftCollapsed ? props.labels.expandEdit : props.labels.collapseEdit}
              onClick={() => setLeftCollapsed((value) => !value)}
            >
              {leftCollapsed ? "+" : "−"}
            </button>
          </header>
          <div
            id={editId}
            ref={editBodyRef}
            className="bead-editor-dock__body"
            hidden={leftCollapsed}
          >
            {props.editControls}
          </div>
        </aside>
        <aside
          className="bead-editor-dock bead-editor-dock--right"
          data-mobile-open={mobileDrawer === "inspector"}
        >
          <header className="bead-editor-dock__header">
            <span>{props.labels.inspectorTitle}</span>
            <button
              type="button"
              aria-controls={inspectorId}
              aria-expanded={!rightCollapsed}
              aria-label={rightCollapsed ? props.labels.expandInspector : props.labels.collapseInspector}
              onClick={() => setRightCollapsed((value) => !value)}
            >
              {rightCollapsed ? "+" : "−"}
            </button>
          </header>
          <div
            id={inspectorId}
            ref={inspectorBodyRef}
            className="bead-editor-dock__body"
            hidden={rightCollapsed}
          >
            {props.inspectorControls}
          </div>
        </aside>
        <div className="bead-editor-workspace__mobile-actions">
          <button
            ref={editTriggerRef}
            type="button"
            aria-controls={editId}
            aria-expanded={mobileDrawer === "edit"}
            onClick={() => openDrawer("edit")}
          >
            {props.labels.openEditDrawer}
          </button>
          <button
            ref={inspectorTriggerRef}
            type="button"
            aria-controls={inspectorId}
            aria-expanded={mobileDrawer === "inspector"}
            onClick={() => openDrawer("inspector")}
          >
            {props.labels.openInspectorDrawer}
          </button>
        </div>
      </div>
      {props.magnifier ? (
        <div className="bead-editor-workspace__magnifier">{props.magnifier}</div>
      ) : null}
    </section>
  );
}
```

Factor the repeated left/right `<aside>` markup into a private dock primitive, and export semantic `BeadEditorFloatingControls` and `BeadEditorInspector` wrappers used by `BeadEditorWorkspace`. The dock content must remain ordinary React children; these components must not import project, reducer, SDK, preview, or color-library types. Keep both controlled regions mounted while collapsed and use `hidden` so every `aria-controls` target remains valid and child-local DOM state is preserved. Tests must resolve each `aria-controls` value to a live element.

- [ ] **Step 4: Run the workspace tests to verify GREEN**

```bash
node_modules/.bin/vitest run test/bead-editor-workspace.test.tsx
node_modules/.bin/tsc -b --pretty false
```

Expected: the new tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the workspace shell**

```bash
git add src/app/BeadEditorWorkspace.tsx test/bead-editor-workspace.test.tsx
git commit -m "feat(workshop): add floating bead workspace shell"
```

### Task 2: Recompose the editor into the workspace slots

**Files:**
- Modify: `src/app/BeadEditorStep.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `test/bead-editor-step.test.tsx`

- [ ] **Step 1: Write failing integration assertions**

Extend `test/bead-editor-step.test.tsx` so the primary existing UI test also asserts the new structure:

```tsx
const workspace = screen.getByTestId("bead-editor-workspace");
expect(workspace).toBeInTheDocument();
expect(screen.getByText("编辑")).toBeInTheDocument();
expect(screen.getByText("参数与输出")).toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: "收起编辑控件" }));
expect(workspace).toHaveAttribute("data-left-collapsed", "true");
fireEvent.click(screen.getByRole("button", { name: "展开编辑控件" }));
expect(
  within(screen.getByRole("toolbar", { name: "编辑工具" }))
    .getByRole("button", { name: "画笔" }),
).toHaveAttribute("aria-pressed", "true");
expect(dispatch).not.toHaveBeenCalledWith(
  expect.objectContaining({ type: "apply-tool" }),
);
```

Add a second assertion sequence that selects “压合预览”, toggles the parameter dock twice, and confirms the pressure preview remains selected. This proves presentation state does not reset `view`.

- [ ] **Step 2: Run the editor test to verify RED**

```bash
node_modules/.bin/vitest run test/bead-editor-step.test.tsx
```

Expected: FAIL because the workspace and floating dock labels do not exist.

- [ ] **Step 3: Add bilingual labels**

Add these exact keys to both locale tables in `src/i18n/translations.ts`:

```ts
"workshop.bead.floating.editTitle": "编辑",
"workshop.bead.floating.inspectorTitle": "参数与输出",
"workshop.bead.floating.collapseEdit": "收起编辑控件",
"workshop.bead.floating.expandEdit": "展开编辑控件",
"workshop.bead.floating.collapseInspector": "收起参数控件",
"workshop.bead.floating.expandInspector": "展开参数控件",
"workshop.bead.floating.openEditDrawer": "打开编辑控件",
"workshop.bead.floating.openInspectorDrawer": "打开参数控件",
```

```ts
"workshop.bead.floating.editTitle": "Edit",
"workshop.bead.floating.inspectorTitle": "Parameters & output",
"workshop.bead.floating.collapseEdit": "Collapse edit controls",
"workshop.bead.floating.expandEdit": "Expand edit controls",
"workshop.bead.floating.collapseInspector": "Collapse parameter controls",
"workshop.bead.floating.expandInspector": "Expand parameter controls",
"workshop.bead.floating.openEditDrawer": "Open edit controls",
"workshop.bead.floating.openInspectorDrawer": "Open parameter controls",
```

- [ ] **Step 4: Move existing editor markup into slots without changing callbacks**

In `src/app/BeadEditorStep.tsx`:

1. Remove the `PanelIntro` import and add `BeadEditorWorkspace`.
2. Before `return`, assign the existing view switch, four-way canvas conditional, and magnifier to `viewControls`, `canvasContent`, and `magnifierContent`. Their complete outer structure is:

```tsx
const viewControls = (
  <div className="view-tabs">
    {(["original", "matrix", "pressure", "three"] as const).map((candidate) => (
      <button
        key={candidate}
        type="button"
        aria-pressed={view === candidate}
        disabled={candidate === "original" && sourceRaster === null}
        className="segmented-control"
        onClick={() => setView(candidate)}
      >
        {t(`workshop.bead.view.${candidate}`)}
      </button>
    ))}
  </div>
);

const canvasContent = (
  <div className="canvas-stage">
    {view === "original" && sourceRaster && sourceGeometry ? (
      <BeadSourceCanvas
        source={sourceRaster}
        rows={project.rows}
        columns={project.columns}
        geometry={sourceGeometry}
        ariaLabel={t("workshop.bead.originalCanvas")}
      />
    ) : view === "pressure" ? (
      <BeadFusionPreview
        project={displayProject}
        ariaLabel={t("workshop.bead.pressureCanvas")}
      />
    ) : view === "three" ? (
      <div className="bead-three-preview-stack">
        <BeadThreePreview
          project={displayProject}
          ariaLabel={t(
            supportsThreePreview
              ? "workshop.bead.threeCanvas"
              : "workshop.bead.threeFallbackCanvas",
          )}
        />
        <p className="bead-three-preview__hint">
          {supportsThreePreview
            ? t("workshop.bead.threeHint")
            : interpolate(t("workshop.bead.threeLimitHint"), {
                count: coloredBeadCount,
                limit: MAX_THREE_PREVIEW_BEADS,
              })}
        </p>
      </div>
    ) : (
      <BeadMatrixCanvas
        project={displayProject}
        showGrid={showGrid}
        selectedCellIndex={state.selectedCellIndex}
        onPickCell={applyAt}
        allowDrag={state.activeTool === "paint" || state.activeTool === "erase"}
        ariaLabel={t("workshop.bead.matrixCanvas")}
      />
    )}
  </div>
);

const magnifierContent = state.selectedCellIndex === null ? undefined : (
  <div className="magnifier">
    <p>{t("workshop.bead.magnifier")}</p>
    <BeadMatrixCanvas
      project={displayProject}
      ariaLabel={t("workshop.bead.magnifier")}
      showGrid
      selectedCellIndex={state.selectedCellIndex}
      viewport={{ centerCellIndex: state.selectedCellIndex, radius: 2 }}
    />
  </div>
);

return (
  <BeadEditorWorkspace
    labels={{
      editTitle: t("workshop.bead.floating.editTitle"),
      inspectorTitle: t("workshop.bead.floating.inspectorTitle"),
      collapseEdit: t("workshop.bead.floating.collapseEdit"),
      expandEdit: t("workshop.bead.floating.expandEdit"),
      collapseInspector: t("workshop.bead.floating.collapseInspector"),
      expandInspector: t("workshop.bead.floating.expandInspector"),
      openEditDrawer: t("workshop.bead.floating.openEditDrawer"),
      openInspectorDrawer: t("workshop.bead.floating.openInspectorDrawer"),
    }}
    viewControls={viewControls}
    editControls={editControls}
    inspectorControls={inspectorControls}
    canvas={canvasContent}
    magnifier={magnifierContent}
  />
);
```

3. Define `editControls` from these concrete current blocks, in this order: compact project summary (`columns × rows`, semantic `h1` editor title, description, return-calibration, new-project); the `printMappingTitle` label and two source/print segmented buttons; `.editor-tool-section`; `.editor-palette-section`; review summary/navigation; `Checkbox` for `showGrid`.
4. Define `inspectorControls` from every existing color-library branch before the manufacturing controls, in this order: current library label; unavailable status plus reload; library-without-mapping description plus create button; stale-mapping warning plus refresh button; valid `.print-mapping-list`; compression `Slider`; the 0/50/100 `.control-grid`; irregularity `Slider`; bead-pitch field; both `.physical-size` values; handoff button. Preserve the exact callbacks and loading/disabled states for all four library/mapping states.
5. Preserve every current handler, disabled condition, `aria-pressed`, and source/print display rule while moving those exact blocks. Do not duplicate controls for desktop and mobile—the workspace repositions the same slots.

- [ ] **Step 5: Run integration and domain-preservation tests**

```bash
node_modules/.bin/vitest run \
  test/bead-editor-step.test.tsx \
  test/bead-matrix-canvas.test.tsx \
  test/handoff.test.ts \
  test/bead-editor-reducer.test.ts
node_modules/.bin/tsc -b --pretty false
```

Expected: all focused tests pass; no control semantics or handoff values change.

- [ ] **Step 6: Commit the editor composition**

```bash
git add src/app/BeadEditorStep.tsx src/i18n/translations.ts test/bead-editor-step.test.tsx
git commit -m "feat(workshop): float bead editor controls"
```

### Task 3: Add dock, canvas-avoidance, and responsive drawer styling

**Files:**
- Modify: `src/ui/theme.css`
- Modify: `test/theme-contract.test.ts`

- [ ] **Step 1: Write failing CSS contract assertions**

Extend `test/theme-contract.test.ts` with assertions for the required layout contract:

```ts
expect(css).toMatch(/\.bead-editor-workspace\s*{[^}]*position:\s*relative/);
expect(css).toMatch(/\.bead-editor-workspace__canvas\s*{[^}]*position:\s*absolute[^}]*inset:\s*0/);
expect(css).toMatch(/\.bead-editor-workspace__overlay\s*{[^}]*pointer-events:\s*none/);
expect(css).toMatch(/\.bead-editor-dock\s*{[^}]*pointer-events:\s*auto/);
expect(css).toMatch(/container-name:\s*bead-editor-workspace/);
expect(css).toMatch(/@container\s+bead-editor-workspace\s*\(max-width:\s*900px\)[\s\S]*\.bead-editor-workspace__mobile-actions/);
expect(css).toMatch(/@container\s+bead-editor-workspace\s*\(max-width:\s*520px\)[\s\S]*\.bead-editor-workspace__mobile-actions/);
```

- [ ] **Step 2: Run the theme test to verify RED**

```bash
node_modules/.bin/vitest run test/theme-contract.test.ts
```

Expected: FAIL because the new selectors do not exist.

- [ ] **Step 3: Implement the desktop floating layout**

Add these structural rules to `src/ui/theme.css`, using the existing theme variables for colors:

```css
.bead-editor-workspace {
  --bead-left-dock-width: clamp(248px, 24vw, 320px);
  --bead-right-dock-width: clamp(280px, 26vw, 350px);
  position: relative;
  min-width: 0;
  min-height: clamp(620px, calc(100dvh - 72px), 920px);
  overflow: hidden;
  border: 1px solid var(--bead-border);
  border-radius: var(--bead-radius);
  background: var(--bead-surface-muted);
  container-name: bead-editor-workspace;
  container-type: inline-size;
}

.bead-editor-workspace[data-left-collapsed="true"] {
  --bead-left-dock-width: 44px;
}

.bead-editor-workspace[data-right-collapsed="true"] {
  --bead-right-dock-width: 44px;
}

.bead-editor-workspace__canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  min-width: 0;
}

.bead-editor-workspace__canvas .canvas-stage {
  width: 100%;
  min-height: 100%;
  border-radius: 0;
  padding: 68px calc(var(--bead-right-dock-width) + 24px) 24px
    calc(var(--bead-left-dock-width) + 24px);
}

.bead-editor-workspace__overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.bead-editor-workspace__views {
  position: absolute;
  top: 12px;
  right: calc(var(--bead-right-dock-width) + 24px);
  left: calc(var(--bead-left-dock-width) + 24px);
  display: flex;
  justify-content: center;
  pointer-events: auto;
}

.bead-editor-dock {
  position: absolute;
  top: 12px;
  bottom: 12px;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--bead-border);
  border-radius: 12px;
  color: var(--bead-text);
  background: color-mix(in srgb, var(--bead-surface-strong) 94%, transparent);
  flex-direction: column;
  pointer-events: auto;
}

.bead-editor-dock--left {
  left: 12px;
  width: var(--bead-left-dock-width);
}

.bead-editor-dock--right {
  right: 12px;
  width: var(--bead-right-dock-width);
}

.bead-editor-dock__header {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--bead-border);
  padding: 0 10px 0 12px;
  font-size: 0.78rem;
  font-weight: 700;
}

.bead-editor-dock__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px;
}

.bead-editor-dock__body[hidden] {
  display: none;
}

.bead-editor-workspace[data-left-collapsed="true"]
  .bead-editor-dock--left .bead-editor-dock__header > span,
.bead-editor-workspace[data-right-collapsed="true"]
  .bead-editor-dock--right .bead-editor-dock__header > span {
  display: none;
}

.bead-editor-workspace__mobile-actions {
  display: none;
}

.bead-editor-workspace__magnifier {
  position: absolute;
  right: calc(var(--bead-right-dock-width) + 24px);
  bottom: 12px;
  z-index: 4;
}

.bead-editor-workspace__magnifier .magnifier {
  position: static;
}
```

Style dock header buttons and mobile action buttons with existing control geometry; do not add `backdrop-filter`.

- [ ] **Step 4: Implement the two responsive modes**

Use named container queries so the breakpoint follows the editor's actual width inside the iframe rather than the browser viewport:

```css
@container bead-editor-workspace (max-width: 900px) {
  .bead-editor-workspace__canvas,
  .bead-editor-workspace__overlay,
  .bead-editor-workspace__magnifier {
    --bead-left-dock-width: 0px;
    --bead-right-dock-width: 0px;
  }

  .bead-editor-workspace__canvas .canvas-stage {
    padding: 68px 12px 72px;
  }

  .bead-editor-workspace__views {
    right: 12px;
    left: 12px;
  }

  .bead-editor-workspace__views .view-tabs,
  .bead-editor-dock .palette-row {
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .bead-editor-dock {
    top: auto;
    right: 12px;
    bottom: 60px;
    left: 12px;
    display: none;
    width: auto;
    max-height: 55%;
  }

  .bead-editor-dock[data-mobile-open="true"] {
    display: flex;
  }

  .bead-editor-dock__header button {
    display: none;
  }

  .bead-editor-workspace__mobile-actions {
    position: absolute;
    right: 12px;
    bottom: 12px;
    left: 12px;
    display: flex;
    justify-content: center;
    gap: 8px;
    pointer-events: auto;
  }

  .bead-editor-workspace__magnifier {
    right: 12px;
    bottom: 72px;
  }

  .bead-editor-workspace:not([data-mobile-drawer="closed"])
    .bead-editor-workspace__magnifier {
    display: none;
  }
}

@container bead-editor-workspace (max-width: 520px) {
  .bead-editor-workspace__mobile-actions > button {
    min-width: 0;
    flex: 1 1 0;
  }

  .bead-editor-dock__body {
    gap: 12px;
    padding: 10px;
  }

  .bead-editor-workspace__magnifier {
    right: 12px;
    left: 12px;
  }
}
```

Remove the old editor-only `.workbench-layout`, `.panel--controls`, `.panel--canvas`, and mobile magnifier assumptions only when they have no remaining adoption site. Keep shared panel styles used by calibration/import dialogs.

- [ ] **Step 5: Run CSS and editor tests to verify GREEN**

```bash
node_modules/.bin/vitest run \
  test/theme-contract.test.ts \
  test/bead-editor-workspace.test.tsx \
  test/bead-editor-step.test.tsx
node_modules/.bin/tsc -b --pretty false
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the responsive styling**

```bash
git add src/ui/theme.css test/theme-contract.test.ts
git commit -m "style(workshop): add responsive floating docks"
```

### Task 4: Package and verify the installed module

**Files:**
- Modify: `package.json`
- Modify: `manifest.json`
- Modify: `src/domain/types.ts`
- Generated and ignored: `dist/ui/index.html`
- Generated and ignored: `artifacts/lumina.bead-pattern-1.0.8-dev.28.lumina-workshop`

- [ ] **Step 1: Bump the synchronized development version**

Change all three version sources from `1.0.8-dev.27` to `1.0.8-dev.28`:

```ts
export const BEAD_MODULE_VERSION = "1.0.8-dev.28" as const;
```

- [ ] **Step 2: Run complete automated verification**

```bash
node_modules/.bin/vitest run
node_modules/.bin/tsc -b --pretty false
node scripts/benchmark.mjs --check-regression
node_modules/.bin/vite build
node --test test/inline-worker-build.test.mjs
node scripts/package.mjs
node --test test/package-output.test.mjs
git diff --check
```

Expected: every non-local test passes, the benchmark stays inside `benchmarks/ci-budget.json`, the single-file build succeeds, and the dev28 package is reproducible.

- [ ] **Step 3: Commit the release metadata**

```bash
git add package.json manifest.json src/domain/types.ts
git commit -m "chore(release): prepare bead studio dev28"
```

- [ ] **Step 4: Install and activate dev28 with rollback**

Back up `/Users/min/Library/Application Support/Lumina Studio/workshop`, inspect the package manifest, install with `source="seed"`, `official=True`, and activate `lumina.bead-pattern@1.0.8-dev.28`. Assert `previous_version == "1.0.8-dev.27"` before reporting success.

- [ ] **Step 5: Perform real browser acceptance**

At `http://127.0.0.1:4174/`:

1. Confirm the host shows `拼豆工作台 · v1.0.8-dev.28`.
2. Restore the current complex project and verify matrix edits, pressure preview, and 3D preview.
3. Verify desktop left/right dock collapse, top view switching, and no click-through.
4. Verify the 900px bottom drawer and the 520px full-width drawer behavior.
5. Check both light and dark host themes.
6. Confirm browser warning/error logs are empty.
7. Leave the page open on the final desktop 3D or matrix view for user inspection.

Expected: the canvas remains the visual focus, all controls remain reachable, and no editor or handoff behavior changes.
