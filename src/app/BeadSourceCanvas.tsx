import { useEffect, useRef, type PointerEvent } from "react";

import type { BeadGridGeometry, Raster } from "../domain/types";
import { cx } from "../ui/panelPrimitives";

export type CalibrationPickMode =
  | "none"
  | "empty"
  | "transparent-support";

interface BeadSourceCanvasProps {
  source: Raster;
  rows: number;
  columns: number;
  geometry: BeadGridGeometry;
  ariaLabel: string;
  pickMode?: CalibrationPickMode;
  emptyCellIndex?: number | null;
  transparentSupportCellIndex?: number | null;
  onPickCell?(cellIndex: number): void;
  className?: string;
}

function drawRaster(
  context: CanvasRenderingContext2D,
  source: Raster,
): void {
  const imageData = context.createImageData(source.width, source.height);
  imageData.data.set(source.data);
  context.putImageData(imageData, 0, 0);
}

function drawSelection(
  context: CanvasRenderingContext2D,
  geometry: BeadGridGeometry,
  columns: number,
  cellIndex: number,
  color: string,
): void {
  const row = Math.floor(cellIndex / columns);
  const column = cellIndex % columns;
  context.save();
  context.fillStyle = color;
  context.fillRect(
    geometry.originX + column * geometry.cellWidth,
    geometry.originY + row * geometry.cellHeight,
    geometry.cellWidth,
    geometry.cellHeight,
  );
  context.restore();
}

function drawGrid(
  context: CanvasRenderingContext2D,
  geometry: BeadGridGeometry,
  rows: number,
  columns: number,
): void {
  context.save();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(37, 99, 235, 0.82)";
  context.beginPath();
  for (let column = 0; column <= columns; column += 1) {
    const x = geometry.originX + column * geometry.cellWidth;
    context.moveTo(x, geometry.originY);
    context.lineTo(
      x,
      geometry.originY + rows * geometry.cellHeight,
    );
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = geometry.originY + row * geometry.cellHeight;
    context.moveTo(geometry.originX, y);
    context.lineTo(
      geometry.originX + columns * geometry.cellWidth,
      y,
    );
  }
  context.stroke();
  context.restore();
}

export function BeadSourceCanvas({
  source,
  rows,
  columns,
  geometry,
  ariaLabel,
  pickMode = "none",
  emptyCellIndex = null,
  transparentSupportCellIndex = null,
  onPickCell,
  className,
}: BeadSourceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    canvas.width = source.width;
    canvas.height = source.height;
    context.clearRect(0, 0, source.width, source.height);
    drawRaster(context, source);
    if (emptyCellIndex !== null) {
      drawSelection(
        context,
        geometry,
        columns,
        emptyCellIndex,
        "rgba(37, 99, 235, 0.26)",
      );
    }
    if (transparentSupportCellIndex !== null) {
      drawSelection(
        context,
        geometry,
        columns,
        transparentSupportCellIndex,
        "rgba(14, 165, 233, 0.34)",
      );
    }
    drawGrid(context, geometry, rows, columns);
  }, [
    columns,
    emptyCellIndex,
    geometry,
    rows,
    source,
    transparentSupportCellIndex,
  ]);

  const handlePointer = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pickMode === "none" || !onPickCell) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      event.clientX < bounds.left ||
      event.clientY < bounds.top ||
      event.clientX >= bounds.right ||
      event.clientY >= bounds.bottom
    ) {
      return;
    }
    const sourceX =
      ((event.clientX - bounds.left) / bounds.width) * source.width;
    const sourceY =
      ((event.clientY - bounds.top) / bounds.height) * source.height;
    const column = Math.floor(
      (sourceX - geometry.originX) / geometry.cellWidth,
    );
    const row = Math.floor(
      (sourceY - geometry.originY) / geometry.cellHeight,
    );
    if (
      row < 0 ||
      column < 0 ||
      row >= rows ||
      column >= columns
    ) {
      return;
    }
    onPickCell(row * columns + column);
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handlePointer}
      className={cx(
        "bead-canvas",
        pickMode !== "none" && "bead-canvas--interactive",
        className,
      )}
    />
  );
}
