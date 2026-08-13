import { useEffect, useRef, type ReactNode } from "react";

export interface BeadEditorWorkspaceLabels {
  project: string;
  workflow: string;
  tools: string;
  modeControls: string;
  output: string;
  auxiliary: string;
}

export interface BeadEditorWorkspaceProps {
  mode: "edit" | "fusion" | "print";
  labels: BeadEditorWorkspaceLabels;
  projectControls: ReactNode;
  workflowControls: ReactNode;
  toolControls: ReactNode;
  modeControls: ReactNode;
  outputControls: ReactNode;
  canvas: ReactNode;
  auxiliaryView?: ReactNode;
  auxiliaryExpanded?: boolean;
  onCollapseAuxiliary?(): void;
}

/**
 * 浏览器端拼豆主工作区：让 3D 画布保持稳定，只将当前任务需要的控件覆盖在画布四周。
 * Browser-side bead workspace that keeps the 3D canvas stable and overlays only
 * the controls required by the active workflow.
 */
export function BeadEditorWorkspace({
  mode,
  labels,
  projectControls,
  workflowControls,
  toolControls,
  modeControls,
  outputControls,
  canvas,
  auxiliaryView,
  auxiliaryExpanded = false,
  onCollapseAuxiliary,
}: BeadEditorWorkspaceProps) {
  const auxiliaryRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCollapseAuxiliaryRef = useRef(onCollapseAuxiliary);
  onCollapseAuxiliaryRef.current = onCollapseAuxiliary;

  useEffect(() => {
    if (!auxiliaryExpanded) return undefined;
    const auxiliary = auxiliaryRef.current;
    if (auxiliary === null) return undefined;
    previousFocusRef.current =
      auxiliary.ownerDocument.activeElement instanceof HTMLElement
        ? auxiliary.ownerDocument.activeElement
        : null;
    auxiliary.querySelector<HTMLElement>("button, input, select, [tabindex]")
      ?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        onCollapseAuxiliaryRef.current === undefined
      ) return;
      event.preventDefault();
      event.stopPropagation();
      onCollapseAuxiliaryRef.current();
    };
    auxiliary.ownerDocument.addEventListener("keydown", onKeyDown, true);
    return () => {
      auxiliary.ownerDocument.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [auxiliaryExpanded]);

  return (
    <section
      className="bead-editor-workspace"
      data-testid="bead-editor-workspace"
      data-has-tools={toolControls !== null}
      data-mode={mode}
    >
      <div
        className="bead-editor-workspace__canvas"
        inert={auxiliaryExpanded ? true : undefined}
      >{canvas}</div>
      <div
        className="bead-editor-workspace__topbar"
        inert={auxiliaryExpanded ? true : undefined}
      >
        <div
          className="bead-editor-workspace__project"
          role="group"
          aria-label={labels.project}
        >
          {projectControls}
        </div>
        <div
          className="bead-editor-workspace__workflow"
          role="toolbar"
          aria-label={labels.workflow}
        >
          {workflowControls}
        </div>
        <div
          className="bead-editor-workspace__output"
          role="group"
          aria-label={labels.output}
        >
          {outputControls}
        </div>
      </div>
      {toolControls === null ? null : (
        <div
          className="bead-editor-workspace__tools"
          role="toolbar"
          aria-label={labels.tools}
          inert={auxiliaryExpanded ? true : undefined}
        >
          {toolControls}
        </div>
      )}
      <section
        className="bead-editor-workspace__mode-dock"
        aria-label={labels.modeControls}
        inert={auxiliaryExpanded ? true : undefined}
      >
        {modeControls}
      </section>
      {auxiliaryView === undefined ? null : (
        <section
          ref={auxiliaryRef}
          className="bead-editor-workspace__auxiliary"
          aria-label={labels.auxiliary}
          role={auxiliaryExpanded ? "dialog" : "region"}
          aria-modal={auxiliaryExpanded ? true : undefined}
          data-expanded={auxiliaryExpanded}
        >
          {auxiliaryView}
        </section>
      )}
    </section>
  );
}
