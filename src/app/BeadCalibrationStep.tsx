import { useState } from "react";

import type {
  BeadEmptySelection,
  BeadGridGeometry,
  BeadInputMode,
  BeadOrientation,
  PatternClassification,
  Raster,
} from "../domain/types";
import { MAX_BEAD_GRID_SIZE } from "../domain/types";
import { interpolate } from "../i18n/translations";
import Button from "../ui/Button";
import {
  PanelIntro,
  StatusBanner,
  workstationFieldLabelClass,
  workstationInputClass,
} from "../ui/panelPrimitives";
import {
  BeadSourceCanvas,
  type CalibrationPickMode,
} from "./BeadSourceCanvas";

export interface BeadCalibrationDraft {
  inputMode: BeadInputMode;
  rows: number;
  columns: number;
  geometry: BeadGridGeometry;
  orientation: BeadOrientation;
  emptySelection: BeadEmptySelection | null;
  transparentSupportSampleCellIndex: number | null;
}

interface BeadCalibrationStepProps {
  source: Raster;
  fileName: string;
  classification: PatternClassification | null;
  draft: BeadCalibrationDraft;
  busy: boolean;
  classificationBusy?: boolean;
  translate(key: string): string;
  onChange(next: BeadCalibrationDraft): void;
  onRecognize(): void;
  onOpenCrop(): void;
  onReturnToEditor?(): void;
  canCrop: boolean;
}

function clampDimension(value: number): number {
  return Math.min(
    MAX_BEAD_GRID_SIZE,
    Math.max(1, Math.round(Number.isFinite(value) ? value : 1)),
  );
}

function isValidGrid(draft: BeadCalibrationDraft): boolean {
  const { geometry } = draft;
  if (
    !Number.isFinite(geometry.originX) ||
    !Number.isFinite(geometry.originY) ||
    !Number.isFinite(geometry.cellWidth) ||
    !Number.isFinite(geometry.cellHeight) ||
    geometry.originX < 0 ||
    geometry.originY < 0 ||
    geometry.cellWidth <= 0 ||
    geometry.cellHeight <= 0
  ) {
    return false;
  }
  const squareError =
    Math.abs(geometry.cellWidth - geometry.cellHeight) /
    Math.max(geometry.cellWidth, geometry.cellHeight);
  return squareError <= 0.12;
}

