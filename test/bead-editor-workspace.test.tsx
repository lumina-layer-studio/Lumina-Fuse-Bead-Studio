import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BeadEditorWorkspace } from "../src/app/BeadEditorWorkspace";

const labels = {
  views: "视图",
  edit: "编辑工具",
  inspector: "参数检查器",
  collapseEdit: "收起编辑工具",
  expandEdit: "展开编辑工具",
  collapseInspector: "收起参数检查器",
  expandInspector: "展开参数检查器",
  openEdit: "打开编辑工具",
  openInspector: "打开参数检查器",
};

function renderWorkspace() {
  return render(
    <BeadEditorWorkspace
      labels={labels}
      viewControls={<button type="button">矩阵视图</button>}
      editControls={<button type="button">画笔</button>}
      inspectorControls={<input aria-label="压合厚度" />}
      canvas={<div data-testid="bead-canvas">画布</div>}
      magnifier={<div data-testid="bead-magnifier">放大镜</div>}
    />,
  );
}

describe("BeadEditorWorkspace", () => {
  it("independently collapses its desktop docks without unmounting the canvas or controls", () => {
    renderWorkspace();

    const workspace = screen.getByTestId("bead-editor-workspace");
    const canvas = screen.getByTestId("bead-canvas");
    const editCollapseTrigger = screen.getByRole("button", {
      name: labels.collapseEdit,
    });
    const inspectorCollapseTrigger = screen.getByRole("button", {
      name: labels.collapseInspector,
    });
    const editBody = document.getElementById(
      editCollapseTrigger.getAttribute("aria-controls")!,
    );
    const inspectorBody = document.getElementById(
      inspectorCollapseTrigger.getAttribute("aria-controls")!,
    );

    expect(workspace).toHaveAttribute("data-left-collapsed", "false");
    expect(workspace).toHaveAttribute("data-right-collapsed", "false");
    fireEvent.click(editCollapseTrigger);
    expect(workspace).toHaveAttribute("data-left-collapsed", "true");
    expect(workspace).toHaveAttribute("data-right-collapsed", "false");
    expect(canvas).toBeInTheDocument();
    expect(editBody).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "画笔", hidden: true })).toBeInTheDocument();

    fireEvent.click(inspectorCollapseTrigger);
    expect(workspace).toHaveAttribute("data-right-collapsed", "true");
    expect(inspectorBody).toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("button", { name: labels.expandEdit }));
    expect(workspace).toHaveAttribute("data-left-collapsed", "false");
    expect(editBody).not.toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "画笔" })).toBeInTheDocument();
  });

  it("connects every desktop and mobile dock trigger to a live controls element", () => {
    const { container } = renderWorkspace();

    for (const trigger of container.querySelectorAll<HTMLButtonElement>(
      "button[aria-controls]",
    )) {
      const controlledId = trigger.getAttribute("aria-controls");
      expect(controlledId).toBeTruthy();
      expect(document.getElementById(controlledId!)).toBeInTheDocument();
    }
  });

  it("gives each workspace instance unique dock bodies and local trigger relationships", () => {
    const { container } = render(
      <>
        <BeadEditorWorkspace
          labels={labels}
          viewControls={<button type="button">视图一</button>}
          editControls={<button type="button">画笔一</button>}
          inspectorControls={<input aria-label="压合厚度一" />}
          canvas={<div>画布一</div>}
        />
        <BeadEditorWorkspace
          labels={labels}
          viewControls={<button type="button">视图二</button>}
          editControls={<button type="button">画笔二</button>}
          inspectorControls={<input aria-label="压合厚度二" />}
          canvas={<div>画布二</div>}
        />
      </>,
    );

    const bodies = Array.from(
      container.querySelectorAll<HTMLElement>(".bead-editor-dock__body[id]"),
    );
    expect(new Set(bodies.map((body) => body.id)).size).toBe(bodies.length);
    expect(bodies).toHaveLength(4);

    for (const trigger of container.querySelectorAll<HTMLButtonElement>(
      "button[aria-controls]",
    )) {
      const owner = trigger.closest(".bead-editor-workspace");
      const controlled = document.getElementById(
        trigger.getAttribute("aria-controls")!,
      );
      expect(controlled?.closest(".bead-editor-workspace")).toBe(owner);
    }
  });

  it("opens one mobile drawer at a time and moves focus into its matching controls", async () => {
    renderWorkspace();
    const workspace = screen.getByTestId("bead-editor-workspace");
    const editTrigger = screen.getByRole("button", { name: labels.openEdit });
    const inspectorTrigger = screen.getByRole("button", {
      name: labels.openInspector,
    });

    fireEvent.click(editTrigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "画笔" })).toHaveFocus());
    expect(workspace).toHaveAttribute("data-mobile-drawer", "edit");
    expect(editTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(inspectorTrigger);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "压合厚度" })).toHaveFocus());
    expect(workspace).toHaveAttribute("data-mobile-drawer", "inspector");
    expect(editTrigger).toHaveAttribute("aria-expanded", "false");
    expect(inspectorTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("lets an aria-modal dialog own Escape, then closes the drawer and restores its trigger focus", async () => {
    renderWorkspace();
    const workspace = screen.getByTestId("bead-editor-workspace");
    const inspectorTrigger = screen.getByRole("button", {
      name: labels.openInspector,
    });

    fireEvent.click(inspectorTrigger);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "压合厚度" })).toHaveFocus());

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(workspace).toHaveAttribute("data-mobile-drawer", "inspector");
    expect(screen.getByRole("textbox", { name: "压合厚度" })).toHaveFocus();

    dialog.remove();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(workspace).toHaveAttribute("data-mobile-drawer", "closed");
    expect(inspectorTrigger).toHaveFocus();
  });

  it("isolates Escape to the workspace that currently owns focus", async () => {
    render(
      <>
        <BeadEditorWorkspace
          labels={labels}
          viewControls={<button type="button">视图一</button>}
          editControls={<button type="button">画笔一</button>}
          inspectorControls={<input aria-label="压合厚度一" />}
          canvas={<div>画布一</div>}
        />
        <BeadEditorWorkspace
          labels={labels}
          viewControls={<button type="button">视图二</button>}
          editControls={<button type="button">画笔二</button>}
          inspectorControls={<input aria-label="压合厚度二" />}
          canvas={<div>画布二</div>}
        />
      </>,
    );
    const [firstWorkspace, secondWorkspace] = screen.getAllByTestId(
      "bead-editor-workspace",
    );
    const firstEditTrigger = within(firstWorkspace).getByRole("button", {
      name: labels.openEdit,
    });
    const secondEditTrigger = within(secondWorkspace).getByRole("button", {
      name: labels.openEdit,
    });

    fireEvent.click(firstEditTrigger);
    await waitFor(() =>
      expect(within(firstWorkspace).getByRole("button", { name: "画笔一" })).toHaveFocus(),
    );
    fireEvent.click(secondEditTrigger);
    await waitFor(() =>
      expect(within(secondWorkspace).getByRole("button", { name: "画笔二" })).toHaveFocus(),
    );
    expect(firstWorkspace).toHaveAttribute("data-mobile-drawer", "edit");
    expect(secondWorkspace).toHaveAttribute("data-mobile-drawer", "edit");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(firstWorkspace).toHaveAttribute("data-mobile-drawer", "edit");
    expect(secondWorkspace).toHaveAttribute("data-mobile-drawer", "closed");
    expect(secondEditTrigger).toHaveFocus();
  });

  it("does not move focus outside its own dock when the opened body has no focusable control", async () => {
    render(
      <>
        <BeadEditorWorkspace
          labels={labels}
          viewControls={<button type="button">视图一</button>}
          editControls={<button type="button">其他工作区画笔</button>}
          inspectorControls={<input aria-label="压合厚度一" />}
          canvas={<div>画布一</div>}
        />
        <BeadEditorWorkspace
          labels={labels}
          viewControls={<button type="button">视图二</button>}
          editControls={<span>没有可聚焦编辑控件</span>}
          inspectorControls={<input aria-label="压合厚度二" />}
          canvas={<div>画布二</div>}
        />
        <button type="button">页面其他按钮</button>
      </>,
    );
    const [, secondWorkspace] = screen.getAllByTestId("bead-editor-workspace");
    const pageButton = screen.getByRole("button", { name: "页面其他按钮" });
    pageButton.focus();

    fireEvent.click(
      within(secondWorkspace).getByRole("button", { name: labels.openEdit }),
    );
    await waitFor(() =>
      expect(secondWorkspace).toHaveAttribute("data-mobile-drawer", "edit"),
    );
    expect(pageButton).toHaveFocus();
    expect(screen.getByRole("button", { name: "其他工作区画笔" })).not.toHaveFocus();
  });

  it("uses its semantic floating controls and inspector wrappers for the supplied children", () => {
    const { container } = renderWorkspace();
    const workspace = screen.getByTestId("bead-editor-workspace");
    const canvasLayer = screen.getByTestId("bead-canvas").parentElement;
    const overlay = canvasLayer?.nextElementSibling;
    const magnifierLayer = screen.getByTestId("bead-magnifier").parentElement;
    const editDock = screen.getByRole("complementary", { name: labels.edit });
    const inspectorDock = screen.getByRole("complementary", {
      name: labels.inspector,
    });

    expect(canvasLayer).toHaveClass("bead-editor-workspace__canvas");
    expect(overlay).toHaveClass("bead-editor-workspace__overlay");
    expect(overlay?.parentElement).toBe(workspace);
    expect(overlay?.querySelector(".bead-editor-workspace__views")).not.toBeNull();
    expect(
      overlay?.querySelector(".bead-editor-workspace__mobile-actions"),
    ).not.toBeNull();
    expect(magnifierLayer).toHaveClass("bead-editor-workspace__magnifier");

    expect(editDock).toHaveClass(
      "bead-editor-dock",
      "bead-editor-dock--left",
      "bead-editor-floating-controls",
    );
    expect(inspectorDock).toHaveClass(
      "bead-editor-dock",
      "bead-editor-dock--right",
      "bead-editor-inspector",
    );
    for (const dock of [editDock, inspectorDock]) {
      expect(dock.querySelector(".bead-editor-dock__header")).not.toBeNull();
      expect(dock.querySelector(".bead-editor-dock__body")).not.toBeNull();
    }
    for (const trigger of container.querySelectorAll<HTMLButtonElement>(
      "button[aria-controls]",
    )) {
      expect(trigger).not.toBeEmptyDOMElement();
      expect(trigger.textContent?.trim()).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "画笔" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "压合厚度" })).toBeInTheDocument();
  });
});
