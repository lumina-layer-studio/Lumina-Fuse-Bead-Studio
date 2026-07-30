import type {
  WorkshopClient,
  WorkshopImageHandoff,
} from "@lumina/workshop-sdk";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  beadEditorReducer,
  createBeadEditorState,
  type BeadEditorAction,
  type BeadEditorState,
} from "../domain/editorReducer";
import {
  calculatePhysicalSize,
  createBeadProject,
  createBeadRecipeSource,
} from "../domain/project";
import { cropRaster, suggestGrid } from "../domain/recognition";
import type { BeadRenderResult } from "../domain/renderer";
import {
  BEAD_MODULE_VERSION,
  type BeadProject,
  type BeadProjectSource,
  type CropRect,
  type PatternClassification,
  type Raster,
  type RecognitionRequest,
  type RecognitionResult,
} from "../domain/types";
import {
  latestBeadProject,
  pickBeadSource,
  saveBeadProject,
} from "../host/hostAdapter";
import {
  browserBeadImageCodec,
  type BeadImageCodec,
} from "../host/imageCodec";
import { translate, type Locale } from "../i18n/translations";
import Button from "../ui/Button";
import CropModal from "../ui/CropModal";
import {
  PanelIntro,
  StatusBanner,
  mutedSectionCardClass,
} from "../ui/panelPrimitives";
import {
  BeadWorkerClient,
  BeadWorkerClientError,
  type BeadWorkerTask,
} from "../worker/workerClient";
import {
  BeadCalibrationStep,
  type BeadCalibrationDraft,
} from "./BeadCalibrationStep";
import { BeadEditorStep } from "./BeadEditorStep";
import { BeadHandoffConfirmDialog } from "./BeadHandoffConfirmDialog";

export type { BeadImageCodec } from "../host/imageCodec";

type BeadWorkflowStage =
  | "loading"
  | "upload"
  | "calibration"
  | "editor";

export interface BeadProcessingEngine {
  classify(source: Raster): BeadWorkerTask<PatternClassification>;
  recognize(
    request: RecognitionRequest,
  ): BeadWorkerTask<RecognitionResult>;
  render(
    project: BeadProject,
    compression: number,
    pixelsPerCell: number,
  ): BeadWorkerTask<BeadRenderResult>;
  cancelBefore(requestId: number): void;
  cancel(requestId: number): void;
  dispose(): void;
}

interface BeadWorkshopModuleProps {
  client: WorkshopClient;
  locale: Locale;
  createEngine?: () => BeadProcessingEngine;
  imageCodec?: BeadImageCodec;
  autosaveDelayMs?: number;
}

interface PendingHandoff {
  base: Omit<WorkshopImageHandoff, "pngBytes">;
  pngBytes: ArrayBuffer;
}

function defaultEngine(): BeadProcessingEngine {
  return new BeadWorkerClient();
}

function generatedProjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `bead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function draftForRaster(
  source: Raster,
  mode: BeadCalibrationDraft["inputMode"],
): BeadCalibrationDraft {
  const suggestion = suggestGrid(source, mode);
  return {
    inputMode: mode,
    rows: suggestion.rows,
    columns: suggestion.columns,
    geometry: suggestion.geometry,
    orientation: {
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    },
    emptySelection: null,
    transparentSupportSampleCellIndex: null,
  };
}

function normalizedCrop(
  source: Raster,
  crop: CropRect,
): CropRect {
  const x = Math.min(
    source.width - 1,
    Math.max(0, Math.round(crop.x)),
  );
  const y = Math.min(
    source.height - 1,
    Math.max(0, Math.round(crop.y)),
  );
  return {
    x,
    y,
    width: Math.min(
      source.width - x,
      Math.max(1, Math.round(crop.width)),
    ),
    height: Math.min(
      source.height - y,
      Math.max(1, Math.round(crop.height)),
    ),
  };
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof BeadWorkerClientError &&
    error.code === "request-cancelled"
  );
}

function ignoreFailure(promise: Promise<unknown>): void {
  void promise.catch(() => undefined);
}

function payloadForHandoff(
  pending: PendingHandoff,
): WorkshopImageHandoff {
  return {
    ...pending.base,
    pngBytes: pending.pngBytes.slice(0),
  };
}

export function BeadWorkshopModule({
  client,
  locale,
  createEngine = defaultEngine,
  imageCodec = browserBeadImageCodec,
  autosaveDelayMs = 250,
}: BeadWorkshopModuleProps) {
  const t = useCallback(
    (key: string) => translate(locale, key),
    [locale],
  );
  const [stage, setStage] =
    useState<BeadWorkflowStage>("loading");
  const [initialized, setInitialized] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [visibleError, setVisibleError] =
    useState<string | null>(null);
  const [classification, setClassification] =
    useState<PatternClassification | null>(null);
  const [calibrationDraft, setCalibrationDraft] =
    useState<BeadCalibrationDraft | null>(null);
  const [originalRaster, setOriginalRaster] =
    useState<Raster | null>(null);
  const [workingRaster, setWorkingRaster] =
    useState<Raster | null>(null);
  const [projectSource, setProjectSource] =
    useState<BeadProjectSource | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [editorState, setEditorState] =
    useState<BeadEditorState | null>(null);
  const [renderResult, setRenderResult] =
    useState<BeadRenderResult | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [pendingHandoff, setPendingHandoff] =
    useState<PendingHandoff | null>(null);
  const [resumed, setResumed] = useState(false);
  const engineRef = useRef<BeadProcessingEngine | null>(null);
  const latestProjectRef = useRef<BeadProject | null>(null);
  const readyReportedRef = useRef(false);
  const editorProject = editorState?.present ?? null;

  const getEngine = useCallback(() => {
    engineRef.current ??= createEngine();
    return engineRef.current;
  }, [createEngine]);

  const dispatchEditor = useCallback((action: BeadEditorAction) => {
    setEditorState((current) =>
      current ? beadEditorReducer(current, action) : current,
    );
  }, []);

  const reportProcessingError = useCallback(
    (code: string) => {
      const message = t("workshop.bead.processingError");
      setVisibleError(message);
      ignoreFailure(
        client.status.error({
          code,
          message,
          retryable: true,
        }),
      );
    },
    [client.status, t],
  );

  const persistProject = useCallback(
    async (project: BeadProject) => {
      try {
        await saveBeadProject(client, project);
      } catch {
        const message = t("workshop.bead.saveError");
        setVisibleError(message);
        ignoreFailure(
          client.status.error({
            code: "project-save-failed",
            message,
            retryable: true,
          }),
        );
      }
    },
    [client, t],
  );

  useEffect(() => {
    if (!projectSource || typeof URL.createObjectURL !== "function") {
      setSourceUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(projectSource.blob);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [projectSource]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const project = await latestBeadProject(client);
        if (cancelled) return;
        if (!project) {
          setStage("upload");
          setInitialized(true);
          return;
        }
        setEditorState(createBeadEditorState(project));
        setStage("editor");
        setResumed(true);
        latestProjectRef.current = project;
        setProjectSource(project.source);
        if (project.source) {
          try {
            const decoded = await imageCodec.decode(project.source.blob);
            if (cancelled) return;
            setOriginalRaster(decoded);
            setCrop(project.calibration.crop);
            setWorkingRaster(
              project.calibration.crop
                ? cropRaster(decoded, project.calibration.crop)
                : decoded,
            );
          } catch {
            setOriginalRaster(null);
            setWorkingRaster(null);
          }
        }
        if (!cancelled) setInitialized(true);
      } catch {
        if (cancelled) return;
        reportProcessingError("project-restore-failed");
        setStage("upload");
        setInitialized(true);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [client, imageCodec, reportProcessingError]);

  useEffect(() => {
    latestProjectRef.current = editorProject;
    if (!editorProject || !initialized) return undefined;
    const timer = window.setTimeout(() => {
      void persistProject(editorProject);
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    autosaveDelayMs,
    editorProject,
    initialized,
    persistProject,
  ]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      const latest = latestProjectRef.current;
      if (latest) void persistProject(latest);
    },
    [persistProject],
  );

  useEffect(() => {
    const close = () => client.close();
    window.addEventListener("pagehide", close, { once: true });
    return () => window.removeEventListener("pagehide", close);
  }, [client]);

  useEffect(() => {
    if (!editorProject) {
      setRenderResult(null);
      setRenderBusy(false);
      return undefined;
    }
    let cancelled = false;
    const engine = getEngine();
    const project = editorProject;
    const previewTask = engine.render(
      project,
      project.compression,
      12,
    );
    engine.cancelBefore(previewTask.id);
    setRenderBusy(true);
    void previewTask.promise
      .then((result) => {
        if (!cancelled) setRenderResult(result);
      })
      .catch((error) => {
        if (!cancelled && !isCancellation(error)) {
          reportProcessingError("preview-render-failed");
        }
      });

    let fullTask: BeadWorkerTask<BeadRenderResult> | null = null;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      fullTask = engine.render(project, project.compression, 32);
      engine.cancelBefore(fullTask.id);
      void fullTask.promise
        .then((result) => {
          if (!cancelled) {
            setRenderResult(result);
            setRenderBusy(false);
          }
        })
        .catch((error) => {
          if (!cancelled && !isCancellation(error)) {
            setRenderBusy(false);
            reportProcessingError("full-render-failed");
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      engine.cancel(previewTask.id);
      if (fullTask) engine.cancel(fullTask.id);
    };
  }, [editorProject, getEngine, reportProcessingError]);

  useEffect(() => {
    if (!initialized || !editorProject) return;
    ignoreFailure(
      client.status.diagnostics({
        projectSchemaVersion: editorProject.schemaVersion,
        inputMode: editorProject.calibration.inputMode,
        rows: editorProject.rows,
        columns: editorProject.columns,
        compression: editorProject.compression,
        errorCode: null,
      }),
    );
  }, [client.status, editorProject, initialized]);

  useEffect(() => {
    if (!initialized || readyReportedRef.current) return;
    readyReportedRef.current = true;
    ignoreFailure(client.lifecycle.ready());
  }, [client.lifecycle, initialized]);

  const preparePickedImage = async (
    picked: Awaited<ReturnType<typeof pickBeadSource>>,
  ) => {
    if (!picked) return;
    setOriginalRaster(picked.raster);
    setWorkingRaster(picked.raster);
    setProjectSource(picked.source);
    setCrop(null);
    setClassification(null);
    setCalibrationDraft(draftForRaster(picked.raster, "hard-pixel"));
    setStage("calibration");
    setIsProcessing(true);

    try {
      const engine = getEngine();
      const task = engine.classify(picked.raster);
      engine.cancelBefore(task.id);
      const result = await task.promise;
      setClassification(result);
      const mode =
        result.mode === "ambiguous" ? "hard-pixel" : result.mode;
      setCalibrationDraft(draftForRaster(picked.raster, mode));
    } catch (error) {
      if (!isCancellation(error)) {
        reportProcessingError("pattern-classification-failed");
      }
    } finally {
      setIsProcessing(false);
      ignoreFailure(client.status.progress(null));
    }
  };

  const handlePickImage = async () => {
    setIsPicking(true);
    setVisibleError(null);
    setResumed(false);
    ignoreFailure(
      client.status.progress({
        phase: "pick-image",
        completed: 0,
        total: 1,
      }),
    );
    try {
      const picked = await pickBeadSource(client);
      if (picked) {
        await preparePickedImage(picked);
      } else {
        ignoreFailure(client.status.progress(null));
      }
    } catch {
      const message = t("workshop.bead.pickerError");
      setVisibleError(message);
      ignoreFailure(
        client.status.error({
          code: "image-pick-failed",
          message,
          retryable: true,
        }),
      );
      ignoreFailure(client.status.progress(null));
    } finally {
      setIsPicking(false);
    }
  };

  const handleCalibrationChange = (
    next: BeadCalibrationDraft,
  ) => {
    if (
      workingRaster &&
      calibrationDraft &&
      next.inputMode !== calibrationDraft.inputMode
    ) {
      setCalibrationDraft(
        draftForRaster(workingRaster, next.inputMode),
      );
      return;
    }
    setCalibrationDraft(next);
  };

  const applyCrop = (nextCrop: CropRect | null) => {
    if (!originalRaster) return;
    const nextRaster = nextCrop
      ? cropRaster(originalRaster, nextCrop)
      : originalRaster;
    setCrop(nextCrop);
    setWorkingRaster(nextRaster);
    setCalibrationDraft(
      draftForRaster(
        nextRaster,
        calibrationDraft?.inputMode ?? "hard-pixel",
      ),
    );
    setCropOpen(false);
  };

  const handleRecognize = async () => {
    if (!workingRaster || !calibrationDraft) return;
    setIsProcessing(true);
    setVisibleError(null);
    ignoreFailure(
      client.status.progress({
        phase: "recognize-pattern",
        completed: 0,
        total: 1,
      }),
    );
    try {
      const engine = getEngine();
      const task = engine.recognize({
        source: workingRaster,
        mode: calibrationDraft.inputMode,
        rows: calibrationDraft.rows,
        columns: calibrationDraft.columns,
        geometry: calibrationDraft.geometry,
        emptySelection:
          calibrationDraft.emptySelection ?? { kind: "none" },
        transparentSupportSampleCellIndex:
          calibrationDraft.transparentSupportSampleCellIndex,
        orientation: calibrationDraft.orientation,
      });
      engine.cancelBefore(task.id);
      const result = await task.promise;
      const now = new Date().toISOString();
      const project = createBeadProject({
        projectId: generatedProjectId(),
        moduleVersion: BEAD_MODULE_VERSION,
        now,
        rows: result.rows,
        columns: result.columns,
        palette:
          result.palette.length > 0
            ? result.palette
            : [[0, 0, 0]],
        cells: result.cells,
        source: projectSource,
        calibration: {
          inputMode: result.mode,
          crop,
          origin: {
            x: calibrationDraft.geometry.originX,
            y: calibrationDraft.geometry.originY,
          },
          orientation: calibrationDraft.orientation,
          emptySelection:
            calibrationDraft.emptySelection ?? { kind: "none" },
          transparentSupportSampleCellIndex:
            calibrationDraft.transparentSupportSampleCellIndex,
        },
        confidenceIssues: result.confidenceIssues,
      });
      setEditorState(createBeadEditorState(project));
      setStage("editor");
      setResumed(false);
      latestProjectRef.current = project;
      ignoreFailure(client.status.progress(null));
    } catch (error) {
      if (!isCancellation(error)) {
        reportProcessingError("pattern-recognition-failed");
      }
      ignoreFailure(client.status.progress(null));
    } finally {
      setIsProcessing(false);
    }
  };

  const reportHandoffError = () => {
    const message = t("workshop.bead.handoffError");
    setVisibleError(message);
    ignoreFailure(
      client.status.error({
        code: "bead-handoff-failed",
        message,
        retryable: true,
      }),
    );
  };

  const sendHandoff = async (handoff: PendingHandoff) =>
    client.handoff.image(payloadForHandoff(handoff));

  const handleHandoff = async () => {
    const project = editorState?.present;
    if (
      !project ||
      !project.cells.some((cell) => cell.kind === "color")
    ) {
      reportHandoffError();
      return;
    }

    setHandoffBusy(true);
    setVisibleError(null);
    ignoreFailure(
      client.status.progress({
        phase: "render-handoff",
        completed: 0,
        total: 1,
      }),
    );
    try {
      const engine = getEngine();
      const task = engine.render(project, project.compression, 32);
      engine.cancelBefore(task.id);
      const raster = await task.promise;
      const pngBytes = await imageCodec.encodePng(raster);
      const size = calculatePhysicalSize(
        project,
        project.beadPitchMm,
      );
      const handoff: PendingHandoff = {
        base: {
          moduleId: project.moduleId,
          moduleVersion: project.moduleVersion,
          projectId: project.projectId,
          pixelWidth: raster.width,
          pixelHeight: raster.height,
          recommendedWidthMm: size.widthMm,
          recommendedHeightMm: size.heightMm,
          preserveCanvasBounds: true,
          layout: {
            kind: "square-grid",
            rows: project.rows,
            columns: project.columns,
            pitchMm: project.beadPitchMm,
          },
          colorLibraryId: null,
          recipeSource: structuredClone(
            createBeadRecipeSource(project),
          ),
        },
        pngBytes: pngBytes.slice(0),
      };
      const result = await sendHandoff(handoff);
      setPendingHandoff(
        result.status === "needs-confirmation" ? handoff : null,
      );
    } catch (error) {
      if (!isCancellation(error)) reportHandoffError();
    } finally {
      setHandoffBusy(false);
      ignoreFailure(client.status.progress(null));
    }
  };

  const confirmHandoff = async () => {
    if (!pendingHandoff) return;
    setHandoffBusy(true);
    setVisibleError(null);
    try {
      await sendHandoff(pendingHandoff);
      setPendingHandoff(null);
    } catch {
      reportHandoffError();
    } finally {
      setHandoffBusy(false);
    }
  };

  const handleNewProject = () => {
    const latest = latestProjectRef.current;
    if (latest) void persistProject(latest);
    engineRef.current?.cancelBefore(Number.MAX_SAFE_INTEGER);
    setEditorState(null);
    setStage("upload");
    setClassification(null);
    setCalibrationDraft(null);
    setOriginalRaster(null);
    setWorkingRaster(null);
    setProjectSource(null);
    setCrop(null);
    setRenderResult(null);
    setPendingHandoff(null);
    setHandoffBusy(false);
    setVisibleError(null);
    setResumed(false);
    latestProjectRef.current = null;
  };

  return (
    <main className="module-shell">
      <div className="workbench-stack">
        {visibleError ? (
          <StatusBanner tone="error">{visibleError}</StatusBanner>
        ) : null}
        {resumed && stage === "editor" ? (
          <StatusBanner tone="success">
            {t("workshop.bead.resumeReady")}
          </StatusBanner>
        ) : null}

        {stage === "loading" ? (
          <section className="panel panel--controls">
            <StatusBanner>
              {t("workshop.bead.loadingProject")}
            </StatusBanner>
          </section>
        ) : null}

        {stage === "upload" ? (
          <>
            <PanelIntro
              eyebrow="Lumina"
              title={t("app.name")}
              description={t("workshop.bead.intro")}
            />
            <section
              className={`${mutedSectionCardClass} panel--controls`}
            >
              <div>
                <p className="review-summary">
                  {t("workshop.bead.supportedInputs")}
                </p>
                <p className="sample-summary">
                  {t("workshop.bead.localPrivacy")}
                </p>
              </div>
              <Button
                label={t("workshop.bead.choosePattern")}
                loading={isPicking}
                onClick={handlePickImage}
              />
            </section>
          </>
        ) : null}

        {stage === "calibration" &&
        workingRaster &&
        calibrationDraft ? (
          <BeadCalibrationStep
            source={workingRaster}
            fileName={projectSource?.fileName ?? ""}
            classification={classification}
            draft={calibrationDraft}
            busy={isProcessing}
            translate={t}
            onChange={handleCalibrationChange}
            onRecognize={handleRecognize}
            onOpenCrop={() => setCropOpen(true)}
            canCrop={Boolean(sourceUrl)}
          />
        ) : null}

        {stage === "editor" && editorState ? (
          <BeadEditorStep
            state={editorState}
            renderResult={renderResult}
            renderBusy={renderBusy}
            sourceRaster={workingRaster}
            translate={t}
            dispatch={dispatchEditor}
            onNewProject={handleNewProject}
            onHandoff={handleHandoff}
            handoffBusy={handoffBusy}
          />
        ) : null}

        <BeadHandoffConfirmDialog
          open={pendingHandoff !== null}
          busy={handoffBusy}
          translate={t}
          onCancel={() => setPendingHandoff(null)}
          onConfirm={confirmHandoff}
        />

        {sourceUrl && originalRaster ? (
          <CropModal
            open={cropOpen}
            imageSrc={sourceUrl}
            imageWidth={originalRaster.width}
            imageHeight={originalRaster.height}
            translate={t}
            onConfirm={(cropData) =>
              applyCrop(normalizedCrop(originalRaster, cropData))
            }
            onUseOriginal={() => applyCrop(null)}
            onClose={() => setCropOpen(false)}
          />
        ) : null}
      </div>
    </main>
  );
}
