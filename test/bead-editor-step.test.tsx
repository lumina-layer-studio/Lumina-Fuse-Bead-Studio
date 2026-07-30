import { fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BeadEditorStep } from "../src/app/BeadEditorStep";
import {
  beadEditorReducer,
  createBeadEditorState,
  type BeadEditorAction,
} from "../src/domain/editorReducer";
import { createBeadProject } from "../src/domain/project";
import { renderBeadProject } from "../src/domain/renderer";
import { translate } from "../src/i18n/translations";

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
      { kind: "transparent-support" },
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
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockReturnValue(null);
  });

  it("exposes every matrix tool, review direction, view, and history control", () => {
    const currentProject = project();
    const state = createBeadEditorState(currentProject);
    const dispatch = vi.fn<(action: BeadEditorAction) => void>();
    const pressure = renderBeadProject(currentProject, {
      compression: 50,
      pixelsPerCell: 12,
    });
    render(
      <BeadEditorStep
        state={state}
        renderResult={pressure}
        renderBusy={false}
        sourceRaster={{
          width: 2,
          height: 2,
          data: new Uint8ClampedArray(16),
        }}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "编辑拼豆矩阵" }),
    ).toBeInTheDocument();
    const tools = [
      ["画笔", "paint"],
      ["橡皮", "erase"],
      ["吸管", "eyedropper"],
      ["填充", "fill"],
      ["透明支撑", "support"],
    ] as const;
    for (const [name, tool] of tools) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(dispatch).toHaveBeenCalledWith({
        type: "set-tool",
        tool,
      });
    }

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "undo" });
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "redo" });

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
      issueIndex: 0,
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
    expect(
      screen.getByRole("img", { name: "拼豆压合预览" }),
    ).toBeInTheDocument();
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
            renderResult={null}
            renderBusy={false}
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
      "0 · 轻压有孔",
      "50 · 标准",
      "100 · 紧压无孔",
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
        renderResult={null}
        renderBusy={false}
        sourceRaster={null}
        translate={t}
        dispatch={dispatch}
        onNewProject={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("img", { name: "选中格局部放大" }),
    ).toBeInTheDocument();
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

  it("offers converter handoff only when at least one colored bead exists", () => {
    const onHandoff = vi.fn();
    const coloredState = createBeadEditorState(project());
    const { rerender } = render(
      <BeadEditorStep
        state={coloredState}
        renderResult={null}
        renderBusy={false}
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
        renderResult={null}
        renderBusy={false}
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
});
