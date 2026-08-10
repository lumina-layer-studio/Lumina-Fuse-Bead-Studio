import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

export interface BeadEditorWorkspaceLabels {
  views: string;
  edit: string;
  inspector: string;
  collapseEdit: string;
  expandEdit: string;
  collapseInspector: string;
  expandInspector: string;
  openEdit: string;
  openInspector: string;
}

export interface BeadEditorWorkspaceProps {
  labels: BeadEditorWorkspaceLabels;
  viewControls: ReactNode;
  editControls: ReactNode;
  inspectorControls: ReactNode;
  canvas: ReactNode;
  magnifier?: ReactNode;
}

interface BeadEditorDockPresentationProps {
  title: string;
  children: ReactNode;
  contentId?: string;
  collapsed?: boolean;
  className?: string;
  headerAction?: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function BeadEditorDock({
  title,
  children,
  contentId,
  collapsed = false,
  className,
  headerAction,
  bodyRef,
}: BeadEditorDockPresentationProps) {
  return (
    <aside aria-label={title} className={className}>
      <div className="bead-editor-dock__header">
        <h2>{title}</h2>
        {headerAction}
      </div>
      <div
        id={contentId}
        ref={bodyRef}
        className="bead-editor-dock__body"
        hidden={collapsed}
      >
        {children}
      </div>
    </aside>
  );
}

export function BeadEditorFloatingControls({
  className,
  ...props
}: BeadEditorDockPresentationProps) {
  return (
    <BeadEditorDock
      {...props}
      className={joinClassNames("bead-editor-floating-controls", className)}
    />
  );
}

export function BeadEditorInspector({
  className,
  ...props
}: BeadEditorDockPresentationProps) {
  return (
    <BeadEditorDock
      {...props}
      className={joinClassNames("bead-editor-inspector", className)}
    />
  );
}

type MobileDrawer = "edit" | "inspector" | null;

function firstFocusableElement(container: HTMLElement): HTMLElement | null {
  const candidates = container.querySelectorAll<HTMLElement>(
    'button, input, select, [tabindex]:not([tabindex="-1"])',
  );
  return (
    Array.from(candidates).find(
      (candidate) =>
        !candidate.hasAttribute("disabled") && !candidate.hasAttribute("hidden"),
    ) ?? null
  );
}

export function BeadEditorWorkspace({
  labels,
  viewControls,
  editControls,
  inspectorControls,
  canvas,
  magnifier,
}: BeadEditorWorkspaceProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawer>(null);
  const workspaceId = useId();
  const editControlsId = `bead-editor-edit-controls-${workspaceId}`;
  const inspectorControlsId = `bead-editor-inspector-controls-${workspaceId}`;
  const workspaceRef = useRef<HTMLElement | null>(null);
  const editControlsBody = useRef<HTMLDivElement | null>(null);
  const inspectorControlsBody = useRef<HTMLDivElement | null>(null);
  const mobileTriggers = useRef<
    Record<Exclude<MobileDrawer, null>, HTMLButtonElement | null>
  >({ edit: null, inspector: null });

  useEffect(() => {
    if (mobileDrawer === null) {
      return;
    }

    const body =
      mobileDrawer === "edit"
        ? editControlsBody.current
        : inspectorControlsBody.current;
    if (body !== null) {
      firstFocusableElement(body)?.focus();
    }
  }, [mobileDrawer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        mobileDrawer === null ||
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null ||
        !workspaceRef.current?.contains(document.activeElement)
      ) {
        return;
      }

      const trigger = mobileTriggers.current[mobileDrawer];
      setMobileDrawer(null);
      if (
        trigger?.isConnected &&
        workspaceRef.current?.contains(trigger)
      ) {
        trigger.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileDrawer]);

  const toggleMobileDrawer = (drawer: Exclude<MobileDrawer, null>) => {
    if (drawer === "edit") {
      setLeftCollapsed(false);
    } else {
      setRightCollapsed(false);
    }
    setMobileDrawer((currentDrawer) =>
      currentDrawer === drawer ? null : drawer,
    );
  };

  return (
    <section
      className="bead-editor-workspace"
      ref={workspaceRef}
      data-testid="bead-editor-workspace"
      data-left-collapsed={leftCollapsed}
      data-right-collapsed={rightCollapsed}
      data-mobile-drawer={mobileDrawer ?? "closed"}
    >
      <div className="bead-editor-workspace__canvas">{canvas}</div>
      <div className="bead-editor-workspace__overlay">
        <div
          className="bead-editor-workspace__views"
          role="toolbar"
          aria-label={labels.views}
        >
          {viewControls}
        </div>
        <BeadEditorFloatingControls
          title={labels.edit}
          contentId={editControlsId}
          bodyRef={editControlsBody}
          collapsed={leftCollapsed}
          className="bead-editor-dock bead-editor-dock--left"
          headerAction={
            <button
              type="button"
              aria-label={
                leftCollapsed ? labels.expandEdit : labels.collapseEdit
              }
              aria-expanded={!leftCollapsed}
              aria-controls={editControlsId}
              onClick={() => setLeftCollapsed((collapsed) => !collapsed)}
            >
              {leftCollapsed ? "+" : "−"}
            </button>
          }
        >
          {editControls}
        </BeadEditorFloatingControls>
        <BeadEditorInspector
          title={labels.inspector}
          contentId={inspectorControlsId}
          bodyRef={inspectorControlsBody}
          collapsed={rightCollapsed}
          className="bead-editor-dock bead-editor-dock--right"
          headerAction={
            <button
              type="button"
              aria-label={
                rightCollapsed
                  ? labels.expandInspector
                  : labels.collapseInspector
              }
              aria-expanded={!rightCollapsed}
              aria-controls={inspectorControlsId}
              onClick={() => setRightCollapsed((collapsed) => !collapsed)}
            >
              {rightCollapsed ? "+" : "−"}
            </button>
          }
        >
          {inspectorControls}
        </BeadEditorInspector>
        <div className="bead-editor-workspace__mobile-actions">
          <button
            ref={(element) => {
              mobileTriggers.current.edit = element;
            }}
            type="button"
            aria-label={labels.openEdit}
            aria-expanded={mobileDrawer === "edit"}
            aria-controls={editControlsId}
            onClick={() => toggleMobileDrawer("edit")}
          >
            {labels.openEdit}
          </button>
          <button
            ref={(element) => {
              mobileTriggers.current.inspector = element;
            }}
            type="button"
            aria-label={labels.openInspector}
            aria-expanded={mobileDrawer === "inspector"}
            aria-controls={inspectorControlsId}
            onClick={() => toggleMobileDrawer("inspector")}
          >
            {labels.openInspector}
          </button>
        </div>
      </div>
      {magnifier === undefined ? null : (
        <div className="bead-editor-workspace__magnifier">{magnifier}</div>
      )}
    </section>
  );
}
