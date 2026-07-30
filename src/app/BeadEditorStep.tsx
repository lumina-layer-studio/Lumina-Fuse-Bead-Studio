import { useMemo, useState } from "react";

import type {
  BeadEditorAction,
  BeadEditorState,
  BeadEditorTool,
} from "../domain/editorReducer";
import { calculatePhysicalSize } from "../domain/project";
import type { BeadRenderResult } from "../domain/renderer";
import type { Raster, RgbColor } from "../domain/types";
import { interpolate } from "../i18n/translations";
import Button from "../ui/Button";
import Checkbox from "../ui/Checkbox";
import HelpDot from "../ui/HelpDot";
import Slider from "../ui/Slider";
import {
  PanelIntro,
  StatusBanner,
  workstationInputClass,
} from "../ui/panelPrimitives";
import { BeadMatrixCanvas } from "./BeadMatrixCanvas";
import { BeadSourceCanvas } from "./BeadSourceCanvas";

type EditorView = "original" | "matrix" | "pressure";

interface BeadEditorStepProps {
  state: BeadEditorState;
  renderResult: BeadRenderResult | null;
  renderBusy: boolean;
  sourceRaster: Raster | null;
  translate(key: string): string;
  dispatch(action: BeadEditorAction): void;
  onNewProject(): void;
  onHandoff?(): void;
  handoffBusy?: boolean;
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

export function BeadEditorStep({
  state,
  renderResult,
  renderBusy,
  sourceRaster,
  translate: t,
  dispatch,
  onNewProject,
  onHandoff,
  handoffBusy = false,
}: BeadEditorStepProps) {
  const [view, setView] = useState<EditorView>("matrix");
  const [showGrid, setShowGrid] = useState(true);
  const project = state.present;
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
  const size = calculatePhysicalSize(project, project.beadPitchMm);
  const hasColoredBeads = useMemo(
    () => project.cells.some((cell) => cell.kind === "color"),
    [project.cells],
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
    "eyedropper",
    "fill",
    "support",
  ];

  return (
    <div className="workbench-stack">
      <PanelIntro
        eyebrow={`${project.columns} × ${project.rows}`}
        title={t("workshop.bead.editorTitle")}
        description={t("workshop.bead.editorDescription")}
        action={
          <Button
            label={t("workshop.bead.newProject")}
            variant="secondary"
            onClick={onNewProject}
          />
        }
      />

      <div className="workbench-layout">
        <aside className="panel panel--controls">
          <div className="control-grid">
            {toolNames.map((tool) => (
              <button
                key={tool}
                type="button"
                aria-pressed={state.activeTool === tool}
                className="segmented-control"
                onClick={() => dispatch({ type: "set-tool", tool })}
              >
                {t(`workshop.bead.tool.${tool}`)}
              </button>
            ))}
          </div>

          <div className="control-row">
            <button
              type="button"
              className="segmented-control"
              onClick={() => dispatch({ type: "undo" })}
            >
              {t("workshop.bead.undo")}
            </button>
            <button
              type="button"
              className="segmented-control"
              onClick={() => dispatch({ type: "redo" })}
            >
              {t("workshop.bead.redo")}
            </button>
          </div>

          <div className="palette-row">
            {project.palette.map((color, index) => (
              <button
                key={`${color.join("-")}-${index}`}
                type="button"
                aria-label={interpolate(
                  t("workshop.bead.paletteColor"),
                  { index: index + 1 },
                )}
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

          <div>
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
          </div>

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

          <label className="field">
            <span className="label-with-help">
              <span className="field-label">
                {t("workshop.bead.beadPitch")}
              </span>
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

          <p className="physical-size">
            {interpolate(t("workshop.bead.physicalSize"), {
              width: formatMillimeters(size.widthMm),
              height: formatMillimeters(size.heightMm),
            })}
          </p>

          {onHandoff ? (
            <Button
              label={t("workshop.bead.handoff")}
              onClick={onHandoff}
              loading={handoffBusy}
              disabled={!hasColoredBeads}
              title={
                hasColoredBeads
                  ? t("workshop.bead.handoff")
                  : t("workshop.bead.handoffEmpty")
              }
              className="button--full"
            />
          ) : null}

          <Checkbox
            label={t("workshop.bead.showGrid")}
            checked={showGrid}
            onChange={setShowGrid}
          />
        </aside>

        <section className="panel panel--canvas">
          <div className="view-tabs">
            {(["original", "matrix", "pressure"] as const).map(
              (candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={view === candidate}
                  disabled={
                    candidate === "original" && sourceRaster === null
                  }
                  className="segmented-control"
                  onClick={() => setView(candidate)}
                >
                  {t(`workshop.bead.view.${candidate}`)}
                </button>
              ),
            )}
          </div>

          {renderBusy && view === "pressure" ? (
            <StatusBanner>
              {t("workshop.bead.rendering")}
            </StatusBanner>
          ) : null}

          <div className="canvas-stage">
            {view === "original" && sourceRaster && sourceGeometry ? (
              <BeadSourceCanvas
                source={sourceRaster}
                rows={project.rows}
                columns={project.columns}
                geometry={sourceGeometry}
                ariaLabel={t("workshop.bead.originalCanvas")}
              />
            ) : view === "pressure" ? (
              <BeadMatrixCanvas
                project={project}
                renderResult={renderResult}
                showGrid={false}
                selectedCellIndex={state.selectedCellIndex}
                ariaLabel={t("workshop.bead.pressureCanvas")}
              />
            ) : (
              <BeadMatrixCanvas
                project={project}
                showGrid={showGrid}
                selectedCellIndex={state.selectedCellIndex}
                onPickCell={applyAt}
                ariaLabel={t("workshop.bead.matrixCanvas")}
              />
            )}
          </div>

          {state.selectedCellIndex !== null ? (
            <div className="magnifier">
              <p>{t("workshop.bead.magnifier")}</p>
              <BeadMatrixCanvas
                project={project}
                ariaLabel={t("workshop.bead.magnifier")}
                showGrid
                selectedCellIndex={state.selectedCellIndex}
                viewport={{
                  centerCellIndex: state.selectedCellIndex,
                  radius: 2,
                }}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
