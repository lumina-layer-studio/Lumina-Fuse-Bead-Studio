import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BeadEditorStep } from "../src/app/BeadEditorStep";
import {
  beadEditorReducer,
  createBeadEditorState,
  type BeadEditorAction,
} from "../src/domain/editorReducer";
import { createBeadProject } from "../src/domain/project";
import type { BeadCell } from "../src/domain/types";
import { translate } from "../src/i18n/translations";

const threePreviewCapture = vi.hoisted(() => ({
  project: null as ReturnType<typeof project> | null,
  onPickCell: null as ((cellIndex: number) => void) | null,
  allowDrag: null as boolean | null,
  selectedCellIndex: null as number | null,
  editingEnabled: null as boolean | null,
}));

vi.mock("../src/app/BeadThreePreview", () => ({
  MAX_THREE_PREVIEW_BEADS: 4_096,
  supportsBeadThreePreviewCount: (beadCount: number) =>
    beadCount <= 4_096,
  BeadThreePreview: ({
    project: previewProject,
    ariaLabel,
    onPickCell,
    allowDrag,
    selectedCellIndex,
    editingEnabled,
  }: {
    project: ReturnType<typeof project>;
    ariaLabel: string;
    onPickCell?: (cellIndex: number) => void;
    allowDrag?: boolean;
    selectedCellIndex?: number | null;
    editingEnabled?: boolean;
  }) => {
    threePreviewCapture.project = previewProject;
    threePreviewCapture.onPickCell = onPickCell ?? null;
    threePreviewCapture.allowDrag = allowDrag ?? null;
    threePreviewCapture.selectedCellIndex = selectedCellIndex ?? null;
    threePreviewCapture.editingEnabled = editingEnabled ?? true;
    return <canvas role="img" aria-label={ariaLabel} />;
  },
}));

const t = (key: string) => translate("zh-CN", key);

function project() {
  return createBeadProject({
    projectId: "editor-ui",
    moduleVersion: "1.0.0",
    now: "2026-07-30T00:00:00.000Z",
    rows: 2,
    columns: 2,
    palette: [
      [230, 40, 50],
      [20, 120, 210],
    ],
    cells: [
      { kind: "empty" },
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
    ],
    confidenceIssues: [
      {
        cellIndex: 1,
        confidence: 0.4,
        reasons: ["overlay-obstruction"],
        resolved: false,
      },
      {
        cellIndex: 3,
        confidence: 0.48,
        reasons: ["jpeg-near-tie"],
        resolved: false,
      },
    ],
  });
}

