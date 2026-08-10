import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  buildPhysicalPreviewModel,
  type PhysicalPreviewModel,
} from "../domain/physicalPreviewModel";
import type { BeadProject } from "../domain/types";
import { cx } from "../ui/panelPrimitives";
import {
  createBeadFusionSurfaceRenderer,
  type BeadFusionSurfaceRenderer,
} from "../worker/previewRenderer";
import { BeadFusionPreview } from "./BeadFusionPreview";
import {
  createBeadThreePreviewController,
  type BeadThreePreviewController,
  type CreateBeadThreePreviewController,
} from "./beadThreePreviewController";

export interface BeadThreePreviewProps {
  project: BeadProject;
  ariaLabel: string;
  className?: string;
  createController?: CreateBeadThreePreviewController;
  createSurfaceRenderer?: () => BeadFusionSurfaceRenderer;
}

const MAX_DEVICE_PIXEL_RATIO = 1.5;
const SURFACE_RENDER_DELAY_MS = 120;

export const MAX_THREE_PREVIEW_BEADS = 4_096;

export function supportsBeadThreePreviewCount(beadCount: number): boolean {
  return Number.isInteger(beadCount) &&
    beadCount >= 0 &&
    beadCount <= MAX_THREE_PREVIEW_BEADS;
}

export function BeadThreePreview({
  project,
  ariaLabel,
  className,
  createController = createBeadThreePreviewController,
  createSurfaceRenderer,
}: BeadThreePreviewProps) {
  const [unavailable, setUnavailable] = useState(false);
  const [model, setModel] = useState<PhysicalPreviewModel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<BeadThreePreviewController | null>(null);
  const createControllerRef = useRef(createController);
  const reportUnavailableRef = useRef<() => void>(() => undefined);
  const rendererFactory =
    createSurfaceRenderer ?? createBeadFusionSurfaceRenderer;
  const coloredBeadCount = project.cells.reduce(
    (count, cell) => count + (cell.kind === "color" ? 1 : 0),
    0,
  );
  const supportsThreePreview = supportsBeadThreePreviewCount(
    coloredBeadCount,
  );

  useLayoutEffect(() => {
    if (!supportsThreePreview) return undefined;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (container === null || canvas === null) return;

    let active = true;
    let observer: ResizeObserver | null = null;
    let resize: (() => void) | null = null;
    let listeningToWindow = false;
    let unavailableDuringCreation = false;
    const disposeController = () => {
      const controller = controllerRef.current;
      controllerRef.current = null;
      controller?.dispose();
    };
    const stopWatchingSize = () => {
      observer?.disconnect();
      observer = null;
      if (listeningToWindow && resize !== null) {
        window.removeEventListener("resize", resize);
        listeningToWindow = false;
      }
    };
    const reportUnavailable = () => {
      if (!active) return;
      unavailableDuringCreation = true;
      stopWatchingSize();
      disposeController();
      setUnavailable(true);
    };
    const cleanup = () => {
      active = false;
      stopWatchingSize();
      reportUnavailableRef.current = () => undefined;
      disposeController();
    };
    reportUnavailableRef.current = reportUnavailable;

    try {
      const controller = createControllerRef.current(
        canvas,
        reportUnavailable,
      );
      if (unavailableDuringCreation) {
        controller.dispose();
        return cleanup;
      }
      controllerRef.current = controller;
      resize = () => {
        if (controllerRef.current !== controller) return;
        const bounds = container.getBoundingClientRect();
        const pixelRatio = Math.min(
          Math.max(window.devicePixelRatio || 1, 1),
          MAX_DEVICE_PIXEL_RATIO,
        );
        try {
          controller.resize(bounds.width, bounds.height, pixelRatio);
        } catch {
          reportUnavailable();
        }
      };
      if (typeof ResizeObserver === "function") {
        observer = new ResizeObserver(resize);
        observer.observe(container);
      } else {
        window.addEventListener("resize", resize);
        listeningToWindow = true;
      }
      resize();

      return cleanup;
    } catch {
      reportUnavailable();
      return cleanup;
    }
  }, [supportsThreePreview]);

  useEffect(() => {
    if (
      unavailable ||
      !supportsThreePreview ||
      controllerRef.current === null
    ) {
      return undefined;
    }
    let active = true;
    let renderer: BeadFusionSurfaceRenderer | null = null;
    let timer: number | null = null;
    setModel(null);
    const startRender = () => {
      if (!active) return;
      try {
        renderer = rendererFactory();
        void renderer
          .render(project)
          .then((surfacePaths) => {
            if (!active) return;
            setModel(
              buildPhysicalPreviewModel(project, surfacePaths),
            );
          })
          .catch(() => {
            if (active) reportUnavailableRef.current();
          });
      } catch {
        if (active) reportUnavailableRef.current();
      }
    };
    if (createSurfaceRenderer === undefined) {
      timer = window.setTimeout(startRender, SURFACE_RENDER_DELAY_MS);
    } else {
      startRender();
    }
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      renderer?.dispose();
    };
  }, [
    createSurfaceRenderer,
    project,
    rendererFactory,
    supportsThreePreview,
    unavailable,
  ]);

  useEffect(() => {
    if (unavailable || model === null) return;
    try {
      controllerRef.current?.update(model);
    } catch {
      reportUnavailableRef.current();
    }
  }, [model, unavailable]);

  if (unavailable || !supportsThreePreview) {
    return (
      <BeadFusionPreview
        project={project}
        ariaLabel={ariaLabel}
        className={className}
      />
    );
  }

  return (
    <div ref={containerRef} className={cx("bead-three-preview", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        aria-busy={model === null}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
