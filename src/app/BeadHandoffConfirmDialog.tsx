import { useId, useRef } from "react";
import { createPortal } from "react-dom";

import Button from "../ui/Button";
import { useModalFocus } from "./useModalFocus";

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
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleId = `bead-handoff-confirm-title-${useId()}`;
  useModalFocus({ open, busy, dialogRef, onCancel });

  if (!open) return null;

  return createPortal(
    <div
      className="dialog-scrim"
      onClick={busy ? undefined : onCancel}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog__body">
          <h2 id={titleId}>
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
