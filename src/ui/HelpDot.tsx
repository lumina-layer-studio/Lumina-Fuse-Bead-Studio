interface HelpDotProps {
  title: string;
  description: string;
  ariaLabel?: string;
}

export default function HelpDot({
  title,
  description,
  ariaLabel,
}: HelpDotProps) {
  return (
    <span
      className="help-dot"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? title}
      data-help={description}
      title={`${title}: ${description}`}
    >
      ?
    </span>
  );
}
