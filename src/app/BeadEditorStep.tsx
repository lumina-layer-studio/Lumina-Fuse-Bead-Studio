import type { WorkshopColorLibrary } from "@lumina/workshop-sdk";
import { useMemo, useState } from "react";

import type {
  BeadEditorAction,
  BeadEditorState,
  BeadEditorTool,
} from "../domain/editorReducer";
import { estimateBeadThicknessMm } from "../domain/beadThickness";
import {
  calculatePhysicalSize,
  trimEmptyBorder,
} from "../domain/project";
import type {
  BeadPrintMapping,
  Raster,
  RgbColor,
} from "../domain/types";
import { interpolate } from "../i18n/translations";
import Button from "../ui/Button";
import Checkbox from "../ui/Checkbox";
import HelpDot from "../ui/HelpDot";
import Slider from "../ui/Slider";
import {
  StatusBanner,
  workstationInputClass,
} from "../ui/panelPrimitives";
import { BeadEditorWorkspace } from "./BeadEditorWorkspace";
import { BeadCanvasViewport } from "./BeadCanvasViewport";
import { BeadMatrixCanvas } from "./BeadMatrixCanvas";
import { BeadFusionPreview } from "./BeadFusionPreview";
import { BeadSourceCanvas } from "./BeadSourceCanvas";
import {
  BeadThreePreview,
  MAX_THREE_PREVIEW_BEADS,
  supportsBeadThreePreviewCount,
} from "./BeadThreePreview";

type AuxiliaryView = "original" | "matrix" | "pressure";
type WorkbenchMode = "edit" | "fusion" | "print";

interface BeadEditorStepProps {
  state: BeadEditorState;
  sourceRaster: Raster | null;
  translate(key: string): string;
  dispatch(action: BeadEditorAction): void;
  onNewProject(): void;
  onReturnCalibration?(): void;
  onHandoff?(trigger: HTMLButtonElement): void;
  handoffBusy?: boolean;
  colorLibrary?: WorkshopColorLibrary | null;
  colorLibraryRefreshing?: boolean;
  printMapping?: BeadPrintMapping | null;
  printMappingStale?: boolean;
  previewColorMode?: "source" | "print";
  displayPalette?: RgbColor[] | null;
  onPreviewColorModeChange?(mode: "source" | "print"): void;
  onReloadColorLibrary?(): void;
  onRefreshPrintMapping?(): void;
  onSetPrintMappingEntry?(
    sourcePaletteIndex: number,
    colorEntryId: string,
  ): void;
}

