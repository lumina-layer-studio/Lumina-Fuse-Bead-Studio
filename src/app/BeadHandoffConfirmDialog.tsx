import { useEffect } from "react";
import { createPortal } from "react-dom";

import Button from "../ui/Button";

interface BeadHandoffConfirmDialogProps {
  open: boolean;
  busy: boolean;
  translate(key: string): string;
  onCancel(): void;
  onConfirm(): void;
}

export function BeadHandoffConfirmDialog({
  open,
  busy,
  translate: t,
  onCancel,
  onConfirm,
}: BeadHandoffConfirmDialogProps) {
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
        aria-labelledby="bead-handoff-confirm-title"
        className="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog__body">
          <h2 id="bead-handoff-confirm-title">
            {t("workshop.bead.replaceTitle")}
          </h2>
          <p>{t("workshop.bead.replaceDescription")}</p>
        </div>
        <footer className="dialog__footer">
          <Button
            label={t("workshop.bead.replaceCancel")}
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
          />
          <Button
            label={t("workshop.bead.replaceConfirm")}
            onClick={onConfirm}
            loading={busy}
          />
        </footer>
      </section>
    </div>,
    document.body,
  );
}
