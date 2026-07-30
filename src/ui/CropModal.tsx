import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { CropRect } from "../domain/types";
import Button from "./Button";

interface CropModalProps {
  open: boolean;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  busy?: boolean;
  translate(key: string): string;
  onClose(): void;
  onUseOriginal(): void;
  onConfirm(crop: CropRect): void;
}

export default function CropModal({
  open,
  imageSrc,
  imageWidth,
  imageHeight,
  busy = false,
  translate: t,
  onClose,
  onUseOriginal,
  onConfirm,
}: CropModalProps) {
  const [crop, setCrop] = useState<CropRect>({
    x: 0,
    y: 0,
    width: imageWidth,
    height: imageHeight,
  });

  useEffect(() => {
    setCrop({ x: 0, y: 0, width: imageWidth, height: imageHeight });
  }, [imageHeight, imageWidth, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  const set = (field: keyof CropRect, value: number) => {
    setCrop((current) => ({ ...current, [field]: Math.max(0, value) }));
  };
  const valid =
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= imageWidth &&
    crop.y + crop.height <= imageHeight;

  return createPortal(
    <div
      className="dialog-scrim"
      onPointerDown={busy ? undefined : onClose}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="dialog__body">
          <h2 id="crop-title">{t("crop.title")}</h2>
          <p>{t("crop.description")}</p>
          <img className="crop-preview" src={imageSrc} alt="" />
          <div className="field-grid field-grid--four">
            {(["x", "y", "width", "height"] as const).map((field) => (
              <label className="field" key={field}>
                <span className="field-label">{t(`crop.${field}`)}</span>
                <input
                  className="field-input"
                  type="number"
                  min={0}
                  value={crop[field]}
                  onChange={(event) => set(field, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        </div>
        <footer className="dialog__footer">
          <Button
            label={t("crop.cancel")}
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          />
          <Button
            label={t("crop.original")}
            variant="secondary"
            disabled={busy}
            onClick={onUseOriginal}
          />
          <Button
            label={t("crop.confirm")}
            loading={busy}
            disabled={!valid}
            onClick={() => onConfirm(crop)}
          />
        </footer>
      </section>
    </div>,
    document.body,
  );
}
