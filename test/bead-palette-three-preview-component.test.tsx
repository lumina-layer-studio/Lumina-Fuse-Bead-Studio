import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { BeadPaletteThreePreview } from "../src/app/BeadPaletteThreePreview";
import type { BeadPaletteThreeRenderer } from "../src/app/beadPaletteThreeRenderer";

describe("BeadPaletteThreePreview viewport", () => {
  it("keeps the WebGL canvas pinned to the visible scroll viewport", () => {
    vi.useFakeTimers();
    const viewportRef = createRef<HTMLDivElement>();
    const renderer: BeadPaletteThreeRenderer = {
      update: vi.fn(),
      setViewport: vi.fn(),
      dispose: vi.fn(),
    };
    try {
      render(
        <div ref={viewportRef} data-testid="palette-viewport">
          <BeadPaletteThreePreview
            colors={[[230, 40, 50], [20, 120, 210]]}
            activeIndex={1}
            colorLabel={(index) => `颜色 ${index + 1}`}
            onSelect={vi.fn()}
            viewportRef={viewportRef}
            createRenderer={() => renderer}
          />
        </div>,
      );
      const viewport = screen.getByTestId("palette-viewport");
      Object.defineProperties(viewport, {
        clientWidth: { configurable: true, value: 360 },
        scrollLeft: { configurable: true, writable: true, value: 72 },
      });

      fireEvent.scroll(viewport);
      vi.advanceTimersByTime(20);

      const canvas = document.querySelector(
        ".bead-palette-three-preview__canvas",
      ) as HTMLCanvasElement;
      expect(canvas.style.width).toBe("360px");
      expect(renderer.setViewport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          scrollLeftPx: 72,
          widthPx: 360,
        }),
      );
      expect(renderer.update).toHaveBeenCalledWith(
        [[230, 40, 50], [20, 120, 210]],
        1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates the camera after the native scroll position settles", () => {
    vi.useFakeTimers();
    const viewportRef = createRef<HTMLDivElement>();
    const setViewport = vi.fn();
    const renderer: BeadPaletteThreeRenderer = {
      update: vi.fn(),
      setViewport,
      dispose: vi.fn(),
    };
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = (callback) => window.setTimeout(
      () => callback(performance.now()),
      16,
    );
    window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
    try {
      render(
        <div ref={viewportRef}>
          <BeadPaletteThreePreview
            colors={[[230, 40, 50], [20, 120, 210]]}
            activeIndex={0}
            colorLabel={(index) => `颜色 ${index + 1}`}
            onSelect={vi.fn()}
            viewportRef={viewportRef}
            createRenderer={() => renderer}
          />
        </div>,
      );
      const viewport = viewportRef.current!;
      Object.defineProperties(viewport, {
        clientWidth: { configurable: true, value: 360 },
        scrollLeft: { configurable: true, writable: true, value: 0 },
      });
      fireEvent.scroll(viewport);
      viewport.scrollLeft = 720;
      fireEvent.scroll(viewport);

      vi.advanceTimersByTime(16);

      expect(setViewport).toHaveBeenLastCalledWith(
        expect.objectContaining({ scrollLeftPx: 720 }),
      );
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      vi.useRealTimers();
    }
  });

  it("re-reads the final scroll position when the selected color changes", () => {
    vi.useFakeTimers();
    const viewportRef = createRef<HTMLDivElement>();
    const setViewport = vi.fn();
    const renderer: BeadPaletteThreeRenderer = {
      update: vi.fn(),
      setViewport,
      dispose: vi.fn(),
    };
    try {
      const { rerender } = render(
        <div ref={viewportRef}>
          <BeadPaletteThreePreview
            colors={[[230, 40, 50], [20, 120, 210]]}
            activeIndex={0}
            colorLabel={(index) => `颜色 ${index + 1}`}
            onSelect={vi.fn()}
            viewportRef={viewportRef}
            createRenderer={() => renderer}
          />
        </div>,
      );
      const viewport = viewportRef.current!;
      Object.defineProperties(viewport, {
        clientWidth: { configurable: true, value: 360 },
        scrollLeft: { configurable: true, writable: true, value: 720 },
      });

      rerender(
        <div ref={viewportRef}>
          <BeadPaletteThreePreview
            colors={[[230, 40, 50], [20, 120, 210]]}
            activeIndex={1}
            colorLabel={(index) => `颜色 ${index + 1}`}
            onSelect={vi.fn()}
            viewportRef={viewportRef}
            createRenderer={() => renderer}
          />
        </div>,
      );
      viewport.scrollLeft = 900;
      vi.advanceTimersByTime(20);

      expect(setViewport).toHaveBeenLastCalledWith(
        expect.objectContaining({ scrollLeftPx: 900 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("derives the live camera mapping from actual swatch geometry", () => {
    const viewportRef = createRef<HTMLDivElement>();
    const renderer: BeadPaletteThreeRenderer = {
      update: vi.fn(),
      setViewport: vi.fn(),
      dispose: vi.fn(),
    };
    const originalOffsetLeft = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetLeft",
    );
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth",
    );
    Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
      configurable: true,
      get() {
        return this.getAttribute("data-palette-index") === "1" ? 48 : 8;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return this.classList.contains("palette-swatch") ? 36 : 0;
      },
    });
    try {
      render(
        <div ref={viewportRef}>
          <BeadPaletteThreePreview
            colors={[[230, 40, 50], [20, 120, 210]]}
            activeIndex={0}
            colorLabel={(index) => `颜色 ${index + 1}`}
            onSelect={vi.fn()}
            viewportRef={viewportRef}
            createRenderer={() => renderer}
          />
        </div>,
      );

      expect(renderer.setViewport).toHaveBeenCalledWith(
        expect.objectContaining({
          firstTargetCenterPx: 26,
          targetStepPx: 40,
        }),
      );
    } finally {
      if (originalOffsetLeft === undefined) {
        delete (HTMLElement.prototype as { offsetLeft?: number }).offsetLeft;
      } else {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetLeft",
          originalOffsetLeft,
        );
      }
      if (originalOffsetWidth === undefined) {
        delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
      } else {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetWidth",
          originalOffsetWidth,
        );
      }
    }
  });
});
