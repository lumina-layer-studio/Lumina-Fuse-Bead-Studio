import type { ReactNode } from "react";

export function cx(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export const workstationFieldLabelClass = "field-label";
export const workstationInputClass = "field-input";
export const mutedSectionCardClass = "panel panel--muted";

export function resolveSectionCardClass(
  tone: "standard" | "muted" = "standard",
): string {
  return tone === "muted" ? mutedSectionCardClass : "panel";
}

interface PanelIntroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PanelIntro({
  eyebrow,
  title,
  description,
  action,
}: PanelIntroProps) {
  return (
    <header className="panel-intro">
      <div className="panel-intro__copy">
        {eyebrow ? (
          <p className="panel-intro__eyebrow">{eyebrow}</p>
        ) : null}
        <h1>{title}</h1>
        {description ? (
          <p className="panel-intro__description">{description}</p>
        ) : null}
      </div>
      {action ? <div className="panel-intro__action">{action}</div> : null}
    </header>
  );
}

interface StatusBannerProps {
  tone?: "info" | "warning" | "error" | "success";
  children: ReactNode;
}

export function StatusBanner({
  tone = "info",
  children,
}: StatusBannerProps) {
  return (
    <div
      className={`status-banner status-banner--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
