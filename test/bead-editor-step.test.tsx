import {
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
import { translate } from "../src/i18n/translations";

const threePreviewCapture = vi.hoisted(() => ({
  project: null as ReturnType<typeof project> | null,
}));

vi.mock("../src/app/BeadThreePreview", () => ({
  MAX_THREE_PREVIEW_BEADS: 4_096,
  supportsBeadThreePreviewCount: (beadCount: number) =>
    beadCount <= 4_096,
  BeadThreePreview: ({
    project: previewProject,
    ariaLabel,
  }: {
    project: ReturnType<typeof project>;
    ariaLabel: string;
  }) => {
    threePreviewCapture.project = previewProject;
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
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockReturnValue(null);
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
      screen.getByRole("heading", { name: "编辑拼豆矩阵" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "当前打印色库" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Lumina 当前没有可用的 LUT 或耗材档案，仍可使用图纸原色编辑。",
      ),
    ).toBeInTheDocument();
    const tools = [
      ["画笔", "paint"],
      ["橡皮", "erase"],
      ["区域擦除", "eraseFill"],
      ["吸管", "eyedropper"],
      ["填充", "fill"],
    ] as const;
    const toolbar = screen.getByRole("toolbar", {
      name: "编辑工具",
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

    fireEvent.click(screen.getByRole("button", { name: "原图" }));
    expect(
      screen.getByRole("img", { name: "拼豆图纸原图" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "识别矩阵" }));
    expect(
      screen.getByRole("img", { name: "可编辑拼豆矩阵" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "压合预览" }));
    const fusionPreview = screen.getByRole("img", {
      name: "拼豆压合预览",
    });
    expect(fusionPreview).toBeInTheDocument();
    expect(fusionPreview.tagName.toLowerCase()).toBe("svg");
    expect(
      fusionPreview.querySelectorAll("[data-bead-fusion-path]"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "3D 预览" }));
    expect(
      screen.getByRole("img", { name: "可旋转的拼豆 3D 预览" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "拖动旋转、滚轮缩放；3D 与压合预览使用同一套挤压规则，并额外显示成品厚度、豆板和定位柱。",
      ),
    ).toBeInTheDocument();
    expect(threePreviewCapture.project?.palette).toEqual([
      [11, 22, 33],
      [44, 55, 66],
    ]);
  });

  it("hosts the editor in one workspace while dock presentation stays outside business dispatch", () => {
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
    expect(
      screen.getByRole("heading", { name: "编辑" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "参数与输出" }),
    ).toBeInTheDocument();
    const editorHeadings = screen.getAllByRole("heading", {
      name: "编辑拼豆矩阵",
    });
    expect(editorHeadings).toHaveLength(1);
    expect(editorHeadings[0].tagName).toBe("H1");

    fireEvent.click(
      screen.getByRole("button", { name: "收起编辑控件" }),
    );
    expect(workspace).toHaveAttribute("data-left-collapsed", "true");
    const collapsedEditorHeadings = screen.getAllByRole("heading", {
      name: "编辑拼豆矩阵",
    });
    expect(collapsedEditorHeadings).toHaveLength(1);
    expect(collapsedEditorHeadings[0].tagName).toBe("H1");
    expect(
      screen.getByRole("img", { name: "可编辑拼豆矩阵" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "展开编辑控件" }),
    );
    expect(
      screen.getByRole("button", { name: "画笔" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("preserves the pressure view while the inspector dock collapses and expands", () => {
    render(
      <BeadEditorStep
        state={createBeadEditorState(project())}
        sourceRaster={null}
        translate={t}
        dispatch={vi.fn()}
        onNewProject={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "压合预览" }),
    );
    const pressureButton = screen.getByRole("button", {
      name: "压合预览",
    });
    expect(pressureButton).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("img", { name: "拼豆压合预览" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "收起参数控件" }),
    );
    expect(screen.getByTestId("bead-editor-workspace")).toHaveAttribute(
      "data-right-collapsed",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "展开参数控件" }),
    );

    expect(pressureButton).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("img", { name: "拼豆压合预览" }),
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

    expect(screen.getByText("当前色库：当前测试色库")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "生成打印色映射" }),
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

    expect(screen.getByText("当前色库：当前测试色库")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "作品颜色 2" }),
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

    fireEvent.click(screen.getByRole("button", { name: "3D 预览" }));
    expect(
      screen.getByText(
        "当前图案有 4160 颗豆，超过 4096 颗的交互式 3D 安全上限；已显示同规则的 2D 压合预览。",
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
    const cellsBefore = screen.getByTestId("cells").textContent;
    const pitchBefore = screen.getByTestId("pitch").textContent;
    for (const name of [
      "0 · 紧密有孔",
      "50 · 标准熔合",
      "100 · 平熔无孔",
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
      screen.getByRole("slider", { name: "压合程度" }),
      { target: { value: "84" } },
    );
    expect(screen.getByTestId("compression")).toHaveTextContent("84");
    expect(screen.getByText("5.2 × 5.2 mm")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("slider", { name: "不规则挤压" }),
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
      screen.getByRole("button", { name: "区域擦除" }),
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
    const magnifierCanvas = screen.getByRole("img", {
      name: "选中格局部放大",
    });
    expect(magnifierCanvas).toHaveClass("bead-canvas--matrix");
    const canvas = screen.getByRole("img", {
      name: "可编辑拼豆矩阵",
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
    const canvas = screen.getByRole("img", {
      name: "可编辑拼豆矩阵",
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
      name: "交给 Lumina 转换",
    });
    expect(button).toBeEnabled();
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
        name: "交给 Lumina 转换",
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

    expect(
      screen.getByRole("button", { name: "当前打印色库" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Lumina 的当前色库已经变化；旧映射不会被静默替换。",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "按当前色库重新映射" }),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
