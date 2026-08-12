import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeadPaletteStrip } from "../src/app/BeadPaletteStrip";

describe("BeadPaletteStrip", () => {
  it("turns vertical wheel input into horizontal palette navigation", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(
      <BeadPaletteStrip
        colors={[[230, 40, 50], [20, 120, 210]]}
        activeIndex={0}
        label="豆子颜色"
        colorLabel={(index) => `颜色 ${index + 1}`}
        previousLabel="查看前面的颜色"
        nextLabel="查看更多颜色"
        addLabel="添加自定义颜色"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const scroller = screen.getByTestId("bead-palette-scroll");
    Object.defineProperty(scroller, "scrollWidth", { value: 900 });
    Object.defineProperty(scroller, "clientWidth", { value: 240 });
    scroller.scrollLeft = 15;

    const allowed = fireEvent.wheel(scroller, {
      deltaY: 120,
      cancelable: true,
    });

    expect(allowed).toBe(false);
    expect(scroller.scrollLeft).toBe(135);

    fireEvent.click(screen.getByRole("button", { name: "查看更多颜色" }));
    expect(scroller.scrollLeft).toBe(327);
    fireEvent.click(screen.getByRole("button", { name: "查看前面的颜色" }));
    expect(scroller.scrollLeft).toBe(135);
  });

  it("keeps adding a color pinned outside the scrollable swatches", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const onAdd = vi.fn();
    render(
      <BeadPaletteStrip
        colors={Array.from({ length: 41 }, (_, index) => [
          index,
          100,
          200,
        ])}
        activeIndex={40}
        label="豆子颜色"
        colorLabel={(index) => `颜色 ${index + 1}`}
        previousLabel="查看前面的颜色"
        nextLabel="查看更多颜色"
        addLabel="添加自定义颜色"
        onSelect={vi.fn()}
        onAdd={onAdd}
      />,
    );

    const scroller = screen.getByTestId("bead-palette-scroll");
    const addInput = screen.getByLabelText("添加自定义颜色");
    expect(scroller).not.toContainElement(addInput);
    expect(addInput.closest(".bead-editor-palette-add")).toBeInTheDocument();

    fireEvent.change(addInput, { target: { value: "#123456" } });
    expect(onAdd).toHaveBeenCalledWith([18, 52, 86]);
  });
});
