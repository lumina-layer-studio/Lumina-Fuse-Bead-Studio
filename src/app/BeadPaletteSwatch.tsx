import { useEffect, useRef } from "react";

import type { RgbColor } from "../domain/types";

/**
 * 豆子色样的受控属性。
 * Controlled properties for a bead-shaped palette swatch.
 */
export interface BeadPaletteSwatchProps {
  color: RgbColor;
  compression: number;
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

function traceSuperellipse(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  exponent: number,
): void {
  const segments = 48;
  context.beginPath();
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x = centerX +
      radius * Math.sign(cosine) * Math.pow(Math.abs(cosine), 2 / exponent);
    const y = centerY +
      radius * Math.sign(sine) * Math.pow(Math.abs(sine), 2 / exponent);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function drawBead(
  context: CanvasRenderingContext2D,
  color: RgbColor,
  compression: number,
): void {
  const pressure = Math.max(0, Math.min(1, compression / 100));
  const solid = pressure >= 1;
  const exponent = pressure < 0.82 ? 2 : 2 + (pressure - 0.82) / 0.18 * 3.5;
  const outerRadius = 22.5 + pressure * 1.2;
  const holeRadius = solid ? 0 : 7.2 * Math.pow(1 - pressure, 0.72) + 2.1;
  const centerX = 32;
  const centerY = 30.5;

  context.clearRect(0, 0, 64, 64);
  context.save();

  context.fillStyle = "rgba(15, 23, 42, 0.2)";
  context.beginPath();
  context.ellipse(centerX + 1.5, 54, 19, 4.6, 0, 0, Math.PI * 2);
  context.fill();

  traceSuperellipse(
    context,
    centerX + 1.1,
    centerY + 2.2,
    outerRadius,
    exponent,
  );
  context.fillStyle = mixColor(color, 0, 0.32);
  context.fill();

  traceSuperellipse(context, centerX, centerY, outerRadius, exponent);
  context.fillStyle = `rgb(${color.join(" ")})`;
  context.fill();

  context.lineWidth = 2.8;
  context.lineCap = "round";
  context.strokeStyle = "rgba(255, 255, 255, 0.46)";
  context.beginPath();
  context.arc(centerX - 1, centerY - 1, outerRadius - 4, Math.PI * 1.08, Math.PI * 1.62);
  context.stroke();

  context.strokeStyle = "rgba(15, 23, 42, 0.2)";
  context.beginPath();
  context.arc(centerX + 1, centerY + 1, outerRadius - 3.5, Math.PI * 0.08, Math.PI * 0.62);
  context.stroke();

  if (holeRadius > 0) {
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(centerX, centerY, holeRadius, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = "source-over";
    context.lineWidth = 2.2;
    context.strokeStyle = mixColor(color, 0, 0.4);
    context.beginPath();
    context.arc(centerX, centerY, holeRadius + 1, Math.PI * 0.08, Math.PI * 1.08);
    context.stroke();
    context.strokeStyle = mixColor(color, 255, 0.38);
    context.beginPath();
    context.arc(centerX, centerY, holeRadius + 0.6, Math.PI * 1.08, Math.PI * 1.7);
    context.stroke();
  }

  context.restore();
}

/**
 * 可选择的豆子色样；使用轻量 Canvas 材质缩略图表达当前熨烫形态。
 * Selectable bead color swatch rendered as a lightweight Canvas material preview.
 */
export function BeadPaletteSwatch({
  color,
  compression,
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
    drawBead(context, color, compression);
  }, [color, compression]);

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
        data-bead-shape={compression >= 100 ? "solid" : "holed"}
        width={64}
        height={64}
      />
    </button>
  );
}
