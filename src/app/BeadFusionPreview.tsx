import { useId, useMemo } from "react";

import {
  buildBeadFusionGeometry,
  type FusionPoint,
} from "../domain/fusionGeometry";
import type { BeadProject } from "../domain/types";
import { cx } from "../ui/panelPrimitives";

interface BeadFusionPreviewProps {
  project: BeadProject;
  ariaLabel: string;
  className?: string;
}

function contourPath(points: readonly FusionPoint[]): string {
  return `${points
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"} ${x.toFixed(5)} ${y.toFixed(5)}`,
    )
    .join(" ")} Z`;
}

export function BeadFusionPreview({
  project,
  ariaLabel,
  className,
}: BeadFusionPreviewProps) {
  const rawMaskId = useId();
  const maskId = `bead-fusion-${rawMaskId.replaceAll(":", "")}`;
  const geometry = useMemo(
    () =>
      buildBeadFusionGeometry(
        project,
        project.compression,
        project.irregularity ?? 0,
      ),
    [project],
  );
  const padding = 0.08;
  const viewBox = [
    -padding,
    -padding,
    project.columns + padding * 2,
    project.rows + padding * 2,
  ].join(" ");

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={viewBox}
      className={cx("bead-fusion-preview", className)}
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-padding}
          y={-padding}
          width={project.columns + padding * 2}
          height={project.rows + padding * 2}
        >
          <rect
            x={-padding}
            y={-padding}
            width={project.columns + padding * 2}
            height={project.rows + padding * 2}
            fill="white"
          />
          {geometry.holeRadius > 0
            ? geometry.contours.map((contour) => (
                <circle
                  key={`hole-${contour.cellIndex}`}
                  cx={contour.center.x}
                  cy={contour.center.y}
                  r={geometry.holeRadius}
                  fill="black"
                />
              ))
            : null}
          {geometry.junctionRadius > 0
            ? geometry.junctions.map((junction) => (
                <circle
                  key={`junction-${junction.x}-${junction.y}`}
                  cx={junction.x}
                  cy={junction.y}
                  r={geometry.junctionRadius}
                  fill="black"
                />
              ))
            : null}
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {geometry.contours.flatMap((contour) => {
          const cell = project.cells[contour.cellIndex];
          if (cell.kind !== "color") return [];
          const color = project.palette[cell.paletteIndex];
          return [
            <path
              key={contour.cellIndex}
              d={contourPath(contour.points)}
              fill={`rgb(${color[0]} ${color[1]} ${color[2]})`}
            />,
          ];
        })}
      </g>
    </svg>
  );
}
