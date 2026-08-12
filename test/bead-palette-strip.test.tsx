import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeadPaletteStrip } from "../src/app/BeadPaletteStrip";

const palettePreviewCapture = vi.hoisted(() => ({
  colors: [] as Array<readonly [number, number, number]>,
}));

vi.mock("../src/app/BeadPaletteThreePreview", () => ({
  BeadPaletteThreePreview: ({
    colors,
    colorLabel,
    activeIndex,
    onSelect,
  }: {
    colors: Array<readonly [number, number, number]>;
    colorLabel(index: number): string;
    activeIndex: number;
    onSelect(index: number): void;
  }) => {
    palettePreviewCapture.colors = colors;
    return (
      <div data-testid="bead-palette-three-preview">
        {colors.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label={colorLabel(index)}
            aria-pressed={activeIndex === index}
            data-bead-view="shared-webgl-upright-cylinder"
            data-palette-index={index}
            onClick={() => onSelect(index)}
          />
        ))}
      </div>
    );
  },
}));

describe("BeadPaletteStrip", () => {
  it("turns vertical wheel input into horizontal palette navigation", () => {
    const onSelect = vi.fn();
    render(
      <BeadPaletteStrip
        colors={[[230, 40, 50], [20, 120, 210]]}
        activeIndex={0}
        label="豆子颜色"
        colorLabel={(index) => `颜色 ${index + 1}`}
        previousLabel="查看前面的颜色"
        nextLabel="查看更多颜色"
        addLabel="添加自定义颜色"
        onSelect={onSelect}
        onAdd={vi.fn()}
      />,
    );

    const scroller = screen.getByTestId("bead-palette-scroll");
    expect(
      screen.getByTestId("bead-palette-three-preview"),
    ).toBeInTheDocument();
    expect(palettePreviewCapture.colors).toEqual([
      [230, 40, 50],
      [20, 120, 210],
    ]);
    expect(
      screen.getByRole("button", { name: "颜色 1" }),
    ).toHaveAttribute("data-bead-view", "shared-webgl-upright-cylinder");
    fireEvent.click(screen.getByRole("button", { name: "颜色 2" }));
    expect(onSelect).toHaveBeenCalledWith(1);
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

    scroller.scrollLeft = 655;
    fireEvent.click(screen.getByRole("button", { name: "查看更多颜色" }));
    expect(scroller.scrollLeft).toBe(660);

    scroller.scrollLeft = 5;
    fireEvent.click(screen.getByRole("button", { name: "查看前面的颜色" }));
    expect(scroller.scrollLeft).toBe(0);
  });

  it("keeps adding a color pinned outside the scrollable swatches", () => {
    const onAdd = vi.fn();
    const { rerender } = render(
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

    fireEvent.input(addInput, { target: { value: "#111111" } });
    fireEvent.input(addInput, { target: { value: "#223344" } });
    fireEvent.input(addInput, { target: { value: "#123456" } });
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.change(addInput, { target: { value: "#123456" } });
    expect(onAdd).toHaveBeenCalledWith([18, 52, 86]);
    expect(onAdd).toHaveBeenCalledTimes(1);

    const latestOnAdd = vi.fn();
    rerender(
      <BeadPaletteStrip
        colors={[[18, 52, 86]]}
        activeIndex={0}
        label="豆子颜色"
        colorLabel={(index) => `颜色 ${index + 1}`}
        previousLabel="查看前面的颜色"
        nextLabel="查看更多颜色"
        addLabel="添加自定义颜色"
        onSelect={vi.fn()}
        onAdd={latestOnAdd}
      />,
    );
    fireEvent.change(addInput, { target: { value: "#abcdef" } });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(latestOnAdd).toHaveBeenCalledWith([171, 205, 239]);
  });

  it("centers the active bead and clamps the first and last colors", () => {
    const { rerender } = render(
      <BeadPaletteStrip
        colors={[[230, 40, 50], [20, 120, 210], [10, 20, 30]]}
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
    const first = screen.getByRole("button", { name: "颜色 1" });
    const middle = screen.getByRole("button", { name: "颜色 2" });
    const last = screen.getByRole("button", { name: "颜色 3" });
    Object.defineProperties(scroller, {
      clientWidth: { value: 100 },
      scrollWidth: { value: 300 },
    });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
    } as DOMRect);
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 54,
      width: 54,
    } as DOMRect);
    vi.spyOn(middle, "getBoundingClientRect").mockReturnValue({
      left: 173,
      right: 227,
      width: 54,
    } as DOMRect);
    vi.spyOn(last, "getBoundingClientRect").mockReturnValue({
      left: 270,
      right: 324,
      width: 54,
    } as DOMRect);

    rerender(
      <BeadPaletteStrip
        colors={[[230, 40, 50], [20, 120, 210], [10, 20, 30]]}
        activeIndex={1}
        label="豆子颜色"
        colorLabel={(index) => `颜色 ${index + 1}`}
        previousLabel="查看前面的颜色"
        nextLabel="查看更多颜色"
        addLabel="添加自定义颜色"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    expect(scroller.scrollLeft).toBe(150);

    rerender(
      <BeadPaletteStrip
        colors={[[230, 40, 50], [20, 120, 210], [10, 20, 30]]}
        activeIndex={2}
        label="豆子颜色"
        colorLabel={(index) => `颜色 ${index + 1}`}
        previousLabel="查看前面的颜色"
        nextLabel="查看更多颜色"
        addLabel="添加自定义颜色"
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    expect(scroller.scrollLeft).toBe(200);
  });
});