export function BeadCalibrationStep({
  source,
  fileName,
  classification,
  draft,
  busy,
  classificationBusy = false,
  translate: t,
  onChange,
  onRecognize,
  onOpenCrop,
  onReturnToEditor,
  canCrop,
}: BeadCalibrationStepProps) {
  const [pickMode, setPickMode] =
    useState<CalibrationPickMode>("none");
  const validGrid = isValidGrid(draft);
  const canRecognize =
    validGrid &&
    draft.emptySelection !== null &&
    !busy &&
    !classificationBusy;

  const updateDimensions = (rows: number, columns: number) => {
    const safeRows = clampDimension(rows);
    const safeColumns = clampDimension(columns);
    onChange({
      ...draft,
      rows: safeRows,
      columns: safeColumns,
      geometry: {
        ...draft.geometry,
        cellWidth:
          (source.width - draft.geometry.originX) / safeColumns,
        cellHeight:
          (source.height - draft.geometry.originY) / safeRows,
      },
      emptySelection: null,
      transparentSupportSampleCellIndex: null,
    });
  };

  const updateOrigin = (axis: "x" | "y", value: number) => {
    const maximum =
      axis === "x" ? source.width - 1 : source.height - 1;
    const safeValue = Math.min(
      maximum,
      Math.max(0, Number.isFinite(value) ? value : 0),
    );
    const originX =
      axis === "x" ? safeValue : draft.geometry.originX;
    const originY =
      axis === "y" ? safeValue : draft.geometry.originY;
    onChange({
      ...draft,
      geometry: {
        originX,
        originY,
        cellWidth: (source.width - originX) / draft.columns,
        cellHeight: (source.height - originY) / draft.rows,
      },
      emptySelection: null,
      transparentSupportSampleCellIndex: null,
    });
  };

  const handleCellPick = (cellIndex: number) => {
    if (pickMode === "empty") {
      onChange({
        ...draft,
        emptySelection: { kind: "sample", cellIndex },
      });
    } else if (pickMode === "transparent-support") {
      onChange({
        ...draft,
        transparentSupportSampleCellIndex: cellIndex,
      });
    }
    setPickMode("none");
  };

  const setRotation = (rotation: BeadOrientation["rotation"]) => {
    onChange({
      ...draft,
      orientation: { ...draft.orientation, rotation },
    });
  };

  const classificationText = classification
    ? interpolate(t("workshop.bead.classification"), {
        mode: t(`workshop.bead.mode.${classification.mode}`),
        confidence: Math.round(classification.confidence * 100),
      })
    : classificationBusy
      ? t("workshop.bead.classifying")
      : t("workshop.bead.classificationUnavailable");

  return (
    <div className="workbench-stack">
      <PanelIntro
        eyebrow={fileName}
        title={t("workshop.bead.calibrationTitle")}
        description={t("workshop.bead.calibrationDescription")}
        action={
          onReturnToEditor || canCrop ? (
            <div className="control-row">
              {onReturnToEditor ? (
                <Button
                  label={t("workshop.bead.returnToEditor")}
                  variant="secondary"
                  disabled={busy}
                  onClick={onReturnToEditor}
                />
              ) : null}
              {canCrop ? (
                <Button
                  label={t("workshop.bead.cropPattern")}
                  variant="secondary"
                  disabled={busy || classificationBusy}
                  onClick={onOpenCrop}
                />
              ) : null}
            </div>
          ) : undefined
        }
      />

      <div className="workbench-layout">
        <section className="panel panel--controls">
          <StatusBanner>{classificationText}</StatusBanner>

          <label className="field">
            <span className={workstationFieldLabelClass}>
              {t("workshop.bead.inputMode")}
            </span>
            <select
              className={workstationInputClass}
              value={draft.inputMode}
              onChange={(event) =>
                onChange({
                  ...draft,
                  inputMode: event.target.value as BeadInputMode,
                  emptySelection: null,
                  transparentSupportSampleCellIndex: null,
                })
              }
            >
              {(
                [
                  "numbered-grid",
                  "hard-pixel",
                  "ring-preview",
                ] as const
              ).map((mode) => (
                <option key={mode} value={mode}>
                  {t(`workshop.bead.mode.${mode}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="field-grid">
            <label className="field">
              <span className={workstationFieldLabelClass}>
                {t("workshop.bead.rows")}
              </span>
              <input
                aria-label={t("workshop.bead.rows")}
                className={workstationInputClass}
                type="number"
                min={1}
                max={MAX_BEAD_GRID_SIZE}
                value={draft.rows}
                onChange={(event) =>
                  updateDimensions(
                    Number(event.target.value),
                    draft.columns,
                  )
                }
              />
            </label>
            <label className="field">
              <span className={workstationFieldLabelClass}>
                {t("workshop.bead.columns")}
              </span>
              <input
                aria-label={t("workshop.bead.columns")}
                className={workstationInputClass}
                type="number"
                min={1}
                max={MAX_BEAD_GRID_SIZE}
                value={draft.columns}
                onChange={(event) =>
                  updateDimensions(
                    draft.rows,
                    Number(event.target.value),
                  )
                }
              />
            </label>
            <label className="field">
              <span className={workstationFieldLabelClass}>
                {t("workshop.bead.originX")}
              </span>
              <input
                aria-label={t("workshop.bead.originX")}
                className={workstationInputClass}
                type="number"
                min={0}
                value={draft.geometry.originX}
                onChange={(event) =>
                  updateOrigin("x", Number(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span className={workstationFieldLabelClass}>
                {t("workshop.bead.originY")}
              </span>
              <input
                aria-label={t("workshop.bead.originY")}
                className={workstationInputClass}
                type="number"
                min={0}
                value={draft.geometry.originY}
                onChange={(event) =>
                  updateOrigin("y", Number(event.target.value))
                }
              />
            </label>
          </div>

          <div className="control-grid">
            {([0, 90, 180, 270] as const).map((rotation) => (
              <button
                key={rotation}
                type="button"
                aria-pressed={draft.orientation.rotation === rotation}
                className="segmented-control"
                onClick={() => setRotation(rotation)}
              >
                {t(`workshop.bead.rotate${rotation}`)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={draft.orientation.flipHorizontal}
              className="segmented-control"
              onClick={() =>
                onChange({
                  ...draft,
                  orientation: {
                    ...draft.orientation,
                    flipHorizontal:
                      !draft.orientation.flipHorizontal,
                  },
                })
              }
            >
              {t("workshop.bead.flipHorizontal")}
            </button>
            <button
              type="button"
              aria-pressed={draft.orientation.flipVertical}
              className="segmented-control"
              onClick={() =>
                onChange({
                  ...draft,
                  orientation: {
                    ...draft.orientation,
                    flipVertical: !draft.orientation.flipVertical,
                  },
                })
              }
            >
              {t("workshop.bead.flipVertical")}
            </button>
          </div>

          <div className="control-grid">
            <button
              type="button"
              aria-pressed={pickMode === "empty"}
              className="segmented-control"
              onClick={() => setPickMode("empty")}
            >
              {t("workshop.bead.pickEmpty")}
            </button>
            <button
              type="button"
              aria-pressed={draft.emptySelection?.kind === "none"}
              className="segmented-control"
              onClick={() => {
                setPickMode("none");
                onChange({
                  ...draft,
                  emptySelection: { kind: "none" },
                });
              }}
            >
              {t("workshop.bead.noEmpty")}
            </button>
            <button
              type="button"
              aria-pressed={pickMode === "transparent-support"}
              className="segmented-control"
              onClick={() => setPickMode("transparent-support")}
            >
              {t("workshop.bead.pickSupport")}
            </button>
            {draft.transparentSupportSampleCellIndex !== null ? (
              <button
                type="button"
                className="segmented-control"
                onClick={() =>
                  onChange({
                    ...draft,
                    transparentSupportSampleCellIndex: null,
                  })
                }
              >
                {t("workshop.bead.clearSupport")}
              </button>
            ) : null}
          </div>

          <div className="sample-summary">
            {draft.emptySelection?.kind === "sample" ? (
              <p>
                {interpolate(t("workshop.bead.emptySample"), {
                  index: draft.emptySelection.cellIndex + 1,
                })}
              </p>
            ) : null}
            {draft.emptySelection?.kind === "none" ? (
              <p>{t("workshop.bead.noEmptySelected")}</p>
            ) : null}
            {draft.transparentSupportSampleCellIndex !== null ? (
              <p>
                {interpolate(t("workshop.bead.supportSample"), {
                  index:
                    draft.transparentSupportSampleCellIndex + 1,
                })}
              </p>
            ) : null}
          </div>

          {!validGrid ? (
            <StatusBanner tone="warning">
              {t("workshop.bead.gridInvalid")}
            </StatusBanner>
          ) : null}
          {validGrid && draft.emptySelection === null ? (
            <StatusBanner tone="warning">
              {t("workshop.bead.emptyDecisionRequired")}
            </StatusBanner>
          ) : null}
          <Button
            label={t(
              busy
                ? "workshop.bead.recognizing"
                : "workshop.bead.recognize",
            )}
            loading={busy}
            disabled={!canRecognize}
            onClick={onRecognize}
            className="button--full"
          />
        </section>

        <section className="panel panel--canvas">
          <div className="canvas-stage">
            <BeadSourceCanvas
              source={source}
              rows={draft.rows}
              columns={draft.columns}
              geometry={draft.geometry}
              ariaLabel={t("workshop.bead.calibrationCanvas")}
              pickMode={pickMode}
              emptyCellIndex={
                draft.emptySelection?.kind === "sample"
                  ? draft.emptySelection.cellIndex
                  : null
              }
              transparentSupportCellIndex={
                draft.transparentSupportSampleCellIndex
              }
              onPickCell={handleCellPick}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
