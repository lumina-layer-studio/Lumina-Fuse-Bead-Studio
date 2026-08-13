import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./panelPrimitives";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium";
  icon?: ReactNode;
}

export default function Button({
  label,
  loading = false,
  variant = "primary",
  size = "medium",
  icon,
  className,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        "button",
        `button--${variant}`,
        `button--${size}`,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="button__spinner" aria-hidden /> : icon}
      <span>{label}</span>
    </button>
  );
}
