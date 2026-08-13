import { useEffect, useRef, type RefObject } from "react";

interface ModalFocusOptions {
  open: boolean;
  busy: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onCancel(): void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

export function useModalFocus({
  open,
  busy,
  dialogRef,
  onCancel,
}: ModalFocusOptions): void {
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return undefined;

    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const focusables = focusableElements(dialog);
    (busy ? dialog : (focusables[0] ?? dialog)).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      const openDialogs = dialog.ownerDocument.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      );
      if (openDialogs.item(openDialogs.length - 1) !== dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onCancelRef.current();
        return;
      }
      const currentFocusables = busy ? [] : focusableElements(dialog);
      if (currentFocusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeElement = document.activeElement;
      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () =>
      document.removeEventListener("keydown", handleKeyDown, true);
  }, [busy, dialogRef, open]);
}
