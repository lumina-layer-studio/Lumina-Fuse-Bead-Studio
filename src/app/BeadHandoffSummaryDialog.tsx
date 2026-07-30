import { useEffect } from "react";
import { createPortal } from "react-dom";

import { interpolate } from "../i18n/translations";
import Button from "../ui/Button";

interface BeadHandoffSummaryDialogProps {
  open: boolean;
  busy: boolean;
  rows: number;
  columns: number;
  compression: number;
  widthMm: number;
  heightMm: number;
  libraryLabel: string | null;
  translate(key: string): string;
  onCancel(): void;
  onConfirm(): void;
}

export function BeadHandoffSummaryDialog({
  open,
  busy,
  rows,
  columns,
  compression,
  widthMm,
  heightMm,
  libraryLabel,
  translate: t,
  onCancel,
  onConfirm,
}: BeadHandoffSummaryDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="dialog-scrim"
      onClick={busy ? undefined : onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bead-handoff-summary-title"
        className="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog__body">
          <h2 id="bead-handoff-summary-title">
            {t("workshop.bead.handoffSummaryTitle")}
          </h2>
          <p>{t("workshop.bead.handoffSummaryDescription")}</p>
          <div className="status-banner status-banner--info">
            {interpolate(t("workshop.bead.handoffSummary"), {
              rows,
              columns,
              width: widthMm,
              height: heightMm,
              compression,
            })}
          </div>
          <p>
            {libraryLabel
              ? interpolate(t("workshop.bead.handoffLibrary"), {
                  label: libraryLabel,
                })
              : t("workshop.bead.handoffNoLibrary")}
          </p>
        </div>
        <footer className="dialog__footer">
          <Button
            label={t("workshop.bead.handoffSummaryCancel")}
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          />
          <Button
            label={t("workshop.bead.handoffSummaryConfirm")}
            loading={busy}
            onClick={onConfirm}
          />
        </footer>
      </section>
    </div>,
    document.body,
  );
}
