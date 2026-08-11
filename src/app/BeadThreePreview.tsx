import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  buildPhysicalPreviewModel,
  type PhysicalPreviewModel,
} from "../domain/physicalPreviewModel";
import type { BeadProject } from "../domain/types";
import {
  normalizeLocale,
  translate as translateMessage,
} from "../i18n/translations";
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
  onPickCell?(cellIndex: number): void;
  allowDrag?: boolean;
  selectedCellIndex?: number | null;
  translate?(key: string): string;
}

const MAX_DEVICE_PIXEL_RATIO = 1.5;
const SURFACE_RENDER_DELAY_MS = 120;
const VIEW_BUTTON_CLASS_NAME = "button button--secondary button--small";
const CLICK_MOVE_THRESHOLD_PX = 6;

export const MAX_THREE_PREVIEW_BEADS = 4_096;

interface PendingSurfaceRender {
  project: BeadProject;
  requestVersion: number;
  ready: boolean;
}

interface PublishedProjectRevision {
  project: BeadProject;
  revision: number;
}

interface ExactPreviewState {
  model: PhysicalPreviewModel;
  revision: number;
}

type ThreeInteractionMode = "edit" | "view";

interface ActiveEditGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  allowDrag: boolean;
  movedBeyondClickThreshold: boolean;
  visitedCellIndices: Set<number>;
}

export function supportsBeadThreePreviewCount(beadCount: number): boolean {
  return Number.isInteger(beadCount) &&
    beadCount >= 0 &&
    beadCount <= MAX_THREE_PREVIEW_BEADS;
}

function defaultTranslate(key: string): string {
  const documentLanguage =
    typeof document === "undefined" ? "" : document.documentElement.lang;
  const browserLanguage =
    typeof navigator === "undefined" ? "en-US" : navigator.language;
  return translateMessage(
    normalizeLocale(documentLanguage || browserLanguage),
    key,
  );
}

