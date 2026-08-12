import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeadPaletteSwatch } from "../src/app/BeadPaletteSwatch";

describe("BeadPaletteSwatch", () => {
  it("renders a selectable bead glyph instead of a flat color dot", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const onSelect = vi.fn();
    const { rerender } = render(
      <BeadPaletteSwatch
        color={[230, 40, 50]}
        compression={50}
        label="颜色 1"
        selected
        onSelect={onSelect}
      />,
    );

    const button = screen.getByRole("button", { name: "颜色 1" });
    const glyph = button.querySelector("canvas");
    expect(button).toHaveClass("palette-swatch");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(glyph).toHaveClass("palette-swatch__bead");
    expect(glyph).toHaveAttribute("width", "64");
    expect(glyph).toHaveAttribute("height", "64");
    expect(glyph).toHaveAttribute("data-bead-shape", "holed");

    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(
      <BeadPaletteSwatch
        color={[230, 40, 50]}
        compression={100}
        label="颜色 1"
        selected={false}
        onSelect={onSelect}
      />,
    );
    expect(button.querySelector("canvas")).toHaveAttribute(
      "data-bead-shape",
      "solid",
    );
  });
});
