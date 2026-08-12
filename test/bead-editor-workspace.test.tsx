import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { BeadEditorWorkspace } from "../src/app/BeadEditorWorkspace";

const labels = {
  project: "当前图案",
  workflow: "工作模式",
  tools: "放豆工具",
  modeControls: "当前模式设置",
  output: "打印输出",
  auxiliary: "2D 校对",
};

function renderWorkspace() {
  return render(
    <BeadEditorWorkspace
      mode="edit"
      labels={labels}
      projectControls={<button type="button">图案操作</button>}
      workflowControls={<button type="button">编辑豆子</button>}
      toolControls={<button type="button">放豆</button>}
      modeControls={<button type="button">颜色 1</button>}
      outputControls={<button type="button">生成打印文件</button>}
      canvas={<div data-testid="bead-canvas">三维画布</div>}
      auxiliaryView={<div data-testid="bead-auxiliary">二维校对画布</div>}
    />,
  );
}

describe("BeadEditorWorkspace", () => {
  it("uses one dominant canvas with mode-specific floating controls instead of permanent side docks", () => {
    const { container } = renderWorkspace();
    const workspace = screen.getByTestId("bead-editor-workspace");
    const canvasLayer = screen.getByTestId("bead-canvas").parentElement;

    expect(canvasLayer).toHaveClass("bead-editor-workspace__canvas");
    expect(canvasLayer?.parentElement).toBe(workspace);
    expect(workspace).toHaveAttribute("data-mode", "edit");
    expect(
      screen.getByRole("group", { name: labels.project }),
    ).toHaveClass("bead-editor-workspace__project");
    expect(
      screen.getByRole("toolbar", { name: labels.workflow }),
    ).toHaveClass("bead-editor-workspace__workflow");
    expect(screen.getByRole("toolbar", { name: labels.tools })).toHaveClass(
      "bead-editor-workspace__tools",
    );
    expect(
      screen.getByRole("region", { name: labels.modeControls }),
    ).toHaveClass("bead-editor-workspace__mode-dock");
    expect(screen.getByRole("group", { name: labels.output })).toHaveClass(
      "bead-editor-workspace__output",
    );
    expect(
      screen.getByRole("region", { name: labels.auxiliary }),
    ).toHaveClass("bead-editor-workspace__auxiliary");

    expect(container.querySelector(".bead-editor-dock")).toBeNull();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("keeps every control layer as a sibling of the canvas so overlays never scroll with it", () => {
    renderWorkspace();
    const workspace = screen.getByTestId("bead-editor-workspace");
    const expectedLayers = [
      "bead-editor-workspace__canvas",
      "bead-editor-workspace__topbar",
      "bead-editor-workspace__tools",
      "bead-editor-workspace__mode-dock",
      "bead-editor-workspace__auxiliary",
    ];

    for (const className of expectedLayers) {
      const layer = workspace.querySelector(`.${className}`);
      expect(layer).not.toBeNull();
      expect(layer?.parentElement).toBe(workspace);
    }
  });

  it("omits the auxiliary layer when no 2D preview is supplied", () => {
    render(
      <BeadEditorWorkspace
          mode="edit"
        labels={labels}
        projectControls={<span>项目</span>}
        workflowControls={<span>模式</span>}
        toolControls={<span>工具</span>}
        modeControls={<span>设置</span>}
        outputControls={<span>输出</span>}
        canvas={<span>画布</span>}
      />,
    );

    expect(
      screen.queryByRole("region", { name: labels.auxiliary }),
    ).not.toBeInTheDocument();
  });

  it("treats the expanded 2D check as a focused overlay and closes it with Escape", () => {
    function Harness() {
      const [expanded, setExpanded] = useState(false);
      return (
        <BeadEditorWorkspace
          mode="edit"
          labels={labels}
          projectControls={<button type="button">图案操作</button>}
          workflowControls={<button type="button">编辑豆子</button>}
          toolControls={<button type="button">放豆</button>}
          modeControls={<button type="button">颜色 1</button>}
          outputControls={<button type="button">生成打印文件</button>}
          canvas={<button type="button">三维视角</button>}
          auxiliaryExpanded={expanded}
          onCollapseAuxiliary={() => setExpanded(false)}
          auxiliaryView={
            <button type="button" onClick={() => setExpanded(true)}>
              {expanded ? "收起 2D" : "展开 2D"}
            </button>
          }
        />
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "展开 2D" });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: labels.auxiliary })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(trigger).toHaveFocus();
    expect(screen.getByText("三维视角").parentElement).toHaveAttribute("inert");
    expect(screen.getByRole("toolbar", { name: labels.tools })).toHaveAttribute(
      "inert",
    );
    expect(
      screen.getByRole("region", { name: labels.modeControls }),
    ).toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("region", { name: labels.auxiliary })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开 2D" })).toHaveFocus();
  });
});