export function BeadThreePreview({
  project,
  ariaLabel,
  className,
  createController = createBeadThreePreviewController,
  createSurfaceRenderer,
  onPickCell,
  allowDrag = false,
  selectedCellIndex = null,
  translate = defaultTranslate,
}: BeadThreePreviewProps) {
  const [unavailable, setUnavailable] = useState(false);
  const [exactState, setExactState] = useState<ExactPreviewState | null>(
    null,
  );
  const [interactionMode, setInteractionMode] =
    useState<ThreeInteractionMode>("edit");
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<BeadThreePreviewController | null>(null);
  const editGestureRef = useRef<ActiveEditGesture | null>(null);
  const onPickCellRef = useRef(onPickCell);
  const allowDragRef = useRef(allowDrag);
  const selectedCellIndexRef = useRef(selectedCellIndex);
  const interactionModeRef = useRef<ThreeInteractionMode>(interactionMode);
  const surfaceRendererRef = useRef<BeadFusionSurfaceRenderer | null>(null);
  const createControllerRef = useRef(createController);
  const createSurfaceRendererRef = useRef(
    createSurfaceRenderer ?? createBeadFusionSurfaceRenderer,
  );
  const reportUnavailableRef = useRef<() => void>(() => undefined);
  const surfaceRequestVersionRef = useRef(0);
  const publishedProjectRef = useRef<PublishedProjectRevision | null>(null);
  const pendingSurfaceRenderRef = useRef<PendingSurfaceRender | null>(null);
  const surfaceRenderInFlightRef = useRef(false);
  const startPendingSurfaceRenderRef = useRef<() => void>(
    () => undefined,
  );
  const [rendering, setRendering] = useState(true);
  onPickCellRef.current = onPickCell;
  allowDragRef.current = allowDrag;
  selectedCellIndexRef.current = selectedCellIndex;
  interactionModeRef.current = interactionMode;

  const releasePointerCapture = (pointerId: number) => {
    const canvas = canvasRef.current;
    if (
      canvas === null ||
      typeof canvas.releasePointerCapture !== "function"
    ) {
      return;
    }
    try {
      if (
        typeof canvas.hasPointerCapture !== "function" ||
        canvas.hasPointerCapture(pointerId)
      ) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // Pointer capture can already be gone after a browser cancellation.
    }
  };

  const clearEditGesture = (
    options: { releaseCapture?: boolean; clearHover?: boolean } = {},
  ) => {
    const gesture = editGestureRef.current;
    editGestureRef.current = null;
    if (options.releaseCapture && gesture !== null) {
      releasePointerCapture(gesture.pointerId);
    }
    if (options.clearHover) {
      try {
        controllerRef.current?.setHoveredCell(null);
      } catch {
        // Cleanup must still dispose a controller after WebGL context loss.
      }
    }
  };
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
      clearEditGesture({ releaseCapture: true, clearHover: true });
      disposeController();
      setUnavailable(true);
    };
    const cleanup = () => {
      active = false;
      stopWatchingSize();
      reportUnavailableRef.current = () => undefined;
      clearEditGesture({ releaseCapture: true, clearHover: true });
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
      controller.setSelectedCell(selectedCellIndexRef.current ?? null);
      controller.setHoveredCell(null);
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

  useLayoutEffect(() => {
    if (unavailable || !supportsThreePreview) return;
    const controller = controllerRef.current;
    if (controller === null) return;

    const revision = surfaceRequestVersionRef.current + 1;
    surfaceRequestVersionRef.current = revision;
    const publishedProject = { project, revision };
    publishedProjectRef.current = publishedProject;
    try {
      controller.previewProject(project, revision);
    } catch {
      if (publishedProjectRef.current === publishedProject) {
        reportUnavailableRef.current();
      }
    }
  }, [project, supportsThreePreview, unavailable]);

  useEffect(() => {
    if (
      unavailable ||
      !supportsThreePreview ||
      controllerRef.current === null
    ) {
      return undefined;
    }
    let renderer: BeadFusionSurfaceRenderer;
    try {
      renderer = createSurfaceRendererRef.current();
      surfaceRendererRef.current = renderer;
    } catch {
      reportUnavailableRef.current();
      return undefined;
    }

    const startPendingSurfaceRender = () => {
      const pendingRender = pendingSurfaceRenderRef.current;
      if (
        surfaceRendererRef.current !== renderer ||
        surfaceRenderInFlightRef.current ||
        pendingRender === null ||
        !pendingRender.ready
      ) {
        return;
      }

      pendingSurfaceRenderRef.current = null;
      surfaceRenderInFlightRef.current = true;
      let surfaceRender: ReturnType<BeadFusionSurfaceRenderer["render"]>;
      try {
        surfaceRender = renderer.render(pendingRender.project);
      } catch {
        surfaceRenderInFlightRef.current = false;
        if (surfaceRendererRef.current !== renderer) return;
        if (
          surfaceRequestVersionRef.current === pendingRender.requestVersion
        ) {
          reportUnavailableRef.current();
          return;
        }
        startPendingSurfaceRender();
        return;
      }

      void surfaceRender
        .then((surfacePaths) => {
          if (
            surfaceRendererRef.current !== renderer ||
            surfaceRequestVersionRef.current !== pendingRender.requestVersion
          ) {
            return;
          }
          setExactState({
            model: buildPhysicalPreviewModel(
              pendingRender.project,
              surfacePaths,
            ),
            revision: pendingRender.requestVersion,
          });
        })
        .catch(() => {
          if (
            surfaceRendererRef.current === renderer &&
            surfaceRequestVersionRef.current === pendingRender.requestVersion
          ) {
            reportUnavailableRef.current();
          }
        })
        .finally(() => {
          if (surfaceRendererRef.current !== renderer) return;
          surfaceRenderInFlightRef.current = false;
          startPendingSurfaceRender();
        });
    };
    startPendingSurfaceRenderRef.current = startPendingSurfaceRender;

    return () => {
      surfaceRequestVersionRef.current += 1;
      publishedProjectRef.current = null;
      pendingSurfaceRenderRef.current = null;
      surfaceRenderInFlightRef.current = false;
      if (
        startPendingSurfaceRenderRef.current === startPendingSurfaceRender
      ) {
        startPendingSurfaceRenderRef.current = () => undefined;
      }
      if (surfaceRendererRef.current === renderer) {
        surfaceRendererRef.current = null;
        renderer.dispose();
      }
    };
  }, [supportsThreePreview, unavailable]);

  useEffect(() => {
    if (
      unavailable ||
      !supportsThreePreview ||
      controllerRef.current === null ||
      surfaceRendererRef.current === null
    ) {
      return undefined;
    }

    const publishedProject = publishedProjectRef.current;
    if (publishedProject?.project !== project) return undefined;
    const requestVersion = publishedProject.revision;
    const pendingRender: PendingSurfaceRender = {
      project,
      requestVersion,
      ready: false,
    };
    pendingSurfaceRenderRef.current = pendingRender;
    setRendering(true);
    const timer = window.setTimeout(() => {
      if (pendingSurfaceRenderRef.current !== pendingRender) return;
      pendingRender.ready = true;
      startPendingSurfaceRenderRef.current();
    }, SURFACE_RENDER_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (pendingSurfaceRenderRef.current === pendingRender) {
        pendingSurfaceRenderRef.current = null;
      }
    };
  }, [project, supportsThreePreview, unavailable]);

  useEffect(() => {
    if (
      unavailable ||
      exactState === null ||
      exactState.revision !== surfaceRequestVersionRef.current
    ) {
      return;
    }
    const controller = controllerRef.current;
    if (controller === null) return;
    try {
      controller.update(exactState.model, exactState.revision);
      if (
        controllerRef.current === controller &&
        exactState.revision === surfaceRequestVersionRef.current
      ) {
        setRendering(false);
      }
    } catch {
      if (exactState.revision === surfaceRequestVersionRef.current) {
        reportUnavailableRef.current();
      }
    }
  }, [exactState, unavailable]);

  useEffect(() => {
    if (unavailable || !supportsThreePreview) return;
    try {
      controllerRef.current?.setSelectedCell(selectedCellIndex ?? null);
    } catch {
      reportUnavailableRef.current();
    }
  }, [selectedCellIndex, supportsThreePreview, unavailable]);

  const pickCellAt = (clientX: number, clientY: number): number | null => {
    try {
      return controllerRef.current?.pickCellAt(clientX, clientY) ?? null;
    } catch {
      reportUnavailableRef.current();
      return null;
    }
  };

  const markHoveredCell = (cellIndex: number | null) => {
    try {
      controllerRef.current?.setHoveredCell(cellIndex);
    } catch {
      reportUnavailableRef.current();
    }
  };

  const interceptEditPointer = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const updateClickThreshold = (
    gesture: ActiveEditGesture,
    clientX: number,
    clientY: number,
  ) => {
    const deltaX = clientX - gesture.startClientX;
    const deltaY = clientY - gesture.startClientY;
    if (
      deltaX * deltaX + deltaY * deltaY >
      CLICK_MOVE_THRESHOLD_PX * CLICK_MOVE_THRESHOLD_PX
    ) {
      gesture.movedBeyondClickThreshold = true;
    }
  };

  const handlePointerDownCapture = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const activeGesture = editGestureRef.current;
    if (
      activeGesture !== null &&
      (activeGesture.pointerId !== event.pointerId ||
        event.isPrimary === false)
    ) {
      interceptEditPointer(event);
      clearEditGesture({ releaseCapture: true, clearHover: true });
      return;
    }
    const startsEdit =
      interactionModeRef.current === "edit" &&
      onPickCellRef.current !== undefined &&
      event.button === 0 &&
      !event.altKey &&
      event.isPrimary !== false;
    if (!startsEdit) return;

    interceptEditPointer(event);
    const gesture: ActiveEditGesture = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      allowDrag: allowDragRef.current,
      movedBeyondClickThreshold: false,
      visitedCellIndices: new Set<number>(),
    };
    editGestureRef.current = gesture;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Browsers can reject capture if the pointer ended concurrently.
    }

    if (!gesture.allowDrag) return;
    const cellIndex = pickCellAt(event.clientX, event.clientY);
    markHoveredCell(cellIndex);
    if (cellIndex === null) return;
    gesture.visitedCellIndices.add(cellIndex);
    onPickCellRef.current?.(cellIndex);
  };

  const handlePointerMoveCapture = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const gesture = editGestureRef.current;
    if (gesture === null) {
      if (
        interactionModeRef.current === "edit" &&
        onPickCellRef.current !== undefined &&
        event.pointerType !== "touch"
      ) {
        markHoveredCell(pickCellAt(event.clientX, event.clientY));
      }
      return;
    }
    if (
      gesture.pointerId !== event.pointerId ||
      event.isPrimary === false
    ) {
      clearEditGesture({ releaseCapture: true, clearHover: true });
      return;
    }
    if (
      event.pointerType !== "touch" &&
      (event.buttons & 1) === 0
    ) {
      interceptEditPointer(event);
      clearEditGesture({ releaseCapture: true, clearHover: true });
      return;
    }

    interceptEditPointer(event);
    updateClickThreshold(gesture, event.clientX, event.clientY);
    const cellIndex = pickCellAt(event.clientX, event.clientY);
    markHoveredCell(cellIndex);
    if (
      !gesture.allowDrag ||
      cellIndex === null ||
      gesture.visitedCellIndices.has(cellIndex)
    ) {
      return;
    }
    gesture.visitedCellIndices.add(cellIndex);
    onPickCellRef.current?.(cellIndex);
  };

  const handlePointerUpCapture = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const gesture = editGestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;

    interceptEditPointer(event);
    updateClickThreshold(gesture, event.clientX, event.clientY);
    if (!gesture.allowDrag && !gesture.movedBeyondClickThreshold) {
      const cellIndex = pickCellAt(event.clientX, event.clientY);
      markHoveredCell(cellIndex);
      if (cellIndex !== null) onPickCellRef.current?.(cellIndex);
    }
    clearEditGesture({ releaseCapture: true });
  };

  const handlePointerCancelCapture = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const gesture = editGestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    interceptEditPointer(event);
    clearEditGesture({ releaseCapture: true, clearHover: true });
  };

  const handleLostPointerCapture = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (editGestureRef.current?.pointerId !== event.pointerId) return;
    clearEditGesture({ clearHover: true });
  };

  const changeInteractionMode = (nextMode: ThreeInteractionMode) => {
    if (interactionModeRef.current === nextMode) return;
    interactionModeRef.current = nextMode;
    clearEditGesture({ releaseCapture: true, clearHover: true });
    setInteractionMode(nextMode);
  };

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
    <div
      ref={containerRef}
      className={cx("bead-three-preview", className)}
      data-interaction-mode={interactionMode}
      style={{ position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        aria-busy={rendering}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={handlePointerUpCapture}
        onPointerCancelCapture={handlePointerCancelCapture}
        onLostPointerCapture={handleLostPointerCapture}
        onPointerLeave={() => markHoveredCell(null)}
        onContextMenu={(event) => event.preventDefault()}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {rendering ? (
        <span
          role="status"
          aria-label={translate("workshop.bead.threeRendering")}
          className="bead-three-preview__rendering-status"
        >
          {translate("workshop.bead.threeRendering")}
        </span>
      ) : null}
      <div
        role="toolbar"
        aria-label={translate("workshop.bead.viewport.threeToolbar")}
        className="bead-three-preview__toolbar"
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 8,
          padding: "8px 12px",
          border: "1px solid var(--bead-border)",
          borderRadius: 999,
          color: "var(--bead-text)",
          background: "var(--bead-surface-strong)",
          boxShadow: "var(--bead-shadow)",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
        }}
      >
        <div
          role="group"
          aria-label={translate("workshop.bead.threeInteractionMode")}
          className="bead-three-preview__mode-switch"
        >
          <button
            type="button"
            className="button button--secondary button--small segmented-control"
            aria-label={translate("workshop.bead.threeEditMode")}
            aria-pressed={interactionMode === "edit"}
            onClick={() => changeInteractionMode("edit")}
          >
            {translate("workshop.bead.threeEditMode")}
          </button>
          <button
            type="button"
            className="button button--secondary button--small segmented-control"
            aria-label={translate("workshop.bead.threeViewMode")}
            aria-pressed={interactionMode === "view"}
            onClick={() => changeInteractionMode("view")}
          >
            {translate("workshop.bead.threeViewMode")}
          </button>
        </div>
        <button
          type="button"
          className={VIEW_BUTTON_CLASS_NAME}
          aria-label={translate("workshop.bead.viewport.threeZoomOut")}
          onClick={() => controllerRef.current?.zoomOut()}
        >
          −
        </button>
        <button
          type="button"
          className={VIEW_BUTTON_CLASS_NAME}
          aria-label={translate("workshop.bead.viewport.threeReset")}
          onClick={() => controllerRef.current?.resetView()}
        >
          {translate("workshop.bead.viewport.threeReset")}
        </button>
        <button
          type="button"
          className={VIEW_BUTTON_CLASS_NAME}
          aria-label={translate("workshop.bead.viewport.threeZoomIn")}
          onClick={() => controllerRef.current?.zoomIn()}
        >
          +
        </button>
        <button
          type="button"
          className={VIEW_BUTTON_CLASS_NAME}
          aria-label={translate("workshop.bead.viewport.threeFit")}
          onClick={() => controllerRef.current?.fit()}
        >
          {translate("workshop.bead.viewport.threeFit")}
        </button>
      </div>
    </div>
  );
}
