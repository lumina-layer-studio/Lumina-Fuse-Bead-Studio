import { useEffect, useId, useState } from "react";

import {
  buildBeadFusionPreviewSvg,
  type BeadFusionPreviewSvg,
} from "../domain/svgRenderer";
import type { BeadProject } from "../domain/types";
import { cx } from "../ui/panelPrimitives";
import {
  createBeadFusionPreviewRenderer,
  type BeadFusionPreviewRenderer,
} from "../worker/previewRenderer";

interface BeadFusionPreviewProps {
  project: BeadProject;
  ariaLabel: string;
  className?: string;
  createPreviewRenderer?: () => BeadFusionPreviewRenderer;
}

export function BeadFusionPreview({
  project,
  ariaLabel,
  className,
  createPreviewRenderer,
}: BeadFusionPreviewProps) {
  const [preview, setPreview] = useState<BeadFusionPreviewSvg | null>(
    () =>
      createPreviewRenderer === undefined &&
      typeof globalThis.Worker === "undefined"
        ? buildBeadFusionPreviewSvg(project)
        : null,
  );
  const rendererFactory =
    createPreviewRenderer ?? createBeadFusionPreviewRenderer;
  useEffect(() => {
    let active = true;
    const renderer = rendererFactory();
    void renderer
      .render(project)
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      renderer.dispose();
    };
  }, [project, rendererFactory]);
  const maskId = `bead-relief-${useId().replaceAll(":", "")}`;
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
      aria-busy={preview === null}
      viewBox={viewBox}
      className={cx("bead-fusion-preview", className)}
    >
      {preview?.reliefD ? (
        <defs>
          <mask
            id={maskId}
            data-bead-relief-mask
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={project.columns}
            height={project.rows}
          >
            <rect
              x={0}
              y={0}
              width={project.columns}
              height={project.rows}
              fill="white"
            />
            <path
              data-bead-relief-path
              d={preview.reliefD}
              fill="black"
            />
          </mask>
        </defs>
      ) : null}
      <g
        data-bead-fusion-colors
        mask={preview?.reliefD ? `url(#${maskId})` : undefined}
      >
        {(preview?.paths ?? []).map(
          ({ cellIndex, d, fill, strokeWidth }) => (
            <path
              key={cellIndex}
              data-bead-fusion-path
              d={d}
              fill={fill}
              fillRule="evenodd"
              stroke={strokeWidth > 0 ? fill : undefined}
              strokeWidth={strokeWidth > 0 ? strokeWidth : undefined}
              strokeLinejoin={strokeWidth > 0 ? "round" : undefined}
              paintOrder={strokeWidth > 0 ? "stroke fill" : undefined}
            />
          ),
        )}
      </g>
    </svg>
  );
}
