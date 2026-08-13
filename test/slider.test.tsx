import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import Slider from "../src/ui/Slider";

it("keeps the slider label stable while the visible value changes", () => {
  const view = render(
    <Slider
      label="压合程度"
      value={99}
      min={0}
      max={100}
      onChange={vi.fn()}
    />,
  );

  const label = screen.getByText("压合程度");
  const slider = screen.getByRole("slider", {
    name: "压合程度",
  });
  expect(label.id).not.toBe("");
  expect(slider).toHaveAttribute("aria-labelledby", label.id);

  view.rerender(
    <Slider
      label="压合程度"
      value={0}
      min={0}
      max={100}
      onChange={vi.fn()}
    />,
  );

  expect(screen.getByText("0")).toBeInTheDocument();
  expect(slider).toHaveAccessibleName("压合程度");
});
