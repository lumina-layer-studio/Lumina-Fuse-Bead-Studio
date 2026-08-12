import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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
  createRenderer = createBeadPaletteThreeRenderer,
}: BeadPaletteThreePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BeadPaletteThreeRenderer | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    try {
      const renderer = createRenderer(canvas);
      rendererRef.current = renderer;
      renderer.update(colors);
      setUnavailable(false);
      const ownerWindow = canvas.ownerDocument.defaultView;
      const resize = () => {
        renderer.resize();
      };
      ownerWindow?.addEventListener("resize", resize);
      return () => {
        ownerWindow?.removeEventListener("resize", resize);
        if (rendererRef.current === renderer) rendererRef.current = null;
        renderer.dispose();
      };
    } catch {
      rendererRef.current = null;
      setUnavailable(true);
      return undefined;
    }
  }, [createRenderer]);

  useEffect(() => {
    rendererRef.current?.update(colors);
  }, [colors]);

  return (
    <div
      className="bead-palette-three-preview"
      data-testid="bead-palette-three-preview"
      data-unavailable={unavailable ? "true" : "false"}
    >
      <canvas
        ref={canvasRef}
        className="bead-palette-three-preview__canvas"
        aria-hidden
      />
      <div className="bead-palette-three-preview__targets">
        {colors.map((color, index) => (
          <button
            key={index}
            type="button"
            className="palette-swatch"
            aria-label={colorLabel(index)}
            aria-pressed={activeIndex === index}
            data-bead-view="shared-webgl-upright-cylinder"
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
