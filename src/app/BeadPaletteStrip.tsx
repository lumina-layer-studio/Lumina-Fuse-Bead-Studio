import { useEffect, useRef } from "react";

import type { RgbColor } from "../domain/types";
import { BeadPaletteSwatch } from "./BeadPaletteSwatch";

/**
 * 豆子色板横向导航所需的受控属性。
 * Controlled properties for horizontal bead-palette navigation.
 */
export interface BeadPaletteStripProps {
  colors: RgbColor[];
  activeIndex: number;
  label: string;
  colorLabel(index: number): string;
  previousLabel: string;
  nextLabel: string;
  addLabel: string;
  onSelect(index: number): void;
  onAdd(color: RgbColor): void;
}

function fromHex(value: string): RgbColor | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return [
    (number >> 16) & 255,
    (number >> 8) & 255,
    number & 255,
  ];
}

function toHex(color: RgbColor): string {
  return `#${color
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * 横向浏览豆子色样，并将普通滚轮转换成水平导航。
 * Browses bead swatches horizontally and maps a regular wheel to that axis.
 */
export function BeadPaletteStrip({
  colors,
  activeIndex,
  label,
  colorLabel,
  previousLabel,
  nextLabel,
  addLabel,
  onSelect,
  onAdd,
}: BeadPaletteStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeColor = colors[activeIndex] ?? colors[0] ?? [0, 0, 0];

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      scroller.scrollLeft += delta;
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  const scrollByPage = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    scroller.scrollLeft += direction * Math.max(160, scroller.clientWidth * 0.8);
  };

  return (
    <div className="bead-editor-palette-strip" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="bead-editor-palette-strip__body">
        <button
          type="button"
          className="bead-editor-palette-nav"
          aria-label={previousLabel}
          onClick={() => scrollByPage(-1)}
        >
          ‹
        </button>
        <div
          ref={scrollerRef}
          className="palette-row"
          data-testid="bead-palette-scroll"
        >
          {colors.map((color, index) => (
            <BeadPaletteSwatch
              key={`${color.join("-")}-${index}`}
              color={color}
              label={colorLabel(index)}
              selected={activeIndex === index}
              onSelect={() => onSelect(index)}
            />
          ))}
        </div>
        <button
          type="button"
          className="bead-editor-palette-nav"
          aria-label={nextLabel}
          onClick={() => scrollByPage(1)}
        >
          ›
        </button>
        <label className="bead-editor-palette-add" title={addLabel}>
          <span aria-hidden>+</span>
          <input
            type="color"
            aria-label={addLabel}
            value={toHex(activeColor)}
            onChange={(event) => {
              const color = fromHex(event.target.value);
              if (color !== null) onAdd(color);
            }}
          />
        </label>
      </div>
    </div>
  );
}
