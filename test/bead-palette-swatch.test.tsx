import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeadPaletteSwatch } from "../src/app/BeadPaletteSwatch";

describe("BeadPaletteSwatch", () => {
  it("renders the palette color as a tilted upright bead cylinder", () => {
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      bezierCurveTo: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const onSelect = vi.fn();
    render(
      <BeadPaletteSwatch
        color={[230, 40, 50]}
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
    expect(glyph).toHaveAttribute("width", "72");
    expect(glyph).toHaveAttribute("height", "64");
    expect(glyph).toHaveAttribute("data-bead-view", "angled-cylinder");
    expect(context.bezierCurveTo).toHaveBeenCalled();
    expect(context.ellipse).toHaveBeenCalled();

    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