describe("BeadEditorStep", () => {
  beforeEach(() => {
    threePreviewCapture.project = null;
    threePreviewCapture.onPickCell = null;
    threePreviewCapture.allowDrag = null;
    threePreviewCapture.selectedCellIndex = null;
    threePreviewCapture.editingEnabled = null;
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockReturnValue(null);
  });

  it("starts in a 3D-first workbench and only exposes controls for the selected workflow", () => {
    render(
      <BeadEditorStep
        state={createBeadEditorState(project())}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
      />,
    );

    const threePreview = screen.getByRole("img", {
      name: "可旋转的拼豆 3D 成品",
    });
    expect(
      screen.getByRole("toolbar", { name: "工作模式" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("toolbar", { name: "工作模式" })).getByRole(
        "button",
        { name: "编辑豆子" },
      ),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "放豆" })).toBeInTheDocument();
    expect(threePreviewCapture.editingEnabled).toBe(true);
    expect(threePreviewCapture.onPickCell).toEqual(expect.any(Function));
    expect(
      screen.queryByRole("slider", { name: "熨烫程度" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "调整熨烫" }));
    expect(
      screen.getByRole("img", { name: "可旋转的拼豆 3D 成品" }),
    ).toBe(threePreview);
    expect(
      screen.getByRole("slider", { name: "熨烫程度" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "放豆" }),
    ).not.toBeInTheDocument();
    expect(threePreviewCapture.editingEnabled).toBe(false);
    expect(threePreviewCapture.onPickCell).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "打印准备" }));
    expect(
      screen.getByRole("img", { name: "可旋转的拼豆 3D 成品" }),
    ).toBe(threePreview);
    expect(
      screen.queryByRole("slider", { name: "熨烫程度" }),
    ).not.toBeInTheDocument();
    expect(threePreviewCapture.editingEnabled).toBe(false);
    expect(threePreviewCapture.onPickCell).toBeNull();
    expect(
      screen.getByRole("region", { name: "2D 校对" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开 2D 校对" }));
    expect(
      screen.getByRole("img", { name: "可旋转的拼豆 3D 成品" }),
    ).toBe(threePreview);
    expect(
      screen.getByRole("img", { name: "可编辑拼豆图案" }),
    ).not.toHaveClass("bead-canvas--interactive");
  });

  it("reports occupied output size instead of blank auto-canvas margins", () => {
    const cells: BeadCell[] = Array.from(
      { length: 4 * 4 },
      () => ({ kind: "empty" }),
    );
    cells[1 * 4 + 2] = { kind: "color", paletteIndex: 0 };
    const blankProject = createBeadProject({
      projectId: "auto-size",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 4,
      columns: 4,
      palette: [[230, 40, 50]],
      cells,
      canvasMode: "auto-expand",
    });

    render(
      <BeadEditorStep
        state={createBeadEditorState(blankProject)}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
      />,
    );

    expect(screen.getByText(/2\.6 × 2\.6 mm/)).toBeInTheDocument();
    expect(screen.getByText("4 × 4")).toBeInTheDocument();
  });

  it("exposes every matrix tool, review direction, view, and history control", () => {
    const currentProject = project();
    const state = createBeadEditorState(currentProject);
    const dispatch = vi.fn<(action: BeadEditorAction) => void>();
    render(
      <BeadEditorStep
        state={state}
        sourceRaster={{
          width: 2,
          height: 2,
          data: new Uint8ClampedArray(16),
        }}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
        displayPalette={[
          [11, 22, 33],
          [44, 55, 66],
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "编辑豆子" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "耗材颜色" }),
    ).toBeDisabled();
    const tools = [
      ["放豆", "paint"],
      ["擦除", "erase"],
      ["清除连片", "eraseFill"],
      ["取色", "eyedropper"],
      ["填充区域", "fill"],
    ] as const;
    const toolbar = screen.getByRole("toolbar", {
      name: "放豆工具",
    });
    for (const [name, tool] of tools) {
      fireEvent.click(within(toolbar).getByRole("button", { name }));
      expect(dispatch).toHaveBeenCalledWith({
        type: "set-tool",
        tool,
      });
    }
    expect(
      screen.queryByRole("button", { name: "透明支撑" }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重做" })).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "上一个待复核格" }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "select-issue",
      issueIndex: 1,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "下一个待复核格" }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "select-issue",
      issueIndex: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "展开 2D 校对" }));
    const auxiliaryToolbar = screen.getByRole("toolbar", {
      name: "二维校对视图",
    });
    fireEvent.click(within(auxiliaryToolbar).getByRole("button", { name: "原图" }));
    expect(
      screen.getByRole("img", { name: "拼豆图纸原图" }),
    ).toBeInTheDocument();
    fireEvent.click(within(auxiliaryToolbar).getByRole("button", { name: "编辑豆子" }));
    expect(
      screen.getByRole("img", { name: "可编辑拼豆图案" }),
    ).toBeInTheDocument();
    fireEvent.click(within(auxiliaryToolbar).getByRole("button", { name: "熨烫效果" }));
    const fusionPreview = screen.getByRole("img", {
      name: "拼豆熨烫效果",
    });
    expect(fusionPreview).toBeInTheDocument();
    expect(fusionPreview.tagName.toLowerCase()).toBe("svg");
    expect(
      fusionPreview.querySelectorAll("[data-bead-fusion-path]"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: "可旋转的拼豆 3D 成品" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "默认从正上方查看，方向和 2D 一致。选择“编辑豆子”后，左键或单指直接使用当前工具；选择“调整视角”后，拖动旋转，滚轮或双指缩放。桌面端也可用右键旋转、中键平移。",
      ),
    ).toBeInTheDocument();
    expect(threePreviewCapture.project?.palette).toEqual([
      [11, 22, 33],
      [44, 55, 66],
    ]);
  });

  it("routes 3D picks through the latest tool and source palette while keeping the 3D view active", () => {
    const actions = vi.fn<(action: BeadEditorAction) => void>();

    function Harness() {
      const [state, reducerDispatch] = useReducer(
        beadEditorReducer,
        createBeadEditorState(project()),
      );
      const dispatch = (action: BeadEditorAction) => {
        actions(action);
        reducerDispatch(action);
      };
      return (
        <>
          <BeadEditorStep
            state={state}
            sourceRaster={null}
            translate={t}
            dispatch={dispatch}
            onNewProject={vi.fn()}
            displayPalette={[
              [11, 22, 33],
              [44, 55, 66],
            ]}
          />
          <output data-testid="active-palette">
            {state.activePaletteIndex}
          </output>
          <output data-testid="selected-cell">
            {state.selectedCellIndex ?? "none"}
          </output>
          <output data-testid="first-cell-kind">
            {state.present.cells[0].kind}
          </output>
        </>
      );
    }

    render(<Harness />);
    const initialPick = threePreviewCapture.onPickCell;
    expect(initialPick).toEqual(expect.any(Function));
    expect(threePreviewCapture.allowDrag).toBe(true);
    expect(threePreviewCapture.project?.palette).toEqual([
      [11, 22, 33],
      [44, 55, 66],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "颜色 2" }));
    fireEvent.click(screen.getByRole("button", { name: "填充区域" }));
    expect(screen.getByTestId("active-palette")).toHaveTextContent("1");
    expect(threePreviewCapture.onPickCell).not.toBe(initialPick);
    expect(threePreviewCapture.allowDrag).toBe(false);

    actions.mockClear();
    act(() => threePreviewCapture.onPickCell?.(0));

    expect(actions).toHaveBeenCalledTimes(1);
    expect(actions).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "apply-tool",
        tool: "fill",
        paletteIndex: 1,
        cellIndex: 0,
      }),
    );
    expect(screen.getByTestId("first-cell-kind")).toHaveTextContent(
      "color",
    );
    expect(screen.getByTestId("selected-cell")).toHaveTextContent("0");
    expect(threePreviewCapture.selectedCellIndex).toBe(0);
    expect(
      screen.getByRole("img", { name: "可旋转的拼豆 3D 成品" }),
    ).toBeInTheDocument();
    expect(threePreviewCapture.selectedCellIndex).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.getByTestId("first-cell-kind")).toHaveTextContent(
      "empty",
    );
    expect(
      screen.getByRole("img", { name: "可旋转的拼豆 3D 成品" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["paint", true],
    ["erase", true],
    ["eraseFill", false],
    ["eyedropper", false],
    ["fill", false],
  ] as const)(
    "passes the %s drag contract and selected cell to the 3D preview",
    (activeTool, expectedAllowDrag) => {
      const baseState = createBeadEditorState(project());
      const { rerender } = render(
        <BeadEditorStep
          state={{
            ...baseState,
            activeTool,
            selectedCellIndex: 3,
          }}
          sourceRaster={null}
          translate={t}
          dispatch={vi.fn()}
          onNewProject={vi.fn()}
        />,
      );
      expect(threePreviewCapture.allowDrag).toBe(expectedAllowDrag);
      expect(threePreviewCapture.selectedCellIndex).toBe(3);

      rerender(
        <BeadEditorStep
          state={{
            ...baseState,
            activeTool,
            selectedCellIndex: 0,
          }}
          sourceRaster={null}
          translate={t}
          dispatch={vi.fn()}
          onNewProject={vi.fn()}
        />,
      );
      expect(threePreviewCapture.selectedCellIndex).toBe(0);
    },
  );

  it("hosts the editor in one 3D-first workspace without permanent side docks", () => {
    const state = createBeadEditorState(project());
    const dispatch = vi.fn<(action: BeadEditorAction) => void>();
    render(
      <BeadEditorStep
        state={state}
        sourceRaster={null}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
      />,
    );

    const workspace = screen.getByTestId("bead-editor-workspace");
    expect(workspace.querySelector(".bead-editor-dock")).toBeNull();
    const editorHeadings = screen.getAllByRole("heading", {
      name: "编辑豆子",
    });
    expect(editorHeadings).toHaveLength(1);
    expect(editorHeadings[0].tagName).toBe("H1");

    expect(
      screen.getByRole("button", { name: "放豆" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps one zoomable viewport while switching among the three 2D views", () => {
    vi.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function getBoundingClientRect(
      this: HTMLElement,
    ) {
      if (
        this.getAttribute("data-testid") ===
        "bead-canvas-viewport-surface"
      ) {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 800,
          bottom: 600,
          left: 0,
          width: 800,
          height: 600,
          toJSON: () => undefined,
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: 0,
        height: 0,
        toJSON: () => undefined,
      } as DOMRect;
    });
    const state = createBeadEditorState(project());
    render(
      <BeadEditorStep
        state={state}
        sourceRaster={{
          width: 320,
          height: 240,
          data: new Uint8ClampedArray(320 * 240 * 4),
        }}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开 2D 校对" }));
    const auxiliaryToolbar = screen.getByRole("toolbar", {
      name: "二维校对视图",
    });
    const matrixViewport = screen.getByTestId("bead-canvas-viewport");
    expect(
      screen.getByTestId("bead-canvas-viewport-content"),
    ).toHaveStyle({ width: "24px", height: "24px" });
    expect(
      screen.getByRole("toolbar", { name: "画布缩放" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "重置为 100%" }),
    );
    expect(
      screen.getByRole("status", { name: "当前缩放：100%" }),
    ).toHaveTextContent("100%");

    fireEvent.click(within(auxiliaryToolbar).getByRole("button", { name: "原图" }));
    expect(screen.getByTestId("bead-canvas-viewport")).toBe(
      matrixViewport,
    );
    expect(
      screen.getByTestId("bead-canvas-viewport-content"),
    ).toHaveStyle({ width: "320px", height: "240px" });
    expect(
      screen.getByRole("status", { name: "当前缩放：250%" }),
    ).toHaveTextContent("250%");

    fireEvent.click(within(auxiliaryToolbar).getByRole("button", { name: "编辑豆子" }));
    expect(
      screen.getByRole("status", { name: "当前缩放：100%" }),
    ).toHaveTextContent("100%");

    fireEvent.click(within(auxiliaryToolbar).getByRole("button", { name: "熨烫效果" }));
    expect(screen.getByTestId("bead-canvas-viewport")).toBe(
      matrixViewport,
    );
    expect(
      screen.getByTestId("bead-canvas-viewport-content"),
    ).toHaveStyle({ width: "24px", height: "24px" });

    fireEvent.click(screen.getByRole("button", { name: "收起 2D 校对" }));
    expect(
      screen.queryByTestId("bead-canvas-viewport"),
    ).not.toBeInTheDocument();
  });

  it("preserves the selected auxiliary view while the 2D check expands and collapses", () => {
    render(
      <BeadEditorStep
        state={createBeadEditorState(project())}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开 2D 校对" }));
    const auxiliaryToolbar = screen.getByRole("toolbar", {
      name: "二维校对视图",
    });
    const pressureButton = within(auxiliaryToolbar).getByRole("button", {
      name: "熨烫效果",
    });
    fireEvent.click(pressureButton);
    expect(pressureButton).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("img", { name: "拼豆熨烫效果" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起 2D 校对" }));
    fireEvent.click(screen.getByRole("button", { name: "展开 2D 校对" }));

    expect(pressureButton).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("img", { name: "拼豆熨烫效果" }),
    ).toBeInTheDocument();
  });

  it("keeps library identity and mapping callbacks available in the inspector", () => {
    const colorLibrary = {
      id: "lut:current",
      label: "当前测试色库",
      sourceKind: "lut" as const,
      colors: [
        {
          id: "print-red",
          label: "打印红",
          hex: "#E62832",
          materialId: null,
        },
        {
          id: "print-blue",
          label: "打印蓝",
          hex: "#1478D2",
          materialId: null,
        },
      ],
    };
    const onRefreshPrintMapping = vi.fn();
    const onSetPrintMappingEntry = vi.fn();
    const { rerender } = render(
      <BeadEditorStep
        state={createBeadEditorState(project())}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
        colorLibrary={colorLibrary}
        printMapping={null}
        onRefreshPrintMapping={onRefreshPrintMapping}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打印准备" }));
    expect(screen.getByText("当前耗材：当前测试色库")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "匹配耗材颜色" }),
    );
    expect(onRefreshPrintMapping).toHaveBeenCalledTimes(1);

    rerender(
      <BeadEditorStep
        state={createBeadEditorState(project())}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
        colorLibrary={colorLibrary}
        printMapping={{
          libraryId: colorLibrary.id,
          libraryLabel: colorLibrary.label,
          entries: [
            { sourcePaletteIndex: 0, colorEntryId: "print-red" },
            { sourcePaletteIndex: 1, colorEntryId: "print-blue" },
          ],
        }}
        onSetPrintMappingEntry={onSetPrintMappingEntry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打印准备" }));
    expect(screen.getByText("当前耗材：当前测试色库")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "图案颜色 2" }),
      { target: { value: "print-red" } },
    );
    expect(onSetPrintMappingEntry).toHaveBeenCalledWith(1, "print-red");
  });

  it("explains when an oversized project uses the 2D pressure fallback", () => {
    const rows = 65;
    const columns = 64;
    const cellCount = rows * columns;
    const oversizedProject = createBeadProject({
      projectId: "editor-three-preview-limit",
      moduleVersion: "1.0.8",
      now: "2026-08-11T00:00:00.000Z",
      rows,
      columns,
      palette: [[230, 40, 50]],
      cells: Array.from({ length: cellCount }, () => ({
        kind: "color" as const,
        paletteIndex: 0,
      })),
    });
    render(
      <BeadEditorStep
        state={createBeadEditorState(oversizedProject)}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "当前图案有 4160 颗豆，超过 4096 颗的交互式 3D 安全上限；已显示同样效果的 2D 熨烫预览。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "拖动旋转、滚轮缩放；3D 与压合预览使用同一套挤压规则，并额外显示成品厚度、豆板和定位柱。",
      ),
    ).not.toBeInTheDocument();
  });

  it("offers recalibration only while the imported source is available", () => {
    const state = createBeadEditorState(project());
    const onReturnCalibration = vi.fn();
    const { rerender } = render(
      <BeadEditorStep
        state={state}
        sourceRaster={{
          width: 2,
          height: 2,
          data: new Uint8ClampedArray(16),
        }}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
        onReturnCalibration={onReturnCalibration}
      />,
    );

    expect(
      screen.getByRole("button", { name: "新建图纸" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "返回校准" }),
    );
    expect(onReturnCalibration).toHaveBeenCalledTimes(1);

    rerender(
      <BeadEditorStep
        state={state}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
        onReturnCalibration={onReturnCalibration}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "返回校准" }),
    ).not.toBeInTheDocument();
  });

  it("offers visible compression anchors without changing cells or pitch", () => {
    function Harness() {
      const [state, dispatch] = useReducer(
        beadEditorReducer,
        createBeadEditorState(project()),
      );
      return (
        <>
          <BeadEditorStep
            state={state}
            sourceRaster={null}
            translate={t}
            dispatch={dispatch}
            onNewProject={vi.fn()}
          />
          <output data-testid="compression">
            {state.present.compression}
          </output>
          <output data-testid="pitch">
            {state.present.beadPitchMm}
          </output>
          <output data-testid="irregularity">
            {state.present.irregularity}
          </output>
          <output data-testid="cells">
            {JSON.stringify(state.present.cells)}
          </output>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "调整熨烫" }));
    const cellsBefore = screen.getByTestId("cells").textContent;
    const pitchBefore = screen.getByTestId("pitch").textContent;
    for (const name of [
      "0 · 有孔",
      "50 · 标准",
      "100 · 无孔",
    ]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByTestId("compression")).toHaveTextContent("100");
    expect(screen.getByTestId("cells")).toHaveTextContent(
      cellsBefore ?? "",
    );
    expect(screen.getByTestId("pitch")).toHaveTextContent(
      pitchBefore ?? "",
    );

    fireEvent.change(
      screen.getByRole("slider", { name: "熨烫程度" }),
      { target: { value: "84" } },
    );
    expect(screen.getByTestId("compression")).toHaveTextContent("84");
    expect(screen.getByText("成品尺寸：5.2 × 5.2 mm")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("slider", { name: "自然形变" }),
      { target: { value: "67" } },
    );
    expect(screen.getByTestId("irregularity")).toHaveTextContent("67");
  });

  it("explains connected area erase and reflects available history", () => {
    const initialState = createBeadEditorState(project());
    const editedState = beadEditorReducer(initialState, {
      type: "apply-tool",
      tool: "paint",
      cellIndex: 0,
      paletteIndex: 0,
    });
    const areaEraseState = {
      ...editedState,
      activeTool: "eraseFill" as const,
    };
    const dispatch = vi.fn<(action: BeadEditorAction) => void>();
    const { rerender } = render(
      <BeadEditorStep
        state={areaEraseState}
        sourceRaster={null}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "清除连片" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText(
        "点击色块，一次清空与它上下左右相连的同色区域。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重做" })).toBeDisabled();

    const undoneState = beadEditorReducer(editedState, { type: "undo" });
    rerender(
      <BeadEditorStep
        state={undoneState}
        sourceRaster={null}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重做" })).toBeEnabled();
  });

  it("maps a matrix pointer to a bounded edit action and shows fixed inspection zoom", () => {
    const state = {
      ...createBeadEditorState(project()),
      selectedCellIndex: 1,
    };
    const dispatch = vi.fn<(action: BeadEditorAction) => void>();
    render(
      <BeadEditorStep
        state={state}
        sourceRaster={null}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
      />,
    );
    const inspection = screen.getByRole("group", {
      name: "选中格局部放大",
    });
    expect(inspection).toBeInTheDocument();
    expect(
      within(inspection).getByRole("img", { name: "选中格局部放大" }),
    ).toHaveAttribute("width", "64");
    fireEvent.click(screen.getByRole("button", { name: "展开 2D 校对" }));
    const canvas = screen.getByRole("img", {
      name: "可编辑拼豆图案",
    });
    expect(canvas).toHaveClass("bead-canvas--matrix");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(canvas, {
      clientX: 150,
      clientY: 50,
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "apply-tool",
        cellIndex: 1,
        tool: "paint",
      }),
    );

    dispatch.mockClear();
    fireEvent.pointerDown(canvas, {
      clientX: 250,
      clientY: 50,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("applies area erase once after a completed click instead of sweeping adjacent regions", () => {
    const state = {
      ...createBeadEditorState(project()),
      activeTool: "eraseFill" as const,
    };
    const dispatch = vi.fn<(action: BeadEditorAction) => void>();
    render(
      <BeadEditorStep
        state={state}
        sourceRaster={null}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "展开 2D 校对" }));
    const canvas = screen.getByRole("img", {
      name: "可编辑拼豆图案",
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      clientX: 25,
      clientY: 25,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      clientX: 125,
      clientY: 25,
    });

    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.click(canvas, {
      clientX: 25,
      clientY: 25,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "apply-tool",
        cellIndex: 0,
        tool: "eraseFill",
      }),
    );
  });

  it("offers converter handoff only when at least one colored bead exists", () => {
    const onHandoff = vi.fn();
    const coloredState = createBeadEditorState(project());
    const { rerender } = render(
      <BeadEditorStep
        state={coloredState}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
        onHandoff={onHandoff}
        handoffBusy={false}
      />,
    );

    const button = screen.getByRole("button", {
      name: "生成打印文件",
    });
    expect(button).toBeEnabled();
    expect(
      button.querySelector(".bead-editor-output-button__compact"),
    ).toHaveTextContent("打印");
    fireEvent.click(button);
    expect(onHandoff).toHaveBeenCalledTimes(1);

    const empty = createBeadProject({
      projectId: "empty-handoff",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 1,
      columns: 1,
      palette: [[0, 0, 0]],
    });
    rerender(
      <BeadEditorStep
        state={createBeadEditorState(empty)}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
        onHandoff={onHandoff}
        handoffBusy={false}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "生成打印文件",
      }),
    ).toBeDisabled();
  });

  it("shows a stale action instead of silently replacing an old library mapping", () => {
    const old = {
      ...project(),
      printMapping: {
        libraryId: "lut:old",
        libraryLabel: "旧色库",
        entries: [
          { sourcePaletteIndex: 0, colorEntryId: "old-red" },
          { sourcePaletteIndex: 1, colorEntryId: "old-blue" },
        ],
      },
    };
    const onRefresh = vi.fn();
    render(
      <BeadEditorStep
        state={createBeadEditorState(old)}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
        colorLibrary={{
          id: "lut:new",
          label: "新色库",
          sourceKind: "lut",
          colors: [
            {
              id: "new-red",
              label: "新红",
              hex: "#E3212A",
              materialId: null,
            },
          ],
        }}
        printMapping={old.printMapping}
        printMappingStale
        onRefreshPrintMapping={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打印准备" }));
    expect(
      screen.getByRole("button", { name: "耗材颜色" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Lumina 的耗材颜色已经变化；旧的匹配结果不会被静默替换。",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "按当前耗材重新匹配" }),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
