import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeadHandoffConfirmDialog } from "../src/app/BeadHandoffConfirmDialog";
import { BeadHandoffSummaryDialog } from "../src/app/BeadHandoffSummaryDialog";

describe("handoff dialogs", () => {
  it("gives every mounted dialog a unique accessible title relationship", () => {
    const translate = (key: string) => key;
    render(
      <>
        <BeadHandoffConfirmDialog
          open
          busy={false}
          translate={translate}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
        <BeadHandoffConfirmDialog
          open
          busy={false}
          translate={translate}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      </>,
    );

    const titleIds = screen
      .getAllByRole("dialog", { name: "workshop.bead.replaceTitle" })
      .map((dialog) => dialog.getAttribute("aria-labelledby"));

    expect(titleIds.every(Boolean)).toBe(true);
    expect(new Set(titleIds).size).toBe(titleIds.length);
    for (const titleId of titleIds) {
      expect(document.getElementById(titleId!)).toHaveTextContent(
        "workshop.bead.replaceTitle",
      );
    }
  });

  it("gives every mounted summary dialog a unique accessible title relationship", () => {
    const translate = (key: string) => key;
    const summary = (key: string) => (
      <BeadHandoffSummaryDialog
        key={key}
        open
        busy={false}
        rows={2}
        columns={2}
        compression={50}
        irregularity={0}
        widthMm={5.2}
        heightMm={5.2}
        thicknessMm={2.35}
        libraryLabel={null}
        translate={translate}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );
    render(<>{summary("first")}{summary("second")}</>);

    const titleIds = screen
      .getAllByRole("dialog", {
        name: "workshop.bead.handoffSummaryTitle",
      })
      .map((dialog) => dialog.getAttribute("aria-labelledby"));

    expect(titleIds.every(Boolean)).toBe(true);
    expect(new Set(titleIds).size).toBe(titleIds.length);
    for (const titleId of titleIds) {
      expect(document.getElementById(titleId!)).toHaveTextContent(
        "workshop.bead.handoffSummaryTitle",
      );
    }
  });

  it("does not reset the user's focus when only a callback identity changes", async () => {
    const translate = (key: string) => key;
    const { rerender } = render(
      <BeadHandoffConfirmDialog
        open
        busy={false}
        translate={translate}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    const confirm = screen.getByRole("button", {
      name: "workshop.bead.replaceConfirm",
    });
    confirm.focus();

    rerender(
      <BeadHandoffConfirmDialog
        open
        busy={false}
        translate={translate}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    await waitFor(() => expect(confirm).toHaveFocus());
  });

  it("keeps focus on the dialog and ignores Tab and Escape while busy", async () => {
    const translate = (key: string) => key;
    const onCancel = vi.fn();
    const { rerender } = render(
      <BeadHandoffConfirmDialog
        open
        busy={false}
        translate={translate}
        onCancel={onCancel}
        onConfirm={() => undefined}
      />,
    );
    const dialog = screen.getByRole("dialog", {
      name: "workshop.bead.replaceTitle",
    });

    rerender(
      <BeadHandoffConfirmDialog
        open
        busy
        translate={translate}
        onCancel={onCancel}
        onConfirm={() => undefined}
      />,
    );
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog).toHaveFocus();
  });

  it("lets only the topmost open dialog handle Escape", () => {
    const translate = (key: string) => key;
    const bottomCancel = vi.fn();
    const topCancel = vi.fn();
    render(
      <>
        <BeadHandoffConfirmDialog
          open
          busy={false}
          translate={translate}
          onCancel={bottomCancel}
          onConfirm={() => undefined}
        />
        <BeadHandoffConfirmDialog
          open
          busy={false}
          translate={translate}
          onCancel={topCancel}
          onConfirm={() => undefined}
        />
      </>,
    );

    const dialogs = screen.getAllByRole("dialog", {
      name: "workshop.bead.replaceTitle",
    });
    fireEvent.keyDown(dialogs[1], { key: "Escape" });

    expect(topCancel).toHaveBeenCalledTimes(1);
    expect(bottomCancel).not.toHaveBeenCalled();
  });

  it("does not let Escape fall through a busy topmost dialog", () => {
    const translate = (key: string) => key;
    const bottomCancel = vi.fn();
    const topCancel = vi.fn();
    render(
      <>
        <BeadHandoffConfirmDialog
          open
          busy={false}
          translate={translate}
          onCancel={bottomCancel}
          onConfirm={() => undefined}
        />
        <BeadHandoffConfirmDialog
          open
          busy
          translate={translate}
          onCancel={topCancel}
          onConfirm={() => undefined}
        />
      </>,
    );

    const dialogs = screen.getAllByRole("dialog", {
      name: "workshop.bead.replaceTitle",
    });
    fireEvent.keyDown(dialogs[1], { key: "Escape" });

    expect(topCancel).not.toHaveBeenCalled();
    expect(bottomCancel).not.toHaveBeenCalled();
  });

  it("does not let a lower dialog redirect the topmost dialog's Tab focus", () => {
    const translate = (key: string) => key;
    render(
      <>
        <BeadHandoffConfirmDialog
          open
          busy={false}
          translate={translate}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
        <BeadHandoffConfirmDialog
          open
          busy={false}
          translate={translate}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      </>,
    );

    const cancelButtons = screen.getAllByRole("button", {
      name: "workshop.bead.replaceCancel",
    });
    const confirmButtons = screen.getAllByRole("button", {
      name: "workshop.bead.replaceConfirm",
    });
    const bottomFocus = vi.fn();
    cancelButtons[0].addEventListener("focus", bottomFocus);
    confirmButtons[1].focus();
    bottomFocus.mockClear();

    fireEvent.keyDown(confirmButtons[1], { key: "Tab" });

    expect(bottomFocus).not.toHaveBeenCalled();
    expect(cancelButtons[1]).toHaveFocus();
  });
});