function toHex(color: RgbColor): string {
  return `#${color
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function fromHex(value: string): RgbColor | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return [
    (number >> 16) & 255,
    (number >> 8) & 255,
    number & 255,
  ];
}

function formatMillimeters(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function EditorToolIcon({ tool }: { tool: BeadEditorTool }) {
  const commonProps = {
    "aria-hidden": true,
    className: "editor-tool-button__icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (tool === "paint") {
    return (
      <svg {...commonProps}>
        <path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
        <path d="m13.8 7.2 3 3" />
      </svg>
    );
  }
  if (tool === "erase") {
    return (
      <svg {...commonProps}>
        <path d="m5 15.5 7.8-7.8a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L12.5 19H8.4L5 15.5Z" />
        <path d="m10.5 10 5.5 5.5M12.5 19H20" />
      </svg>
    );
  }
  if (tool === "eraseFill") {
    return (
      <svg {...commonProps}>
        <path d="M5 7h5v5H5zM14 7h5v5h-5zM5 16h5M14 16h5" />
        <path d="M6.5 19h11" />
      </svg>
    );
  }
  if (tool === "eyedropper") {
    return (
      <svg {...commonProps}>
        <path d="m14.5 5.5 4 4M7 17l8.8-8.8M5 19l2-2 3 3-2 2H5v-3Z" />
        <path d="m13.5 5.5 1.2-1.2a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-1.2 1.2" />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <path d="m4.5 12 7.3-7.3 7.5 7.5-7.3 7.3L4.5 12Z" />
      <path d="m8.5 8.5 7 7M4 20h16" />
    </svg>
  );
}

export function BeadEditorStep({
  state,
  sourceRaster,
  translate: t,
  dispatch,
  onNewProject,
  onReturnCalibration,
  onHandoff,
  handoffBusy = false,
  colorLibrary = null,
  colorLibraryRefreshing = false,
  printMapping = null,
  printMappingStale = false,
  previewColorMode = "source",
  displayPalette = null,
  onPreviewColorModeChange,
  onReloadColorLibrary,
  onRefreshPrintMapping,
  onSetPrintMappingEntry,
}: BeadEditorStepProps) {
  const [workbenchMode, setWorkbenchMode] =
    useState<WorkbenchMode>("edit");
  const [auxiliaryView, setAuxiliaryView] =
    useState<AuxiliaryView>("matrix");
  const [auxiliaryExpanded, setAuxiliaryExpanded] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const project = state.present;
  const outputProject = useMemo(
    () =>
      project.canvasMode === "auto-expand"
        ? trimEmptyBorder(project)
        : project,
    [project],
  );
  const unresolvedIssueIndices = useMemo(
    () =>
      project.confidenceIssues.flatMap((issue, index) =>
        issue.resolved ? [] : [index],
      ),
    [project.confidenceIssues],
  );
  const selectedPendingPosition = unresolvedIssueIndices.indexOf(
    state.selectedIssueIndex ?? -1,
  );
  const size = calculatePhysicalSize(
    outputProject,
    project.beadPitchMm,
  );
  const estimatedThicknessMm = estimateBeadThicknessMm(
    project.compression,
    project.beadPitchMm,
  );
  const hasColoredBeads = useMemo(
    () => project.cells.some((cell) => cell.kind === "color"),
    [project.cells],
  );
  const coloredBeadCount = useMemo(
    () =>
      project.cells.reduce(
        (count, cell) => count + (cell.kind === "color" ? 1 : 0),
        0,
      ),
    [project.cells],
  );
  const supportsThreePreview = supportsBeadThreePreviewCount(
    coloredBeadCount,
  );
  const hasCurrentPrintMapping =
    colorLibrary !== null &&
    printMapping !== null &&
    printMapping.libraryId === colorLibrary.id &&
    !printMappingStale;
  const displayProject = useMemo(
    () =>
      displayPalette
        ? {
            ...project,
            palette: displayPalette.map(
              (color) => [...color] as RgbColor,
            ),
          }
        : project,
    [displayPalette, project],
  );
  const mappingByPaletteIndex = useMemo(
    () =>
      new Map(
        printMapping?.entries.map((entry) => [
          entry.sourcePaletteIndex,
          entry.colorEntryId,
        ]) ?? [],
      ),
    [printMapping],
  );

  const selectIssue = (direction: -1 | 1) => {
    if (unresolvedIssueIndices.length === 0) return;
    const next =
      selectedPendingPosition < 0
        ? direction < 0
          ? unresolvedIssueIndices.length - 1
          : 0
        : (selectedPendingPosition +
            direction +
            unresolvedIssueIndices.length) %
          unresolvedIssueIndices.length;
    dispatch({
      type: "select-issue",
      issueIndex: unresolvedIssueIndices[next],
    });
  };

  const applyAt = (cellIndex: number) => {
    dispatch({
      type: "apply-tool",
      tool: state.activeTool,
      cellIndex,
      paletteIndex: state.activePaletteIndex,
      updatedAt: new Date().toISOString(),
    });
  };

  const sourceGeometry = sourceRaster
    ? {
        originX: 0,
        originY: 0,
        cellWidth: sourceRaster.width / project.columns,
        cellHeight: sourceRaster.height / project.rows,
      }
    : null;

  const toolNames: BeadEditorTool[] = [
    "paint",
    "erase",
    "eraseFill",
    "eyedropper",
    "fill",
  ];

  const renderAuxiliaryCanvas = () => {
    if (auxiliaryView === "original" && sourceRaster && sourceGeometry) {
      return (
        <BeadSourceCanvas
          source={sourceRaster}
          rows={project.rows}
          columns={project.columns}
          geometry={sourceGeometry}
          ariaLabel={t("workshop.bead.originalCanvas")}
        />
      );
    }
    if (auxiliaryView === "pressure") {
      return (
        <BeadFusionPreview
          project={displayProject}
          ariaLabel={t("workshop.bead.pressureCanvas")}
        />
      );
    }
    return (
      <BeadMatrixCanvas
        project={displayProject}
        showGrid={showGrid}
        selectedCellIndex={state.selectedCellIndex}
        onPickCell={
          auxiliaryExpanded && workbenchMode === "edit"
            ? applyAt
            : undefined
        }
        allowDrag={
          auxiliaryExpanded &&
          workbenchMode === "edit" &&
          (state.activeTool === "paint" || state.activeTool === "erase")
        }
        ariaLabel={t("workshop.bead.matrixCanvas")}
      />
    );
  };

  const previewColorControls = (
    <div className="bead-editor-preview-colors">
      <span className="field-label">
        {t("workshop.bead.printMappingTitle")}
      </span>
      <div className="bead-editor-inline-segmented">
        <button
          type="button"
          className="segmented-control"
          aria-pressed={previewColorMode === "source"}
          onClick={() => onPreviewColorModeChange?.("source")}
        >
          {t("workshop.bead.preview.source")}
        </button>
        <button
          type="button"
          className="segmented-control"
          aria-pressed={previewColorMode === "print"}
          disabled={!hasCurrentPrintMapping}
          onClick={() => onPreviewColorModeChange?.("print")}
        >
          {t("workshop.bead.preview.print")}
        </button>
      </div>
    </div>
  );

  const paletteControls = (
    <div className="bead-editor-mode-content bead-editor-mode-content--edit">
      {previewColorControls}
      <div className="bead-editor-palette-strip">
        <span className="field-label">
          {t("workshop.bead.paletteTitle")}
        </span>
        <div className="palette-row">
          {project.palette.map((color, index) => (
            <button
              key={`${color.join("-")}-${index}`}
              type="button"
              aria-label={interpolate(t("workshop.bead.paletteColor"), {
                index: index + 1,
              })}
              aria-pressed={state.activePaletteIndex === index}
              className="palette-swatch"
              style={{
                backgroundColor: `rgb(${color[0]} ${color[1]} ${color[2]})`,
              }}
              onClick={() =>
                dispatch({ type: "set-palette", paletteIndex: index })
              }
            />
          ))}
          <label className="color-input">
            <span>{t("workshop.bead.customColor")}</span>
            <input
              type="color"
              aria-label={t("workshop.bead.customColor")}
              value={toHex(
                project.palette[state.activePaletteIndex] ??
                  project.palette[0] ??
                  ([0, 0, 0] as RgbColor),
              )}
              onChange={(event) => {
                const color = fromHex(event.target.value);
                if (color) {
                  dispatch({
                    type: "add-palette-color",
                    color,
                    updatedAt: new Date().toISOString(),
                  });
                }
              }}
            />
          </label>
        </div>
      </div>
      <p className="editor-tool-hint" aria-live="polite">
        {t(`workshop.bead.toolHint.${state.activeTool}`)}
      </p>
    </div>
  );

  const fusionControls = (
    <div className="bead-editor-mode-content bead-editor-mode-content--fusion">
      <div className="bead-editor-fusion-primary">
        <Slider
          label={t("workshop.bead.compression")}
          tooltip={t("workshop.bead.compressionHint")}
          value={project.compression}
          min={0}
          max={100}
          step={1}
          onChange={(compression) =>
            dispatch({
              type: "set-compression",
              compression,
              updatedAt: new Date().toISOString(),
            })
          }
        />
        <div className="control-grid control-grid--three">
          {(
            [
              [0, "workshop.bead.pressureLight"],
              [50, "workshop.bead.pressureStandard"],
              [100, "workshop.bead.pressureTight"],
            ] as const
          ).map(([compression, key]) => (
            <button
              key={compression}
              type="button"
              aria-pressed={project.compression === compression}
              className="segmented-control"
              onClick={() =>
                dispatch({
                  type: "set-compression",
                  compression,
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
      <Slider
        label={t("workshop.bead.irregularity")}
        tooltip={t("workshop.bead.irregularityHint")}
        value={project.irregularity ?? 0}
        min={0}
        max={100}
        step={1}
        unit="%"
        onChange={(irregularity) =>
          dispatch({
            type: "set-irregularity",
            irregularity,
            updatedAt: new Date().toISOString(),
          })
        }
      />
      <label className="field bead-editor-pitch-field">
        <span className="label-with-help">
          <span className="field-label">{t("workshop.bead.beadPitch")}</span>
          <HelpDot
            title={t("workshop.bead.beadPitch")}
            description={t("workshop.bead.beadPitchHint")}
          />
        </span>
        <input
          aria-label={t("workshop.bead.beadPitch")}
          type="number"
          min={0.5}
          max={10}
          step={0.1}
          value={project.beadPitchMm}
          className={workstationInputClass}
          onChange={(event) =>
            dispatch({
              type: "set-bead-pitch",
              beadPitchMm: Number(event.target.value),
              updatedAt: new Date().toISOString(),
            })
          }
        />
      </label>
      <div className="bead-editor-size-summary">
        <p className="physical-size">
          {interpolate(t("workshop.bead.physicalSize"), {
            width: formatMillimeters(size.widthMm),
            height: formatMillimeters(size.heightMm),
          })}
        </p>
        <p className="physical-size">
          {interpolate(t("workshop.bead.estimatedThickness"), {
            thickness: formatMillimeters(estimatedThicknessMm),
          })}
        </p>
      </div>
    </div>
  );

  const printControls = (
    <div className="bead-editor-mode-content bead-editor-mode-content--print">
      {previewColorControls}
      <div className="bead-editor-print-status">
        {colorLibrary ? (
          <p className="sample-summary">
            {interpolate(t("workshop.bead.printLibraryLabel"), {
              label: colorLibrary.label,
            })}
          </p>
        ) : (
          <>
            <StatusBanner>
              {t("workshop.bead.printLibraryUnavailable")}
            </StatusBanner>
            <Button
              label={t("workshop.bead.reloadPrintLibrary")}
              variant="secondary"
              size="small"
              loading={colorLibraryRefreshing}
              onClick={onReloadColorLibrary}
            />
          </>
        )}
        {colorLibrary && !printMapping ? (
          <Button
            label={t("workshop.bead.createPrintMapping")}
            variant="secondary"
            size="small"
            onClick={onRefreshPrintMapping}
          />
        ) : null}
        {colorLibrary && printMappingStale ? (
          <>
            <StatusBanner tone="warning">
              {t("workshop.bead.printMappingStale")}
            </StatusBanner>
            <Button
              label={t("workshop.bead.refreshPrintMapping")}
              variant="secondary"
              size="small"
              onClick={onRefreshPrintMapping}
            />
          </>
        ) : null}
      </div>
      {colorLibrary && hasCurrentPrintMapping ? (
        <div className="print-mapping-list">
          {project.palette.map((sourceColor, index) => (
            <label className="print-mapping-row" key={index}>
              <span
                className="print-mapping-row__source"
                aria-hidden
                style={{
                  backgroundColor: `rgb(${sourceColor[0]} ${sourceColor[1]} ${sourceColor[2]})`,
                }}
              />
              <span className="field-label">
                {interpolate(t("workshop.bead.printColorFor"), {
                  index: index + 1,
                })}
              </span>
              <select
                className={workstationInputClass}
                aria-label={interpolate(t("workshop.bead.printColorFor"), {
                  index: index + 1,
                })}
                value={mappingByPaletteIndex.get(index) ?? ""}
                onChange={(event) =>
                  onSetPrintMappingEntry?.(index, event.target.value)
                }
              >
                {colorLibrary.colors.map((entry, entryIndex) => (
                  <option key={`${entry.id}-${entryIndex}`} value={entry.id}>
                    {entry.label} · {entry.hex}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <BeadEditorWorkspace
      labels={{
        project: t("workshop.bead.workspace.project"),
        workflow: t("workshop.bead.workspace.workflow"),
        tools: t("workshop.bead.toolsTitle"),
        modeControls: t("workshop.bead.workspace.modeControls"),
        output: t("workshop.bead.workspace.output"),
        auxiliary: t("workshop.bead.workspace.auxiliary"),
      }}
      projectControls={
        <div className="bead-editor-project-control">
          <span className="bead-editor-project-control__title">
            {t("workshop.bead.workspace.untitled")}
          </span>
          <span className="bead-editor-project-control__size">
            {project.columns} × {project.rows}
          </span>
          <details className="bead-editor-project-menu">
            <summary aria-label={t("workshop.bead.workspace.projectMenu")}>⋮</summary>
            <div className="bead-editor-project-menu__content">
              {sourceRaster !== null && onReturnCalibration ? (
                <Button
                  label={t("workshop.bead.returnCalibration")}
                  variant="secondary"
                  size="small"
                  onClick={onReturnCalibration}
                />
              ) : null}
              <Button
                label={t("workshop.bead.newProject")}
                variant="secondary"
                size="small"
                onClick={onNewProject}
              />
              <p className="review-summary">
                {interpolate(t("workshop.bead.reviewSummary"), {
                  pending: unresolvedIssueIndices.length,
                  total: project.confidenceIssues.length,
                })}
              </p>
              <div className="control-row">
                <button
                  type="button"
                  className="segmented-control"
                  disabled={unresolvedIssueIndices.length === 0}
                  onClick={() => selectIssue(-1)}
                >
                  {t("workshop.bead.previousIssue")}
                </button>
                <button
                  type="button"
                  className="segmented-control"
                  disabled={unresolvedIssueIndices.length === 0}
                  onClick={() => selectIssue(1)}
                >
                  {t("workshop.bead.nextIssue")}
                </button>
              </div>
              <Checkbox
                label={t("workshop.bead.showGrid")}
                checked={showGrid}
                onChange={setShowGrid}
              />
            </div>
          </details>
        </div>
      }
      workflowControls={
        <div className="bead-editor-workflow-tabs">
          {(["edit", "fusion", "print"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={workbenchMode === mode}
              className="segmented-control"
              onClick={() => setWorkbenchMode(mode)}
            >
              {t(`workshop.bead.workspace.mode.${mode}`)}
            </button>
          ))}
        </div>
      }
      toolControls={
        workbenchMode === "edit" ? (
          <>
            <div className="bead-editor-tool-rail">
              {toolNames.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={state.activeTool === tool}
                  className="segmented-control editor-tool-button"
                  title={t(`workshop.bead.toolHint.${tool}`)}
                  onClick={() => dispatch({ type: "set-tool", tool })}
                >
                  <EditorToolIcon tool={tool} />
                  <span>{t(`workshop.bead.tool.${tool}`)}</span>
                </button>
              ))}
            </div>
            <div className="editor-history-row">
              <button
                type="button"
                className="segmented-control"
                disabled={state.past.length === 0}
                onClick={() => dispatch({ type: "undo" })}
              >
                {t("workshop.bead.undo")}
              </button>
              <button
                type="button"
                className="segmented-control"
                disabled={state.future.length === 0}
                onClick={() => dispatch({ type: "redo" })}
              >
                {t("workshop.bead.redo")}
              </button>
            </div>
          </>
        ) : null
      }
      modeControls={
        workbenchMode === "edit"
          ? paletteControls
          : workbenchMode === "fusion"
            ? fusionControls
            : printControls
      }
      outputControls={
        <>
          <span className="bead-editor-output-summary">
            {project.compression}% · {formatMillimeters(project.beadPitchMm)} mm ·{" "}
            {formatMillimeters(size.widthMm)} × {formatMillimeters(size.heightMm)} mm
          </span>
          {onHandoff ? (
            <Button
              label={t("workshop.bead.handoff")}
              className="bead-editor-output-button"
              icon={
                <span
                  className="bead-editor-output-button__compact"
                  aria-hidden
                >
                  {t("workshop.bead.workspace.printShort")}
                </span>
              }
              onClick={(event) => onHandoff(event.currentTarget)}
              loading={handoffBusy}
              disabled={!hasColoredBeads}
              title={
                hasColoredBeads
                  ? t("workshop.bead.handoff")
                  : t("workshop.bead.handoffEmpty")
              }
            />
          ) : null}
        </>
      }
      canvas={
        <>
          <h1 className="bead-editor-workspace__title">
            {t("workshop.bead.editorTitle")}
          </h1>
          <div className="canvas-stage">
            <div className="bead-three-preview-stack">
              <BeadThreePreview
                project={displayProject}
                translate={t}
                onPickCell={workbenchMode === "edit" ? applyAt : undefined}
                allowDrag={
                  workbenchMode === "edit" &&
                  (state.activeTool === "paint" || state.activeTool === "erase")
                }
                selectedCellIndex={state.selectedCellIndex}
                editingEnabled={workbenchMode === "edit"}
                ariaLabel={t(
                  supportsThreePreview
                    ? "workshop.bead.threeCanvas"
                    : "workshop.bead.threeFallbackCanvas",
                )}
              />
              <p className="bead-three-preview__hint">
                {supportsThreePreview
                  ? t("workshop.bead.threeHint")
                  : interpolate(t("workshop.bead.threeLimitHint"), {
                      count: coloredBeadCount,
                      limit: MAX_THREE_PREVIEW_BEADS,
                    })}
              </p>
            </div>
          </div>
        </>
      }
      auxiliaryExpanded={auxiliaryExpanded}
      onCollapseAuxiliary={() => setAuxiliaryExpanded(false)}
      auxiliaryView={
        <div className="bead-editor-auxiliary">
          <header className="bead-editor-auxiliary__header">
            <strong>{t("workshop.bead.workspace.auxiliary")}</strong>
            <button
              type="button"
              className="segmented-control"
              aria-label={t(
                auxiliaryExpanded
                  ? "workshop.bead.workspace.auxiliaryCollapse"
                  : "workshop.bead.workspace.auxiliaryExpand",
              )}
              aria-expanded={auxiliaryExpanded}
              onClick={() => setAuxiliaryExpanded((expanded) => !expanded)}
            >
              {auxiliaryExpanded ? "↙" : "↗"}
            </button>
          </header>
          <div
            className="bead-editor-auxiliary__tabs"
            role="toolbar"
            aria-label={t("workshop.bead.workspace.auxiliaryViews")}
            hidden={!auxiliaryExpanded}
          >
            {(["matrix", "pressure", "original"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                className="segmented-control"
                aria-pressed={auxiliaryView === candidate}
                disabled={candidate === "original" && sourceRaster === null}
                onClick={() => setAuxiliaryView(candidate)}
              >
                {t(`workshop.bead.view.${candidate}`)}
              </button>
            ))}
          </div>
          <div className="bead-editor-auxiliary__canvas">
            {auxiliaryExpanded ? (
              <BeadCanvasViewport
                viewKey={auxiliaryView}
                contentWidth={
                  auxiliaryView === "original" && sourceRaster
                    ? sourceRaster.width
                    : project.columns * 12
                }
                contentHeight={
                  auxiliaryView === "original" && sourceRaster
                    ? sourceRaster.height
                    : project.rows * 12
                }
                ariaLabel={t(
                  auxiliaryView === "original"
                    ? "workshop.bead.originalCanvas"
                    : auxiliaryView === "pressure"
                      ? "workshop.bead.pressureCanvas"
                      : "workshop.bead.matrixCanvas",
                )}
                translate={t}
              >
                {renderAuxiliaryCanvas()}
              </BeadCanvasViewport>
            ) : (
              renderAuxiliaryCanvas()
            )}
          </div>
          {!auxiliaryExpanded && state.selectedCellIndex !== null ? (
            <div
              className="bead-editor-auxiliary__inspection"
              role="group"
              aria-label={t("workshop.bead.magnifier")}
            >
              <BeadMatrixCanvas
                project={displayProject}
                selectedCellIndex={state.selectedCellIndex}
                viewport={{ centerCellIndex: state.selectedCellIndex, radius: 2 }}
                showGrid
                ariaLabel={t("workshop.bead.magnifier")}
              />
            </div>
          ) : null}
        </div>
      }
    />
  );
}
