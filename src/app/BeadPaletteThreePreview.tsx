import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import type { RgbColor } from "../domain/types";
import {
  createBeadPaletteThreeRenderer,
  type BeadPaletteThreeRenderer,
} from "./beadPaletteThreeRenderer";

/**
 * 共享三维豆子色板的受控属性。
 * Controlled properties for the shared 3D bead palette.
 */
export interface BeadPaletteThreePreviewProps {
  colors: RgbColor[];
  activeIndex: number;
  colorLabel(index: number): string;
  onSelect(index: number): void;
  viewportRef?: RefObject<HTMLDivElement | null>;
  createRenderer?: (canvas: HTMLCanvasElement) => BeadPaletteThreeRenderer;
}

/**
 * 使用单一 WebGL 场景显示一排可选择的竖直圆柱豆子。
 * Displays selectable upright cylindrical beads in one WebGL scene.
 */
export function BeadPaletteThreePreview({
  colors,
  activeIndex,
  colorLabel,
  onSelect,
  viewportRef,
  createRenderer = createBeadPaletteThreeRenderer,
}: BeadPaletteThreePreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetsRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BeadPaletteThreeRenderer | null>(null);
  const measureViewportRef = useRef<(() => void) | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    try {
      const renderer = createRenderer(canvas);
      rendererRef.current = renderer;
      const measureViewportAt = (scrollLeftPx: number) => {
        const viewport = viewportRef?.current ?? rootRef.current?.parentElement;
        const targets = targetsRef.current;
        if (viewport == null || targets === null) return;
        const buttons = targets.querySelectorAll<HTMLElement>(".palette-swatch");
        const first = buttons[0];
        const second = buttons[1];
        const firstTargetCenterPx = first !== undefined && first.offsetWidth > 0
          ? first.offsetLeft + first.offsetWidth / 2
          : 26;
        const measuredStep = first !== undefined && second !== undefined
          ? second.offsetLeft + second.offsetWidth / 2 - firstTargetCenterPx
          : 0;
        const targetStepPx = measuredStep > 0 ? measuredStep : 40;
        const widthPx = Math.max(1, viewport.clientWidth);
        canvas.style.width = `${widthPx}px`;
        renderer.setViewport({
          scrollLeftPx,
          widthPx,
          heightPx: 48,
          firstTargetCenterPx,
          targetStepPx,
        });
      };
      const measureViewport = () => {
        const viewport = viewportRef?.current ?? rootRef.current?.parentElement;
        if (viewport == null) return;
        measureViewportAt(viewport.scrollLeft);
      };
      measureViewportRef.current = measureViewport;
      measureViewport();
      renderer.update(colors, activeIndex);
      setUnavailable(false);
      const ownerWindow = canvas.ownerDocument.defaultView;
      const viewport = viewportRef?.current ?? rootRef.current?.parentElement;
      let scrollFrame: number | null = null;
      let latestScrollLeftPx = viewport?.scrollLeft ?? 0;
      const scheduleViewportMeasure = (event: Event) => {
        latestScrollLeftPx = event.currentTarget instanceof HTMLElement
          ? event.currentTarget.scrollLeft
          : viewport?.scrollLeft ?? 0;
        if (scrollFrame !== null) return;
        scrollFrame = ownerWindow?.requestAnimationFrame(() => {
          scrollFrame = null;
          measureViewportAt(latestScrollLeftPx);
        }) ?? null;
        if (scrollFrame === null) measureViewportAt(latestScrollLeftPx);
      };
      viewport?.addEventListener("scroll", scheduleViewportMeasure, {
        passive: true,
      });
      const observer = typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureViewport);
      if (viewport != null) observer?.observe(viewport);
      ownerWindow?.addEventListener("resize", measureViewport);
      return () => {
        viewport?.removeEventListener("scroll", scheduleViewportMeasure);
        if (scrollFrame !== null) {
          ownerWindow?.cancelAnimationFrame(scrollFrame);
        }
        observer?.disconnect();
        ownerWindow?.removeEventListener("resize", measureViewport);
        if (measureViewportRef.current === measureViewport) {
          measureViewportRef.current = null;
        }
        if (rendererRef.current === renderer) rendererRef.current = null;
        renderer.dispose();
      };
    } catch {
      rendererRef.current = null;
      setUnavailable(true);
      return undefined;
    }
  }, [createRenderer, viewportRef]);

  useEffect(() => {
    rendererRef.current?.update(colors, activeIndex);
    const ownerWindow = canvasRef.current?.ownerDocument.defaultView;
    if (ownerWindow == null) return undefined;
    const frame = ownerWindow.requestAnimationFrame(() => {
      measureViewportRef.current?.();
    });
    return () => ownerWindow.cancelAnimationFrame(frame);
  }, [activeIndex, colors]);

  return (
    <div
      ref={rootRef}
      className="bead-palette-three-preview"
      data-testid="bead-palette-three-preview"
      data-unavailable={unavailable ? "true" : "false"}
    >
      <canvas
        ref={canvasRef}
        className="bead-palette-three-preview__canvas"
        aria-hidden
      />
      <div ref={targetsRef} className="bead-palette-three-preview__targets">
        {colors.map((color, index) => (
          <button
            key={index}
            type="button"
            className="palette-swatch"
            aria-label={colorLabel(index)}
            aria-pressed={activeIndex === index}
            data-bead-view="shared-webgl-upright-cylinder"
            data-palette-index={index}
            style={{
              "--bead-palette-fallback": `rgb(${color.join(" ")})`,
            } as CSSProperties}
            onClick={() => onSelect(index)}
          />
        ))}
      </div>
    </div>
  );
}
