import { useEffect, useRef } from "react";

import type { RgbColor } from "../domain/types";

/**
 * 豆子色样的受控属性。
 * Controlled properties for a bead-shaped palette swatch.
 */
export interface BeadPaletteSwatchProps {
  color: RgbColor;
  label: string;
  selected: boolean;
  onSelect(): void;
}

function clampChannel(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)));
}

function mixColor(
  color: RgbColor,
  target: number,
  amount: number,
): string {
  return `rgb(${color.map((channel) =>
    clampChannel(channel + (target - channel) * amount),
  ).join(" ")})`;
}

function traceCylinderSide(
  context: CanvasRenderingContext2D,
): void {
  context.beginPath();
  context.moveTo(13.5, 26.5);
  context.bezierCurveTo(12.8, 33, 12.4, 40.5, 13.2, 44.5);
  context.bezierCurveTo(15.8, 51, 29, 55.5, 42.2, 55.5);
  context.bezierCurveTo(55.8, 55.5, 67, 50.8, 68.2, 44.2);
  context.lineTo(68.8, 28.4);
  context.closePath();
}

function traceTopFace(context: CanvasRenderingContext2D): void {
  context.beginPath();
  context.ellipse(41, 27.5, 28, 15.8, 0.16, 0, Math.PI * 2);
  context.closePath();
}

function drawBead(
  context: CanvasRenderingContext2D,
  color: RgbColor,
): void {
  context.clearRect(0, 0, 72, 64);
  context.save();

  context.fillStyle = "rgba(15, 23, 42, 0.2)";
  context.beginPath();
  context.ellipse(42, 57.3, 26.5, 4.2, 0.08, 0, Math.PI * 2);
  context.fill();

  traceCylinderSide(context);
  context.fillStyle = mixColor(color, 0, 0.32);
  context.fill();

  context.lineWidth = 2;
  context.strokeStyle = mixColor(color, 0, 0.48);
  context.beginPath();
  context.moveTo(14, 42);
  context.bezierCurveTo(18, 49, 31, 52.5, 42.5, 52.5);
  context.bezierCurveTo(55.5, 52.5, 65, 48.5, 68, 43);
  context.stroke();

  traceTopFace(context);
  context.fillStyle = `rgb(${color.join(" ")})`;
  context.fill();

  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 255, 255, 0.52)";
  context.beginPath();
  context.ellipse(37, 23.5, 20, 9.2, 0.16, Math.PI * 1.08, Math.PI * 1.68);
  context.stroke();

  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.ellipse(41, 27.4, 9.8, 5.7, 0.16, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
  context.lineWidth = 2.4;
  context.strokeStyle = mixColor(color, 0, 0.46);
  context.beginPath();
  context.ellipse(41, 27.4, 10.3, 6.1, 0.16, 0, Math.PI * 2);
  context.stroke();

  context.restore();
}

/**
 * 可选择的豆子色样；使用轻量 Canvas 材质缩略图表达当前熨烫形态。
 * Selectable bead color swatch rendered as a lightweight Canvas material preview.
 */
export function BeadPaletteSwatch({
  color,
  label,
  selected,
  onSelect,
}: BeadPaletteSwatchProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (context === null || context === undefined) return;
    if (
      typeof context.ellipse !== "function" ||
      typeof context.arc !== "function"
    ) return;
    if (typeof context.bezierCurveTo !== "function") return;
    drawBead(context, color);
  }, [color]);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      className="palette-swatch"
      onClick={onSelect}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="palette-swatch__bead"
        data-bead-view="angled-cylinder"
        width={72}
        height={64}
      />
    </button>
  );
}
